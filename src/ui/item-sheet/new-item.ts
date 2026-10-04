import { MAX_CENTS, price as toPrice } from "../../core/money";
import { MAX_ROW_NAME_LENGTH, applyOperation, isName, type Operation } from "../../core/operations";
import type { ItemId, ParticipantId, Split } from "../../core/split";
import { parseAmount } from "../../draft";

/** The add sheet's fields as typed. */
export type NewItem = {
  readonly name: string;
  readonly detail: string;
  readonly price: string;
  readonly quantity: number;
  readonly who: readonly ParticipantId[];
};

export type NewItemProblem = "name" | "price" | "overLimit" | "tooManyItems" | "tooLarge" | "failed";

export type NewItemAnswer = { readonly ok: true; readonly op: Operation } | { readonly ok: false; readonly problem: NewItemProblem };

const amountShape = /^\d+(\.\d{0,2})?$|^\.\d{1,2}$/;

/** The add to send for what was typed, at the end of the receipt and outside every Bundle, or the one problem to show. */
export function newItem(split: Split, typed: NewItem, id: ItemId, by: ParticipantId | null): NewItemAnswer {
  const name = typed.name.trim();
  if (!isName(name, MAX_ROW_NAME_LENGTH)) return { ok: false, problem: "name" };
  const text = typed.price.trim().replace(/^\$/, "");
  if (!amountShape.test(text)) return { ok: false, problem: "price" };
  const cents = parseAmount(text);
  if (cents === null || cents > MAX_CENTS) return { ok: false, problem: "overLimit" };
  const detail = typed.detail.trim();
  const item = { id, name, price: toPrice(cents), ...(typed.quantity > 1 && { quantity: typed.quantity }), ...(detail && { detail }) };
  const op: Operation = { by, type: "editReceipt", items: [{ type: "add", item, index: split.receipt.items.length, who: typed.who }] };
  const preview = applyOperation(split, op, { creator: false });
  if (preview.ok) return { ok: true, op };
  return { ok: false, problem: problemFor(preview.rejection.reason) };
}

export function problemFor(reason: string): NewItemProblem {
  return reason === "tooManyItems" || reason === "tooLarge" ? reason : reason === "amountOutOfRange" ? "overLimit" : "failed";
}
