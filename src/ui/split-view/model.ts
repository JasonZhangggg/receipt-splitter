import { claimersOf, type Optimistic } from "../../core/operations";
import { shareBreakdown, type ShareBreakdown, type Shares } from "../../core/shares";
import type { Cents } from "../../core/money";
import { itemId, type Adjustment, type AdjustmentId, type ItemId, type ItemRow, type NonEmpty, type Participant, type ParticipantId, type Receipt, type Split, type SplitItem } from "../../core/split";
import { runTotalCheck } from "../../core/total-check";
import { gapNote, money } from "../../draft";
import { splitCopy as say } from "../split-copy";

export function claimersOfItem(item: SplitItem): ParticipantId[] {
  return [...claimersOf(item.split)];
}

/** How an Item is split when someone shares it, as the Pay sheet reads it under the line: "Split 3 ways", "2 of 6 shares", "By amount". An Item one person had says nothing. */
export function payNote({ split }: SplitItem, participantId: ParticipantId): string | null {
  const claimers = claimersOf(split);
  if (claimers.length < 2) return null;
  if (split.by === "amount") return say.byAmount;
  if (split.by === "even") return say.splitWays(claimers.length);
  const total = split.units[0].reduce((sum, [, weight]) => sum + weight, 0);
  return say.shareOfShares(split.units[0].find(([id]) => id === participantId)?.[1] ?? 0, total);
}

export function quantityText({ quantity = 1 }: { readonly quantity?: number }): string | null {
  return quantity > 1 ? `${quantity}x` : null;
}

export type BreakdownLine = { readonly id: ItemId; readonly quantity: string | null; readonly name: string; readonly detail: string | null; readonly part: string | null; readonly portion: Cents };

/** One line per row on the Split page: a quantity line is one line with its quantity, never "1 of 3". */
export function breakdownLines(breakdown: ShareBreakdown, items: readonly SplitItem[], participantId: ParticipantId): BreakdownLine[] {
  return breakdown.items.map((line) => {
    const item = items.find(({ id }) => id === line.id);
    const [name, detail] = item ? nameParts(item) : [line.name, null];
    return { id: line.id, quantity: quantityText(line), name, detail, part: item ? payNote(item, participantId) : null, portion: line.portion };
  });
}

const MAX_ID_LENGTH = 24;

