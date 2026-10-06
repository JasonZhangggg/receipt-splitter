import { cents, type Cents } from "../../core/money";
import { MAX_ROW_NAME_LENGTH, applyOperation, isName, type AdjustmentPatch, type Operation, type WireRejection } from "../../core/operations";
import type { Adjustment, AdjustmentId, AdjustmentKind, ParticipantId, ReceiptLevelKind, Split } from "../../core/split";
import { splitCopy as say } from "../split-copy";
import { readAmount } from "../item-sheet/new-item";

/** A sheet's fields as typed. The amount is always typed as a positive number; the kind gives it its sign. */
export type TypedAdjustment = {
  readonly kind: AdjustmentKind;
  readonly name: string;
  readonly amount: string;
};

export type AdjustmentProblem = "amount" | "overLimit" | "tooManyAdjustments" | "negativeTotal" | "tooLarge" | "failed";

export type AdjustmentAnswer = { readonly ok: true; readonly op: Operation } | { readonly ok: false; readonly problem: AdjustmentProblem };

/** A discount comes off the total, so it is stored below zero. */
export const takesOff = (kind: AdjustmentKind) => kind === "discount" || kind === "bundleDiscount";

const signed = (kind: AdjustmentKind, amount: Cents) => cents(takesOff(kind) ? -amount : amount);

/** The amount as the sheet shows it: what the line adds, or for a discount what it takes off. */
export const shownAmount = ({ kind, amount }: Pick<Adjustment, "kind" | "amount">) => cents(takesOff(kind) ? -amount : amount);

export function typedFrom(row: Adjustment): TypedAdjustment {
  const amount = shownAmount(row);
  return { kind: row.kind, name: row.name, amount: (amount / 100).toFixed(2) };
}

/** Every edit keeps the Total at the Subtotal plus the Adjustments, so a fixed tax or tip moves it (preferences 70, 75). */
const editReceipt = (by: ParticipantId | null, patch: AdjustmentPatch): Operation => ({ by, type: "editReceipt", adjustments: [patch], totalFollows: true });

/** The edit to send for what is typed in an Adjustment's sheet, null when nothing it can save differs from the row, or the problem to show. */
export function adjustmentEdit(split: Split, id: AdjustmentId, typed: TypedAdjustment, by: ParticipantId | null): AdjustmentAnswer | null {
  const row = split.receipt.adjustments.find((adjustment) => adjustment.id === id);
  if (!row) return null;
  const amount = readAmount(typed.amount);
  if (typeof amount === "string") return { ok: false, problem: amount === "price" ? "amount" : amount };
  const name = typed.name.trim();
  const patch = {
    ...(row.kind !== "bundleDiscount" && typed.kind !== "bundleDiscount" && typed.kind !== row.kind && { kind: typed.kind }),
    ...(isName(name, MAX_ROW_NAME_LENGTH) && name !== row.name && { name }),
    ...(signed(typed.kind, amount) !== row.amount && { amount: signed(typed.kind, amount) }),
  };
  if (Object.keys(patch).length === 0) return null;
  return checked(split, editReceipt(by, { type: "edit", adjustmentId: id, ...patch }));
}

/** The add to send for the add sheet, after the other Adjustments, or the one problem to show. An empty name takes the kind's. */
export function newAdjustment(split: Split, typed: TypedAdjustment & { readonly kind: ReceiptLevelKind }, id: AdjustmentId, by: ParticipantId | null): AdjustmentAnswer {
  const amount = readAmount(typed.amount);
  if (typeof amount === "string") return { ok: false, problem: amount === "price" ? "amount" : amount };
  const name = typed.name.trim() || say.kinds[typed.kind];
  const adjustment = { id, kind: typed.kind, name, amount: signed(typed.kind, amount) };
  return checked(split, editReceipt(by, { type: "add", adjustment, index: split.receipt.adjustments.length }));
}

export const deleteAdjustment = (by: ParticipantId | null, id: AdjustmentId) => editReceipt(by, { type: "delete", adjustmentId: id });

function checked(split: Split, op: Operation): AdjustmentAnswer {
  const preview = applyOperation(split, op, { creator: false });
  return preview.ok ? { ok: true, op } : { ok: false, problem: adjustmentProblem(preview.rejection.reason) };
}

export function adjustmentProblem(reason: WireRejection["reason"] | "disconnected"): AdjustmentProblem {
  switch (reason) {
    case "tooManyAdjustments":
    case "negativeTotal":
    case "tooLarge":
      return reason;
    case "amountOutOfRange":
      return "overLimit";
    default:
      return "failed";
  }
}
