import { cents, type Cents } from "../../core/money";
import { MAX_ROW_NAME_LENGTH, applyOperation, isName, type AdjustmentPatch, type Operation, type WireRejection } from "../../core/operations";
import type { Adjustment, AdjustmentId, AdjustmentKind, ParticipantId, ReceiptLevelKind, Split } from "../../core/split";
import { plainAmount } from "../../draft";
import { splitCopy as say } from "../split-copy";
import { readAmount } from "../item-sheet/new-item";

/** A sheet's fields as typed. The amount is always typed as a positive number; the kind gives it its sign. */
export type TypedAdjustment = {
  readonly kind: AdjustmentKind;
  readonly name: string;
  readonly amount: string;
};

export type AdjustmentProblem = "name" | "amount" | "overLimit" | "tooManyAdjustments" | "negativeTotal" | "tooLarge" | "failed" | "offline";

export type AdjustmentAnswer = { readonly ok: true; readonly op: Operation } | { readonly ok: false; readonly problem: AdjustmentProblem };

/** A discount comes off the total, so it is stored below zero. */
export const takesOff = (kind: AdjustmentKind) => kind === "discount" || kind === "bundleDiscount";

const signed = (kind: AdjustmentKind, amount: Cents) => cents(takesOff(kind) ? -amount : amount);

export function typedFrom(row: Adjustment): TypedAdjustment {
  const amount = signed(row.kind, row.amount);
  return { kind: row.kind, name: row.name, amount: plainAmount(amount) };
}

/** A typed amount written the way the sheet shows a saved one, "4" as "4.00"; text that does not read as an amount stays as typed. */
export function tidyAmount(typed: string): string {
  const amount = readAmount(typed);
  return typeof amount === "number" ? plainAmount(amount) : typed;
}

/** A kind switch renames a line still called by its old kind's word, so a Tax made a discount reads Discount; a name someone gave it stays. */
export function switchKind(typed: TypedAdjustment, kind: ReceiptLevelKind): { kind: ReceiptLevelKind; name?: string } {
  const word = typed.kind === "bundleDiscount" ? null : say.kinds[typed.kind];
  return typed.name.trim() === word ? { kind, name: say.kinds[kind] } : { kind };
}

/** Every edit keeps the Total at the Subtotal plus the Adjustments, so a fixed tax or tip moves it (preferences 70, 75). */
const editReceipt = (by: ParticipantId | null, patch: AdjustmentPatch): Operation => ({ by, type: "editReceipt", adjustments: [patch], totalFollows: true });

/**
 * The edit to send for the fields typed in an Adjustment's sheet, null when none differs from the row, or the problem to show.
 * Only typed fields go out, so a field another phone fixed while this sheet was open keeps that fix.
 */
export function adjustmentEdit(split: Split, id: AdjustmentId, typed: Partial<TypedAdjustment>, by: ParticipantId | null): AdjustmentAnswer | null {
  const row = split.receipt.adjustments.find((adjustment) => adjustment.id === id);
  if (!row) return null;
  const name = typed.name?.trim();
  if (name !== undefined && !isName(name, MAX_ROW_NAME_LENGTH)) return { ok: false, problem: "name" };
  const off = typed.amount === undefined ? signed(row.kind, row.amount) : readAmount(typed.amount);
  if (typeof off === "string") return { ok: false, problem: off === "price" ? "amount" : off };
  const kind = row.kind === "bundleDiscount" || typed.kind === undefined || typed.kind === "bundleDiscount" ? row.kind : typed.kind;
  const amount = signed(kind, off);
  const patch = {
    ...(kind !== row.kind && kind !== "bundleDiscount" && { kind }),
    ...(name !== undefined && name !== row.name && { name }),
    ...(amount !== row.amount && { amount }),
  };
  if (Object.keys(patch).length === 0) return null;
  const edit: AdjustmentPatch = { type: "edit", adjustmentId: id, ...patch };
  // A rename leaves the Total as it is, even on a receipt that does not add up.
  return checked(split, patch.amount === undefined ? { by, type: "editReceipt", adjustments: [edit] } : editReceipt(by, edit));
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
    case "disconnected":
      return "offline";
    default:
      return "failed";
  }
}
