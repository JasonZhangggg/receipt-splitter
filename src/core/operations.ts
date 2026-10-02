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
  type DeviceId,
  type Item,
  type ItemId,
  type ItemSplit,
  type LegacyWrite,
  type Part,
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
  type SplitItem,
  type SplitMode,
  type Write,
} from "./split";
import { unitPrices } from "./shares";
import { runTotalCheck, type FailedTotalCheck } from "./total-check";

export const MAX_ITEMS = 100;
export const MAX_ADJUSTMENTS = 20;
export const MAX_PARTICIPANTS = 30;
export const MAX_PARTICIPANT_NAME_LENGTH = 40;
export const MAX_ROW_NAME_LENGTH = 80;
export const MAX_QUANTITY = 20;
export const MAX_SHARES = 99;
export const RECENT_CHANGES_LIMIT = 64;
export const MAX_WRITES_PER_CHANGE = MAX_ITEMS + MAX_ADJUSTMENTS + 1;
export const PAYMENT_RESERVE_BYTES = 2 * 1024;
export const MAX_CHANGE_BYTES = 5 * 1024;
/** Bytes of recorded changes a Split may write in one burst before the Worker's history rate refuses more. */
export const HISTORY_BURST_BYTES = MAX_CHANGE_BYTES;
const COMMAS_BETWEEN_CHANGES = RECENT_CHANGES_LIMIT;
export const HISTORY_RESERVE_BYTES = MAX_CHANGE_BYTES + HISTORY_BURST_BYTES + COMMAS_BETWEEN_CHANGES;

export type ItemPatch =
  | { readonly type: "add"; readonly item: Item; readonly index: number }
  | {
      readonly type: "edit";
      readonly itemId: ItemId;
      readonly name?: string;
      readonly price?: Price;
      /** Adds empty units or drops the last ones. */
      readonly quantity?: number;
      /** A new mode starts every claimer at 1 share or $0.00. */
      readonly by?: SplitMode;
      readonly values?: readonly ItemValue[];
    }
  | { readonly type: "delete"; readonly itemId: ItemId };

/** One claimer's share count or cents on one unit, applied after `quantity` and `by`. */
export type ItemValue = { readonly unit: number; readonly participantId: ParticipantId; readonly value: number };

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
  | { readonly type: "recordPayment"; readonly participantId: ParticipantId; readonly device: DeviceId; readonly amount: Cents }
  | { readonly type: "clearPayment"; readonly participantId: ParticipantId; readonly device: DeviceId }
  | { readonly type: "setPaymentHandles"; readonly handles: NonEmpty<PaymentHandle> }
  /** Picks a name for a device. With takeOver it moves a name another device picked, which is "That's me". Neither is recorded. */
  | { readonly type: "pick"; readonly participantId: ParticipantId; readonly device: DeviceId; readonly takeOver: boolean }
  | { readonly type: "undo"; readonly revision: number }
  | { readonly type: "restoreReceipt" }
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
  | "payerOnly"
  | "paymentNotRevertible"
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
  | "nameTaken"
  | "namePicked"
  | "removalNotAllowed"
  | "noOriginal"
  | "amountOverPrice"
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

