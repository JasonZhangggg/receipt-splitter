import { MAX_CENTS, cents, isCents, type Cents, type Price } from "./money";
import {
  SPLIT_BYTE_BUDGET,
  serializedBytes,
  type Adjustment,
  type AdjustmentId,
  type AdjustmentKind,
  type Change,
  type Claim,
  type Edit,
  type Item,
  type ItemId,
  type MintedSplitId,
  type NonEmpty,
  type Participant,
  type ParticipantId,
  type PaymentHandle,
  type PaymentService,
  type Placed,
  type Presence,
  type Receipt,
  type RowWrite,
  type Split,
  type SplitId,
  type Write,
} from "./split";
import { runTotalCheck, type FailedTotalCheck } from "./total-check";

export const MAX_ITEMS = 100;
export const MAX_ADJUSTMENTS = 20;
export const MAX_PARTICIPANTS = 30;
export const MAX_PARTICIPANT_NAME_LENGTH = 40;
export const MAX_ROW_NAME_LENGTH = 80;
export const RECENT_CHANGES_LIMIT = 50;
export const MAX_WRITES_PER_CHANGE = MAX_ITEMS + MAX_ADJUSTMENTS + 1;
export const PAYMENT_RESERVE_BYTES = 2 * 1024;
export const HISTORY_RESERVE_BYTES = 6 * 1024;

export type ItemPatch =
  | { readonly type: "add"; readonly item: Item; readonly index: number }
  | { readonly type: "edit"; readonly itemId: ItemId; readonly name?: string; readonly price?: Price }
  | { readonly type: "delete"; readonly itemId: ItemId };

export type AdjustmentPatch =
  | { readonly type: "add"; readonly adjustment: Adjustment; readonly index: number }
  | {
      readonly type: "edit";
      readonly adjustmentId: AdjustmentId;
      readonly kind?: AdjustmentKind;
      readonly name?: string;
      readonly amount?: Cents;
    }
  | { readonly type: "delete"; readonly adjustmentId: AdjustmentId };

export type Operation = (
  | {
      readonly type: "editReceipt";
      readonly items?: readonly ItemPatch[];
      readonly adjustments?: readonly AdjustmentPatch[];
      readonly subtotalDelta?: Cents;
      readonly totalDelta?: Cents;
    }
  | { readonly type: "addParticipant"; readonly participant: Participant }
  | { readonly type: "removeParticipant"; readonly participantId: ParticipantId }
  | ({ readonly type: "claim" } & Claim)
  | ({ readonly type: "unclaim" } & Claim)
  | { readonly type: "splitUnclaimed" }
  | { readonly type: "recordPayment"; readonly participantId: ParticipantId; readonly amount: Cents }
  | { readonly type: "clearPayment"; readonly participantId: ParticipantId }
  | { readonly type: "setPaymentHandles"; readonly handles: NonEmpty<PaymentHandle> }
  | { readonly type: "setJoined"; readonly participantId: ParticipantId; readonly joined: boolean }
  | { readonly type: "undo"; readonly revision: number }
) & { readonly by: ParticipantId | null };

export type Auth = { readonly creator: boolean };

export type RejectionReason =
  | "unknownParticipant"
  | "unknownItem"
  | "unknownAdjustment"
  | "duplicateId"
  | "badIndex"
  | "emptyEdit"
  | "lastItem"
  | "host"
  | "participantInUse"
  | "tooManyItems"
  | "tooManyAdjustments"
  | "tooManyParticipants"
  | "amountOutOfRange"
  | "negativeTotal"
  | "badName"
  | "badHandle"
  | "creatorRequired"
  | "changeNotFound"
  | "alreadyUndone"
  | "conflict"
  | "tooLarge";

export type Rejection =
  | { readonly reason: RejectionReason }
  | { readonly reason: "totalCheckFailed"; readonly check: FailedTotalCheck }
  | { readonly reason: "malformed"; readonly path: string };

export type Rejected = { readonly ok: false; readonly rejection: Rejection };

export type OperationResult = { readonly ok: true; readonly split: Split; readonly changed: boolean } | Rejected;

type Recorded = { readonly writes: NonEmpty<Write>; readonly undoes: number | null };

type Step = { readonly ok: true; readonly split: Split; readonly record: Recorded | null } | Rejected;

