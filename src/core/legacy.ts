import { cents, price, type Cents } from "./money";
import { MAX_SHARES, checkSplit } from "./operations";
import { unitPrices } from "./shares";
import {
  isId,
  storedVersion,
  type Change,
  type ItemId,
  type ItemRow,
  type ItemSplit,
  type LegacyWrite,
  type NonEmpty,
  type Part,
  type ParticipantId,
  type Receipt,
  type RowWrite,
  type Split,
  type SplitItem,
  type Write,
} from "./split";

/** How versions 1 to 3 stored an Item's split: one claim set per unit, so the quantity is `units.length`. */
export type LegacyItemSplit =
  | { readonly by: "even"; readonly units: NonEmpty<readonly ParticipantId[]> }
  | { readonly by: "shares"; readonly units: NonEmpty<readonly Part<number>[]> }
  | { readonly by: "amount"; readonly units: NonEmpty<readonly Part<Cents>[]> };

export type LegacyItem = ItemRow & { readonly split: LegacyItemSplit };

export type LegacyItemWrite = { readonly kind: "item" } & RowWrite<ItemId, Omit<LegacyItem, "id">>;

export type LegacyChange = Omit<Change, "writes"> & { readonly writes: NonEmpty<LegacyItemWrite | Exclude<Write | LegacyWrite, { readonly kind: "item" }>> };

export type LegacySplit = Omit<Split, "schemaVersion" | "receipt" | "recentChanges"> & {
  readonly schemaVersion: 1 | 2 | 3;
  readonly receipt: Receipt<LegacyItem>;
  readonly recentChanges: readonly LegacyChange[];
};

/**
 * Reads a version 1, 2, or 3 Split as the current model, keeping each person's money and each Item's detail.
 * A line whose units differ becomes one-unit rows, as Split would leave it. A line whose rows would not load reads as one line by amount instead, one line at a time.
 */
export function fromLegacy(legacy: LegacySplit): Split {
  const differing = legacy.receipt.items.filter(({ split }) => !sameUnits(split)).map(({ id }) => id);
  const all = mapped(legacy, new Set(differing));
  if (checkSplit(all) === null) return all;
  const expanded = new Set<ItemId>();
  for (const id of differing) {
    expanded.add(id);
    if (checkSplit(mapped(legacy, expanded)) !== null) expanded.delete(id);
  }
  return mapped(legacy, expanded);
}

function mapped(legacy: LegacySplit, expanded: ReadonlySet<ItemId>): Split {
  const taken = new Set<string>(legacy.receipt.items.map(({ id }) => id));
  const [first, ...rest] = legacy.receipt.items.map((item): NonEmpty<SplitItem> => (expanded.has(item.id) ? asRows(item, taken) : [asLine(item)]));
  const rowIds = new Map([first, ...rest].map((rows) => [rows[0].id, rows.slice(1).map(({ id }) => id)]));
  const adjustments = legacy.receipt.adjustments.map((row) => {
    if (row.kind !== "bundleDiscount") return row;
    const [head, ...tail] = row.bundle.items;
    const withRows = (id: ItemId) => [id, ...(rowIds.get(id) ?? [])];
    return { ...row, bundle: { ...row.bundle, items: [head, ...(rowIds.get(head) ?? []), ...tail.flatMap(withRows)] as const } };
  });
  const receipt = { ...legacy.receipt, items: [first[0], ...first.slice(1), ...rest.flat()] as const, adjustments };
  const now = { rows: new Set([...rowIds].filter(([, ids]) => ids.length > 0).map(([id]) => id)), units: new Map(legacy.receipt.items.map(({ id, split }) => [id, split.units.length])) };
  const recentChanges = legacy.recentChanges.map(({ writes: [first, ...rest], ...change }): Change => ({
    ...change,
    writes: [...asWrites(first, now), ...rest.flatMap((write) => asWrites(write, now))],
  }));
  return { ...legacy, schemaVersion: storedVersion({ receipt, original: legacy.original, recentChanges }), receipt, recentChanges };
}

/** One line with the quantity. Equal units keep their claims with cents times the quantity; differing units read by amount with each person's exact cents. */
function asLine({ split, ...row }: LegacyItem): SplitItem {
  const quantity = split.units.length;
  const line = sameUnits(split) ? oneLine(split) : { by: "amount" as const, units: [exactCents(split, row.price)] as const };
  return { ...row, ...(quantity > 1 && { quantity }), split: line };
}

function asRows(item: LegacyItem, taken: Set<string>): NonEmpty<SplitItem> {
  const { units } = item.split;
  if (sameUnits(item.split)) return [asLine(item)];
  const wanted = units.slice(1).map((_, at) => `${item.id}-${at + 2}`);
  const ids = wanted.filter((id): id is ItemId => isId<"ItemId">(id) && !taken.has(id));
  if (ids.length !== wanted.length) return [asLine(item)];
  for (const id of ids) taken.add(id);
  const prices = unitPrices(item.price, units.length);
  const row = (id: ItemId, unit: number): SplitItem => ({ id, name: item.name, price: price(prices[unit]), ...(item.detail !== undefined && { detail: item.detail }), split: unitSplit(item.split, unit) });
  return [row(item.id, 0), ...ids.map((id, at) => row(id, at + 1))];
}

function unitSplit(split: LegacyItemSplit, unit: number): ItemSplit {
  if (split.by === "even") return { by: "even", units: [split.units[unit]] };
  if (split.by === "shares") return { by: "shares", units: [split.units[unit]] };
  return { by: "amount", units: [split.units[unit]] };
}