export function applyOperation(split: Split, op: Operation, auth: Auth, at?: number): OperationResult {
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
  if (repeatedNames(state.participants) > repeatedNames(split.participants)) return reject("nameTaken");
  let recentChanges = step.split.recentChanges;
  if (step.record) {
    const change: Change = { revision, by: op.by, undoes: step.record.undoes, undoneBy: null, writes: step.record.writes, ...(at === undefined ? {} : { at }) };
    if (serializedBytes(change) <= MAX_CHANGE_BYTES) recentChanges = [...recentChanges, change];
    else if (op.type !== "restoreReceipt") return reject("tooLarge");
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
    case "removeParticipant":
      return reject("removalNotAllowed");
    case "claim":
    case "unclaim": {
      const index = indexOf(split.receipt.items, op.itemId);
      if (index === -1) return reject("unknownItem");
      if (!findParticipant(split, op.participantId)) return reject("unknownParticipant");
      const item = split.receipt.items[index];
      const unit = op.unit ?? 0;
      if (!Number.isInteger(unit) || unit < 0 || unit >= item.split.units.length) return reject("badIndex");
      const claimed = op.type === "claim";
      if (claimersOf(item.split, unit).includes(op.participantId) === claimed) return unchanged(split);
      const next = { ...item, split: toggleClaimer(item.split, unit, op.participantId, claimed) };
      const [first, ...rest] = split.receipt.items.map((row, at) => (at === index ? next : row));
      return { ok: true, split: { ...split, receipt: { ...split.receipt, items: [first, ...rest] } }, record: null };
    }
    case "recordPayment":
    case "clearPayment": {
      const participantId = op.participantId;
      const index = indexOf(split.participants, participantId);
      if (index === -1) return reject("unknownParticipant");
      if (index === 0) return reject("host");
      if (!split.picks.some((pick) => pick.participantId === participantId && pick.device === op.device)) return reject("payerOnly");
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
    case "pick": {
      const { participantId, device, takeOver } = op;
      if (!findParticipant(split, participantId)) return reject("unknownParticipant");
      const held = split.picks.find((pick) => pick.participantId === participantId);
      if (held?.device === device) return unchanged(split);
      if (held && !takeOver) return reject("namePicked");
      const others = split.picks.filter((pick) => pick.participantId !== participantId);
      const picks = [...others, { participantId, device }].sort((a, b) => compareCodeUnits(a.participantId, b.participantId));
      return { ok: true, split: { ...split, picks }, record: null };
    }
    case "undo":
      return undo(split, op.revision);
    case "restoreReceipt": {
      const { original } = split;
      if (!original) return reject("noOriginal");
      return commit(split, [
        ...restoreRows(original.items, ITEM_ROWS),
        ...restoreRows(original.adjustments, ADJUSTMENT_ROWS),
        ({ receipt }) => {
          const subtotalDelta = cents(original.subtotal - receipt.subtotal);
          const totalDelta = cents(original.total - receipt.total);
          return subtotalDelta === 0 && totalDelta === 0 ? [] : [{ kind: "totals", subtotalDelta, totalDelta }];
        },
      ]);
    }
  }
}

type RowCodec<Row extends { readonly id: string }, Original extends { readonly id: string }> = {
  readonly rows: (split: Split) => readonly Row[];
  readonly add: (row: Original, index: number, moved: Row | undefined) => Write;
  readonly remove: (row: Row, index: number) => Write;
  readonly edit: (row: Row, to: Original) => readonly Write[];
};

const ITEM_ROWS: RowCodec<SplitItem, Item> = {
  rows: (split) => split.receipt.items,
  add: ({ id, name, price, quantity = 1 }, index, moved) => ({
    kind: "item",
    id,
    added: { index, name, price, split: evenIfOverPrice(resize(moved?.split ?? evenUnits(1), quantity), price) },
  }),
  remove: ({ id, name, price, split }, index) => ({ kind: "item", id, removed: { index, name, price, split } }),
  edit: ({ id, name, price, split }, to) => {
    const edit = diff({ name, price, split }, { name: to.name, price: to.price, split: evenIfOverPrice(resize(split, to.quantity ?? 1), to.price) });
    return edit === null || edit === "emptyEdit" ? [] : [{ kind: "item", id, edit }];
  },
};

export function evenUnits(quantity: number): ItemSplit {
  return { by: "even", units: [[], ...Array.from({ length: quantity - 1 }, () => [])] };
}

export function claimersOf(split: ItemSplit, unit: number): readonly ParticipantId[] {
  return split.by === "even" ? split.units[unit] : split.units[unit].map(([id]) => id);
}

function unitsOf(split: ItemSplit): (readonly ParticipantId[])[] {
  return split.units.map((_, unit) => claimersOf(split, unit));
}

const STARTING_VALUE = { shares: 1, amount: 0 } as const;

function withClaimers(by: SplitMode, claimers: readonly (readonly ParticipantId[])[], valueOf: (unit: number, id: ParticipantId) => number | undefined): ItemSplit {
  const [first = [], ...rest] = claimers;
  if (by === "even") return { by, units: [first, ...rest] };
  const value = (unit: number, id: ParticipantId) => valueOf(unit, id) ?? STARTING_VALUE[by];
  if (by === "shares") {
    const shares = (ids: readonly ParticipantId[], unit: number) => ids.map((id): Part<number> => [id, value(unit, id)]);
    return { by, units: [shares(first, 0), ...rest.map((ids, unit) => shares(ids, unit + 1))] };
  }
  const amounts = (ids: readonly ParticipantId[], unit: number) => ids.map((id): Part<Cents> => [id, cents(value(unit, id))]);
  return { by, units: [amounts(first, 0), ...rest.map((ids, unit) => amounts(ids, unit + 1))] };
}

function valueIn(split: ItemSplit, unit: number, id: ParticipantId): number | undefined {
  return split.by === "even" ? undefined : split.units[unit]?.find(([claimer]) => claimer === id)?.[1];
}

function toggleClaimer(split: ItemSplit, unit: number, id: ParticipantId, claimed: boolean): ItemSplit {
  const units = unitsOf(split).map((ids, at) => (at !== unit ? ids : claimed ? sortByCodeUnit([...ids, id]) : ids.filter((claimer) => claimer !== id)));
  return withClaimers(split.by, units, (at, claimer) => valueIn(split, at, claimer));
}

function resize(split: ItemSplit, quantity: number): ItemSplit {
  const now = unitsOf(split);
  return withClaimers(split.by, Array.from({ length: quantity }, (_, unit) => now[unit] ?? []), (unit, id) => valueIn(split, unit, id));
}

function evenIfOverPrice(split: ItemSplit, price: number): ItemSplit {
  return overPrice(split, price) ? withClaimers("even", unitsOf(split), () => undefined) : split;
}

function overPrice(split: ItemSplit, price: number): boolean {
  if (split.by !== "amount") return false;
  const prices = unitPrices(price, split.units.length);
  return split.units.some((unit, index) => unit.reduce((total, [, cents]) => total + cents, 0) > prices[index]);
}

function editedSplit(split: ItemSplit, { quantity, by, values }: Extract<ItemPatch, { type: "edit" }>): ItemSplit | RejectionReason {
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)) return "amountOutOfRange";
  let next = quantity === undefined ? split : resize(split, quantity);
  if (by !== undefined && by !== next.by) next = withClaimers(by, unitsOf(next), () => undefined);
  for (const { unit, participantId, value } of values ?? []) {
    if (!Number.isInteger(unit) || unit < 0 || unit >= next.units.length) return "badIndex";
    if (next.by === "even" || !claimersOf(next, unit).includes(participantId)) return "conflict";
    const current = next;
    next = withClaimers(current.by, unitsOf(current), (at, id) => (at === unit && id === participantId ? value : valueIn(current, at, id)));
  }
  return next;
}

