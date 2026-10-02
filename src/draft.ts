import { cents, isCents, MAX_CENTS, price, type Cents, type Price } from "./core/money";
import { canonicalName, isName, MAX_PARTICIPANT_NAME_LENGTH, MAX_QUANTITY, nameKey, type NewSplit, type RejectionReason } from "./core/operations";
import {
  RECEIPT_LEVEL_KINDS,
  adjustmentId,
  isId,
  itemId,
  PAYMENT_SERVICES,
  type ReceiptLevelKind,
  type Adjustment,
  type NonEmpty,
  type ParticipantId,
  type PaymentHandle,
  type PaymentService,
  type Receipt,
} from "./core/split";
import { runTotalCheck, type FailedTotalCheck } from "./core/total-check";
import type { ParsedItem } from "./parse";

export type ReceiptFile = { readonly name: string; readonly thumbnail: string | null };

type DraftItem = {
  readonly id: string;
  readonly name: string;
  readonly price: Price;
  readonly quantity?: number;
  readonly discountExceededPrice?: true;
  readonly unreadPrice?: true;
  readonly retyped?: true;
};

type DraftAdjustment =
  | { readonly id: string; readonly kind: Exclude<ReceiptLevelKind, "tip">; readonly name: string; readonly amount: Cents }
  | { readonly id: string; readonly kind: "bundleDiscount"; readonly name: string; readonly amount: Cents; readonly bundle: DraftBundle };

type DraftBundle = { readonly name: string; readonly items: NonEmpty<string> };

export type DraftReceipt = {
  readonly items: readonly DraftItem[];
  readonly adjustments: readonly DraftAdjustment[];
  readonly subtotal: Cents | null;
  readonly tip: Cents;
  readonly totalBeforeTip: Cents;
  readonly nextId: number;
};

type Scan =
  | { readonly status: "empty" }
  | { readonly status: "reading"; readonly file: ReceiptFile }
  | { readonly status: "read"; readonly file: ReceiptFile; readonly receipt: DraftReceipt; readonly fixOnHome?: true };

export type HandleRow = { readonly service: PaymentService; readonly handle: string };

export type Draft = { readonly scan: Scan; readonly handles: readonly HandleRow[]; readonly names: readonly string[] };

export type DraftAction =
  | { readonly type: "reading"; readonly file: ReceiptFile }
  | { readonly type: "read"; readonly file: ReceiptFile; readonly receipt: Receipt<ParsedItem> | null }
  | { readonly type: "example" }
  | { readonly type: "created" }
  | { readonly type: "editItem"; readonly id: string; readonly name?: string; readonly price?: Price }
  | { readonly type: "addItem" }
  | { readonly type: "removeItem"; readonly id: string }
  | { readonly type: "editAdjustment"; readonly id: string; readonly amount: Cents }
  | { readonly type: "removeAdjustment"; readonly id: string }
  | { readonly type: "editSubtotal"; readonly amount: Cents }
  | { readonly type: "editTip"; readonly amount: Cents }
  | { readonly type: "editTotal"; readonly amount: Cents }
  | { readonly type: "setService"; readonly index: number; readonly service: PaymentService }
  | { readonly type: "setHandle"; readonly index: number; readonly handle: string }
  | { readonly type: "addHandle" }
  | { readonly type: "removeHandle"; readonly index: number }
  | { readonly type: "addName"; readonly name: string }
  | { readonly type: "removeName"; readonly name: string };

const MAX_GRAPHEMES = 80;

export const emptyDraft: Draft = { scan: { status: "empty" }, handles: [{ service: "venmo", handle: "" }], names: [] };

const graphemes = new Intl.Segmenter();

function clip(text: string, max = MAX_GRAPHEMES): string {
  let kept = "";
  let count = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (count++ === max) break;
    kept += segment;
  }
  return kept;
}

/** The name to add for what was typed, or why none: `badName` when core would refuse it, as it does a name that draws nothing, and `nameTaken` when it repeats one in `names`. */
export function newName(
  typed: string,
  names: readonly string[],
): { readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: Extract<RejectionReason, "badName" | "nameTaken"> } {
  const name = clip(canonicalName(typed), MAX_PARTICIPANT_NAME_LENGTH);
  if (!isName(name, MAX_PARTICIPANT_NAME_LENGTH)) return { ok: false, reason: "badName" };
  if (names.some((other) => nameKey(other) === nameKey(name))) return { ok: false, reason: "nameTaken" };
  return { ok: true, name };
}

