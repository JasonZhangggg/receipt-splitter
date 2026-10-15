import { MAX_CENTS, price as toPrice, type Cents } from "../../core/money";
import { MAX_ROW_NAME_LENGTH, applyOperation, isName, type Operation, type WireRejection } from "../../core/operations";
import type { ItemId, ParticipantId, Split } from "../../core/split";
import { parseAmount } from "../../draft";

/** The add sheet's fields as typed. */
export type NewItem = {
  readonly name: string;
  readonly price: string;
};

export type NewItemProblem = "name" | "price" | "overLimit" | "tooManyItems" | "tooLarge" | "failed";

export type NewItemAnswer = { readonly ok: true; readonly op: Operation } | { readonly ok: false; readonly problem: NewItemProblem };

const amountShape = /^\d+(\.\d{0,2})?$|^\.\d{1,2}$/;

/** Dollars and cents as typed in a sheet, a leading $ allowed, or why they do not read as an amount. */
export function readAmount(typed: string): Cents | "price" | "overLimit" {
  const text = typed.trim().replace(/^\$/, "");
  if (!amountShape.test(text)) return "price";
  const cents = parseAmount(text);
  return cents === null || cents > MAX_CENTS ? "overLimit" : cents;
}

/** The add to send for what was typed, at the end of the receipt and outside every Bundle, with nobody having it yet, or the one problem to show. */
export function newItem(split: Split, typed: NewItem, id: ItemId, by: ParticipantId | null): NewItemAnswer {
  const name = typed.name.trim();
  if (!isName(name, MAX_ROW_NAME_LENGTH)) return { ok: false, problem: "name" };
  const cents = readAmount(typed.price);
  if (typeof cents === "string") return { ok: false, problem: cents };
  const op: Operation = { by, type: "editReceipt", items: [{ type: "add", item: { id, name, price: toPrice(cents) }, index: split.receipt.items.length, who: [] }] };
  const preview = applyOperation(split, op, { creator: false });
  if (preview.ok) return { ok: true, op };
  return { ok: false, problem: problemFor(preview.rejection.reason) };
}

export function problemFor(reason: WireRejection["reason"] | "disconnected"): NewItemProblem {
  return reason === "tooManyItems" || reason === "tooLarge" ? reason : reason === "amountOutOfRange" ? "overLimit" : "failed";
}
