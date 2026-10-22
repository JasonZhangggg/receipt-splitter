import { MAX_CENTS, cents, isCents, price as asPrice, type Cents, type Price } from "./money";
import { pickDevice } from "./pick-device";
import {
  SPLIT_BYTE_BUDGET,
  serializedBytes,
  type Adjustment,
  type AdjustmentFields,
  type AdjustmentId,
  type Change,
  type Claim,
  type ClaimPart,
  type Edit,
  type DeviceId,
  type Item,
  type ItemFields,
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
  type ReceiptLevelAdjustment,
  type ReceiptLevelKind,
  type RowWrite,
  type Split,
  type SplitId,
  type SplitItem,
  type SplitMode,
  type Write,
} from "./split";
import { computeShares, unitPrices } from "./shares";

export const MAX_ITEMS = 100;
export const MAX_ADJUSTMENTS = 20;
export const MAX_PARTICIPANTS = 30;
export const MAX_PARTICIPANT_NAME_LENGTH = 40;
export const MAX_ROW_NAME_LENGTH = 80;
export const MAX_PLACE_LENGTH = 64;
export const MAX_DETAIL_LENGTH = 120;
export const MAX_QUANTITY = 20;
export const MAX_SHARES = 99;
export const RECENT_CHANGES_LIMIT = 64;
/** An old Split's line of up to MAX_QUANTITY units can read as that many rows, so a stored Split may hold more Items than a write may add. */
export const MAX_STORED_ITEMS = MAX_ITEMS * MAX_QUANTITY;
export const MAX_STORED_BYTES = MAX_QUANTITY * SPLIT_BYTE_BUDGET;
export const MAX_WRITES_PER_CHANGE = MAX_ITEMS + MAX_ADJUSTMENTS + 1;
/** An old change reads with one perUnit mark added, so a stored change may hold one write more than a new one. */
export const MAX_STORED_WRITES_PER_CHANGE = MAX_WRITES_PER_CHANGE + 1;
export const PAYMENT_RESERVE_BYTES = 2 * 1024;
export const MAX_CHANGE_BYTES = 5 * 1024;
/** Bytes of recorded changes a Split may write in one burst before the Worker's history rate refuses more. */
export const HISTORY_BURST_BYTES = MAX_CHANGE_BYTES;
const COMMAS_BETWEEN_CHANGES = RECENT_CHANGES_LIMIT;
export const HISTORY_RESERVE_BYTES = MAX_CHANGE_BYTES + HISTORY_BURST_BYTES + COMMAS_BETWEEN_CHANGES;

export type ItemPatch =
  /** `who` had the new Item, split evenly; without it the Item starts unclaimed. */
  | { readonly type: "add"; readonly item: Item; readonly index: number; readonly who?: readonly ParticipantId[] }
  | {
      readonly type: "edit";
      readonly itemId: ItemId;
      readonly name?: string;
      readonly price?: Price;
      /** "" removes the detail. */
      readonly detail?: string;
      /** A new mode starts every claimer at 1 share or $0.00. */
      readonly by?: SplitMode;
      readonly values?: readonly ItemValue[];
    }
  /** Turns a quantity line into one-unit rows. The client mints `ids`, one per row after the first. */
  | { readonly type: "split"; readonly itemId: ItemId; readonly ids: NonEmpty<ItemId> }
  | { readonly type: "delete"; readonly itemId: ItemId };

/** One claimer's share count or cents on the line, applied after `by`. */
export type ItemValue = { readonly participantId: ParticipantId; readonly value: number };

export type AdjustmentPatch =
  | { readonly type: "add"; readonly adjustment: ReceiptLevelAdjustment; readonly index: number }
  | {
      readonly type: "edit";
      readonly adjustmentId: AdjustmentId;
      readonly kind?: ReceiptLevelKind;
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
      /**
       * Sets the Total to the Subtotal plus the Adjustments once the patches apply, on the Split as the server holds it.
       * Two phones fixing different Adjustments at once still leave a Total that adds up, which a delta sent from each could not.
       */
      readonly totalFollows?: true;
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

/**
 * The Operations a phone may show before the server answers. Each is absolute or guarded by an id, so applying it to a Split that already holds it changes nothing:
 * claim and unclaim set membership, a payment sets an amount, an add is refused as a duplicate id, a delete as an unknown one, and an undo as already undone.
 * Item edits and the deltas of `editReceipt` are left out: replaying a delta would count it twice.
 */
export type Optimistic =
  | Extract<Operation, { readonly type: "claim" | "unclaim" | "recordPayment" | "clearPayment" | "undo" }>
  | (Omit<Extract<Operation, { readonly type: "editReceipt" }>, "items" | "adjustments" | "subtotalDelta" | "totalDelta"> & {
      readonly items?: readonly Extract<ItemPatch, { readonly type: "add" | "delete" }>[];
      readonly adjustments?: readonly Extract<AdjustmentPatch, { readonly type: "add" | "delete" }>[];
      readonly subtotalDelta?: undefined;
      readonly totalDelta?: undefined;
    });

export type Auth = { readonly creator: boolean };

export type RejectionReason =
  | "unknownParticipant"
  | "unknownItem"
  | "unknownAdjustment"
  | "duplicateId"
  | "badIndex"
  | "emptyEdit"
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
  | "noOriginal"
  | "amountOverPrice"
  | "tooLarge";

export type Rejection =
  | { readonly reason: RejectionReason }
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
  const rejection = checkState(state) ?? capRejection(state, split);
  if (rejection) return { ok: false, rejection };
  if (repeatedNames(state.participants) > repeatedNames(split.participants)) return reject("nameTaken");
  let recentChanges = step.split.recentChanges;
  if (step.record) {
    const change: Change = { revision, by: op.by, undoes: step.record.undoes, undoneBy: null, writes: step.record.writes, ...(at === undefined ? {} : { at }) };
    if (change.writes.length <= MAX_WRITES_PER_CHANGE && serializedBytes(change) <= MAX_CHANGE_BYTES) recentChanges = [...recentChanges, change];
    else if (op.type !== "restoreReceipt") return reject("tooLarge");
  }
  return { ok: true, split: { ...state, recentChanges: fitChanges(state, recentChanges, split) }, changed: true };
}

