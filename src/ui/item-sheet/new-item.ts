import { MAX_CENTS, cents, price as toPrice, type Cents } from "../../core/money";
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

/** How far the Items are under the printed Subtotal, which is a line the reading missed and the amount an added Item fills first, or null. */
export function shortfall({ receipt }: Split): Cents | null {
  const missing = receipt.subtotal - receipt.items.reduce((sum, { price }) => sum + price, 0);
  return missing > 0 ? cents(missing) : null;
}

/** The printed tax and tip a new Item shares in, since they keep their amounts. */
export function sharedCharges({ receipt }: Split): readonly ("tax" | "tip")[] {
  return (["tax", "tip"] as const).filter((kind) => receipt.adjustments.some((row) => row.kind === kind && row.amount !== 0));
}