export function reduceDraft(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "reading":
      return { ...draft, scan: { status: "reading", file: action.file } };
    case "read": {
      const receipt = action.receipt ? fromReceipt(action.receipt) : typedReceipt;
      const fixOnHome = itemProblem(receipt) ? { fixOnHome: true as const } : {};
      return { ...draft, scan: { status: "read", file: action.file, receipt, ...fixOnHome } };
    }
    case "example":
      return { ...draft, scan: { status: "read", file: { name: "Example receipt", thumbnail: null }, receipt: fromReceipt(example1040) } };
    case "created":
      return draft.scan.status === "read" ? { ...emptyDraft, handles: draft.handles } : draft;
    case "setService":
      return { ...draft, handles: draft.handles.map((row, i) => (i === action.index ? { ...row, service: action.service } : row)) };
    case "setHandle":
      return { ...draft, handles: draft.handles.map((row, i) => (i === action.index ? { ...row, handle: action.handle } : row)) };
    case "addHandle": {
      const service = PAYMENT_SERVICES.find((app) => !draft.handles.some((row) => row.service === app));
      return service ? { ...draft, handles: [...draft.handles, { service, handle: "" }] } : draft;
    }
    case "removeHandle":
      return draft.handles.length > 1 ? { ...draft, handles: draft.handles.filter((_, i) => i !== action.index) } : draft;
    case "addName": {
      const named = newName(action.name, draft.names);
      return named.ok ? { ...draft, names: [...draft.names, named.name] } : draft;
    }
    case "removeName":
      return { ...draft, names: draft.names.filter((name) => name !== action.name) };
    default: {
      if (draft.scan.status !== "read") return draft;
      const receipt = editReceipt(draft.scan.receipt, action);
      return receipt === draft.scan.receipt ? draft : { ...draft, scan: { ...draft.scan, receipt } };
    }
  }
}

type ReceiptEdit = Extract<DraftAction, { type: "editItem" | "addItem" | "removeItem" | "editAdjustment" | "removeAdjustment" | "editSubtotal" | "editTip" | "editTotal" }>;

function editReceipt(receipt: DraftReceipt, action: ReceiptEdit): DraftReceipt {
  switch (action.type) {
    case "editItem": {
      if (action.price !== undefined && action.price > MAX_CENTS) return receipt;
      const items = receipt.items.map((item) => {
        if (item.id !== action.id) return item;
        const name = action.name === undefined ? item.name : clip(action.name);
        if (action.price === undefined) return { ...item, name };
        return { id: item.id, name, price: action.price, ...(item.quantity && { quantity: item.quantity }), retyped: true as const };
      });
      return { ...receipt, items };
    }
    case "addItem":
      return { ...receipt, items: [...receipt.items, { id: `i${receipt.nextId}`, name: "", price: price(0) }], nextId: receipt.nextId + 1 };
    case "removeItem":
      return { ...receipt, items: receipt.items.filter((item) => item.id !== action.id), adjustments: receipt.adjustments.flatMap((row) => leaveBundle(row, action.id)) };
    case "editAdjustment":
      if (Math.abs(action.amount) > MAX_CENTS) return receipt;
      return { ...receipt, adjustments: receipt.adjustments.map((row) => (row.id === action.id ? { ...row, amount: action.amount } : row)) };
    case "removeAdjustment":
      return { ...receipt, adjustments: receipt.adjustments.filter((row) => row.id !== action.id) };
    case "editSubtotal":
      return action.amount > MAX_CENTS ? receipt : { ...receipt, subtotal: action.amount };
    case "editTip":
      return action.amount > MAX_CENTS ? receipt : { ...receipt, tip: action.amount };
    case "editTotal":
      return action.amount > MAX_CENTS ? receipt : { ...receipt, totalBeforeTip: cents(action.amount - receipt.tip) };
    default:
      return action satisfies never;
  }
}

function leaveBundle(row: DraftAdjustment, id: string): DraftAdjustment[] {
  if (row.kind !== "bundleDiscount") return [row];
  const [first, ...rest] = row.bundle.items.filter((item) => item !== id);
  return first === undefined ? [] : [{ ...row, bundle: { ...row.bundle, items: [first, ...rest] } }];
}