function run(split: Split, op: Operation, auth: Auth): Step {
  switch (op.type) {
    case "editReceipt": {
      const { items, adjustments, subtotalDelta, totalDelta, totalFollows } = op;
      if (!items?.length && !adjustments?.length && subtotalDelta === undefined && totalDelta === undefined) return reject("emptyEdit");
      if (totalFollows && totalDelta !== undefined) return reject("conflict");
      let lines: Lines = { subtotal: 0, total: 0 };
      return commit(split, [
        ...(items ?? []).map((patch): MakeWrites => (current) => {
          const writes = itemWrites(current, patch);
          if (typeof writes !== "string") lines = linesMoved(lines, current.receipt, writes);
          return writes;
        }),
        ...(adjustments ?? []).map((patch): MakeWrites => (current) => adjustmentWrites(current, patch)),
        ({ receipt }) => {
          const subtotal = cents((subtotalDelta ?? 0) + lines.subtotal);
          const total = totalFollows ? cents(receipt.subtotal + subtotal + adjustmentsSum(receipt) - receipt.total) : cents((totalDelta ?? 0) + lines.total);
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
      const { participantId } = op;
      const index = indexOf(split.participants, participantId);
      if (index === -1) return reject("unknownParticipant");
      if (index === 0) return reject("host");
      // Picks are device state and never recorded, so a Revert brings the name back unpicked; its device picks it again with "That's me".
      const unpicked = { ...split, picks: split.picks.filter((pick) => pick.participantId !== participantId) };
      return commit(unpicked, [
        ({ receipt }) => {
          const [first, ...rest] = receipt.items.flatMap((item): ClaimPart[] =>
            claimersOf(item.split).includes(participantId) ? [[item.id, item.split.by, valueIn(item.split, participantId) ?? 0]] : [],
          );
          return first === undefined ? [] : [{ kind: "claimParts", participantId, parts: [first, ...rest], claimed: false }];
        },
        (current) => {
          const before = paymentOf(current, participantId);
          return before === null ? [] : [{ kind: "payment", participantId, before, after: null }];
        },
        () => [{ kind: "participant", id: participantId, removed: { index, name: split.participants[index].name } }],
      ]);
    }
    case "claim":
    case "unclaim": {
      const index = indexOf(split.receipt.items, op.itemId);
      if (index === -1) return reject("unknownItem");
      if (!findParticipant(split, op.participantId)) return reject("unknownParticipant");
      const item = split.receipt.items[index];
      const claimed = op.type === "claim";
      if (claimersOf(item.split).includes(op.participantId) === claimed) return unchanged(split);
      const next = { ...item, split: toggleClaimer(item.split, op.participantId, claimed) };
      const [first, ...rest] = split.receipt.items.map((row, at) => (at === index ? next : row));
      return { ok: true, split: { ...split, receipt: { ...split.receipt, items: [first, ...rest] } }, record: null };
    }
    case "recordPayment":
    case "clearPayment": {
      const participantId = op.participantId;
      const index = indexOf(split.participants, participantId);
      if (index === -1) return reject("unknownParticipant");
      if (index === 0) return reject("host");
      const device = pickDevice(op.device, split.id);
      if (!split.picks.some((pick) => pick.participantId === participantId && pick.device === device)) return reject("payerOnly");
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
      const { participantId, takeOver } = op;
      const device = pickDevice(op.device, split.id);
      if (!findParticipant(split, participantId)) return reject("unknownParticipant");
      const held = split.picks.find((pick) => pick.participantId === participantId);
      if (held?.device === device) return unchanged(split);
      if (held && !takeOver) return reject("namePicked");
      const others = split.picks.filter((pick) => pick.participantId !== participantId && pick.device !== device);
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
  readonly edit: (row: Row, to: Original, index: number) => readonly Write[];
};

const ITEM_ROWS: RowCodec<SplitItem, Item> = {
  rows: (split) => split.receipt.items,
  add: ({ id, name, price, detail, quantity = 1 }, index, moved) => ({
    kind: "item",
    id,
    added: { index, name, price, ...(detail !== undefined && { detail }), ...(quantity === 1 ? {} : { quantity }), split: evenIfOverPrice(moved?.split ?? unclaimedSplit(), price) },
  }),
  remove: (row, index) => ({ kind: "item", id: row.id, removed: { index, ...itemFieldsOf(row) } }),
  edit: ({ id, name, price, detail = "", quantity = 1, split }, to) => {
    const edit = diff(
      { name, price, detail, quantity, split },
      { name: to.name, price: to.price, detail: to.detail ?? "", quantity: to.quantity ?? 1, split: evenIfOverPrice(split, to.price) },
    );
    return edit === null || edit === "emptyEdit" ? [] : [{ kind: "item", id, edit }];
  },
};

function itemFieldsOf({ id, ...fields }: SplitItem): ItemFields {
  return fields;
}

export function unclaimedSplit(): ItemSplit {
  return { by: "even", units: [[]] };
}

export function claimersOf(split: ItemSplit): readonly ParticipantId[] {
  return split.by === "even" ? split.units[0] : split.units[0].map(([id]) => id);
}

const STARTING_VALUE = { shares: 1, amount: 0 } as const;

function withClaimers(by: SplitMode, claimers: readonly ParticipantId[], valueOf: (id: ParticipantId) => number | undefined): ItemSplit {
  if (by === "even") return { by, units: [claimers] };
  const value = (id: ParticipantId) => valueOf(id) ?? STARTING_VALUE[by];
  if (by === "shares") return { by, units: [claimers.map((id): Part<number> => [id, value(id)])] };
  return { by, units: [claimers.map((id): Part<Cents> => [id, cents(value(id))])] };
}

function valueIn(split: ItemSplit, id: ParticipantId): number | undefined {
  return split.by === "even" ? undefined : split.units[0].find(([claimer]) => claimer === id)?.[1];
}

function toggleClaimer(split: ItemSplit, id: ParticipantId, claimed: boolean): ItemSplit {
  const claimers = claimersOf(split);
  return withClaimers(split.by, claimed ? sortByCodeUnit([...claimers, id]) : claimers.filter((claimer) => claimer !== id), (claimer) => valueIn(split, claimer));
}

/**
 * Puts a person back on an Item as the Item is now. In the mode they left, they get their own part back, cents only up to what the others leave of the price.
 * In a mode someone switched to since, they start as anyone added to it does, at 1 share or $0.00, so a Revert never fails on that and never moves the others.
 */
function withClaimer({ price, split }: SplitItem, id: ParticipantId, part: { readonly by: SplitMode; readonly value: number }): ItemSplit {
  const others = split.by === "amount" ? split.units[0].reduce((sum, [, amount]) => sum + amount, 0) : 0;
  const own = part.by !== split.by ? undefined : split.by === "amount" ? Math.min(part.value, Math.max(0, price - others)) : part.value;
  return withClaimers(split.by, sortByCodeUnit([...claimersOf(split), id]), (claimer) => (claimer === id ? own : valueIn(split, claimer)));
}

function evenIfOverPrice(split: ItemSplit, price: number): ItemSplit {
  return overPrice(split, price) ? withClaimers("even", claimersOf(split), () => undefined) : split;
}

function overPrice(split: ItemSplit, price: number): boolean {
  return split.by === "amount" && split.units[0].reduce((total, [, cents]) => total + cents, 0) > price;
}

function editedSplit(split: ItemSplit, { by, values }: Extract<ItemPatch, { type: "edit" }>): ItemSplit | RejectionReason {
  let next = by !== undefined && by !== split.by ? withClaimers(by, claimersOf(split), () => undefined) : split;
  for (const { participantId, value } of values ?? []) {
    if (next.by === "even" || !claimersOf(next).includes(participantId)) return "conflict";
    const current = next;
    next = withClaimers(current.by, claimersOf(current), (id) => (id === participantId ? value : valueIn(current, id)));
  }
  return next;
}

/**
 * The rows a Split leaves: each copies the line's claimers and mode.
 * By amount, the rows fill in order, each claimer taking what is left of their cents up to what is left of the row's price, so every claimer's total and the unclaimed rest stay the same.
 */
function splitRows(split: ItemSplit, prices: readonly number[]): ItemSplit[] {
  if (split.by !== "amount") return prices.map(() => split);
  const left = new Map<ParticipantId, number>(split.units[0]);
  return prices.map((rowPrice) => {
    let room = rowPrice;
    const parts = split.units[0].map(([id]): Part<Cents> => {
      const taken = Math.min(left.get(id) ?? 0, room);
      left.set(id, (left.get(id) ?? 0) - taken);
      room -= taken;
      return [id, cents(taken)];
    });
    return { by: "amount", units: [parts] };
  });
}

function fieldsOf({ id, ...fields }: Adjustment): AdjustmentFields {
  return fields;
}

const ADJUSTMENT_ROWS: RowCodec<Adjustment, Adjustment> = {
  rows: (split) => split.receipt.adjustments,
  add: (row, index) => ({ kind: "adjustment", id: row.id, added: { index, ...fieldsOf(row) } }),
  remove: (row, index) => ({ kind: "adjustment", id: row.id, removed: { index, ...fieldsOf(row) } }),
  edit: (row, to, index) => {
    // parseSplit refuses an edit that turns a row into or out of a Bundle, so replace the row.
    if ((row.kind === "bundleDiscount") !== (to.kind === "bundleDiscount")) return [ADJUSTMENT_ROWS.remove(row, index), ADJUSTMENT_ROWS.add(to, index, undefined)];
    const edit = diff<AdjustmentFields>(fieldsOf(row), fieldsOf(to));
    return edit === null || edit === "emptyEdit" ? [] : [{ kind: "adjustment", id: row.id, edit }];
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
      if (rows[index]?.id === to.id) return codec.edit(rows[index], to, index);
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
  // A Payment reverts only as part of a removal, which cleared it, or of that removal's Revert.
  const removal = target.writes.some((write) => write.kind === "participant");
  if (!removal && target.writes.some((write) => write.kind === "payment")) return reject("paymentNotRevertible");
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

function inverse(split: Split, write: Write | LegacyWrite): readonly Write[] | RejectionReason {
  switch (write.kind) {
    case "item": {
      const at = indexOf(split.receipt.items, write.id);
      const current = split.receipt.items[at];
      // A line added with a quantity that was Split since, or that an old Split now reads as rows, is more than this row.
      if ("added" in write && current) return (current.quantity ?? 1) === (write.added.quantity ?? 1) ? [ITEM_ROWS.remove(current, at)] : "conflict";
      const inverted = invertRow(write, at);
      if (!("edit" in inverted) || !("edit" in write) || !write.edit.split || !current) return [{ kind: "item", ...inverted }];
      const [before] = write.edit.split;
      return [{ kind: "item", id: write.id, edit: { ...inverted.edit, split: [current.split, withClaimers(before.by, claimersOf(current.split), (id) => valueIn(before, id))] } }];
    }
    case "split": {
      // Only rows exactly as the Split made them fold back, so a Revert never drops a later edit, even one that moves no money.
      const prices = unitPrices(write.line.price, write.line.quantity);
      const claims = splitRows(write.line.split, prices);
      const rows = [write.id, ...write.ids].map((id) => split.receipt.items.find((item) => item.id === id));
      const [head] = rows;
      const asSplit = rows.every((row, at) => row !== undefined && holds(row, { name: head?.name, detail: head?.detail, price: prices[at], split: claims[at] }));
      if (!asSplit) return "conflict";
      const unsplit: Write = { kind: "unsplit", id: write.id, ids: write.ids, line: write.line };
      const after = unsplitLine(split, unsplit);
      return typeof after !== "string" && sameMoney(split, after) ? [unsplit] : "conflict";
    }
    case "unsplit": {
      const current = split.receipt.items.find(({ id }) => id === write.id);
      if (!current) return "conflict";
      return [{ kind: "split", id: write.id, ids: write.ids, line: { quantity: current.quantity ?? 1, price: current.price, split: current.split } }];
    }
    case "adjustment":
      return [{ kind: "adjustment", ...invertRow(write, indexOf(split.receipt.adjustments, write.id)) }];
    case "participant":
      return [{ kind: "participant", ...invertPresence(write, indexOf(split.participants, write.id)) }];
    case "totals":
      return [{ kind: "totals", subtotalDelta: cents(0 - write.subtotalDelta), totalDelta: cents(0 - write.totalDelta) }];
    case "payment":
      return [{ kind: "payment", participantId: write.participantId, before: write.after, after: write.before }];
    case "claimParts": {
      // An Item deleted since has no claim to give back or take.
      const [first, ...rest] = write.parts.filter(([itemId]) => indexOf(split.receipt.items, itemId) !== -1);
      return first === undefined ? [] : [{ ...write, parts: [first, ...rest], claimed: !write.claimed }];
    }
    case "perUnit":
      return "conflict";
    case "claims":
    case "joined":
      return [];
  }
}

function sameMoney(a: Split, b: Split): boolean {
  const money = (split: Split) => {
    const { shares, unclaimed } = computeShares(split);
    return JSON.stringify([shares, unclaimed.total]);
  };
  return money(a) === money(b);
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
  const swapped: { [Key in keyof Fields]?: readonly [Required<Fields>[Key], Required<Fields>[Key]] } = {};
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
    const who = patch.who ?? [];
    if (!who.every((id) => findParticipant(split, id))) return "unknownParticipant";
    if (new Set(who).size !== who.length) return "duplicateId";
    return [ITEM_ROWS.add(patch.item, patch.index, { ...patch.item, split: withClaimers("even", sortByCodeUnit(who), () => undefined) })];
  }
  const index = indexOf(items, patch.itemId);
  if (index === -1) return "unknownItem";
  if (patch.type === "delete") return [ITEM_ROWS.remove(items[index], index), ...leaveBundle(split, patch.itemId)];
  if (patch.type === "split") return splitWrites(split, index, patch.ids);
  const { name, price, detail = "", split: shape } = items[index];
  const reshaped = patch.by !== undefined || patch.values !== undefined;
  const next = reshaped ? editedSplit(shape, patch) : undefined;
  if (typeof next === "string") return next;
  const edit = diff({ name, price, detail, split: shape }, { name: patch.name, price: patch.price, detail: patch.detail, split: next });
  return typeof edit === "string" ? edit : edit ? [{ kind: "item", id: patch.itemId, edit }] : [];
}

function splitWrites(split: Split, index: number, ids: NonEmpty<ItemId>): readonly Write[] | RejectionReason {
  const { items } = split.receipt;
  const { id, quantity = 1, price, split: claims } = items[index];
  if (ids.length !== quantity - 1) return "conflict";
  if (new Set([...items.map((item) => item.id), ...ids]).size !== items.length + ids.length) return "duplicateId";
  return [{ kind: "split", id, ids, line: { quantity, price, split: claims } }];
}

/** Turns the line into its rows, with the new ids right after the line's in any Bundle that lists it. */
function splitLine(split: Split, { id, ids, line }: Extract<Write, { kind: "split" }>): Split | RejectionReason {
  const { items, adjustments } = split.receipt;
  const at = indexOf(items, id);
  const current = items[at];
  if (!current || !holds({ quantity: current.quantity ?? 1, price: current.price, split: current.split }, line)) return "conflict";
  if (ids.length !== line.quantity - 1 || ids.some((rowId) => indexOf(items, rowId) !== -1)) return "conflict";
  const prices = unitPrices(line.price, line.quantity).map(asPrice);
  const [first, ...rest] = splitRows(line.split, prices);
  const { quantity: _, ...named } = current;
  const rows = ids.map((rowId, row): SplitItem => ({ ...named, id: rowId, price: prices[row + 1], split: rest[row] }));
  const [head, ...tail] = [...items.slice(0, at), { ...named, price: prices[0], split: first }, ...rows, ...items.slice(at + 1)];
  const bundled = adjustments.map((row) => (row.kind === "bundleDiscount" && row.bundle.items.includes(id) ? { ...row, bundle: { ...row.bundle, items: withRowsAfter(row.bundle.items, id, ids) } } : row));
  return { ...split, receipt: { ...split.receipt, items: [head, ...tail], adjustments: bundled } };
}

/** Folds the rows back into the line and drops them from every Bundle. */
function unsplitLine(split: Split, { id, ids, line }: Extract<Write, { kind: "unsplit" }>): Split | RejectionReason {
  const { items, adjustments } = split.receipt;
  const current = items.find((item) => item.id === id);
  if (!current || current.quantity !== undefined || ids.some((rowId) => indexOf(items, rowId) === -1)) return "conflict";
  if (!claimersOf(line.split).every((claimer) => findParticipant(split, claimer))) return "conflict";
  const gone = new Set<ItemId>(ids);
  const restored: SplitItem = { ...current, price: line.price, ...(line.quantity !== 1 && { quantity: line.quantity }), split: line.split };
  const [head, ...tail] = items.filter((item) => !gone.has(item.id)).map((item) => (item.id === id ? restored : item));
  const bundles = adjustments.map((row) => {
    if (row.kind !== "bundleDiscount") return row;
    const [first, ...rest] = row.bundle.items.filter((itemId) => !gone.has(itemId));
    return first === undefined ? null : { ...row, bundle: { ...row.bundle, items: [first, ...rest] as const } };
  });
  if (bundles.includes(null)) return "conflict";
  return { ...split, receipt: { ...split.receipt, items: [head, ...tail], adjustments: bundles.filter((row) => row !== null) } };
}

function withRowsAfter(list: NonEmpty<ItemId>, id: ItemId, ids: NonEmpty<ItemId>): NonEmpty<ItemId> {
  const [head, ...tail] = list.flatMap((itemId) => (itemId === id ? [itemId, ...ids] : [itemId]));
  return [head ?? id, ...tail];
}

function leaveBundle(split: Split, itemId: ItemId): readonly Write[] {
  return split.receipt.adjustments.flatMap((row, index): Write[] => {
    if (row.kind !== "bundleDiscount" || !row.bundle.items.includes(itemId)) return [];
    const [first, ...rest] = row.bundle.items.filter((id) => id !== itemId);
    if (first === undefined) return [ADJUSTMENT_ROWS.remove(row, index)];
    return [{ kind: "adjustment", id: row.id, edit: { bundle: [row.bundle, { ...row.bundle, items: [first, ...rest] }] } }];
  });
}

type Lines = { readonly subtotal: number; readonly total: number };

/**
 * How far an Item patch's own writes move the Subtotal and Total (preferences 70).
 * An added Item first fills any shortfall of the Items under the printed Subtotal (a line the reading missed), and only the rest raises the Subtotal and Total.
 * A delete or a price edit moves both by the full amount, so a price typed in steps lands where it would in one step.
 * A delete that drops a Bundle discount also takes that amount off the Total. Printed tax, tip and fees keep their amounts.
 */
function linesMoved(lines: Lines, receipt: Receipt, writes: readonly Write[]): Lines {
  let added = 0;
  let moved = 0;
  let dropped = 0;
  for (const write of writes) {
    if (write.kind === "adjustment" && "removed" in write) dropped += write.removed.amount;
    if (write.kind !== "item") continue;
    if ("added" in write) added += write.added.price;
    else if ("removed" in write) moved -= write.removed.price;
    else if (write.edit.price) moved += write.edit.price[1] - write.edit.price[0];
  }
  const shortfall = Math.max(0, receipt.subtotal + lines.subtotal - receipt.items.reduce((sum, { price }) => sum + price, 0));
  const subtotal = Math.max(0, added - shortfall) + moved;
  return { subtotal: lines.subtotal + subtotal, total: lines.total + subtotal - dropped };
}

function adjustmentsSum({ adjustments }: Receipt): number {
  return adjustments.reduce((sum, { amount }) => sum + amount, 0);
}

function adjustmentWrites(split: Split, patch: AdjustmentPatch): readonly Write[] | RejectionReason {
  const adjustments = split.receipt.adjustments;
  if (patch.type === "add") {
    if (adjustments.some(({ id }) => id === patch.adjustment.id)) return "duplicateId";
    if (!isInsertIndex(patch.index, adjustments.length)) return "badIndex";
    return [ADJUSTMENT_ROWS.add(patch.adjustment, patch.index, undefined)];
  }
  const index = indexOf(adjustments, patch.adjustmentId);
  if (index === -1) return "unknownAdjustment";
  const row = adjustments[index];
  if (patch.type === "delete") return [ADJUSTMENT_ROWS.remove(row, index)];
  const { name, amount } = row;
  if (row.kind === "bundleDiscount" && patch.kind !== undefined) return "conflict";
  const edit: Edit<AdjustmentFields> | "emptyEdit" | null =
    row.kind === "bundleDiscount"
      ? diff({ name, amount }, { name: patch.name, amount: patch.amount })
      : diff({ kind: row.kind, name, amount }, { kind: patch.kind, name: patch.name, amount: patch.amount });
  return typeof edit === "string" ? edit : edit ? [{ kind: "adjustment", id: row.id, edit }] : [];
}

function diff<Fields>(
  row: Required<Fields>,
  patch: { readonly [Key in keyof Fields]?: Required<Fields>[Key] },
): Edit<Fields> | "emptyEdit" | null {
  const edit: { [Key in keyof Fields]?: readonly [Required<Fields>[Key], Required<Fields>[Key]] } = {};
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
      if (!keepsNameValid(write, MAX_ROW_NAME_LENGTH) || !keepsDetailValid(write)) return "badName";
      if ("added" in write && !claimersOf(write.added.split).every((id) => findParticipant(split, id))) return "conflict";
      const filled = receipt.items.map((item) => ({ ...item, detail: item.detail ?? "", quantity: item.quantity ?? 1 }));
      const rows = putRow(filled, write, 0, ({ index, detail = "", quantity = 1, ...fields }) => ({ id: write.id, ...fields, detail, quantity }));
      if (typeof rows === "string") return rows;
      const items = rows.map(({ detail, quantity, split: shape, ...row }): SplitItem => ({ ...row, ...(detail !== "" && { detail }), ...(quantity !== 1 && { quantity }), split: shape }));
      return { ...split, receipt: { ...receipt, items } };
    }
    case "adjustment": {
      if (!keepsNameValid(write, MAX_ROW_NAME_LENGTH)) return "badName";
      const rows = putRow(receipt.adjustments, write, 0, ({ index, ...fields }): Adjustment => ({ id: write.id, ...fields }));
      return typeof rows === "string" ? rows : { ...split, receipt: { ...receipt, adjustments: rows } };
    }
    case "participant": {
      const [host, ...others] = split.participants;
      if (write.id === host.id) return "host";
      if (!keepsNameValid(write, MAX_PARTICIPANT_NAME_LENGTH)) return "badName";
      if ("removed" in write) {
        const claimed = split.receipt.items.some((item) => claimersOf(item.split).includes(write.id));
        const picked = split.picks.some((pick) => pick.participantId === write.id);
        if (claimed || picked || paymentOf(split, write.id) !== null) return "participantInUse";
      }
      const rows = putRow(others, write, 1, ({ name }) => ({ id: write.id, name }));
      return typeof rows === "string" ? rows : { ...split, participants: [host, ...rows] };
    }
    case "split":
      return splitLine(split, write);
    case "unsplit":
      return unsplitLine(split, write);
    case "totals": {
      const subtotal = receipt.subtotal + write.subtotalDelta;
      const total = receipt.total + write.totalDelta;
      if (!isCents(subtotal) || !isCents(total)) return "amountOutOfRange";
      return { ...split, receipt: { ...receipt, subtotal, total } };
    }
    case "claimParts": {
      if (write.claimed && !findParticipant(split, write.participantId)) return "conflict";
      const parts = new Map(write.parts.map(([itemId, by, value]) => [itemId, { by, value }]));
      if (parts.size !== write.parts.length || [...parts.keys()].some((itemId) => indexOf(receipt.items, itemId) === -1)) return "conflict";
      const [first, ...rest] = receipt.items.map((item) => {
        const part = parts.get(item.id);
        if (!part || claimersOf(item.split).includes(write.participantId) === write.claimed) return item;
        return { ...item, split: write.claimed ? withClaimer(item, write.participantId, part) : toggleClaimer(item.split, write.participantId, false) };
      });
      return { ...split, receipt: { ...receipt, items: [first, ...rest] } };
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

function keepsDetailValid(write: Extract<Write, { kind: "item" }>): boolean {
  const detail = "added" in write ? write.added.detail : "edit" in write ? write.edit.detail?.[1] : undefined;
  return detail === undefined || detail === "" || isDetail(detail);
}

export function isDetail(detail: string): boolean {
  return isName(detail, MAX_DETAIL_LENGTH);
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

/**
 * History fills the 32 KB budget left by the rest of the Split. An old Split whose rows read past that budget keeps the room for history a Split
 * at the core cap has, and never loses a change to a budget it was already over before this write.
 */
function fitChanges(state: Split, changes: readonly Change[], before: Split): readonly Change[] {
  const budget = Math.max(SPLIT_BYTE_BUDGET, coreBytes(state) + PAYMENT_RESERVE_BYTES + HISTORY_RESERVE_BYTES, serializedBytes(before));
  const sizes = changes.map(serializedBytes);
  let bytes = serializedBytes(state) + sizes.reduce((sum, size) => sum + size + 1, -1);
  let start = 0;
  while (start < changes.length - 1 && (changes.length - start > RECENT_CHANGES_LIMIT || bytes > budget)) {
    bytes -= sizes[start] + 1;
    start += 1;
  }
  return changes.slice(start);
}

/** True when what the Operation set out to do is already so on `split`. A send whose answer never came counts as saved when it is, whoever made it so. */
export function landed(split: Split, op: Optimistic): boolean {
  switch (op.type) {
    case "claim":
    case "unclaim": {
      const item = split.receipt.items.find(({ id }) => id === op.itemId);
      return item !== undefined && claimersOf(item.split).includes(op.participantId) === (op.type === "claim");
    }
    case "recordPayment":
      return paymentOf(split, op.participantId) === op.amount;
    case "clearPayment":
      return paymentOf(split, op.participantId) === null;
    case "undo": {
      const target = split.recentChanges.find((change) => change.revision === op.revision);
      return target !== undefined && target.undoneBy !== null;
    }
    case "editReceipt":
      return (
        (op.items ?? []).every((patch) => split.receipt.items.some(({ id }) => id === (patch.type === "add" ? patch.item.id : patch.itemId)) === (patch.type === "add")) &&
        (op.adjustments ?? []).every((patch) => split.receipt.adjustments.some(({ id }) => id === (patch.type === "add" ? patch.adjustment.id : patch.adjustmentId)) === (patch.type === "add"))
      );
  }
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

type HandleRule = { readonly sigil: string; readonly min: number; readonly max: number; readonly allowed: RegExp | null; readonly needsLetter: boolean };

// Venmo and Cash App's own username rules. PayPal and Zelle take any text the Host types; the pay link encodes it, and Zelle shows it to copy.
const HANDLE_RULES: { readonly [Service in PaymentService]: HandleRule } = {
  venmo: { sigil: "@", min: 5, max: 30, allowed: /[A-Za-z0-9_-]/, needsLetter: false },
  cashApp: { sigil: "$", min: 1, max: 20, allowed: /[A-Za-z0-9]/, needsLetter: true },
  paypal: { sigil: "", min: 1, max: 80, allowed: null, needsLetter: false },
  zelle: { sigil: "", min: 1, max: 80, allowed: null, needsLetter: false },
};

/** Why a Split refuses a handle: the first rule it breaks, counting characters without the sigil. */
export type HandleProblem =
  | { readonly kind: "short" | "long"; readonly length: number; readonly limit: number }
  | { readonly kind: "character"; readonly character: string }
  | { readonly kind: "noLetter" };

export function handleText({ service, handle }: PaymentHandle): string {
  return `${HANDLE_RULES[service].sigil}${handle}`;
}

const PAYPAL_ME_PREFIX = /^(?:https?:\/\/)?(?:www\.)?paypal\.me\//i;

function canonical({ service, handle }: PaymentHandle): PaymentHandle {
  const { sigil } = HANDLE_RULES[service];
  if (service === "paypal") return { service, handle: handle.replace(PAYPAL_ME_PREFIX, "") };
  return { service, handle: sigil !== "" && handle.startsWith(sigil) ? handle.slice(sigil.length) : handle };
}

function brokenRule({ service, handle }: PaymentHandle): HandleProblem | null {
  const { min, max, allowed, needsLetter } = HANDLE_RULES[service];
  const characters = [...handle];
  if (characters.length < min) return { kind: "short", length: characters.length, limit: min };
  if (characters.length > max) return { kind: "long", length: characters.length, limit: max };
  const edge = /^\s|\s$/u.exec(handle);
  if (edge) return { kind: "character", character: edge[0] };
  const odd = characters.find((character) => HIDDEN_CHARACTERS.test(character) || (allowed !== null && !allowed.test(character)));
  if (odd !== undefined) return { kind: "character", character: odd };
  if (needsLetter && !/[A-Za-z]/.test(handle)) return { kind: "noLetter" };
  return null;
}

/** Why a Split would refuse this handle as typed, sigil or not, so home can say so before Create sends it. */
export const handleProblem = (handle: PaymentHandle): HandleProblem | null => brokenRule(canonical(handle));

function canonicalHandles(handles: readonly PaymentHandle[]): readonly PaymentHandle[] {
  return handles.map(canonical);
}

export type NewSplit = {
  readonly id: MintedSplitId;
  readonly receipt: Receipt;
  /** The business name read from the receipt. */
  readonly place?: string;
  readonly participants: Split["participants"];
  readonly paymentHandles: readonly PaymentHandle[];
  /** The creating browser's device id. It makes the Host's name picked on that browser from the first load. */
  readonly hostDevice?: DeviceId;
};

export type CreateSplitRequest = { readonly split: Omit<NewSplit, "id"> };

/** `split` is the Split as stored, which is what the socket's first state will carry, so the Host's page can show it before the socket has said anything. */
export type CreateSplitResponse = { readonly id: SplitId; readonly creatorSecret: string; readonly split: Split };

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

/** While the Split is live, each ClientMessage gets exactly one answer, in the order sent: a `state` or `unchanged` carrying its ref, or a `rejected` whose ref is null when the frame was refused before its ref was read. A `state` with a null ref is the snapshot on connect, someone else's change, or the receipt photo landing or going. Its `photo` says whether `GET /api/splits/<id>/photo` has one. `unavailable` ends the socket. A recorded change that would write history faster than the Split's history rate gets a `rateLimited` refusal carrying its ref, and is not early. A frame sent before the `retryAfterMs` of the socket's preceding `rateLimited` refusal with a null ref has elapsed is early. The 100th early frame since the socket's last admitted frame gets its `rejected`, and then the socket is closed with code 1008 and reason `rateLimited`. A frame that waits out `retryAfterMs` neither counts nor resets the count. No frame after a close gets an answer. */
export type ServerMessage =
  | { readonly type: "state"; readonly ref: string | null; readonly photo: boolean; readonly split: Split }
  | { readonly type: "unchanged"; readonly ref: string; readonly revision: number }
  | { readonly type: "rejected"; readonly ref: string | null; readonly rejection: WireRejection }
  | { readonly type: "unavailable"; readonly reason: "notFound" | "unreadable" };

export function createSplit(input: NewSplit): { readonly ok: true; readonly split: Split } | Rejected {
  const { items, adjustments, subtotal, total } = input.receipt;
  const plain = ({ quantity = 1, ...row }: Item): Item => (quantity === 1 ? row : { ...row, quantity });
  const unclaimed = (item: Item): SplitItem => ({ ...plain(item), split: unclaimedSplit() });
  const receipt: Receipt<SplitItem> = { items: items.map(unclaimed), adjustments, subtotal, total };
  const bare: Split = {
    schemaVersion: 4,
    id: input.id,
    currency: "USD",
    ...(input.place !== undefined && { place: input.place }),
    receipt,
    participants: input.participants,
    picks: input.hostDevice ? [{ participantId: input.participants[0].id, device: pickDevice(input.hostDevice, input.id) }] : [],
    payments: [],
    paymentHandles: canonicalHandles(input.paymentHandles),
    revision: 0,
    recentChanges: [],
  };
  const withOriginal: Split = { ...bare, original: { items: items.map(plain), adjustments, subtotal, total } };
  const check = (candidate: Split) => checkSplit(candidate) ?? capRejection(candidate, null);
  const split = check(withOriginal) === null ? withOriginal : bare;
  const rejection = repeatedNames(split.participants) > 0 ? { reason: "nameTaken" as const } : check(split);
  return rejection ? { ok: false, rejection } : { ok: true, split };
}

export function checkSplit(split: Split): Rejection | null {
  const rejection = checkState({ ...split, recentChanges: [] });
  if (rejection) return rejection;
  const { items, adjustments } = split.receipt;
  const rowsNamed = [...items, ...adjustments].every(({ name }) => isName(name, MAX_ROW_NAME_LENGTH)) && [...items, ...(split.original?.items ?? [])].every(({ detail }) => detail === undefined || isDetail(detail));
  const participantsNamed = split.participants.every(({ name }) => isName(name, MAX_PARTICIPANT_NAME_LENGTH));
  const placeNamed = split.place === undefined || isName(split.place, MAX_PLACE_LENGTH);
  if (!rowsNamed || !participantsNamed || !placeNamed) return { reason: "badName" };
  const revisions = split.recentChanges.map(({ revision }) => revision);
  if (!isStrictlySorted(revisions) || revisions.some((revision) => revision > split.revision)) {
    return { reason: "malformed", path: "recentChanges" };
  }
  if (split.recentChanges.length > RECENT_CHANGES_LIMIT || serializedBytes(split) > MAX_STORED_BYTES) {
    return { reason: "tooLarge" };
  }
  return null;
}

function checkState(split: Split): Rejection | null {
  const { receipt, participants, payments, paymentHandles } = split;
  const { items, adjustments, subtotal, total } = receipt;
  if (items.length > MAX_STORED_ITEMS) return { reason: "tooManyItems" };
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
  const bundles = bundleRejection(receipt, "receipt") ?? (split.original ? bundleRejection(split.original, "original") : null);
  if (bundles) return bundles;

  const ids = new Set<ParticipantId>(participants.map(({ id }) => id));
  const [host] = participants;
  const unsorted = items.findIndex(({ split }) => !isStrictlySorted(claimersOf(split)));
  if (unsorted !== -1) return { reason: "malformed", path: `receipt.items[${unsorted}].split` };
  if (!items.every(({ split }) => valuesInRange(split))) return { reason: "amountOutOfRange" };
  if (items.some(({ split, price }) => overPrice(split, price))) return { reason: "amountOverPrice" };
  const claimsValid = items.every(({ split }) => claimersOf(split).every((id) => ids.has(id)));
  const paidBy = payments.map(({ participantId }) => participantId);
  const paymentsValid = isStrictlySorted(paidBy) && paidBy.every((id) => ids.has(id) && id !== host.id);
  const picked = split.picks.map(({ participantId }) => participantId);
  if (!isStrictlySorted(picked)) return { reason: "malformed", path: "picks" };
  if (!claimsValid || !paymentsValid || !picked.every((id) => ids.has(id))) return { reason: "unknownParticipant" };

  const services = paymentHandles.map(({ service }) => service);
  const handlesValid = paymentHandles.every((handle) => brokenRule(handle) === null);
  if (!handlesValid || new Set(services).size !== services.length) return { reason: "badHandle" };

  return null;
}

const coreBytes = (split: Split) => serializedBytes({ ...split, payments: [], recentChanges: [] });

/**
 * The Item and byte caps hold for a new Split and for any write that adds Items. A stored old Split can read past them, since its
 * differing units read as rows; it still takes writes that add no Item, and one within the byte cap never grows past it.
 */
function capRejection(split: Split, before: Split | null): Rejection | null {
  const items = split.receipt.items.length;
  const grew = before === null || items > before.receipt.items.length;
  if (grew && items > MAX_ITEMS) return { reason: "tooManyItems" };
  const core = coreBytes(split);
  const room = PAYMENT_RESERVE_BYTES + HISTORY_RESERVE_BYTES;
  if (core > MAX_STORED_BYTES - room) return { reason: "tooLarge" };
  if (core > SPLIT_BYTE_BUDGET - room && (grew || coreBytes(before) <= SPLIT_BYTE_BUDGET - room)) return { reason: "tooLarge" };
  return null;
}

function bundleRejection({ items, adjustments }: Receipt, path: string): Rejection | null {
  const known = new Set(items.map(({ id }) => id));
  const bundled = new Set<ItemId>();
  for (const [index, row] of adjustments.entries()) {
    if (row.kind !== "bundleDiscount") continue;
    if (row.amount > 0) return { reason: "amountOutOfRange" };
    const named = new Set(row.bundle.items);
    if (named.size !== row.bundle.items.length || [...named].some((id) => !known.has(id) || bundled.has(id))) {
      return { reason: "malformed", path: `${path}.adjustments[${index}].bundle.items` };
    }
    for (const id of named) bundled.add(id);
  }
  return null;
}

function valuesInRange(split: ItemSplit): boolean {
  if (split.by === "even") return true;
  const [low, high] = split.by === "amount" ? [0, MAX_CENTS] : [1, MAX_SHARES];
  return split.units[0].every(([, value]) => Number.isSafeInteger(value) && value >= low && value <= high);
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
