import { claimersOf, type Operation } from "../../core/operations";
import { unitPrices } from "../../core/shares";
import type { Cents } from "../../core/money";
import type { Adjustment, AdjustmentId, ItemId, NonEmpty, ParticipantId, Receipt, SplitItem } from "../../core/split";
import { runTotalCheck } from "../../core/total-check";
import { gapNote, plainAmount } from "../../draft";
import { splitCopy as say } from "../split-copy";

const UNICODE_FRACTIONS: Record<string, string> = { "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "1/6": "⅙", "1/8": "⅛" };

export function claimersOfItem(item: SplitItem): ParticipantId[] {
  return [...new Set(item.split.units.flatMap((_, unit) => claimersOf(item.split, unit)))];
}

export function ratio(weights: readonly (readonly [ParticipantId, number])[], order: readonly ParticipantId[]): string {
  return [...weights]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([, weight]) => weight)
    .join(":");
}

export function lineTag(item: SplitItem, order: readonly ParticipantId[]): string | null {
  const { split } = item;
  const [unit, ...more] = split.units;
  if (more.length > 0 || unit.length < 2) return null;
  if (split.by === "shares") return ratio(split.units[0], order);
  if (split.by === "amount") return "split";
  return fractionText([1, unit.length]);
}

export function fractionText([numerator, denominator]: readonly [number, number]): string {
  return UNICODE_FRACTIONS[`${numerator}/${denominator}`] ?? `${numerator}/${denominator}`;
}

export function shareLabel(fraction: readonly [number, number], quantity: number, price: string): string | null {
  const [numerator, denominator] = fraction;
  if (numerator === denominator) return null;
  const units = (numerator * quantity) / denominator;
  if (quantity > 1 && Number.isInteger(units)) return `${units} of ${quantity}`;
  return `${fractionText(fraction)} of ${price}`;
}

export function circleTap(item: SplitItem, participantId: ParticipantId): Operation[] {
  const units = item.split.units.map((_, unit) => claimersOf(item.split, unit));
  const had = units.flatMap((claimers, unit) => (claimers.includes(participantId) ? [unit] : []));
  if (had.length > 0) return had.map((unit) => ({ by: participantId, type: "unclaim", itemId: item.id, participantId, unit }));
  const open = units.findIndex((claimers) => claimers.length === 0);
  return [{ by: participantId, type: "claim", itemId: item.id, participantId, unit: Math.max(open, 0) }];
}

export type BundleRow = {
  readonly id: AdjustmentId;
  readonly name: string;
  readonly items: NonEmpty<SplitItem>;
  readonly discount: { readonly label: string; readonly amount: Cents };
  readonly summary: string;
  readonly net: number;
};

export type ReceiptRow = { readonly kind: "item"; readonly item: SplitItem } | { readonly kind: "bundle"; readonly bundle: BundleRow };

type BundleDiscount = Extract<Adjustment, { readonly kind: "bundleDiscount" }>;

const isBundle = (row: Adjustment): row is BundleDiscount => row.kind === "bundleDiscount";
const percentOff = (name: string) => /(\d+(?:\.\d+)?)\s*%/.exec(name)?.[1] ?? null;

/** Groups each Bundle's Items under it, at the place of its first Item, and leaves the receipt-level Adjustments as the charges. */
export function receiptRows(receipt: Receipt<SplitItem>): { readonly rows: readonly ReceiptRow[]; readonly charges: readonly Adjustment[] } {
  const bundles = receipt.adjustments.filter(isBundle).flatMap((row) => {
    const [first, ...rest] = receipt.items.filter(({ id }) => row.bundle.items.includes(id));
    return first ? [bundleRow(row, [first, ...rest])] : [];
  });
  const rows = receipt.items.flatMap((item): ReceiptRow[] => {
    const bundle = bundles.find(({ items }) => items.some(({ id }) => id === item.id));
    if (!bundle) return [{ kind: "item", item }];
    return bundle.items[0].id === item.id ? [{ kind: "bundle", bundle }] : [];
  });
  return { rows, charges: receipt.adjustments.filter((row) => !isBundle(row)) };
}

function bundleRow(row: BundleDiscount, items: NonEmpty<SplitItem>): BundleRow {
  const percent = percentOff(row.name);
  const units = items.reduce((total, { split }) => total + split.units.length, 0);
  const label = row.name.startsWith(`${row.bundle.name} `) ? row.name.slice(row.bundle.name.length + 1) : row.name;
  return {
    id: row.id,
    name: row.bundle.name,
    items,
    discount: { label: label.charAt(0).toUpperCase() + label.slice(1), amount: row.amount },
    summary: say.bundleSummary(units, percent ? `${percent}%` : `$${plainAmount(Math.abs(row.amount))}`),
    net: items.reduce((total, { price }) => total + price, 0) + row.amount,
  };
}

export function unclaimedUnits(bundle: BundleRow): number {
  return bundle.items.reduce((total, { split }) => total + split.units.filter((_, unit) => claimersOf(split, unit).length === 0).length, 0);
}

/** What a Bundle's discount takes off one of its Items, in proportion to the Item's price. */
export function bundleNote(receipt: Receipt<SplitItem>, itemId: ItemId): string | null {
  const row = receipt.adjustments.filter(isBundle).find(({ bundle }) => bundle.items.includes(itemId));
  const item = receipt.items.find(({ id }) => id === itemId);
  if (!row || !item) return null;
  const inBundle = receipt.items.filter(({ id }) => row.bundle.items.includes(id)).reduce((total, { price }) => total + price, 0);
  const off = inBundle === 0 ? 0 : Math.round((item.price * Math.abs(row.amount)) / inBundle);
  return say.inBundle(row.bundle.name, percentOff(row.name), `$${plainAmount(off)}`);
}

/** The Adjustments in a breakdown that apply to its person: every receipt-level one, and the discount of each Bundle they had an Item in. */
export function breakdownCharges<Row extends { readonly id: AdjustmentId }>(receipt: Receipt<SplitItem>, breakdown: { readonly items: readonly { readonly id: ItemId }[]; readonly adjustments: readonly Row[] }): Row[] {
  const had = new Set(breakdown.items.map(({ id }) => id));
  return breakdown.adjustments.filter(({ id }) => {
    const row = receipt.adjustments.find((adjustment) => adjustment.id === id);
    return !row || !isBundle(row) || row.bundle.items.some((item) => had.has(item));
  });
}

export function totalNote(receipt: Receipt<SplitItem>): string | null {
  const check = runTotalCheck(receipt);
  return check.ok ? null : gapNote(check, true);
}

export function unitAmounts(item: SplitItem): { readonly participantId: ParticipantId; readonly cents: number }[][] {
  const prices = unitPrices(item.price, item.split.units.length);
  return item.split.units.map((_, unit) => {
    const { split } = item;
    if (split.by === "amount") return split.units[unit].map(([participantId, cents]) => ({ participantId, cents }));
    const weights = split.by === "even" ? split.units[unit].map((id): [ParticipantId, number] => [id, 1]) : split.units[unit];
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    const exact = weights.map(([participantId, weight]) => ({ participantId, value: (prices[unit] * weight) / total }));
    const floors = exact.map(({ participantId, value }) => ({ participantId, cents: Math.floor(value), rest: value - Math.floor(value) }));
    let left = prices[unit] - floors.reduce((sum, { cents }) => sum + cents, 0);
    for (const part of [...floors].sort((a, b) => b.rest - a.rest)) {
      if (left <= 0) break;
      part.cents += 1;
      left -= 1;
    }
    return floors.map(({ participantId, cents }) => ({ participantId, cents }));
  });
}