type MakeWrites = (split: Split) => readonly Write[] | RejectionReason;

export function applyOperation(split: Split, op: Operation, auth: Auth): OperationResult {
  const step = run(split, op, auth);
  if (!step.ok) return step;
  if (op.by !== null && !findParticipant(split, op.by) && !findParticipant(step.split, op.by)) {
    return reject("unknownParticipant");
  }
  if (step.split === split) return { ok: true, split, changed: false };
  const revision = split.revision + 1;
  const state: Split = { ...step.split, revision, recentChanges: [] };
  const rejection = checkState(state);
  if (rejection) return { ok: false, rejection };
  let recentChanges = step.split.recentChanges;
  if (step.record) {
    const change: Change = { revision, by: op.by, undoes: step.record.undoes, undoneBy: null, writes: step.record.writes };
    if (serializedBytes(change) > HISTORY_RESERVE_BYTES) return reject("tooLarge");
    recentChanges = [...recentChanges, change];
  }
  return { ok: true, split: { ...state, recentChanges: fitChanges(state, recentChanges) }, changed: true };
}

function run(split: Split, op: Operation, auth: Auth): Step {
  switch (op.type) {
    case "editReceipt": {
      const { items, adjustments, subtotalDelta, totalDelta } = op;
      if (!items && !adjustments && subtotalDelta === undefined && totalDelta === undefined) return reject("emptyEdit");
      return commit(split, [
        ...(items ?? []).map((patch): MakeWrites => (current) => itemWrites(current, patch)),
        ...(adjustments ?? []).map((patch): MakeWrites => (current) => adjustmentWrites(current, patch)),
        () => {
          const subtotal = subtotalDelta ?? cents(0);
          const total = totalDelta ?? cents(0);
          return subtotal === 0 && total === 0 ? [] : [{ kind: "totals", subtotalDelta: subtotal, totalDelta: total }];
        },
      ]);
    }
    case "addParticipant": {
      if (findParticipant(split, op.participant.id)) return reject("duplicateId");
      const { id, name } = op.participant;
      return commit(split, [() => [{ kind: "participant", id, added: { index: split.participants.length, name } }]]);
    }
    case "removeParticipant": {
      const index = indexOf(split.participants, op.participantId);
      if (index === -1) return reject("unknownParticipant");
      const { id, name } = split.participants[index];
      return commit(split, [() => [{ kind: "participant", id, removed: { index, name } }]]);
    }
    case "claim":
    case "unclaim": {
      const item = split.receipt.items.find(({ id }) => id === op.itemId);
      if (!item) return reject("unknownItem");
      if (!findParticipant(split, op.participantId)) return reject("unknownParticipant");
      const claimed = op.type === "claim";
      if (item.claimedBy.includes(op.participantId) === claimed) return unchanged(split);
      const write: Write = { kind: "claims", itemIds: [item.id], participantIds: [op.participantId], claimed };
      return commit(split, [() => [write]], { recorded: false });
    }
    case "splitUnclaimed": {
      const [first, ...rest] = split.receipt.items.filter(({ claimedBy }) => claimedBy.length === 0).map(({ id }) => id);
      if (first === undefined) return unchanged(split);
      const [lowest, ...higher] = sortByCodeUnit(split.participants.map(({ id }) => id));
      const participantIds: NonEmpty<ParticipantId> = [lowest, ...higher];
      return commit(split, [() => [{ kind: "claims", itemIds: [first, ...rest], participantIds, claimed: true }]]);
    }
    case "recordPayment":
    case "clearPayment": {
      const participantId = op.participantId;
      const index = indexOf(split.participants, participantId);
      if (index === -1) return reject("unknownParticipant");
      if (index === 0) return reject("host");
      const before = paymentOf(split, participantId);
      const after = op.type === "recordPayment" ? op.amount : null;
      return commit(split, [() => (before === after ? [] : [{ kind: "payment", participantId, before, after }])]);
    }
    case "setPaymentHandles": {
      if (!auth.creator) return reject("creatorRequired");
      const paymentHandles = canonicalHandles(op.handles);
      if (JSON.stringify(paymentHandles) === JSON.stringify(split.paymentHandles)) return unchanged(split);
      return { ok: true, split: { ...split, paymentHandles }, record: null };
    }
    case "setJoined": {
      if (!findParticipant(split, op.participantId)) return reject("unknownParticipant");
      if (split.joined.includes(op.participantId) === op.joined) return unchanged(split);
      const others = split.joined.filter((id) => id !== op.participantId);
      return { ok: true, split: { ...split, joined: op.joined ? sortByCodeUnit([...others, op.participantId]) : others }, record: null };
    }
    case "undo":
      return undo(split, op.revision);
  }
}

