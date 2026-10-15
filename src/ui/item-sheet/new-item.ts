import { MAX_CENTS, cents, price as toPrice, type Cents } from "../../core/money";
import { MAX_QUANTITY, MAX_ROW_NAME_LENGTH, applyOperation, isName, type Operation, type WireRejection } from "../../core/operations";
import type { ItemId, ParticipantId, Split } from "../../core/split";
import { parseAmount } from "../../draft";

/** The add sheet's fields as typed. */
export type NewItem = {
  readonly name: string;
  /** The line's price covers all of them, as the list shows "3x Guinness $21.87". Empty reads as 1. */
  readonly price: string;
  readonly quantity: string;
};

export type NewItemProblem = "name" | "price" | "quantity" | "overLimit" | "tooManyItems" | "tooLarge" | "failed" | "offline";

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
  const quantity = readQuantity(typed.quantity);
  if (quantity === null) return { ok: false, problem: "quantity" };
  const item = { id, name, price: toPrice(cents), ...(quantity > 1 && { quantity }) };
  const op: Operation = { by, type: "editReceipt", items: [{ type: "add", item, index: split.receipt.items.length, who: [] }] };
  const preview = applyOperation(split, op, { creator: false });
  if (preview.ok) return { ok: true, op };
  return { ok: false, problem: problemFor(preview.rejection.reason) };
}

function readQuantity(typed: string): number | null {
  const text = typed.trim();
  if (text === "") return 1;
  const count = /^\d{1,2}$/.test(text) ? Number(text) : 0;
  return count >= 1 && count <= MAX_QUANTITY ? count : null;
}

export function problemFor(reason: WireRejection["reason"] | "disconnected"): NewItemProblem {
  if (reason === "disconnected") return "offline";
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
