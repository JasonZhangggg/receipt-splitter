import { cents, MAX_CENTS, price, type Cents } from "./core/money";
import { canonicalName, isName, MAX_ADJUSTMENTS, MAX_ITEMS, MAX_PARTICIPANT_NAME_LENGTH, MAX_ROW_NAME_LENGTH, nameKey, type NewSplit, type RejectionReason } from "./core/operations";
import { adjustmentId, itemId, PAYMENT_SERVICES, type Adjustment, type Item, type NonEmpty, type ParticipantId, type PaymentHandle, type PaymentService, type Receipt } from "./core/split";
import { runTotalCheck, type FailedTotalCheck } from "./core/total-check";

export type ReceiptFile = { readonly name: string; readonly thumbnail: string | null };

/** A read holds the Receipt Create split link sends, or null when it found no Item, since a Split holds at least one. */
type Scan =
  | { readonly status: "empty" }
  | { readonly status: "reading"; readonly file: ReceiptFile }
  | { readonly status: "read"; readonly file: ReceiptFile; readonly receipt: Receipt | null };

export type HandleRow = { readonly service: PaymentService; readonly handle: string };

export type Draft = { readonly scan: Scan; readonly handles: readonly HandleRow[]; readonly names: readonly string[] };

export type DraftAction =
  | { readonly type: "reading"; readonly file: ReceiptFile }
  | { readonly type: "read"; readonly file: ReceiptFile; readonly receipt: Receipt | null }
  | { readonly type: "example" }
  | { readonly type: "created" }
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
    case "read":
      return { ...draft, scan: { status: "read", file: action.file, receipt: action.receipt && sendable(action.receipt) } };
    case "example":
      return { ...draft, scan: { status: "read", file: { name: "Example receipt", thumbnail: null }, receipt: sendable(example1040) } };
    case "created":
      return { ...emptyDraft, handles: draft.handles };
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
    default:
      return action satisfies never;
  }
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const inRange = (amount: number) => Math.abs(amount) <= MAX_CENTS;

const readable = (amount: number) => amount >= 0 && amount <= MAX_CENTS;

const clamped = (amount: number) => cents(Math.min(Math.max(amount, 0), MAX_CENTS));

/** The name as read, or null when it draws nothing, which the Split refuses. */
function rowName(read: string): string | null {
  const name = clip(read.trim());
  return isName(name, MAX_ROW_NAME_LENGTH) ? name : null;
}

const adjustmentNames: Record<Adjustment["kind"], string> = { tax: "Tax", tip: "Tip", serviceCharge: "Service charge", discount: "Discount", bundleDiscount: "Discount" };

/**
 * The Receipt a read sends, repaired where the Split would refuse it, so the rows reach the Split page to be fixed there:
 * an unnamed Item or Bundle is called by its place, an amount over the limit is sent as $0.00, and a Subtotal or Total outside $0.00 and the limit
 * is sent as the sum it should be, within them. The Subtotal's sum counts a price over the limit at the limit, so the Total check still shows its gap.
 */
