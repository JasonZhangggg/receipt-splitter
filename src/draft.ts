import { cents, MAX_CENTS, price, type Cents } from "./core/money";
import { canonicalName, handleProblem, isName, MAX_ADJUSTMENTS, MAX_ITEMS, MAX_PARTICIPANT_NAME_LENGTH, MAX_ROW_NAME_LENGTH, nameKey, type HandleProblem, type NewSplit, type RejectionReason } from "./core/operations";
import { adjustmentId, PAYMENT_SERVICES, type Adjustment, type Item, type NonEmpty, type ParticipantId, type PaymentHandle, type PaymentService, type Receipt } from "./core/split";
import { runTotalCheck, type FailedTotalCheck } from "./core/total-check";

/** One picked photo. Nothing reads it but its identity, which keys the cleaned copy to the scan it came from. */
export type ReceiptFile = object;

/** A read holds the Receipt Create split link sends, or null when it found no Item, and the business name the server read from it. `notReceipt` is the reader saying the photo shows no receipt. `byHand` is a Host who adds every Item on the Split page. */
type Scan =
  | { readonly status: "empty" }
  | { readonly status: "reading"; readonly file: ReceiptFile }
  | { readonly status: "read"; readonly file: ReceiptFile; readonly receipt: Receipt | null; readonly place?: string; readonly totalUnread?: true; readonly notReceipt?: true }
  | { readonly status: "byHand" };

export type HandleRow = { readonly service: PaymentService; readonly handle: string };

/** The Host is apart from the friends, so friends can be named before the Host is. */
export type Draft = { readonly scan: Scan; readonly handles: readonly HandleRow[]; readonly host: string | null; readonly friends: readonly string[] };

export type DraftAction =
  | { readonly type: "reading"; readonly file: ReceiptFile }
  | { readonly type: "read"; readonly file: ReceiptFile; readonly receipt: Receipt | null; readonly place?: string; readonly totalUnread?: true; readonly notReceipt?: true }
  | { readonly type: "byHand" }
  | { readonly type: "setPlace"; readonly name: string }
  | { readonly type: "created" }
  | { readonly type: "setService"; readonly index: number; readonly service: PaymentService }
  | { readonly type: "setHandle"; readonly index: number; readonly handle: string }
  | { readonly type: "addHandle" }
  | { readonly type: "removeHandle"; readonly index: number }
  | { readonly type: "setHost"; readonly name: string }
  | { readonly type: "removeHost" }
  | { readonly type: "addFriend"; readonly name: string }
  | { readonly type: "removeFriend"; readonly name: string };

const MAX_GRAPHEMES = 80;

/** The longest place name home keeps, read or typed. */
export const MAX_HOME_PLACE_LENGTH = 32;

export const emptyDraft: Draft = { scan: { status: "empty" }, handles: [{ service: "venmo", handle: "" }], host: null, friends: [] };

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

/** Every name in the Draft, the Host first when there is one. */
export const draftNames = ({ host, friends }: Draft): readonly string[] => (host === null ? friends : [host, ...friends]);

