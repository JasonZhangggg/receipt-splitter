import { cents, isCents, MAX_CENTS, price, type Cents, type Price } from "./core/money";
import { MAX_PARTICIPANT_NAME_LENGTH, type NewSplit } from "./core/operations";
import {
  ADJUSTMENT_KINDS,
  adjustmentId,
  isId,
  isRoutableSplitId,
  itemId,
  PAYMENT_SERVICES,
  type AdjustmentKind,
  type NonEmpty,
  type ParticipantId,
  type PaymentHandle,
  type PaymentService,
  type Receipt,
  type SplitId,
} from "./core/split";
import { runTotalCheck } from "./core/total-check";
import type { ParsedItem } from "./parse";

export type ReceiptFile = { readonly name: string; readonly thumbnail: string | null };

type DraftItem = {
  readonly id: string;
  readonly name: string;
  readonly price: Price;
  readonly discountExceededPrice?: true;
  readonly unreadPrice?: true;
  readonly retyped?: true;
};

type DraftAdjustment = { readonly id: string; readonly kind: Exclude<AdjustmentKind, "tip">; readonly name: string; readonly amount: Cents };

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
  | { readonly status: "read"; readonly file: ReceiptFile; readonly receipt: DraftReceipt }
  | { readonly status: "linked"; readonly file: ReceiptFile; readonly receipt: DraftReceipt; readonly splitId: SplitId };

export type HandleRow = { readonly service: PaymentService; readonly handle: string };

export type Draft = { readonly scan: Scan; readonly handles: readonly HandleRow[]; readonly names: readonly string[] };

export type DraftAction =
  | { readonly type: "reading"; readonly file: ReceiptFile }
  | { readonly type: "read"; readonly file: ReceiptFile; readonly receipt: Receipt<ParsedItem> | null }
  | { readonly type: "example" }
  | { readonly type: "linked"; readonly splitId: SplitId }
  | { readonly type: "unlinked" }
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

export function newName(typed: string, names: readonly string[]): string | null {
  const name = clip(typed.trim(), MAX_PARTICIPANT_NAME_LENGTH);
  const taken = names.some((other) => other.toLowerCase() === name.toLowerCase());
  return name && !taken ? name : null;
}

export function reduceDraft(draft: Draft, action: DraftAction): Draft {
  const names = draft.scan.status === "linked" ? [] : draft.names;
  switch (action.type) {
    case "reading":
      return { ...draft, names, scan: { status: "reading", file: action.file } };
    case "read":
      return { ...draft, scan: { status: "read", file: action.file, receipt: action.receipt ? fromReceipt(action.receipt) : typedReceipt } };
    case "example":
      return { ...draft, names, scan: { status: "read", file: { name: "Example receipt", thumbnail: null }, receipt: fromReceipt(example1040) } };
    case "linked":
      return draft.scan.status === "read" ? { ...draft, scan: { ...draft.scan, status: "linked", splitId: action.splitId } } : draft;
    case "unlinked": {
      if (draft.scan.status !== "linked") return draft;
      const { file, receipt } = draft.scan;
      return { ...draft, scan: { status: "read", file, receipt } };
    }
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
      const name = newName(action.name, draft.names);
      return name ? { ...draft, names: [...draft.names, name] } : draft;
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
        return { id: item.id, name, price: action.price, retyped: true as const };
      });
      return { ...receipt, items };
    }
    case "addItem":
      return { ...receipt, items: [...receipt.items, { id: `i${receipt.nextId}`, name: "", price: price(0) }], nextId: receipt.nextId + 1 };
    case "removeItem":
      return { ...receipt, items: receipt.items.filter((item) => item.id !== action.id) };
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
    if (item.price > MAX_CENTS) return [{ id: item.id, name, price: price(0), unreadPrice: true }];
    return [{ id: item.id, name, price: item.price, ...flags }];
  });
  const tip = receipt.adjustments.filter((row) => row.kind === "tip").reduce((sum, row) => sum + row.amount, 0);
  const adjustments = receipt.adjustments.flatMap((row): DraftAdjustment[] =>
    row.kind === "tip" ? [] : [{ id: row.id, kind: row.kind, name: clip(row.name.trim()), amount: row.amount }],
  );
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

const adjustmentNames: Record<DraftAdjustment["kind"], string> = { tax: "Tax", serviceCharge: "Service charge", discount: "Discount" };

function receiptOf(receipt: DraftReceipt): Receipt | null {
  const [first, ...rest] = receipt.items.map((item) => ({ id: itemId(item.id), name: item.name.trim(), price: item.price }));
  if (!first) return null;
  const adjustments = receipt.adjustments.map((row) => ({ ...row, id: adjustmentId(row.id), name: row.name.trim() || adjustmentNames[row.kind] }));
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

const gapReason = (what: string, gap: number) => `${what} ${dollars(Math.abs(gap))} ${gap > 0 ? "short" : "over"}.`;

export function blockedReason({ scan, handles, names }: Draft): string | null {
  if (scan.status === "empty") return "Add a receipt.";
  if (scan.status === "reading") return "Reading the receipt.";
  if (hasAmountOverLimit(scan.receipt)) return `An amount is over $${(MAX_CENTS / 100).toLocaleString("en-US")}.`;
  const check = totalCheck(scan.receipt);
  if (!check) return "Add an item.";
  if (!check.ok) {
    if (check.subtotalGap !== 0) return gapReason("Items are", check.subtotalGap);
    return gapReason(scan.receipt.subtotal === null ? "Items are" : "Tax and charges are", check.totalGap);
  }
  if (scan.receipt.items.some((item) => !item.name.trim())) return "Name every item.";
  if (!handles.some((row) => row.handle.trim())) return "Add how to pay you.";
  if (names.length === 0) return "Add your name.";
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
  if (scan.status === "empty" || scan.status === "reading") return { status: "empty" };
  const linked = scan.status === "linked" && typeof scan.splitId === "string" && isRoutableSplitId(scan.splitId);
  if ((scan.status !== "read" && !linked) || !isFile(scan.file) || !isObject(scan.receipt)) return null;
  const { items, adjustments, subtotal, tip, totalBeforeTip, nextId } = scan.receipt;
  const valid =
    Array.isArray(items) &&
    items.every(isItem) &&
    Array.isArray(adjustments) &&
    adjustments.every(isAdjustment) &&
    (subtotal === null || isAmount(subtotal)) &&
    isPrice(tip) &&
    isAmount(totalBeforeTip) &&
    Number.isSafeInteger(nextId);
  if (!valid) return null;
  const read = { status: "read" as const, file: scan.file, receipt: scan.receipt as DraftReceipt };
  return linked ? { ...read, status: "linked", splitId: scan.splitId as SplitId } : read;
}

const isItem = (item: unknown) =>
  isObject(item) &&
  isId(item.id) &&
  isText(item.name) &&
  isPrice(item.price) &&
  (item.discountExceededPrice === undefined || item.discountExceededPrice === true) &&
  (item.unreadPrice === undefined || item.unreadPrice === true) &&
  (item.retyped === undefined || item.retyped === true);

const isAdjustment = (row: unknown) =>
  isObject(row) && isId(row.id) && ADJUSTMENT_KINDS.includes(row.kind as AdjustmentKind) && row.kind !== "tip" && isText(row.name) && isAmount(row.amount);