const typedReceipt: DraftReceipt = {
  items: [],
  adjustments: [{ id: "a1", kind: "tax", name: "Tax", amount: cents(0) }],
  subtotal: null,
  tip: cents(0),
  totalBeforeTip: cents(0),
  nextId: 1,
};

function fromReceipt(receipt: Receipt<ParsedItem>): DraftReceipt {
  const items = receipt.items.flatMap((item): DraftItem[] => {
    const name = clip(item.name.trim());
    if (!name && item.price === 0) return [];
    const flags = item.discountExceededPrice ? { discountExceededPrice: true as const } : {};
    const quantity = item.quantity && { quantity: item.quantity };
    if (item.price > MAX_CENTS) return [{ id: item.id, name, price: price(0), ...quantity, unreadPrice: true }];
    return [{ id: item.id, name, price: item.price, ...quantity, ...flags }];
  });
  const tip = receipt.adjustments.filter((row) => row.kind === "tip").reduce((sum, row) => sum + row.amount, 0);
  const kept = new Set(items.map((item) => item.id));
  const adjustments = receipt.adjustments.flatMap((row): DraftAdjustment[] => {
    const name = clip(row.name.trim());
    if (row.kind === "tip") return [];
    if (row.kind !== "bundleDiscount") return [{ id: row.id, kind: row.kind, name, amount: row.amount }];
    const [first, ...rest] = row.bundle.items.filter((id) => kept.has(id));
    if (first === undefined) return [{ id: row.id, kind: "discount", name, amount: row.amount }];
    return [{ id: row.id, kind: row.kind, name, amount: row.amount, bundle: { name: clip(row.bundle.name.trim()), items: [first, ...rest] } }];
  });
  return {
    items,
    adjustments,
    subtotal: receipt.subtotal,
    tip: cents(tip),
    totalBeforeTip: cents(receipt.total - tip),
    nextId: receipt.items.length + 1,
  };
}

const example1040: Receipt = {
  items: [
    { id: itemId("i1"), name: "Chicken Fried Rice And Egg", price: price(799) },
    { id: itemId("i2"), name: "California Tropic And Miso", price: price(799) },
    { id: itemId("i3"), name: "Add Two Tostones", price: price(100) },
    { id: itemId("i4"), name: "Sprite", price: price(250) },
    { id: itemId("i5"), name: "Perrier Sparkling Water", price: price(350) },
  ],
  adjustments: [
    { id: adjustmentId("a1"), kind: "tax", name: "Tax", amount: cents(161) },
    { id: adjustmentId("a2"), kind: "serviceCharge", name: "Service fees on tables", amount: cents(345) },
  ],
  subtotal: cents(2298),
  total: cents(2804),
};