/** Ids for the rows Split adds after a line: `<id>-2`, `<id>-3`, and so on, past any id the receipt already holds. */
export function splitIds(receipt: Receipt<SplitItem>, line: SplitItem): ItemId[] {
  const taken = new Set<string>(receipt.items.map(({ id }) => id));
  const ids: ItemId[] = [];
  for (let n = 2; ids.length < (line.quantity ?? 1) - 1; n += 1) {
    const suffix = `-${n}`;
    const id = `${line.id.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(id)) ids.push(itemId(id));
  }
  return ids;
}

/** Where focus goes when the line for `gone` leaves the receipt, nearest first: the lines after it, then the ones before it. */
export function linesNear(order: readonly ItemId[], gone: ItemId): ItemId[] {
  const at = order.indexOf(gone);
  return at < 0 ? [] : [...order.slice(at + 1), ...order.slice(0, at).reverse()];
}

/** Whose list this is: everyone at the table, the person this phone belongs to, and the person whose checks the dots show. */
export type Viewing = { readonly people: readonly Participant[]; readonly me: ParticipantId | null; readonly viewer: ParticipantId | null };

/** Who had a line: whether this phone's owner did, and everyone else in the table's order. */
export type Who = { readonly you: boolean; readonly others: readonly string[] };

/** What a row says under its name and price: who had it, and what it costs the viewer or each person. */
export type LineView = { readonly who: Who; readonly split: string | null };

export function whoHad(claimers: readonly ParticipantId[], { people, me }: Viewing): Who {
  const had = people.filter(({ id }) => claimers.includes(id));
  return { you: had.some(({ id }) => id === me), others: had.filter(({ id }) => id !== me).map(({ name }) => name) };
}

/** The who line as words: "You" first, then the others, or Nobody yet. */
export function whoText({ you, others }: Who): string {
  return you || others.length > 0 ? [...(you ? [say.youHad] : []), ...others].join(", ") : say.nobodyYet;
}

/** What the viewer owes for each Item they have a part in, from their share breakdown, so a row reads what the Pay sheet charges. */
export type Portions = ReadonlyMap<ItemId, Cents>;

export function lineView(item: SplitItem, viewing: Viewing, portions: Portions): LineView {
  const claimers = claimersOf(item.split);
  return { who: whoHad(claimers, viewing), split: splitLine(item, claimers, viewing, portions) };
}

function splitLine(item: SplitItem, claimers: readonly ParticipantId[], { me, viewer }: Viewing, portions: Portions): string | null {
  const parts = lineAmounts(item);
  const mine = viewer !== null && claimers.includes(viewer) ? portions.get(item.id) : undefined;
  if (mine !== undefined) return `${money(mine)} ${viewer === me ? say.yours : say.theirs}`;
  if (claimers.length < 2) return null;
  if (item.split.by === "even") return parts.every(({ cents }) => cents === parts[0].cents) ? `${money(parts[0].cents)} ${say.each}` : say.splitWaysLine(claimers.length);
  return item.split.by === "shares" ? say.byShares : say.byAmountLine;
}

/** How many Items the viewer has a part in, for the Items heading. */
export function itemsHad(items: readonly SplitItem[], viewer: ParticipantId | null): number {
  return items.filter(({ split }) => viewer !== null && claimersOf(split).includes(viewer)).length;
}

/** The claim or unclaim a tap on the dot sends: the opposite of what the Item shows for the person. */
export function circleTap(item: SplitItem, participantId: ParticipantId): Extract<Optimistic, { type: "claim" | "unclaim" }> {
  const had = claimersOf(item.split).includes(participantId);
  return { by: participantId, type: had ? "unclaim" : "claim", itemId: item.id, participantId };
}

const SIZE = /^\d+(?:\.\d+)?(?:oz|ml|cl|l|lb|g|kg)$/i;

/** The Item's name and the line under it: its detail when set, or else a size printed on the name line and what follows it. */
export function nameParts({ name, detail }: Pick<ItemRow, "name" | "detail">): readonly [title: string, detail: string | null] {
  if (detail !== undefined) return [name, detail];
  const words = name.split(" ");
  const at = words.findIndex((word, index) => index > 0 && SIZE.test(word));
  return at < 0 ? [name, null] : [words.slice(0, at).join(" "), words.slice(at).join(" ")];
}


export type BundleRow = {
  readonly id: AdjustmentId;
  readonly name: string;
  readonly items: NonEmpty<SplitItem>;
  readonly discount: { readonly label: string; readonly amount: Cents };
  readonly summary: string;
  readonly net: number;
};

export type ReceiptRow = { readonly kind: "item"; readonly id: ItemId; readonly item: SplitItem } | { readonly kind: "bundle"; readonly id: AdjustmentId; readonly bundle: BundleRow };

type BundleDiscount = Extract<Adjustment, { readonly kind: "bundleDiscount" }>;

const isBundle = (row: Adjustment): row is BundleDiscount => row.kind === "bundleDiscount";
const percentOff = (name: string) => /(\d+(?:\.\d+)?)\s*%/.exec(name)?.[1] ?? null;

export function receiptRows(receipt: Receipt<SplitItem>): { readonly rows: readonly ReceiptRow[]; readonly charges: readonly Adjustment[] } {
  const bundles = receipt.adjustments.filter(isBundle).flatMap((row) => {
    const [first, ...rest] = receipt.items.filter(({ id }) => row.bundle.items.includes(id));
    return first ? [bundleRow(row, [first, ...rest])] : [];
  });
  const rows = receipt.items.flatMap((item): ReceiptRow[] => {
    const bundle = bundles.find(({ items }) => items.some(({ id }) => id === item.id));
    if (!bundle) return [{ kind: "item", id: item.id, item }];
    return bundle.items[0].id === item.id ? [{ kind: "bundle", id: bundle.id, bundle }] : [];
  });
  return { rows, charges: receipt.adjustments.filter((row) => !isBundle(row)) };
}

function bundleRow(row: BundleDiscount, items: NonEmpty<SplitItem>): BundleRow {
  const percent = percentOff(row.name);
  const label = row.name.startsWith(`${row.bundle.name} `) ? row.name.slice(row.bundle.name.length + 1) : row.name;
  return {
    id: row.id,
    name: row.bundle.name,
    items,
    discount: { label: label.charAt(0).toUpperCase() + label.slice(1), amount: row.amount },
    summary: say.bundleSummary(items.length, percent ? `${percent}%` : money(Math.abs(row.amount))),
    net: items.reduce((total, { price }) => total + price, 0) + row.amount,
  };
}

export type BillParts = { readonly mine: number; readonly others: number; readonly unclaimed: number };

/** The bill in three parts for the share bar: the viewed person's share, everyone else's, and what nobody has claimed yet. */
export function billParts(shares: Shares, viewer: ParticipantId): BillParts {
  const share = (one: { readonly share: number }) => Math.max(0, one.share);
  return {
    mine: shares.shares.filter(({ participantId }) => participantId === viewer).reduce((sum, one) => sum + share(one), 0),
    others: shares.shares.filter(({ participantId }) => participantId !== viewer).reduce((sum, one) => sum + share(one), 0),
    unclaimed: Math.max(0, shares.unclaimed.total),
  };
}

export type ItemFilter = "all" | "mine" | "none" | "shared";

/** The list's filters in the order the tabs and the menu show them. "Yours" needs someone viewed, so it drops out until then. */
export function itemFilters(viewer: ParticipantId | null): readonly ItemFilter[] {
  return viewer === null ? ["all", "none", "shared"] : ["all", "mine", "none", "shared"];
}

/** Whether a line shows under `filter`: the viewed person had it, nobody has it yet, or two or more people share it. A By amount line with money left over still has someone, so it is not under Nobody yet. */
export function itemShows(item: SplitItem, filter: ItemFilter, viewer: ParticipantId | null): boolean {
  const claimers = claimersOf(item.split);
  if (filter === "mine") return viewer !== null && claimers.includes(viewer);
  if (filter === "none") return claimers.length === 0;
  if (filter === "shared") return claimers.length > 1;
  return true;
}

/** How many lines each filter shows, one per line whatever its quantity, Bundle lines included. */
export function filterCounts(items: readonly SplitItem[], viewer: ParticipantId | null): Record<ItemFilter, number> {
  const count = (filter: ItemFilter) => items.filter((item) => itemShows(item, filter, viewer)).length;
  return { all: items.length, mine: count("mine"), none: count("none"), shared: count("shared") };
}

/** The receipt's rows under `filter`. A Bundle stays while any of its lines shows, holding only those lines; the rows that pass through are the same objects, so a kept list sees no change. */
export function filterRows(rows: readonly ReceiptRow[], filter: ItemFilter, viewer: ParticipantId | null): readonly ReceiptRow[] {
  if (filter === "all") return rows;
  return rows.flatMap((row): ReceiptRow[] => {
    if (row.kind === "item") return itemShows(row.item, filter, viewer) ? [row] : [];
    const [first, ...rest] = row.bundle.items.filter((item) => itemShows(item, filter, viewer));
    if (!first) return [];
    return rest.length + 1 === row.bundle.items.length ? [row] : [{ ...row, bundle: { ...row.bundle, items: [first, ...rest] } }];
  });
}

/** The Bundle's Items off the Unclaimed line (`unclaimed`), one per row whatever its quantity, so a By amount line with money left over is not claimed. */
export function claimedItems(bundle: BundleRow, unclaimed: readonly ItemId[]): number {
  return bundle.items.filter(({ id }) => !unclaimed.includes(id)).length;
}

export function bundleNote(receipt: Receipt<SplitItem>, itemId: ItemId, price: number): string | null {
  const row = receipt.adjustments.filter(isBundle).find(({ bundle }) => bundle.items.includes(itemId));
  if (!row) return null;
  const inBundle = receipt.items.filter(({ id }) => row.bundle.items.includes(id)).reduce((total, { price }) => total + price, 0);
  const off = inBundle === 0 ? 0 : Math.round((price * Math.abs(row.amount)) / inBundle);
  return say.inBundle(row.bundle.name, percentOff(row.name), money(off));
}

export function breakdownCharges(receipt: Receipt<SplitItem>, breakdown: ShareBreakdown): ShareBreakdown["adjustments"] {
  const had = new Set(breakdown.items.map(({ id }) => id));
  return breakdown.adjustments.filter(({ id }) => {
    const row = receipt.adjustments.find((adjustment) => adjustment.id === id);
    return !row || !isBundle(row) || row.bundle.items.some((item) => had.has(item));
  });
}

export function totalNote(receipt: Receipt<SplitItem>): string | null {
  const check = runTotalCheck(receipt);
  return check.ok ? null : gapNote(check);
}

/**
 * Each claimer's part of `item` as the list and the Pay sheet charge it, from their Share breakdown with `item` in place of its row, so an unsaved edit reads right.
 * By amount, the parts are the typed cents. They come in the order "Who had it" lists people, `viewer` first and then `split.participants`, whatever order the claims were stored in.
 */
export function itemParts(split: Pick<Split, "receipt" | "participants" | "payments">, item: SplitItem, viewer: ParticipantId | null = null): { readonly participantId: ParticipantId; readonly cents: number }[] {
  const parts = lineAmounts(item);
  const at = ({ participantId }: (typeof parts)[number]) => (participantId === viewer ? -1 : split.participants.findIndex(({ id }) => id === participantId));
  const order = (list: typeof parts) => list.toSorted((a, b) => at(a) - at(b));
  if (item.split.by === "amount") return order(parts);
  const [first, ...rest] = split.receipt.items.map((row) => (row.id === item.id ? item : row));
  const shown = { ...split, receipt: { ...split.receipt, items: [first, ...rest] as const } };
  return order(parts.map(({ participantId, cents }) => ({ participantId, cents: shareBreakdown(shown, participantId).items.find(({ id }) => id === item.id)?.portion ?? cents })));
}

export function lineAmounts<Line extends Pick<SplitItem, "price" | "split">>({ price, split }: Line): { readonly participantId: ParticipantId; readonly cents: number }[] {
  if (split.by === "amount") return split.units[0].map(([participantId, cents]) => ({ participantId, cents }));
  const weights = split.by === "even" ? split.units[0].map((id): [ParticipantId, number] => [id, 1]) : split.units[0];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const exact = weights.map(([participantId, weight]) => ({ participantId, value: (price * weight) / total }));
  const floors = exact.map(({ participantId, value }) => ({ participantId, cents: Math.floor(value), rest: value - Math.floor(value) }));
  let left = price - floors.reduce((sum, { cents }) => sum + cents, 0);
  for (const part of [...floors].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    part.cents += 1;
    left -= 1;
  }
  return floors.map(({ participantId, cents }) => ({ participantId, cents }));
}

export type Kept<Row> = { readonly row: Row; readonly gone: boolean };

/** The rows, with each one the list dropped kept where it stood, marked gone, so it can leave in place. */
export function keepInPlace<Row extends { readonly id: string }>(was: readonly Kept<Row>[], rows: readonly Row[]): Kept<Row>[] {
  const at = new Map(rows.map(({ id }, index) => [id, index]));
  const next: Kept<Row>[] = [];
  let taken = 0;
  for (const { row } of was) {
    const index = at.get(row.id);
    if (index === undefined) next.push({ row, gone: true });
    else for (; taken <= index; taken += 1) next.push({ row: rows[taken], gone: false });
  }
  for (; taken < rows.length; taken += 1) next.push({ row: rows[taken], gone: false });
  return next;
}
