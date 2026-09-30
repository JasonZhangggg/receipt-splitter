import { describe, expect, test } from "vitest";
import type { TextBox } from "../ocr/types";
import { classifyLines } from "./lines";
import { groupRows } from "./rows";

const LINE = 30;

function box(text: string, x: number, row: number): TextBox {
  const [left, top, right, bottom] = [x, row * LINE, x + 12 * text.length, row * LINE + 20];
  return {
    text,
    corners: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  };
}

const linesOf = (boxes: TextBox[]) => classifyLines(groupRows(boxes));

describe("classifyLines", () => {
  test("reads a quantity line as its count, unit price, and extended price", () => {
    const lines = linesOf([box("Iced Tea", 20, 0), box("2 @ 1.50", 40, 1), box("3.00", 400, 1)]);

    expect(lines).toEqual([
      { kind: "noise", text: "Iced Tea" },
      { kind: "quantity", price: 300, quantity: { count: 2, unitPrice: 150 } },
    ]);
  });

  test("reads a priced row under an Item as a modifier, whether it starts with Add or is indented", () => {
    const lines = linesOf([
      box("Ribeye", 20, 0),
      box("45.00", 400, 0),
      box("Add Lobster", 20, 1),
      box("21.00", 400, 1),
      box("Blue cheese", 60, 2),
      box("5.00", 400, 2),
    ]);

    expect(lines).toEqual([
      { kind: "item", name: "Ribeye", price: 4500, quantity: null },
      { kind: "modifier", name: "Add Lobster", price: 2100 },
      { kind: "modifier", name: "Blue cheese", price: 500 },
    ]);
  });

  test("reads a named discount under an Item as an Item-level discount and a coupon as a Receipt-level one", () => {
    const lines = linesOf([
      box("BBQ Chips", 20, 0),
      box("6.00", 400, 0),
      box("Discount:BBQ Chips", 60, 1),
      box("-6.00", 400, 1),
      box("COUPON (F6)", 60, 2),
      box("10.18", 400, 2),
    ]);

    expect(lines).toEqual([
      { kind: "item", name: "BBQ Chips", price: 600, quantity: null },
      { kind: "discount", name: "Discount:BBQ Chips", amount: -600, appliesTo: "item", readFrom: "label" },
      { kind: "discount", name: "COUPON (F6)", amount: -1018, appliesTo: "receipt", readFrom: "label" },
    ]);
  });

  test("reads subtotal, tax, service charge, tip, and total rows by their labels", () => {
    const labels = ["Subtotal", "Sales Tax", "Service Charge 18%", "Gratuity", "Total"];
    const lines = linesOf(labels.flatMap((label, row) => [box(label, 20, row), box(`${row + 1}.00`, 400, row)]));

    expect(lines).toEqual([
      { kind: "subtotal", amount: 100 },
      { kind: "tax", name: "Sales Tax", amount: 200 },
      { kind: "serviceCharge", name: "Service Charge 18%", amount: 300 },
      { kind: "tip", name: "Gratuity", amount: 400 },
      { kind: "total", amount: 500 },
    ]);
  });
});
