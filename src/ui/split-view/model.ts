import { claimersOf, type Operation } from "../../core/operations";
import type { ShareBreakdown } from "../../core/shares";
import type { Cents } from "../../core/money";
import { itemId, type Adjustment, type AdjustmentId, type ItemId, type ItemRow, type NonEmpty, type ParticipantId, type Receipt, type SplitItem } from "../../core/split";
import { runTotalCheck } from "../../core/total-check";
import { gapNote, groupedAmount, money } from "../../draft";
import { splitCopy as say } from "../split-copy";

const UNICODE_FRACTIONS: Record<string, string> = { "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "1/6": "⅙", "1/8": "⅛" };

/** What the Split page's bar shows outside the pick sheet. Only someone who picked a name has a share or a breakdown. */
export type Bar =
  | { readonly kind: "ask" }
  | { readonly kind: "share"; readonly me: ParticipantId }
  | { readonly kind: "breakdown"; readonly me: ParticipantId; readonly person: ParticipantId };

export function barFor(me: ParticipantId | null, expanded: boolean, selected: ParticipantId | null): Bar {
  if (me === null) return { kind: "ask" };
  return expanded ? { kind: "breakdown", me, person: selected ?? me } : { kind: "share", me };
}

export function claimersOfItem(item: SplitItem): ParticipantId[] {
  return [...claimersOf(item.split)];
}

export function ratio(weights: readonly (readonly [ParticipantId, number])[], order: readonly ParticipantId[]): string {
  return [...weights]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([, weight]) => weight)
    .join(":");
}

export function lineTag(item: SplitItem, order: readonly ParticipantId[]): string | null {
  const { split } = item;
  if (claimersOf(split).length < 2) return null;
  if (split.by === "shares") return ratio(split.units[0], order);
  if (split.by === "amount") return "split";
  return fractionText([1, split.units[0].length]);
}

export function fractionText([numerator, denominator]: readonly [number, number]): string {
  return UNICODE_FRACTIONS[`${numerator}/${denominator}`] ?? `${numerator}/${denominator}`;
}

export function shareLabel(fraction: readonly [number, number], price: string): string | null {
  const [numerator, denominator] = fraction;
  if (numerator === denominator) return null;
  return `${fractionText(fraction)} of ${price}`;
}

export function quantityText({ quantity = 1 }: { readonly quantity?: number }): string | null {
  return quantity > 1 ? `${quantity}x` : null;
}

export type BreakdownLine = { readonly id: ItemId; readonly quantity: string | null; readonly name: string; readonly part: string | null; readonly portion: Cents };

/** One line per row on the Split page: a quantity line is one line with its quantity, never "1 of 3". */
export function breakdownLines(breakdown: ShareBreakdown): BreakdownLine[] {
  return breakdown.items.map((line) => ({ id: line.id, quantity: quantityText(line), name: line.name, part: shareLabel(line.fraction, groupedAmount(line.price)), portion: line.portion }));
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

export function circleTap(item: SplitItem, participantId: ParticipantId): Operation[] {
  const had = claimersOf(item.split).includes(participantId);
  return [{ by: participantId, type: had ? "unclaim" : "claim", itemId: item.id, participantId }];
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
  const units = items.reduce((total, { quantity = 1 }) => total + quantity, 0);
  const label = row.name.startsWith(`${row.bundle.name} `) ? row.name.slice(row.bundle.name.length + 1) : row.name;
  return {
    id: row.id,
    name: row.bundle.name,
    items,
    discount: { label: label.charAt(0).toUpperCase() + label.slice(1), amount: row.amount },
    summary: say.bundleSummary(units, percent ? `${percent}%` : money(Math.abs(row.amount))),
    net: items.reduce((total, { price }) => total + price, 0) + row.amount,
  };
}

export function unclaimedUnits(bundle: BundleRow): number {
  return bundle.items.reduce((total, { split, quantity = 1 }) => total + (claimersOf(split).length === 0 ? quantity : 0), 0);
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

export function lineAmounts({ price, split }: SplitItem): { readonly participantId: ParticipantId; readonly cents: number }[] {
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
