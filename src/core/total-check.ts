import type { AdjustmentId, ItemId, Receipt } from "./split";

export type FailedTotalCheck = {
  readonly ok: false;
  readonly subtotalGap: number;
  readonly totalGap: number;
  readonly itemIds: readonly ItemId[];
  readonly adjustmentIds: readonly AdjustmentId[];
  readonly suspects: readonly ("subtotal" | "total")[];
};

export type TotalCheck = { readonly ok: true } | FailedTotalCheck;

export function runTotalCheck(receipt: Receipt): TotalCheck {
  const { items, adjustments, subtotal, total } = receipt;
  const itemsSum = items.reduce((sum, item) => sum + item.price, 0);
  const adjustmentsSum = adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const subtotalGap = subtotal - itemsSum;
  const totalGap = total - subtotal - adjustmentsSum;
  if (subtotalGap === 0 && totalGap === 0) return { ok: true };
  if (subtotalGap + totalGap === 0) {
    return { ok: false, subtotalGap, totalGap, itemIds: [], adjustmentIds: [], suspects: ["subtotal"] };
  }
  return {
    ok: false,
    subtotalGap,
    totalGap,
    itemIds: items.filter((item) => misreadCloses(item.price, subtotalGap, false)).map((item) => item.id),
    adjustmentIds: adjustments
      .filter((adjustment) => misreadCloses(adjustment.amount, totalGap, true))
      .map((adjustment) => adjustment.id),
    suspects: subtotalGap === 0 && isDecimalShift(total, subtotal + adjustmentsSum) ? ["total"] : [],
  };
}

function misreadCloses(read: number, gap: number, signed: boolean): boolean {
  if (gap === 0) return false;
  const actual = read + gap;
  if (actual < 0 && !signed) return false;
  return actual === 0 || isDecimalShift(read, actual) || isConfusedDigit(read, actual) || (signed && actual === -read);
}

const CONFUSED_DIGIT_PAIRS = new Set(["08", "38", "68", "56", "17"]);

function isConfusedDigit(read: number, actual: number): boolean {
  const [shown, meant] = [String(Math.abs(read)), String(Math.abs(actual))];
  if (Math.sign(read) !== Math.sign(actual) || shown.length !== meant.length) return false;
  const differing = [...shown].flatMap((digit, index) => (digit === meant[index] ? [] : [[digit, meant[index]].sort().join("")]));
  return differing.length === 1 && CONFUSED_DIGIT_PAIRS.has(differing[0]);
}

function isDecimalShift(read: number, actual: number): boolean {
  return [10, 100].some((factor) => actual === read * factor || actual * factor === read);
}