export function totalOf(receipt: DraftReceipt): Cents {
  return cents(receipt.totalBeforeTip + receipt.tip);
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const adjustmentNames: Record<DraftAdjustment["kind"], string> = { tax: "Tax", serviceCharge: "Service charge", discount: "Discount", bundleDiscount: "Discount" };

function receiptOf(receipt: DraftReceipt): Receipt | null {
  const [first, ...rest] = receipt.items.map((item) => ({ id: itemId(item.id), name: item.name.trim(), price: item.price, ...(item.quantity && { quantity: item.quantity }) }));
  if (!first) return null;
  const adjustments = receipt.adjustments.map((row): Adjustment => {
    const named = { id: adjustmentId(row.id), name: row.name.trim() || adjustmentNames[row.kind], amount: row.amount };
    if (row.kind !== "bundleDiscount") return { ...named, kind: row.kind };
    const [first, ...rest] = row.bundle.items.map(itemId);
    return { ...named, kind: row.kind, bundle: { name: row.bundle.name, items: [first, ...rest] } };
  });
  return {
    items: [first, ...rest],
    adjustments: [...adjustments, { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: receipt.tip }],
    subtotal: receipt.subtotal ?? cents(sum(receipt.items.map((item) => item.price))),
    total: totalOf(receipt),
  };
}

function totalCheck(receipt: DraftReceipt) {
  const core = receiptOf(receipt);
  return core && runTotalCheck(core);
}

export const filledHandles = (handles: readonly HandleRow[]): PaymentHandle[] =>
  handles.flatMap(({ service, handle }) => (handle.trim() ? [{ service, handle: handle.trim() }] : []));

export function splitRequest({ scan, handles, names }: Draft, newId: () => ParticipantId): Omit<NewSplit, "id"> | null {
  const receipt = scan.status === "read" ? receiptOf(scan.receipt) : null;
  const [first, ...rest] = filledHandles(handles);
  const [host, ...others] = names;
  if (!receipt || !first || host === undefined) return null;
  const paymentHandles: NonEmpty<PaymentHandle> = [first, ...rest];
  return { receipt, participants: [{ id: newId(), name: host }, ...others.map((name) => ({ id: newId(), name }))], paymentHandles };
}

const unsignedAmount = /^\d{0,6}(\.\d{0,2})?$/;
const signedAmount = /^-?\d{0,6}(\.\d{0,2})?$/;

export function parseAmount(text: string, allowNegative = false): Cents | null {
  if (!(allowNegative ? signedAmount : unsignedAmount).test(text)) return null;
  const [whole = "", part = ""] = text.replace("-", "").split(".");
  const amount = Number(whole || 0) * 100 + Number(part.padEnd(2, "0"));
  if (amount > MAX_CENTS) return null;
  return cents(text.startsWith("-") ? -amount : amount);
}

export const plainAmount = (amount: number) => `${amount < 0 ? "-" : ""}${(Math.abs(amount) / 100).toFixed(2)}`;

const dollars = (amount: number) => `$${plainAmount(amount)}`;

function hasAmountOverLimit(receipt: DraftReceipt): boolean {
  const amounts = [...receipt.items.map((item) => item.price), ...receipt.adjustments.map((row) => row.amount), receipt.subtotal ?? 0, receipt.tip, totalOf(receipt)];
  return amounts.some((amount) => Math.abs(amount) > MAX_CENTS);
}

const gapText = (what: string, gap: number, against: string) => `${what} ${dollars(Math.abs(gap))} ${gap > 0 ? "short of" : "over"} the ${against}.`;

export function gapNote({ subtotalGap, totalGap }: FailedTotalCheck, subtotalPrinted: boolean): string {
  if (subtotalGap !== 0) return gapText("Items are", subtotalGap, "subtotal");
  return gapText(subtotalPrinted ? "Tax and charges are" : "Items are", totalGap, "total");
}

export function mismatchNote({ scan }: Draft): string | null {
  if (scan.status !== "read") return null;
  const check = totalCheck(scan.receipt);
  return check && !check.ok ? gapNote(check, scan.receipt.subtotal !== null) : null;
}

export type Blocker = { readonly kind: "note"; readonly note: string } | { readonly kind: "noHandle" };

const note = (text: string): Blocker => ({ kind: "note", note: text });

function itemProblem(receipt: DraftReceipt): Blocker | null {
  if (hasAmountOverLimit(receipt)) return note(`An amount is over $${(MAX_CENTS / 100).toLocaleString("en-US")}.`);
  if (!receiptOf(receipt)) return note("Add an item.");
  if (receipt.items.some((item) => !item.name.trim())) return note("Name every item.");
  return null;
}

export const editsOnHome = ({ scan }: Draft): boolean => scan.status === "read" && scan.fixOnHome === true;

export function blocker({ scan, handles, names }: Draft): Blocker | null {
  if (scan.status === "empty") return note("Add a receipt.");
  if (scan.status === "reading") return note("Reading the receipt.");
  const problem = itemProblem(scan.receipt);
  if (problem) return problem;
  if (!handles.some((row) => row.handle.trim())) return { kind: "noHandle" };
  if (names.length === 0) return note("Add your name.");
  return null;
}

export function flaggedRows(draft: Draft): string[] {
  if (draft.scan.status !== "read") return [];
  const check = totalCheck(draft.scan.receipt);
  const { items } = draft.scan.receipt;
  const unread = items.filter((item) => item.unreadPrice).map((item) => item.id);
  if (!check || check.ok) return unread;
  const retyped = items.filter((item) => item.retyped).map((item) => item.id);
  const named = [...check.itemIds, ...check.adjustmentIds.filter((id) => id !== "tip")];
  return [...new Set([...unread, ...named, ...retyped])];
}

type Store = Pick<Storage, "getItem" | "setItem">;

const key = "receipt-splitter:draft";

export function saveDraft(draft: Draft, storage: Store | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(key, JSON.stringify({ version: 1, draft }));
  } catch {
    return;
  }
}