function keepClaimersRestoreShape(target: ItemSplit, current: ItemSplit): ItemSplit {
  const now = unitsOf(current);
  return withClaimers(target.by, unitsOf(target).map((ids, unit) => now[unit] ?? ids), (unit, id) => valueIn(target, unit, id));
}

const ADJUSTMENT_ROWS: RowCodec<Adjustment, Adjustment> = {
  rows: (split) => split.receipt.adjustments,
  add: ({ id, kind, name, amount }, index) => ({ kind: "adjustment", id, added: { index, kind, name, amount } }),
  remove: ({ id, kind, name, amount }, index) => ({ kind: "adjustment", id, removed: { index, kind, name, amount } }),
  edit: ({ id, kind, name, amount }, to) => {
    const edit = diff({ kind, name, amount }, { kind: to.kind, name: to.name, amount: to.amount });
    return edit === null || edit === "emptyEdit" ? [] : [{ kind: "adjustment", id, edit }];
  },
};

function restoreRows<Row extends { readonly id: string }, Original extends { readonly id: string }>(
  original: readonly Original[],
  codec: RowCodec<Row, Original>,
): MakeWrites[] {
  const wanted = new Set(original.map(({ id }) => id));
  const removeFrom = (split: Split, from: number, keep: (row: Row) => boolean) =>
    codec
      .rows(split)
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => index >= from && !keep(row))
      .reverse()
      .map(({ row, index }) => codec.remove(row, index));
  return [
    (split) => (codec.rows(split).some(({ id }) => wanted.has(id)) ? removeFrom(split, 0, ({ id }) => wanted.has(id)) : []),
    ...original.map((to, index): MakeWrites => (split) => {
      const rows = codec.rows(split);
      if (rows[index]?.id === to.id) return codec.edit(rows[index], to);
      const at = indexOf(rows, to.id);
      return at === -1 ? [codec.add(to, index, undefined)] : [codec.remove(rows[at], at), codec.add(to, index, rows[at])];
    }),
    (split) => removeFrom(split, original.length, () => false),
  ];
}