export function reduceDraft(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "reading":
      return { ...draft, scan: { status: "reading", file: action.file } };
    case "read":
      return { ...draft, scan: { status: "read", file: action.file, receipt: action.receipt && sendable(action.receipt), ...(action.receipt && action.place && { place: action.place }), ...(action.totalUnread && { totalUnread: true as const }), ...(action.notReceipt && { notReceipt: true as const }) } };
    case "byHand":
      return { ...draft, scan: { status: "byHand" } };
    case "setPlace": {
      // A place can be edited or removed, never added: a read that found none has nothing to edit.
      if (draft.scan.status !== "read" || draft.scan.place === undefined) return draft;
      const { place: _, ...rest } = draft.scan;
      const name = clip(canonicalName(action.name), MAX_HOME_PLACE_LENGTH);
      return { ...draft, scan: isName(name, MAX_HOME_PLACE_LENGTH) ? { ...rest, place: name } : rest };
    }
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
    case "setHost": {
      const named = newName(action.name, draft.friends);
      return named.ok ? { ...draft, host: named.name } : draft;
    }
    case "removeHost":
      return { ...draft, host: null };
    case "addFriend": {
      const named = newName(action.name, draftNames(draft));
      return named.ok ? { ...draft, friends: [...draft.friends, named.name] } : draft;
    }
    case "removeFriend":
      return { ...draft, friends: draft.friends.filter((name) => name !== action.name) };
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

/** More Adjustments than a Split holds, with the Tip as one, would gray Create, so the whole-receipt discounts become one row. */
function mergedDiscounts(adjustments: readonly Adjustment[]): Adjustment[] {
  const discounts = adjustments.filter((row) => row.kind === "discount");
  if (adjustments.length < MAX_ADJUSTMENTS || discounts.length < 2) return [...adjustments];
  const merged = { id: discounts[0].id, kind: "discount" as const, name: "Discounts", amount: cents(Math.max(sum(discounts.map((row) => row.amount)), -MAX_CENTS)) };
  return [merged, ...adjustments.filter((row) => row.kind !== "discount")];
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
  // A tip is never negative: a negative one is a cash tender or a refund the reading took for a tip.
  const tip = sum(read.adjustments.filter((row) => row.kind === "tip" && readable(row.amount)).map((row) => row.amount));
  const withTip = [...mergedDiscounts(adjustments), { id: adjustmentId("tip"), kind: "tip" as const, name: "Tip", amount: cents(readable(tip) ? tip : 0) }];
  const subtotal = readable(read.subtotal) ? read.subtotal : clamped(sum(read.items.map((item) => Math.min(item.price, MAX_CENTS))));
  const total = readable(read.total) ? read.total : clamped(subtotal + sum(withTip.map((row) => row.amount)));
  return { items, adjustments: withTip, subtotal, total };
}

export const filledHandles = (handles: readonly HandleRow[]): PaymentHandle[] =>
  handles.flatMap(({ service, handle }) => (handle.trim() ? [{ service, handle: handle.trim() }] : []));

export function splitRequest({ receipt, place, paymentHandles, names: [host, ...others] }: Ready, newId: () => ParticipantId): Omit<NewSplit, "id"> {
  return { ...(place !== undefined && { place }), receipt, participants: [{ id: newId(), name: host }, ...others.map((name) => ({ id: newId(), name }))], paymentHandles };
}

const amountPattern = /^\d{0,6}(\.\d{0,2})?$/;

export function parseAmount(text: string): Cents | null {
  if (!amountPattern.test(text)) return null;
  const [whole = "", part = ""] = text.split(".");
  const amount = Number(whole || 0) * 100 + Number(part.padEnd(2, "0"));
  return amount > MAX_CENTS ? null : cents(amount);
}

/** For fields and copied values, which other apps parse: no thousands separator. */
export const plainAmount = (amount: number) => `${amount < 0 ? "-" : ""}${(Math.abs(amount) / 100).toFixed(2)}`;

/** For reading: "1,234.56". */
export const groupedAmount = (amount: number) => plainAmount(amount).replace(/\d(?=(\d{3})+\.)/g, "$&,");

export const money = (amount: number) => `${amount < 0 ? "-" : ""}$${groupedAmount(Math.abs(amount))}`;

const gapText = (what: string, gap: number, against: string) => `${what} ${money(Math.abs(gap))} ${gap > 0 ? "short of" : "over"} the ${against}.`;

export function gapNote({ subtotalGap, totalGap }: FailedTotalCheck): string {
  if (subtotalGap !== 0) return gapText("Items are", subtotalGap, "subtotal");
  return gapText("Tax and charges are", totalGap, "total");
}

export function mismatchNote({ scan }: Draft): string | null {
  if (scan.status !== "read" || !scan.receipt) return null;
  const check = runTotalCheck(scan.receipt);
  if (!check.ok) return gapNote(check);
  return scan.totalUnread ? "Couldn't read the total, so check the rows." : null;
}

/** A `note` is about the Receipt. `reading` has no words of its own, since the sentence says the step. `noName` and `badHandle` name the field a tap on Create focuses. */
export type Blocker =
  | { readonly kind: "note"; readonly note: string }
  | { readonly kind: "reading" }
  | { readonly kind: "noName" }
  | { readonly kind: "badHandle"; readonly index: number; readonly service: PaymentService; readonly problem: HandleProblem };

export type Ready = { readonly kind: "ready"; readonly receipt: Receipt; readonly place?: string; readonly paymentHandles: readonly PaymentHandle[]; readonly names: NonEmpty<string> };

const note = (text: string): Blocker => ({ kind: "note", note: text });

const receiptByHand: Receipt = { items: [], adjustments: [{ id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(0) }], subtotal: cents(0), total: cents(0) };

export function readiness({ scan, handles, host, friends }: Draft): Blocker | Ready {
  if (scan.status === "empty") return note("Add a receipt first.");
  if (scan.status === "reading") return { kind: "reading" };
  const receipt = scan.status === "byHand" ? receiptByHand : scan.receipt;
  if (!receipt) return note(scan.status === "read" && scan.notReceipt ? "That doesn't look like a receipt. Try another photo." : "Couldn't read any items. Try another photo.");
  const { items, adjustments } = receipt;
  if (items.length > MAX_ITEMS) return note(`A split holds up to ${MAX_ITEMS} items. This receipt has ${items.length}.`);
  // The Tip is always one of the Adjustments sent, so the receipt's own charges get one fewer.
  if (adjustments.length > MAX_ADJUSTMENTS) return note(`A split holds up to ${MAX_ADJUSTMENTS - 1} taxes, fees and discounts. This receipt has ${adjustments.length - 1}.`);
  for (const [index, { service, handle }] of handles.entries()) {
    const problem = handle.trim() === "" ? null : handleProblem({ service, handle: handle.trim() });
    if (problem) return { kind: "badHandle", index, service, problem };
  }
  if (host === null) return { kind: "noName" };
  return { kind: "ready", receipt, ...(scan.status === "read" && scan.place !== undefined && { place: scan.place }), paymentHandles: filledHandles(handles), names: [host, ...friends] };
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
