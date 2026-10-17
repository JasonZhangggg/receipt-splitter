import type { ReadAdjustment, ReadBundle, ReadDiscount, ReadItem, ScanReply } from "../../worker/scan/format";
import { cents, isCents, price, type Cents, type Price } from "../core/money";
import { isDetail, MAX_DETAIL_LENGTH, MAX_QUANTITY } from "../core/operations";
import { adjustmentId, itemId, type Adjustment, type Item, type NonEmpty, type Receipt, type ReceiptLevelKind } from "../core/split";
import { money } from "../draft";
import type { TextBox } from "../ocr/types";
import { groupRows } from "../parse/rows";

/** The route refuses a body over 1 MB, so the client sends at most this. */
export const MAX_SCAN_BYTES = 1024 * 1024;
/** The route answers within 9.8 s of admission (`SCAN_REVIEW_BY_MS`). This adds the upload and network margin, then the device reader takes over. */
export const SCAN_TIMEOUT_MS = 15_000;
const LONG_EDGE = 2048;
const QUALITIES = [0.85, 0.75, 0.6, 0.45, 0.3];

const KINDS: Readonly<Record<ReadAdjustment["kind"], ReceiptLevelKind>> = {
  tax: "tax",
  tip: "tip",
  discount: "discount",
  serviceCharge: "serviceCharge",
  // A fee or deposit is charged on the order, which is what a service charge is in the core model.
  fee: "serviceCharge",
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isList = <T>(value: unknown, isEntry: (entry: unknown) => entry is T): value is T[] => Array.isArray(value) && value.every(isEntry);
const isNonEmpty = <T>(value: unknown, isEntry: (entry: unknown) => entry is T): value is NonEmpty<T> => isList(value, isEntry) && value.length > 0;

const isDiscount = (value: unknown): value is ReadDiscount => isObject(value) && isText(value.name) && isCents(value.amount);
const isItem = (value: unknown): value is ReadItem =>
  isObject(value) &&
  isText(value.name) &&
  isCents(value.price) &&
  (value.quantity === null || (Number.isSafeInteger(value.quantity) && Number(value.quantity) > 1)) &&
  isList(value.details, isText) &&
  isList(value.discounts, isDiscount);
const isAdjustment = (value: unknown): value is ReadAdjustment => isObject(value) && isText(value.name) && isCents(value.amount) && isText(value.kind) && Object.hasOwn(KINDS, value.kind);
const isIndex = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isBundle = (value: unknown): value is ReadBundle<NonEmpty<number>> =>
  isObject(value) && isText(value.name) && isNonEmpty(value.items, isIndex) && isList(value.discounts, isDiscount);
const isSubtotal = (value: unknown): value is ScanReply["subtotal"] =>
  value === null || (isObject(value) && isCents(value.amount) && typeof value.beforeDiscounts === "boolean");

function parseReply(value: unknown): ScanReply | null {
  if (!isObject(value) || !isNonEmpty(value.items, isItem) || !isList(value.bundles, isBundle) || !isList(value.adjustments, isAdjustment)) return null;
  if (!isSubtotal(value.subtotal) || !isCents(value.total)) return null;
  const count = value.items.length;
  const bundled = value.bundles.flatMap((bundle) => bundle.items);
  if (bundled.some((index) => index >= count) || new Set(bundled).size !== bundled.length) return null;
  return value as ScanReply;
}

const sum = (amounts: readonly number[]) => amounts.reduce((total, amount) => total + amount, 0);

/** The Item's detail lines and folded discounts as one line, such as "Large, oat milk, $2.00 off", or undefined when there are none or it cannot be shown. */
function detailLine({ details, discounts }: ReadItem): string | undefined {
  const parts = [...details, ...discounts.map(({ amount }) => `${money(Math.abs(amount))} off`)];
  const line = parts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");
  const characters = [...line];
  const clipped = characters.length > MAX_DETAIL_LENGTH ? `${characters.slice(0, MAX_DETAIL_LENGTH - 1).join("").trimEnd()}…` : line;
  return clipped && isDetail(clipped) ? clipped : undefined;
}

/**
 * An Item's price with the discounts printed under it folded in, as the route reads it. A coupon worth more than its Item takes that below $0.00,
 * which no Item may be, so the Item goes to $0.00 with as much of its own coupon as its price covers, and only the excess goes on the whole receipt
 * as `unfolded`. The line's sum is unchanged, and the other Items absorb only the excess.
 */
function fold(read: ReadItem): { readonly price: Price; readonly folded: readonly ReadDiscount[]; readonly unfolded: Cents } {
  if (read.price >= 0) return { price: price(read.price), folded: read.discounts, unfolded: cents(0) };
  let room = Math.max(read.price - sum(read.discounts.map(({ amount }) => amount)), 0);
  const folded = read.discounts.flatMap(({ name, amount }): ReadDiscount[] => {
    const own = Math.min(-amount, room);
    room -= own;
    return own > 0 ? [{ name, amount: cents(-own) }] : [];
  });
  return { price: price(0), folded, unfolded: read.price };
}

/**
 * The core subtotal counts Items only. The reply's subtotal is what the receipt printed, which also holds every line but tax and tip,
 * or, when printed before discounts, the Items before their discounts plus the fees and service charges.
 */
function subtotalOf(reply: ScanReply, items: readonly Item[], adjustments: readonly Adjustment[], folded: readonly ReadDiscount[]): Cents {
  const itemsSum = sum(items.map((item) => item.price));
  if (reply.subtotal === null) return cents(itemsSum);
  const charges = adjustments.filter(({ kind }) => kind !== "tax" && kind !== "tip");
  const counted = reply.subtotal.beforeDiscounts ? charges.filter(({ kind }) => kind === "serviceCharge") : charges;
  const itemDiscounts = reply.subtotal.beforeDiscounts ? sum(folded.map(({ amount }) => amount)) : 0;
  const subtotal = reply.subtotal.amount + itemDiscounts - sum(counted.map(({ amount }) => amount));
  return isCents(subtotal) ? subtotal : cents(itemsSum);
}

/** Maps the route's reply to a Receipt, or null when the reply does not have the reply's shape. */
export function receiptOfReply(value: unknown): Receipt | null {
  const reply = parseReply(value);
  if (reply === null) return null;
  const folds = reply.items.map(fold);
  const items = reply.items.map((read, index): Item => {
    const detail = detailLine({ ...read, discounts: folds[index].folded });
    return {
      id: itemId(`i${index + 1}`),
      name: read.name,
      price: folds[index].price,
      ...(detail !== undefined && { detail }),
      ...(read.quantity !== null && read.quantity <= MAX_QUANTITY && { quantity: read.quantity }),
    };
  });
  const discounted = reply.bundles.filter(({ discounts }) => discounts.length > 0);
  const bundles = discounted.map(({ name, items: members, discounts }, index): Adjustment => {
    const [first, ...rest] = members.map((member) => items[member].id);
    return {
      id: adjustmentId(`b${index + 1}`),
      kind: "bundleDiscount",
      name: discounts[0].name || name,
      amount: cents(sum(discounts.map(({ amount }) => amount))),
      bundle: { name, items: [first, ...rest] },
    };
  });
  const coupons = reply.items.flatMap(({ name, discounts }, index): Adjustment[] => {
    const { unfolded } = folds[index];
    return unfolded === 0 ? [] : [{ id: adjustmentId(`c${index + 1}`), kind: "discount", name: discounts[0]?.name || name, amount: unfolded }];
  });
  const charges = reply.adjustments.map(({ kind, name, amount }, index): Adjustment => ({ id: adjustmentId(`a${index + 1}`), kind: KINDS[kind], name, amount }));
  const adjustments = [...bundles, ...coupons, ...charges];
  const [first, ...rest] = items;
  return { items: [first, ...rest], adjustments, subtotal: subtotalOf(reply, items, adjustments, folds.flatMap(({ folded }) => folded)), total: reply.total };
}

export type Crop = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** The part of the photo the OCR boxes cover, with a margin of two median box heights, inside the photo. */
export function cropOf(boxes: readonly TextBox[], width: number, height: number): Crop {
  const xs = boxes.flatMap((box) => box.corners.map((point) => point.x));
  const ys = boxes.flatMap((box) => box.corners.map((point) => point.y));
  if (xs.length === 0) return { x: 0, y: 0, width, height };
  const heights = boxes.map((box) => Math.max(...box.corners.map((point) => point.y)) - Math.min(...box.corners.map((point) => point.y))).sort((a, b) => a - b);
  const margin = 2 * heights[Math.floor(heights.length / 2)];
  const left = Math.max(0, Math.floor(Math.min(...xs) - margin));
  const top = Math.max(0, Math.floor(Math.min(...ys) - margin));
  const right = Math.min(width, Math.ceil(Math.max(...xs) + margin));
  const bottom = Math.min(height, Math.ceil(Math.max(...ys) + margin));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : { x: 0, y: 0, width, height };
}

/** The upright photo cropped to the text and scaled down to at most `longEdge` px on its long edge, on a canvas, or null when the canvas cannot draw. */
export async function drawCropped(photo: Blob, boxes: readonly TextBox[], longEdge: number): Promise<HTMLCanvasElement | null> {
  const image = await createImageBitmap(photo, { imageOrientation: "from-image" });
  try {
    const crop = cropOf(boxes, image.width, image.height);
    const scale = Math.min(1, longEdge / Math.max(crop.width, crop.height));
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(crop.width * scale), height: Math.round(crop.height * scale) });
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.close();
  }
}