function undo(split: Split, revision: number): Step {
  const target = split.recentChanges.find((change) => change.revision === revision);
  if (!target) return reject("changeNotFound");
  if (target.undoneBy !== null) return reject("alreadyUndone");
  const step = commit(
    split,
    [...target.writes].reverse().map((write): MakeWrites => (current) => inverse(current, write)),
  );
  if (!step.ok) return step;
  if (!step.record) return reject("conflict");
  const recentChanges = step.split.recentChanges.map((change) =>
    change.revision === revision ? { ...change, undoneBy: split.revision + 1 } : change,
  );
  return { ok: true, split: { ...step.split, recentChanges }, record: { writes: step.record.writes, undoes: revision } };
}

function inverse(split: Split, write: Write): readonly Write[] {
  switch (write.kind) {
    case "item":
      return [{ kind: "item", ...invertRow(write, indexOf(split.receipt.items, write.id)) }];
    case "adjustment":
      return [{ kind: "adjustment", ...invertRow(write, indexOf(split.receipt.adjustments, write.id)) }];
    case "participant":
      return [{ kind: "participant", ...invertPresence(write, indexOf(split.participants, write.id)) }];
    case "totals":
      return [{ kind: "totals", subtotalDelta: cents(0 - write.subtotalDelta), totalDelta: cents(0 - write.totalDelta) }];
    case "payment":
      return [{ kind: "payment", participantId: write.participantId, before: write.after, after: write.before }];
    case "claims":
      return claimsStillHeld(split, write);
  }
}

function indexOf<RowId>(rows: readonly { readonly id: RowId }[], id: RowId): number {
  return rows.findIndex((row) => row.id === id);
}

function invertPresence<RowId, Fields>(write: Presence<RowId, Fields>, at: number): Presence<RowId, Fields> {
  if (!("added" in write)) return { id: write.id, added: write.removed };
  return { id: write.id, removed: { ...write.added, index: at } };
}

function invertRow<RowId, Fields, Editable extends keyof Fields>(
  write: RowWrite<RowId, Fields, Editable>,
  at: number,
): RowWrite<RowId, Fields, Editable> {
  if (!("edit" in write)) return invertPresence(write, at);
  const swapped: { [Key in Editable]?: readonly [Fields[Key], Fields[Key]] } = {};
  for (const key in write.edit) {
    const change = write.edit[key];
    if (change) swapped[key] = [change[1], change[0]];
  }
  return { id: write.id, edit: swapped };
}

function claimsStillHeld(split: Split, write: Extract<Write, { kind: "claims" }>): Write[] {
  const itemsById = new Map(split.receipt.items.map((item) => [item.id, item]));
  const present = new Set<ParticipantId>(split.participants.map(({ id }) => id));
  const byClaimers = new Map<string, { itemIds: [ItemId, ...ItemId[]]; participantIds: NonEmpty<ParticipantId> }>();
  for (const itemId of write.itemIds) {
    const item = itemsById.get(itemId);
    if (!item) continue;
    const [first, ...rest] = write.participantIds.filter((id) =>
      write.claimed ? item.claimedBy.includes(id) : present.has(id) && !item.claimedBy.includes(id),
    );
    if (first === undefined) continue;
    const key = [first, ...rest].join(",");
    const claims = byClaimers.get(key);
    if (claims) claims.itemIds.push(itemId);
    else byClaimers.set(key, { itemIds: [itemId], participantIds: [first, ...rest] });
  }
  return [...byClaimers.values()].map(({ itemIds, participantIds }) => ({
    kind: "claims",
    itemIds,
    participantIds,
    claimed: !write.claimed,
  }));
}