export function loadDraft(storage: Store | undefined = globalThis.localStorage): Draft {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(key) ?? "null");
    return parseDraft(saved) ?? emptyDraft;
  } catch {
    return emptyDraft;
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && clip(value) === value;
const isAmount = (value: unknown): value is Cents => isCents(value) && Math.abs(value) <= MAX_CENTS;
const isPrice = (value: unknown): value is Price => isAmount(value) && value >= 0;
const isQuantity = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY;
const isFile = (value: unknown): value is ReceiptFile =>
  isObject(value) && typeof value.name === "string" && (value.thumbnail === null || (typeof value.thumbnail === "string" && value.thumbnail.startsWith("data:image/")));

function parseDraft(saved: unknown): Draft | null {
  if (!isObject(saved) || saved.version !== 1 || !isObject(saved.draft)) return null;
  const { scan, handles, names } = saved.draft;
  if (!Array.isArray(handles) || handles.length === 0 || !handles.every(isHandle)) return null;
  if (!Array.isArray(names) || !names.every(isText)) return null;
  return { scan: parseScan(scan) ?? emptyDraft.scan, handles, names };
}

const isHandle = (row: unknown): row is HandleRow =>
  isObject(row) && PAYMENT_SERVICES.includes(row.service as PaymentService) && typeof row.handle === "string";

function parseScan(scan: unknown): Scan | null {
  if (!isObject(scan)) return null;
  // A draft an older build left linked to its Split was already sent, so it opens fresh.
  if (scan.status === "empty" || scan.status === "reading" || scan.status === "linked") return { status: "empty" };
  if (scan.status !== "read" || !isFile(scan.file) || !isObject(scan.receipt)) return null;
  const { items, adjustments, subtotal, tip, totalBeforeTip, nextId } = scan.receipt;
  const itemIds = Array.isArray(items) && items.every(isItem) ? new Set(items.map((item) => item.id)) : null;
  const valid =
    itemIds !== null &&
    Array.isArray(adjustments) &&
    adjustments.every((row) => isAdjustment(row, itemIds)) &&
    (subtotal === null || isAmount(subtotal)) &&
    isPrice(tip) &&
    isAmount(totalBeforeTip) &&
    Number.isSafeInteger(nextId);
  if (!valid) return null;
  const bundled = (adjustments as DraftAdjustment[]).flatMap((row) => (row.kind === "bundleDiscount" ? row.bundle.items : []));
  if (new Set(bundled).size !== bundled.length) return null;
  const receipt = scan.receipt as DraftReceipt;
  // Drafts saved before fixOnHome existed lack the flag, and an Item problem with no editor on home leaves the Host stuck.
  const fixOnHome = scan.fixOnHome === true || itemProblem(receipt) !== null;
  return { status: "read", file: scan.file, receipt, ...(fixOnHome && { fixOnHome: true as const }) };
}

const isItem = (item: unknown) =>
  isObject(item) &&
  isId(item.id) &&
  isText(item.name) &&
  isPrice(item.price) &&
  (item.quantity === undefined || isQuantity(item.quantity)) &&
  (item.discountExceededPrice === undefined || item.discountExceededPrice === true) &&
  (item.unreadPrice === undefined || item.unreadPrice === true) &&
  (item.retyped === undefined || item.retyped === true);

const isAdjustment = (row: unknown, itemIds: ReadonlySet<unknown>) =>
  isObject(row) &&
  isId(row.id) &&
  isText(row.name) &&
  isAmount(row.amount) &&
  (row.kind === "bundleDiscount" ? isBundle(row.bundle, itemIds) : RECEIPT_LEVEL_KINDS.includes(row.kind as ReceiptLevelKind) && row.kind !== "tip" && row.bundle === undefined);

const isBundle = (bundle: unknown, itemIds: ReadonlySet<unknown>) =>
  isObject(bundle) && isText(bundle.name) && Array.isArray(bundle.items) && bundle.items.length > 0 && bundle.items.every((id) => itemIds.has(id));