function undo(split: Split, revision: number): Step {
  const target = split.recentChanges.find((change) => change.revision === revision);
  if (!target) return reject("changeNotFound");
  if (target.undoneBy !== null) return reject("alreadyUndone");
  if (target.writes.some((write) => write.kind === "payment")) return reject("paymentNotRevertible");
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

function inverse(split: Split, write: Write | LegacyWrite): readonly Write[] {
  switch (write.kind) {
    case "item": {
      const at = indexOf(split.receipt.items, write.id);
      const current = split.receipt.items[at];
      if ("added" in write && current) return [{ kind: "item", id: write.id, removed: { index: at, name: current.name, price: current.price, split: current.split } }];
      const inverted = invertRow(write, at);
      if (!("edit" in inverted) || !("edit" in write) || !write.edit.split || !current) return [{ kind: "item", ...inverted }];
      return [{ kind: "item", id: write.id, edit: { ...inverted.edit, split: [current.split, keepClaimersRestoreShape(write.edit.split[0], current.split)] } }];
    }
    case "adjustment":
      return [{ kind: "adjustment", ...invertRow(write, indexOf(split.receipt.adjustments, write.id)) }];
    case "participant":
      return [{ kind: "participant", ...invertPresence(write, indexOf(split.participants, write.id)) }];
    case "totals":
      return [{ kind: "totals", subtotalDelta: cents(0 - write.subtotalDelta), totalDelta: cents(0 - write.totalDelta) }];
    case "payment":
      return [{ kind: "payment", participantId: write.participantId, before: write.after, after: write.before }];
    case "claims":
    case "joined":
      return [];
  }
}

function indexOf<RowId>(rows: readonly { readonly id: RowId }[], id: RowId): number {
  return rows.findIndex((row) => row.id === id);
}

function invertPresence<RowId, Fields>(write: Presence<RowId, Fields>, at: number): Presence<RowId, Fields> {
  if (!("added" in write)) return { id: write.id, added: write.removed };
  return { id: write.id, removed: { ...write.added, index: at } };
}

function invertRow<RowId, Fields>(write: RowWrite<RowId, Fields>, at: number): RowWrite<RowId, Fields> {
  if (!("edit" in write)) return invertPresence(write, at);
  const swapped: { [Key in keyof Fields]?: readonly [Fields[Key], Fields[Key]] } = {};
  for (const key in write.edit) {
    const change = write.edit[key];
    if (change) swapped[key] = [change[1], change[0]];
  }
  return { id: write.id, edit: swapped };
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
    return [ITEM_ROWS.add(patch.item, patch.index, undefined)];
  }
  const index = indexOf(items, patch.itemId);
  if (index === -1) return "unknownItem";
  if (patch.type === "delete") return [ITEM_ROWS.remove(items[index], index)];
  const { name, price, split: shape } = items[index];
  const reshaped = patch.quantity !== undefined || patch.by !== undefined || patch.values !== undefined;
  const next = reshaped ? editedSplit(shape, patch) : undefined;
  if (typeof next === "string") return next;
  const edit = diff({ name, price, split: shape }, { name: patch.name, price: patch.price, split: next });
  return typeof edit === "string" ? edit : edit ? [{ kind: "item", id: patch.itemId, edit }] : [];
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
    if (JSON.stringify(value) === JSON.stringify(row[key])) continue;
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
      if ("added" in write && !unitsOf(write.added.split).flat().every((id) => findParticipant(split, id))) return "conflict";
      const rows = putRow(receipt.items, write, 0, ({ name, price, split: shape }) => ({ id: write.id, name, price, split: shape }));
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
        const claimed = split.receipt.items.some((item) => unitsOf(item.split).some((ids) => ids.includes(write.id)));
        const picked = split.picks.some((pick) => pick.participantId === write.id);
        if (claimed || picked || paymentOf(split, write.id) !== null) return "participantInUse";
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
  }
}