/** The request body: the photo cropped to the text, at most 2048 px on its long edge, as a JPEG with no EXIF, at the highest quality that fits 1 MB. */
async function scanBody(photo: Blob, boxes: readonly TextBox[]): Promise<string | null> {
  const canvas = await drawCropped(photo, boxes, LONG_EDGE);
  if (!canvas) return null;
  const ocrLines = groupRows(boxes).map((row) => row.text);
  for (const quality of QUALITIES) {
    const body = JSON.stringify({ photo: canvas.toDataURL("image/jpeg", quality), ocrLines });
    if (new TextEncoder().encode(body).length <= MAX_SCAN_BYTES) return body;
  }
  return null;
}

/** Reads the receipt through `POST /api/scan`. "notReceipt" is the reader saying the photo shows none. Any other refusal, failure, malformed reply, or no reply within the timeout is null. */
export async function readOnServer(photo: Blob, boxes: readonly TextBox[], timeoutMs = SCAN_TIMEOUT_MS): Promise<Receipt | "notReceipt" | null> {
  try {
    const body = await scanBody(photo, boxes);
    if (body === null) return null;
    const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 422) return (await response.json())?.refused === "notReceipt" ? "notReceipt" : null;
    return response.status === 200 ? receiptOfReply(await response.json()) : null;
  } catch {
    return null;
  }
}