function sameUnits({ units }: LegacyItemSplit): boolean {
  return units.every((unit) => JSON.stringify(unit) === JSON.stringify(units[0]));
}

/**
 * What each person pays of the line, in cents, as the old per-unit Shares computed it.
 * An exact share can hold a fraction of a cent; the claimed cents are then shared out by largest remainder, so the line's claimed total stays exact.
 */
function exactCents(split: LegacyItemSplit, linePrice: number): Part<Cents>[] {
  const prices = unitPrices(linePrice, split.units.length);
  const units = prices.map((_, at) => {
    const parts = split.by === "even" ? split.units[at].map((id) => [id, 1n] as const) : split.units[at].map(([id, value]) => [id, BigInt(value)] as const);
    const total = parts.reduce((sum, [, value]) => sum + value, 0n);
    const unitPrice = BigInt(prices[at]);
    const whole = split.by === "amount" ? (unitPrice > total ? unitPrice : total) : total;
    return { parts, whole, unitPrice };
  });
  const denominator = units.reduce((lcm, { whole }) => (whole === 0n ? lcm : leastCommonMultiple(lcm, whole)), 1n);
  const scaled = new Map<ParticipantId, bigint>();
  for (const { parts, whole, unitPrice } of units) {
    for (const [id, value] of parts) scaled.set(id, (scaled.get(id) ?? 0n) + (whole === 0n ? 0n : (value * unitPrice * denominator) / whole));
  }
  const people = [...scaled].sort(([a], [b]) => byCodeUnit(a, b));
  const claimed = Number(people.reduce((sum, [, value]) => sum + value, 0n) / denominator);
  const floors = people.map(([id, value]) => ({ id, cents: Number(value / denominator), remainder: value % denominator }));
  const short = claimed - floors.reduce((sum, { cents: floor }) => sum + floor, 0);
  const roundedUp = new Set([...floors].sort((a, b) => (a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1)).slice(0, short));
  return floors.map((part): Part<Cents> => [part.id, cents(part.cents + (roundedUp.has(part) ? 1 : 0))]);
}

function leastCommonMultiple(a: bigint, b: bigint): bigint {
  let [x, y] = [a, b];
  while (y !== 0n) [x, y] = [y, x % y];
  return (a / x) * b;
}

/** One claim set for the whole line: equal units keep their claims with cents times the quantity, and differing units merge everyone who had any, with shares or cents summed. */
function oneLine(split: LegacyItemSplit): ItemSplit {
  const quantity = split.units.length;
  const same = sameUnits(split);
  if (split.by === "even") return { by: "even", units: [same ? split.units[0] : [...new Set(split.units.flat())].sort(byCodeUnit)] };
  if (split.by === "shares") return { by: "shares", units: [same ? split.units[0] : summed(split.units, (total) => Math.min(total, MAX_SHARES))] };
  return { by: "amount", units: [same ? split.units[0].map(([id, amount]): Part<Cents> => [id, cents(amount * quantity)]) : summed(split.units, cents)] };
}

function summed<Value extends number>(units: readonly (readonly Part<Value>[])[], value: (total: number) => Value): Part<Value>[] {
  const totals = new Map<ParticipantId, number>();
  for (const [id, amount] of units.flat()) totals.set(id, (totals.get(id) ?? 0) + amount);
  return [...totals].sort(([a], [b]) => byCodeUnit(a, b)).map(([id, total]): Part<Value> => [id, value(total)]);
}

/**
 * An old item write, with a perUnit mark when reverting it would no longer undo what it did:
 * its line now reads as rows, its units differed, or its quantity is not the line's, since an old Revert then gave the claims to the first units only.
 */
function asWrites(
  write: LegacyItemWrite | Exclude<Write | LegacyWrite, { readonly kind: "item" }>,
  now: { readonly rows: ReadonlySet<ItemId>; readonly units: ReadonlyMap<ItemId, number> },
): NonEmpty<Write | LegacyWrite> {
  if (write.kind !== "item") return [write];
  const claimSets = "edit" in write ? (write.edit.split ?? []) : ["added" in write ? write.added.split : write.removed.split];
  const quantities = new Set([...claimSets.map(({ units }) => units.length), ...(claimSets.length > 0 && now.units.has(write.id) ? [now.units.get(write.id)] : [])]);
  const perUnit = now.rows.has(write.id) || quantities.size > 1 || claimSets.some((split) => !sameUnits(split));
  return perUnit ? [asWrite(write), { kind: "perUnit", id: write.id }] : [asWrite(write)];
}

function asWrite(write: LegacyItemWrite | Exclude<Write | LegacyWrite, { readonly kind: "item" }>): Write | LegacyWrite {
  if (write.kind !== "item") return write;
  if ("edit" in write) {
    const { split, ...fields } = write.edit;
    if (!split) return { kind: "item", id: write.id, edit: fields };
    const [before, after] = split;
    const quantity = before.units.length === after.units.length ? {} : { quantity: [before.units.length, after.units.length] as const };
    return { kind: "item", id: write.id, edit: { ...fields, ...quantity, split: [oneLine(before), oneLine(after)] } };
  }
  const { index, ...placed } = "added" in write ? write.added : write.removed;
  const { id: _, ...line } = asLine({ id: write.id, ...placed });
  return "added" in write ? { kind: "item", id: write.id, added: { index, ...line } } : { kind: "item", id: write.id, removed: { index, ...line } };
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