function commit(split: Split, makers: readonly MakeWrites[], { recorded } = { recorded: true }): Step {
  let next = split;
  const writes: Write[] = [];
  for (const make of makers) {
    const made = make(next);
    if (typeof made === "string") return reject(made);
    for (const write of made) {
      const applied = applyWrite(next, write);
      if (typeof applied === "string") return reject(applied);
      next = applied;
      writes.push(write);
    }
  }
  const [first, ...rest] = writes;
  if (first === undefined) return unchanged(split);
  return { ok: true, split: next, record: recorded ? { writes: [first, ...rest], undoes: null } : null };
}

function itemWrites(split: Split, patch: ItemPatch): readonly Write[] | RejectionReason {
  const items = split.receipt.items;
  if (patch.type === "add") {
    if (items.some(({ id }) => id === patch.item.id)) return "duplicateId";
    if (!isInsertIndex(patch.index, items.length)) return "badIndex";
    const { id, name, price } = patch.item;
    return [{ kind: "item", id, added: { index: patch.index, name, price, claimedBy: [] } }];
  }
  const index = indexOf(items, patch.itemId);
  if (index === -1) return "unknownItem";
  const { id, name, price, claimedBy } = items[index];
  if (patch.type === "delete") return [{ kind: "item", id, removed: { index, name, price, claimedBy } }];
  const edit = diff({ name, price }, { name: patch.name, price: patch.price });
  return typeof edit === "string" ? edit : edit ? [{ kind: "item", id, edit }] : [];
}

function adjustmentWrites(split: Split, patch: AdjustmentPatch): readonly Write[] | RejectionReason {
  const adjustments = split.receipt.adjustments;
  if (patch.type === "add") {
    if (adjustments.some(({ id }) => id === patch.adjustment.id)) return "duplicateId";
    if (!isInsertIndex(patch.index, adjustments.length)) return "badIndex";
    const { id, kind, name, amount } = patch.adjustment;
    return [{ kind: "adjustment", id, added: { index: patch.index, kind, name, amount } }];
  }
  const index = indexOf(adjustments, patch.adjustmentId);
  if (index === -1) return "unknownAdjustment";
  const { id, kind, name, amount } = adjustments[index];
  if (patch.type === "delete") return [{ kind: "adjustment", id, removed: { index, kind, name, amount } }];
  const edit = diff({ kind, name, amount }, { kind: patch.kind, name: patch.name, amount: patch.amount });
  return typeof edit === "string" ? edit : edit ? [{ kind: "adjustment", id, edit }] : [];
}

function diff<Fields>(
  row: Fields,
  patch: { readonly [Key in keyof Fields]?: Fields[Key] },
): Edit<Fields> | "emptyEdit" | null {
  const edit: { [Key in keyof Fields]?: readonly [Fields[Key], Fields[Key]] } = {};
  let named = false;
  let changed = false;
  for (const key in patch) {
    const value = patch[key];
    if (value === undefined) continue;
    named = true;
    if (value === row[key]) continue;
    edit[key] = [row[key], value];
    changed = true;
  }
  if (!named) return "emptyEdit";
  return changed ? edit : null;
}

