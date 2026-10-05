import type { Cents } from "../../src/core/money";
import type { NonEmpty } from "../../src/core/split";
import type { Reading } from "./format";

/** The largest gap a reading may leave and still pass. Pass 2's penny fixes were wrong 2 times in 3. */
export const ACCEPTED_GAP = 3;

/** What the receipt prints minus what the reading sums to. `subtotal` is null when the receipt prints none. */
export type Gaps = { readonly subtotal: Cents | null; readonly total: Cents };

export type Check =
  | { readonly passed: true; readonly gaps: Gaps }
  | { readonly passed: false; readonly gaps: Gaps; readonly problems: NonEmpty<string> };

const sum = (amounts: readonly number[]) => amounts.reduce((total, amount) => total + amount, 0);

const dollars = (amount: number) => `$${(Math.abs(amount) / 100).toFixed(2)}`;

const gapText = (gap: number) => `${gap > 0 ? "short" : "over"} by ${dollars(gap)}`;

/** Sums the reading against the subtotal and total it read. With `beforeDiscounts`, the subtotal is compared with the lines before any discount. */
export function checkReading(reading: Reading): Check {
  const bundleDiscounts = reading.bundles.flatMap((bundle) => bundle.discounts.map((discount) => discount.amount));
  const notTaxOrTip = reading.adjustments.filter(({ kind }) => kind !== "tax" && kind !== "tip");
  const charges = sum(reading.items.map((item) => item.price)) + sum(bundleDiscounts) + sum(notTaxOrTip.map((adjustment) => adjustment.amount));
  const taxAndTip = sum(reading.adjustments.filter(({ kind }) => kind === "tax" || kind === "tip").map((adjustment) => adjustment.amount));
  const allDiscounts =
    sum(reading.items.flatMap((item) => item.discounts.map((discount) => discount.amount))) +
    sum(bundleDiscounts) +
    sum(notTaxOrTip.filter(({ kind }) => kind === "discount").map((adjustment) => adjustment.amount));

  const subtotalRead = reading.subtotal?.beforeDiscounts ? charges - allDiscounts : charges;
  const gaps: Gaps = {
    subtotal: reading.subtotal === null ? null : ((reading.subtotal.amount - subtotalRead) as Cents),
    total: (reading.total - charges - taxAndTip) as Cents,
  };

  const problems: string[] = reading.bundles.filter((bundle) => bundle.items.length === 0).map((bundle) => `bundle "${bundle.name}" has no items`);
  if (gaps.subtotal !== null && Math.abs(gaps.subtotal) > ACCEPTED_GAP) {
    const lines = reading.subtotal?.beforeDiscounts ? "lines before discounts" : "non-tax lines";
    problems.push(`${lines} sum to ${dollars(subtotalRead)} but the printed subtotal is ${dollars(reading.subtotal!.amount)} (${gapText(gaps.subtotal)})`);
  }
  if (Math.abs(gaps.total) > ACCEPTED_GAP) {
    problems.push(`all lines sum to ${dollars(charges + taxAndTip)} but the printed total is ${dollars(reading.total)} (${gapText(gaps.total)})`);
  }
  const [first, ...rest] = problems;
  return first === undefined ? { passed: true, gaps } : { passed: false, gaps, problems: [first, ...rest] };
}

/**
 * The problems of a reading that passes with a gap of 1 to 3 cents on the total, for one review, or null otherwise.
 * A subtotal gap is named beside a total gap and never triggers a review alone.
 */
export function pennyProblems(check: Check): NonEmpty<string> | null {
  if (!check.passed || check.gaps.total === 0) return null;
  const total = `all lines miss the printed total by ${dollars(check.gaps.total)} (${check.gaps.total > 0 ? "short" : "over"}); a receipt adds up to the cent, so one amount is likely misread by a digit`;
  return check.gaps.subtotal ? [total, `the lines miss the printed subtotal by ${dollars(check.gaps.subtotal)}`] : [total];
}
