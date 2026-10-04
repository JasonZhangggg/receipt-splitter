import { cents, price, type Cents } from "./money";
import { MAX_SHARES } from "./operations";
import { unitPrices } from "./shares";
import {
  MAX_ID_LENGTH,
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
 * A line whose units differ becomes rows, one per distinct claim set, so every Share stays exact.
 */
export function fromLegacy(legacy: LegacySplit): Split {
  const taken = new Set<string>(legacy.receipt.items.map(({ id }) => id));
  const [first, ...rest] = legacy.receipt.items.map((item) => asRows(item, taken));
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

/** One line with the quantity and one claim set for all its units, which only an old History write needs once its units differ. */
function asLine({ split, ...row }: LegacyItem): SplitItem {
  const quantity = split.units.length;
  return { ...row, ...(quantity > 1 && { quantity }), split: oneLine(split) };
}

/**
 * One row per distinct claim set, in the order the units first show it, with that set's units as its quantity and their prices summed.
 * The first row keeps the line's id; the others take the next free `<id>-n` that fits.
 */
function asRows(item: LegacyItem, taken: Set<string>): NonEmpty<SplitItem> {
  const prices = unitPrices(item.price, item.split.units.length);
  const groups = new Map<string, { readonly unit: number; quantity: number; price: number }>();
  item.split.units.forEach((claims, unit) => {
    const key = JSON.stringify(claims);
    const group = groups.get(key) ?? { unit, quantity: 0, price: 0 };
    group.quantity += 1;
    group.price += prices[unit];
    groups.set(key, group);
  });
  const row = (id: ItemId, { unit, quantity, price: cents }: { readonly unit: number; readonly quantity: number; readonly price: number }): SplitItem => ({
    id,
    name: item.name,
    price: price(cents),
    ...(item.detail !== undefined && { detail: item.detail }),
    ...(quantity > 1 && { quantity }),
    split: unitSplit(item.split, unit, quantity),
  });
  const [head, ...tail] = [...groups.values()];
  return [row(item.id, head), ...tail.map((group) => row(freeId(item.id, taken), group))];
}

function freeId(base: ItemId, taken: Set<string>): ItemId {
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const id = `${base.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (isId<"ItemId">(id) && !taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** A unit's claims for a row of `quantity` such units: cents scale by the quantity, so each claimer pays what those units cost them. */
function unitSplit(split: LegacyItemSplit, unit: number, quantity: number): ItemSplit {
  if (split.by === "even") return { by: "even", units: [split.units[unit]] };
  if (split.by === "shares") return { by: "shares", units: [split.units[unit]] };
  return { by: "amount", units: [split.units[unit].map(([id, amount]): Part<Cents> => [id, cents(amount * quantity)])] };
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