function applyWrite(split: Split, write: Write): Split | RejectionReason {
  const receipt = split.receipt;
  switch (write.kind) {
    case "item": {
      if (!keepsNameValid(write, MAX_ROW_NAME_LENGTH)) return "badName";
      if ("added" in write && !write.added.claimedBy.every((id) => findParticipant(split, id))) return "conflict";
      const rows = putRow(receipt.items, write, 0, ({ name, price, claimedBy }) => ({ id: write.id, name, price, claimedBy }));
      if (typeof rows === "string") return rows;
      const [first, ...rest] = rows;
      if (first === undefined) return "lastItem";
      return { ...split, receipt: { ...receipt, items: [first, ...rest] } };
    }
    case "adjustment": {
      if (!keepsNameValid(write, MAX_ROW_NAME_LENGTH)) return "badName";
      const rows = putRow(receipt.adjustments, write, 0, ({ kind, name, amount }) => ({ id: write.id, kind, name, amount }));
      return typeof rows === "string" ? rows : { ...split, receipt: { ...receipt, adjustments: rows } };
    }
    case "participant": {
      const [host, ...others] = split.participants;
      if (write.id === host.id) return "host";
      if (!keepsNameValid(write, MAX_PARTICIPANT_NAME_LENGTH)) return "badName";
      if ("removed" in write) {
        const claimed = split.receipt.items.some(({ claimedBy }) => claimedBy.includes(write.id));
        if (claimed || split.joined.includes(write.id) || paymentOf(split, write.id) !== null) return "participantInUse";
      }
      const rows = putRow(others, write, 1, ({ name }) => ({ id: write.id, name }));
      return typeof rows === "string" ? rows : { ...split, participants: [host, ...rows] };
    }
    case "totals": {
      const subtotal = receipt.subtotal + write.subtotalDelta;
      const total = receipt.total + write.totalDelta;
      if (!isCents(subtotal) || !isCents(total)) return "amountOutOfRange";
      return { ...split, receipt: { ...receipt, subtotal, total } };
    }
    case "payment": {
      if (!findParticipant(split, write.participantId) || paymentOf(split, write.participantId) !== write.before) {
        return "conflict";
      }
      const others = split.payments.filter(({ participantId }) => participantId !== write.participantId);
      if (write.after === null) return { ...split, payments: others };
      const payments = [...others, { participantId: write.participantId, amount: write.after }];
      return { ...split, payments: payments.sort((a, b) => compareCodeUnits(a.participantId, b.participantId)) };
    }
    case "claims": {
      const targets = new Set<ItemId>(write.itemIds);
      const found = receipt.items.filter(({ id }) => targets.has(id)).length;
      const claimersExist = !write.claimed || write.participantIds.every((id) => findParticipant(split, id));
      if (found !== targets.size || !claimersExist) return "conflict";
      const toggle = (claimedBy: readonly ParticipantId[]) =>
        write.claimed
          ? sortByCodeUnit([...new Set([...claimedBy, ...write.participantIds])])
          : claimedBy.filter((id) => !write.participantIds.includes(id));
      const [first, ...rest] = receipt.items.map((item) =>
        targets.has(item.id) ? { ...item, claimedBy: toggle(item.claimedBy) } : item,
      );
      return { ...split, receipt: { ...receipt, items: [first, ...rest] } };
    }
  }
}

function keepsNameValid(write: Extract<Write, { kind: "item" | "adjustment" | "participant" }>, maxLength: number): boolean {
  if ("added" in write) return isName(write.added.name, maxLength);
  if ("edit" in write && write.edit.name) return isName(write.edit.name[1], maxLength);
  return true;
}

function putRow<RowId, Fields, Editable extends keyof Fields, Row extends { readonly id: RowId }>(
  rows: readonly Row[],
  write: RowWrite<RowId, Fields, Editable>,
  offset: number,
  build: (placed: Placed<Fields>) => Row,
): Row[] | "conflict" {
  const at = indexOf(rows, write.id);
  if ("added" in write) {
    if (at !== -1) return "conflict";
    const position = Math.max(0, Math.min(write.added.index - offset, rows.length));
    return [...rows.slice(0, position), build(write.added), ...rows.slice(position)];
  }
  if (at === -1) return "conflict";
  if ("removed" in write) {
    return holds(rows[at], write.removed) ? rows.filter((_, position) => position !== at) : "conflict";
  }
  const before: Partial<Fields> = {};
  const after: Partial<Fields> = {};
  for (const key in write.edit) {
    const change = write.edit[key];
    if (!change) continue;
    before[key] = change[0];
    after[key] = change[1];
  }
  if (!holds(rows[at], before)) return "conflict";
  return rows.map((row, position) => (position === at ? { ...row, ...after } : row));
}

function holds(row: object, expected: object): boolean {
  const current = new Map(Object.entries(row));
  return Object.entries(expected).every(
    ([key, value]) => key === "index" || JSON.stringify(current.get(key)) === JSON.stringify(value),
  );
}

function fitChanges(state: Split, changes: readonly Change[]): readonly Change[] {
  const sizes = changes.map(serializedBytes);
  let bytes = serializedBytes(state) + sizes.reduce((sum, size) => sum + size + 1, -1);
  let start = 0;
  while (start < changes.length - 1 && (changes.length - start > RECENT_CHANGES_LIMIT || bytes > SPLIT_BYTE_BUDGET)) {
    bytes -= sizes[start] + 1;
    start += 1;
  }
  return changes.slice(start);
}

function findParticipant(split: Split, participantId: ParticipantId): Participant | undefined {
  return split.participants.find(({ id }) => id === participantId);
}

function paymentOf(split: Split, participantId: ParticipantId): Cents | null {
  return split.payments.find((payment) => payment.participantId === participantId)?.amount ?? null;
}

function isInsertIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= length;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortByCodeUnit<T extends string>(ids: readonly T[]): T[] {
  return [...ids].sort(compareCodeUnits);
}

function unchanged(split: Split): Step {
  return { ok: true, split, record: null };
}

function reject(reason: RejectionReason): Rejected {
  return { ok: false, rejection: { reason } };
}

const HANDLE_RULES: { readonly [Service in PaymentService]: { readonly sigil: string; readonly pattern: RegExp } } = {
  venmo: { sigil: "@", pattern: /^[A-Za-z0-9_-]{5,30}$/ },
  cashApp: { sigil: "$", pattern: /^(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,20}$/ },
  paypal: { sigil: "", pattern: /^[A-Za-z0-9]{1,20}$/ },
  zelle: { sigil: "", pattern: /^(?:(?=.{3,80}$)[^\s@]+@[^\s@]+\.[^\s@]+|\d{10})$/ },
};

function canonicalHandles(handles: NonEmpty<PaymentHandle>): NonEmpty<PaymentHandle> {
  const canonical = ({ service, handle }: PaymentHandle): PaymentHandle => {
    const { sigil } = HANDLE_RULES[service];
    return { service, handle: sigil !== "" && handle.startsWith(sigil) ? handle.slice(sigil.length) : handle };
  };
  const [first, ...rest] = handles;
  return [canonical(first), ...rest.map(canonical)];
}

export type NewSplit = {
  readonly id: MintedSplitId;
  readonly receipt: Receipt;
  readonly participants: Split["participants"];
  readonly paymentHandles: NonEmpty<PaymentHandle>;
};

export type CreateSplitRequest = {
  readonly turnstileToken: string;
  readonly split: Omit<NewSplit, "id">;
};

export type CreateSplitResponse = { readonly id: SplitId; readonly creatorSecret: string };

export type CreateSplitRefusal =
  | { readonly refused: "bodyTooLarge" | "turnstileFailed" | "turnstileUnavailable" | "rateLimited" }
  | { readonly refused: "rejected"; readonly rejection: Rejection };

export type ClientMessage = {
  readonly ref: string;
  readonly op: Operation;
  readonly creatorSecret?: string;
};

export type WireRejection =
  | Rejection
  | { readonly reason: "rateLimited"; readonly retryAfterMs: number }
  | { readonly reason: "messageTooLarge" };

/** While the Split is live, each ClientMessage gets exactly one answer, in the order sent: a `state` or `unchanged` carrying its ref, or a `rejected` whose ref is null when the frame was refused before its ref was read. A `state` with a null ref is the snapshot on connect or someone else's change. `unavailable` ends the socket. A frame sent before the `retryAfterMs` of the socket's preceding `rateLimited` refusal has elapsed is early. The 100th early frame since the socket's last admitted frame gets its `rejected`, and then the socket is closed with code 1008 and reason `rateLimited`. A frame that waits out `retryAfterMs` neither counts nor resets the count. No frame after a close gets an answer. */
export type ServerMessage =
  | { readonly type: "state"; readonly ref: string | null; readonly split: Split }
  | { readonly type: "unchanged"; readonly ref: string; readonly revision: number }
  | { readonly type: "rejected"; readonly ref: string | null; readonly rejection: WireRejection }
  | { readonly type: "unavailable"; readonly reason: "notFound" | "unreadable" };

export function createSplit(input: NewSplit): { readonly ok: true; readonly split: Split } | Rejected {
  const { items, adjustments, subtotal, total } = input.receipt;
  const unclaimed = ({ id, name, price }: Item) => ({ id, name, price, claimedBy: [] });
  const [first, ...rest] = items;
  const split: Split = {
    schemaVersion: 1,
    id: input.id,
    currency: "USD",
    receipt: { items: [unclaimed(first), ...rest.map(unclaimed)], adjustments, subtotal, total },
    participants: input.participants,
    joined: [input.participants[0].id],
    payments: [],
    paymentHandles: canonicalHandles(input.paymentHandles),
    revision: 0,
    recentChanges: [],
  };
  const rejection = checkSplit(split);
  return rejection ? { ok: false, rejection } : { ok: true, split };
}

