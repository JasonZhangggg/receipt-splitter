import { claimersOf, type Operation } from "../../core/operations";
import { unitPrices } from "../../core/shares";
import type { ParticipantId, Receipt, SplitItem } from "../../core/split";
import { runTotalCheck } from "../../core/total-check";

const UNICODE_FRACTIONS: Record<string, string> = { "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "1/6": "⅙", "1/8": "⅛" };

/** Everyone who had any unit, in the order they first appear. */
export function claimersOfItem(item: SplitItem): ParticipantId[] {
  return [...new Set(item.split.units.flatMap((_, unit) => claimersOf(item.split, unit)))];
}

/** A shares split's weights as a ratio, in the table's order of people, such as "2:1". */
export function ratio(weights: readonly (readonly [ParticipantId, number])[], order: readonly ParticipantId[]): string {
  return [...weights]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([, weight]) => weight)
    .join(":");
}

/** The tag beside a line's name: the units of a line of several, a ratio for shares, "split" for amounts, a fraction for an even split. */
export function lineTag(item: SplitItem, order: readonly ParticipantId[]): string | null {
  const { split } = item;
  if (split.units.length > 1) return `×${split.units.length}`;
  const [unit] = split.units;
  if (unit.length < 2) return null;
  if (split.by === "shares") return ratio(split.units[0], order);
  if (split.by === "amount") return "split";
  return fractionText([1, unit.length]);
}

/** ½ or ⅔ when there is a glyph, else n/d. */
export function fractionText([numerator, denominator]: readonly [number, number]): string {
  return UNICODE_FRACTIONS[`${numerator}/${denominator}`] ?? `${numerator}/${denominator}`;
}

/** How much of an Item one person had: "1 of 2" for whole units of a line of several, otherwise a fraction, or null for all of it. */
export function shareOfItem(fraction: readonly [number, number], quantity: number): string | null {
  const [numerator, denominator] = fraction;
  if (numerator === denominator) return null;
  const units = (numerator * quantity) / denominator;
  if (quantity > 1 && Number.isInteger(units)) return `${units} of ${quantity}`;
  return fractionText(fraction);
}

/** A tap on a line's circle: unchecks the person from every unit they had, or checks them on the first unit nobody had, else the first unit. */
export function circleTap(item: SplitItem, participantId: ParticipantId): Operation[] {
  const units = item.split.units.map((_, unit) => claimersOf(item.split, unit));
  const had = units.flatMap((claimers, unit) => (claimers.includes(participantId) ? [unit] : []));
  if (had.length > 0) return had.map((unit) => ({ by: participantId, type: "unclaim", itemId: item.id, participantId, unit }));
  const open = units.findIndex((claimers) => claimers.length === 0);
  return [{ by: participantId, type: "claim", itemId: item.id, participantId, unit: Math.max(open, 0) }];
}

/** The cents the Items run over (positive) or short (negative) of the printed subtotal. */
export function itemsGap(receipt: Receipt<SplitItem>): number {
  const check = runTotalCheck(receipt);
  return check.ok ? 0 : -check.subtotalGap;
}

/** Each claimer's cents on each unit as the Item sheet shows them: a unit's price divided by largest remainder, or the typed cents under amount. */
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
