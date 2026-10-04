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
 * A line whose units differ becomes one-unit rows, as Split would leave it. When that Split would not load, every such line reads as one line instead.
 */
export function fromLegacy(legacy: LegacySplit): Split {
  const expanded = mapped(legacy, true);
  return checkSplit(expanded) === null ? expanded : mapped(legacy, false);
}

function mapped(legacy: LegacySplit, expand: boolean): Split {
  const taken = new Set<string>(legacy.receipt.items.map(({ id }) => id));
  const [first, ...rest] = legacy.receipt.items.map((item): NonEmpty<SplitItem> => (expand ? asRows(item, taken) : [asLine(item)]));
  const rowIds = new Map([first, ...rest].map((rows) => [rows[0].id, rows.slice(1).map(({ id }) => id)]));
  const adjustments = legacy.receipt.adjustments.map((row) => {
    if (row.kind !== "bundleDiscount") return row;
    const [head, ...tail] = row.bundle.items;
    const withRows = (id: ItemId) => [id, ...(rowIds.get(id) ?? [])];
    return { ...row, bundle: { ...row.bundle, items: [head, ...(rowIds.get(head) ?? []), ...tail.flatMap(withRows)] as const } };
  });
  const receipt = { ...legacy.receipt, items: [first[0], ...first.slice(1), ...rest.flat()] as const, adjustments };
  const recentChanges = legacy.recentChanges.map(({ writes: [head, ...tail], ...change }): Change => ({ ...change, writes: [asWrite(head), ...tail.map(asWrite)] }));
  return { ...legacy, schemaVersion: storedVersion({ receipt, original: legacy.original, recentChanges }), receipt, recentChanges };
}

function asLine({ split, ...row }: LegacyItem): SplitItem {
  const quantity = split.units.length;
  return { ...row, ...(quantity > 1 && { quantity }), split: oneLine(split) };
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