export function checkSplit(split: Split): Rejection | null {
  const rejection = checkState({ ...split, recentChanges: [] });
  if (rejection) return rejection;
  const { items, adjustments } = split.receipt;
  const rowsNamed = [...items, ...adjustments].every(({ name }) => isName(name, MAX_ROW_NAME_LENGTH));
  const participantsNamed = split.participants.every(({ name }) => isName(name, MAX_PARTICIPANT_NAME_LENGTH));
  if (!rowsNamed || !participantsNamed) return { reason: "badName" };
  const revisions = split.recentChanges.map(({ revision }) => revision);
  if (!isStrictlySorted(revisions) || revisions.some((revision) => revision > split.revision)) {
    return { reason: "malformed", path: "recentChanges" };
  }
  if (split.recentChanges.length > RECENT_CHANGES_LIMIT || serializedBytes(split) > SPLIT_BYTE_BUDGET) {
    return { reason: "tooLarge" };
  }
  return null;
}

function checkState(split: Split): Rejection | null {
  const { receipt, participants, payments, paymentHandles } = split;
  const { items, adjustments, subtotal, total } = receipt;
  if (items.length > MAX_ITEMS) return { reason: "tooManyItems" };
  if (adjustments.length > MAX_ADJUSTMENTS) return { reason: "tooManyAdjustments" };
  if (participants.length > MAX_PARTICIPANTS) return { reason: "tooManyParticipants" };
  if (!hasUniqueIds(items) || !hasUniqueIds(adjustments) || !hasUniqueIds(participants)) return { reason: "duplicateId" };

  const magnitudes = [
    ...items.map(({ price }) => price),
    ...adjustments.map(({ amount }) => Math.abs(amount)),
    subtotal,
    Math.abs(total),
    ...payments.map(({ amount }) => amount),
  ];
  if (magnitudes.some((amount) => amount < 0 || amount > MAX_CENTS)) return { reason: "amountOutOfRange" };
  if (payments.some(({ amount }) => amount < 1)) return { reason: "amountOutOfRange" };
  if (total < 0) return { reason: "negativeTotal" };

  const ids = new Set<ParticipantId>(participants.map(({ id }) => id));
  const [host] = participants;
  const unsorted = items.findIndex(({ claimedBy }) => !isStrictlySorted(claimedBy));
  if (unsorted !== -1) return { reason: "malformed", path: `receipt.items[${unsorted}].claimedBy` };
  const claimsValid = items.every(({ claimedBy }) => claimedBy.every((id) => ids.has(id)));
  const paidBy = payments.map(({ participantId }) => participantId);
  const paymentsValid = isStrictlySorted(paidBy) && paidBy.every((id) => ids.has(id) && id !== host.id);
  if (!isStrictlySorted(split.joined)) return { reason: "malformed", path: "joined" };
  if (!claimsValid || !paymentsValid || !split.joined.every((id) => ids.has(id))) return { reason: "unknownParticipant" };

  const services = paymentHandles.map(({ service }) => service);
  const handlesValid = paymentHandles.every(({ service, handle }) => HANDLE_RULES[service].pattern.test(handle));
  if (!handlesValid || new Set(services).size !== services.length) return { reason: "badHandle" };

  const check = runTotalCheck(receipt);
  if (!check.ok) return { reason: "totalCheckFailed", check };

  const core = serializedBytes({ ...split, payments: [], recentChanges: [] });
  if (core > SPLIT_BYTE_BUDGET - PAYMENT_RESERVE_BYTES - HISTORY_RESERVE_BYTES) return { reason: "tooLarge" };
  return null;
}

const HIDDEN_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uD800-\uDFFF]/u;
const BLANK = /^[\s\p{Default_Ignorable_Code_Point}\u2800]*$/u;
const MAX_UNITS_PER_GRAPHEME = 32;
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function isName(name: string, maxLength: number): boolean {
  if (name.length > maxLength * MAX_UNITS_PER_GRAPHEME || HIDDEN_CHARACTERS.test(name) || BLANK.test(name)) return false;
  const characters = [...graphemes.segment(name)];
  return characters.length <= maxLength && characters.every(({ segment }) => segment.length <= MAX_UNITS_PER_GRAPHEME);
}

function hasUniqueIds(rows: readonly { readonly id: string }[]): boolean {
  return new Set(rows.map(({ id }) => id)).size === rows.length;
}

function isStrictlySorted(values: readonly (string | number)[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}