function keepsNameValid(write: Extract<Write, { kind: "item" | "adjustment" | "participant" }>, maxLength: number): boolean {
  if ("added" in write) return isName(write.added.name, maxLength);
  if ("edit" in write && write.edit.name) return isName(write.edit.name[1], maxLength);
  return true;
}

function putRow<RowId, Fields, Row extends { readonly id: RowId }>(
  rows: readonly Row[],
  write: RowWrite<RowId, Fields>,
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

export function handleText({ service, handle }: PaymentHandle): string {
  return `${HANDLE_RULES[service].sigil}${handle}`;
}

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

export type CreateSplitRequest = { readonly split: Omit<NewSplit, "id"> };

export type CreateSplitResponse = { readonly id: SplitId; readonly creatorSecret: string };

export type CreateSplitRefusal =
  | { readonly refused: "bodyTooLarge" | "unavailable" | "rateLimited" | "dailyLimit" }
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

/** While the Split is live, each ClientMessage gets exactly one answer, in the order sent: a `state` or `unchanged` carrying its ref, or a `rejected` whose ref is null when the frame was refused before its ref was read. A `state` with a null ref is the snapshot on connect or someone else's change. `unavailable` ends the socket. A recorded change that would write history faster than the Split's history rate gets a `rateLimited` refusal carrying its ref, and is not early. A frame sent before the `retryAfterMs` of the socket's preceding `rateLimited` refusal with a null ref has elapsed is early. The 100th early frame since the socket's last admitted frame gets its `rejected`, and then the socket is closed with code 1008 and reason `rateLimited`. A frame that waits out `retryAfterMs` neither counts nor resets the count. No frame after a close gets an answer. */
export type ServerMessage =
  | { readonly type: "state"; readonly ref: string | null; readonly split: Split }
  | { readonly type: "unchanged"; readonly ref: string; readonly revision: number }
  | { readonly type: "rejected"; readonly ref: string | null; readonly rejection: WireRejection }
  | { readonly type: "unavailable"; readonly reason: "notFound" | "unreadable" };

export function createSplit(input: NewSplit): { readonly ok: true; readonly split: Split } | Rejected {
  const { items, adjustments, subtotal, total } = input.receipt;
  const plain = ({ id, name, price, quantity = 1 }: Item): Item => (quantity === 1 ? { id, name, price } : { id, name, price, quantity });
  const unclaimed = ({ id, name, price, quantity = 1 }: Item): SplitItem => ({ id, name, price, split: evenUnits(quantity) });
  const [first, ...rest] = items;
  const bare: Split = {
    schemaVersion: 1,
    id: input.id,
    currency: "USD",
    receipt: { items: [unclaimed(first), ...rest.map(unclaimed)], adjustments, subtotal, total },
    participants: input.participants,
    picks: [],
    payments: [],
    paymentHandles: canonicalHandles(input.paymentHandles),
    revision: 0,
    recentChanges: [],
  };
  const withOriginal: Split = { ...bare, original: { items: [plain(first), ...rest.map(plain)], adjustments, subtotal, total } };
  const split = checkSplit(withOriginal) === null ? withOriginal : bare;
  const check = runTotalCheck(split.receipt);
  const rejection = repeatedNames(split.participants) > 0 ? { reason: "nameTaken" as const } : (checkSplit(split) ?? (check.ok ? null : { reason: "totalCheckFailed" as const, check }));
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
  const unsorted = items.findIndex(({ split }) => split.units.length > MAX_QUANTITY || !unitsOf(split).every(isStrictlySorted));
  if (unsorted !== -1) return { reason: "malformed", path: `receipt.items[${unsorted}].split` };
  if (!items.every(({ split }) => valuesInRange(split))) return { reason: "amountOutOfRange" };
  if (items.some(({ split, price }) => overPrice(split, price))) return { reason: "amountOverPrice" };
  const claimsValid = items.every(({ split }) => unitsOf(split).flat().every((id) => ids.has(id)));
  const paidBy = payments.map(({ participantId }) => participantId);
  const paymentsValid = isStrictlySorted(paidBy) && paidBy.every((id) => ids.has(id) && id !== host.id);
  const picked = split.picks.map(({ participantId }) => participantId);
  if (!isStrictlySorted(picked)) return { reason: "malformed", path: "picks" };
  if (!claimsValid || !paymentsValid || !picked.every((id) => ids.has(id))) return { reason: "unknownParticipant" };

  const services = paymentHandles.map(({ service }) => service);
  const handlesValid = paymentHandles.every(({ service, handle }) => HANDLE_RULES[service].pattern.test(handle) && !HIDDEN_CHARACTERS.test(handle));
  if (!handlesValid || new Set(services).size !== services.length) return { reason: "badHandle" };

  const core = serializedBytes({ ...split, payments: [], recentChanges: [] });
  if (core > SPLIT_BYTE_BUDGET - PAYMENT_RESERVE_BYTES - HISTORY_RESERVE_BYTES) return { reason: "tooLarge" };
  return null;
}

function valuesInRange(split: ItemSplit): boolean {
  if (split.by === "even") return true;
  const [low, high] = split.by === "amount" ? [0, MAX_CENTS] : [1, MAX_SHARES];
  return split.units.every((unit) => unit.every(([, value]) => Number.isSafeInteger(value) && value >= low && value <= high));
}

const HIDDEN_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uD800-\uDFFF]/u;
const MAX_UNITS_PER_GRAPHEME = 32;
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

