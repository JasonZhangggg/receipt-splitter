import { cents, type Cents } from "../../core/money";
import { applyOperation, type Operation } from "../../core/operations";
import type { ParticipantId, Receipt, Split } from "../../core/split";
import { readAmount } from "../item-sheet/new-item";
import { adjustmentProblem, type AdjustmentAnswer } from "../adjustment-sheet/adjustment";

/** The two figures the receipt prints under its lines, each set by hand from its own sheet. */
export type TotalLine = "subtotal" | "total";

const sum = (amounts: readonly number[]) => cents(amounts.reduce((total, amount) => total + amount, 0));

/** What the line adds up to from the rows above it: the Items for the Subtotal, the Subtotal and the Adjustments for the Total. */
export function addsUpTo(receipt: Receipt, line: TotalLine): Cents {
  return line === "subtotal" ? sum(receipt.items.map(({ price }) => price)) : sum([receipt.subtotal, ...receipt.adjustments.map(({ amount }) => amount)]);
}

/**
 * The edit to send for the amount typed in a Subtotal or Total sheet, null when it matches the line, or the problem to show.
 * It sets the figure itself rather than moving it, so it lands on what was typed whatever another phone changed meanwhile. A Subtotal leaves the Total where it is.
 */
export function totalsEdit(split: Split, line: TotalLine, typed: string, by: ParticipantId | null): AdjustmentAnswer | null {
  const amount = readAmount(typed, split.currency);
  if (typeof amount === "string") return { ok: false, problem: amount === "price" ? "amount" : amount };
  if (amount === split.receipt[line]) return null;
  const op: Operation = line === "subtotal" ? { by, type: "editReceipt", subtotal: amount } : { by, type: "editReceipt", total: amount };
  const preview = applyOperation(split, op, { creator: false });
  return preview.ok ? { ok: true, op } : { ok: false, problem: adjustmentProblem(preview.rejection.reason) };
}