function sendable(read: Receipt): Receipt | null {
  const [first, ...rest] = read.items.flatMap(({ id, name: readName, price: amount, detail, quantity }, place): Item[] => {
    const name = rowName(readName);
    if (name === null && amount === 0) return [];
    return [{ id, name: name ?? `Item ${place + 1}`, price: inRange(amount) ? amount : price(0), ...(detail && { detail }), ...(quantity && { quantity }) }];
  });
  if (!first) return null;
  const items: NonEmpty<Item> = [first, ...rest];
  const kept = new Set(items.map(({ id }) => id));
  const bundlePlaces = new Map(read.adjustments.filter((row) => row.kind === "bundleDiscount").map(({ id }, place) => [id, place + 1]));
  const adjustments = read.adjustments.flatMap((row): Adjustment[] => {
    if (row.kind === "tip") return [];
    const fields = { id: row.id, name: rowName(row.name) ?? adjustmentNames[row.kind], amount: inRange(row.amount) ? row.amount : cents(0) };
    if (row.kind !== "bundleDiscount") return [{ ...fields, kind: row.kind }];
    const [inside, ...others] = row.bundle.items.filter((id) => kept.has(id));
    if (inside === undefined) return [{ ...fields, kind: "discount" }];
    return [{ ...fields, kind: row.kind, bundle: { name: rowName(row.bundle.name) ?? `Bundle ${bundlePlaces.get(row.id)}`, items: [inside, ...others] } }];
  });
  const tip = sum(read.adjustments.filter((row) => row.kind === "tip").map((row) => row.amount));
  const withTip = [...adjustments, { id: adjustmentId("tip"), kind: "tip" as const, name: "Tip", amount: cents(inRange(tip) ? tip : 0) }];
  const subtotal = readable(read.subtotal) ? read.subtotal : clamped(sum(read.items.map((item) => Math.min(item.price, MAX_CENTS))));
  const total = readable(read.total) ? read.total : clamped(subtotal + sum(withTip.map((row) => row.amount)));
  return { items, adjustments: withTip, subtotal, total };
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

export const filledHandles = (handles: readonly HandleRow[]): PaymentHandle[] =>
  handles.flatMap(({ service, handle }) => (handle.trim() ? [{ service, handle: handle.trim() }] : []));

export function splitRequest({ receipt, paymentHandles, names: [host, ...others] }: Ready, newId: () => ParticipantId): Omit<NewSplit, "id"> {
  return { receipt, participants: [{ id: newId(), name: host }, ...others.map((name) => ({ id: newId(), name }))], paymentHandles };
}

const amountPattern = /^\d{0,6}(\.\d{0,2})?$/;

export function parseAmount(text: string): Cents | null {
  if (!amountPattern.test(text)) return null;
  const [whole = "", part = ""] = text.split(".");
  const amount = Number(whole || 0) * 100 + Number(part.padEnd(2, "0"));
  return amount > MAX_CENTS ? null : cents(amount);
}

export const plainAmount = (amount: number) => `${amount < 0 ? "-" : ""}${(Math.abs(amount) / 100).toFixed(2)}`;

const dollars = (amount: number) => `$${plainAmount(amount)}`;

const gapText = (what: string, gap: number, against: string) => `${what} ${dollars(Math.abs(gap))} ${gap > 0 ? "short of" : "over"} the ${against}.`;

export function gapNote({ subtotalGap, totalGap }: FailedTotalCheck): string {
  if (subtotalGap !== 0) return gapText("Items are", subtotalGap, "subtotal");
  return gapText("Tax and charges are", totalGap, "total");
}

export function mismatchNote({ scan }: Draft): string | null {
  if (scan.status !== "read" || !scan.receipt) return null;
  const check = runTotalCheck(scan.receipt);
  return check.ok ? null : gapNote(check);
}

export type Blocker = { readonly kind: "note"; readonly note: string } | { readonly kind: "noHandle" };

export type Ready = { readonly kind: "ready"; readonly receipt: Receipt; readonly paymentHandles: NonEmpty<PaymentHandle>; readonly names: NonEmpty<string> };

const note = (text: string): Blocker => ({ kind: "note", note: text });

export function readiness({ scan, handles, names }: Draft): Blocker | Ready {
  if (scan.status === "empty") return note("Add a receipt.");
  if (scan.status === "reading") return note("Reading the receipt.");
  if (!scan.receipt) return note("Couldn't read any items. Try another photo.");
  const { items, adjustments } = scan.receipt;
  if (items.length > MAX_ITEMS) return note(`A split holds up to ${MAX_ITEMS} items. This receipt has ${items.length}.`);
  // The Tip is always one of the Adjustments sent, so the receipt's own charges get one fewer.
  if (adjustments.length > MAX_ADJUSTMENTS) return note(`A split holds up to ${MAX_ADJUSTMENTS - 1} taxes, fees and discounts. This receipt has ${adjustments.length - 1}.`);
  const [first, ...rest] = filledHandles(handles);
  if (!first) return { kind: "noHandle" };
  const [host, ...others] = names;
  if (host === undefined) return note("Add your name.");
  return { kind: "ready", receipt: scan.receipt, paymentHandles: [first, ...rest], names: [host, ...others] };
}

type Store = Pick<Storage, "getItem" | "setItem">;

const key = "receipt-splitter:draft";

/** A reload of home starts a new split, so only the Payment handles are stored. */
export function saveDraft({ handles }: Draft, storage?: Store): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify({ version: 2, handles }));
  } catch {
    return;
  }
}

export function loadDraft(storage?: Store): Draft {
  try {
    const handles = storedHandles(JSON.parse((storage ?? globalThis.localStorage)?.getItem(key) ?? "null"));
    return handles ? { ...emptyDraft, handles } : emptyDraft;
  } catch {
    return emptyDraft;
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

// Version 1 held the whole Draft; its handles carry over so nobody retypes one after the deploy.
function storedHandles(saved: unknown): HandleRow[] | null {
  if (!isObject(saved)) return null;
  const handles = saved.version === 2 ? saved.handles : saved.version === 1 && isObject(saved.draft) ? saved.draft.handles : null;
  return Array.isArray(handles) && handles.length > 0 && handles.every(isHandle) ? handles : null;
}

const isHandle = (row: unknown): row is HandleRow =>
  isObject(row) && PAYMENT_SERVICES.includes(row.service as PaymentService) && typeof row.handle === "string";