export function isName(name: string, maxLength: number): boolean {
  if (name.length > maxLength * MAX_UNITS_PER_GRAPHEME || HIDDEN_CHARACTERS.test(name) || nameKey(name).trim() === "") return false;
  const characters = [...graphemes.segment(name)];
  return characters.length <= maxLength && characters.every(({ segment }) => segment.length <= MAX_UNITS_PER_GRAPHEME);
}

function repeatedNames(participants: readonly Participant[]): number {
  return participants.length - new Set(participants.map(({ name }) => nameKey(name))).size;
}

const STRIPPED = new RegExp(`(?!\\s)${HIDDEN_CHARACTERS.source}`, "gu");

/** A name as a person typed it, in NFC, with inner whitespace collapsed to one space and the hidden characters `isName` refuses dropped. */
export function canonicalName(typed: string): string {
  return typed.normalize("NFC").replace(STRIPPED, "").replace(/\s+/gu, " ").trim();
}

const IGNORABLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/gu;

/** Two names are the same name when their keys match: NFKC, no format, default-ignorable or braille-blank characters, and a full case fold, so "Ｓam", "Sam" with a soft hyphen, and "STRAUẞ" against "Strauss" all collide. A name whose key is empty draws nothing. */
export function nameKey(name: string): string {
  return canonicalName(name).replace(IGNORABLE, "").normalize("NFKC").toLowerCase().toUpperCase().toLowerCase();
}

function hasUniqueIds(rows: readonly { readonly id: string }[]): boolean {
  return new Set(rows.map(({ id }) => id)).size === rows.length;
}

function isStrictlySorted(values: readonly (string | number)[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}
