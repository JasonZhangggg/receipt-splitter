import { describe, expect, test } from "vitest";
import type { TextBox } from "../ocr/types";
import { box, receiptRows } from "./fixtures/boxes";
import { classifyLines } from "./lines";
import { groupRows } from "./rows";

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
      { kind: "discount", name: "Discount:BBQ Chips", amount: -600, appliesTo: "item", markedBy: "label" },
      { kind: "discount", name: "COUPON (F6)", amount: -1018, appliesTo: "receipt", markedBy: "label" },
    ]);
  });

  test("reads an unindented discount that names the Item's price as Item-level and one that does not as Receipt-level", () => {
    const lines = linesOf(
      receiptRows([
        ["5 Dinner $29.88", "149.40"],
        ["29.88 50%OFF BIRTHDAY", "-14.94"],
        ["Burger", "12.00"],
        ["Happy Hour Discount", "-2.00"],
      ]),
    );

    expect(lines.map((line) => (line.kind === "discount" ? [line.name, line.appliesTo] : line.kind))).toEqual([
      "item",
      ["29.88 50%OFF BIRTHDAY", "item"],
      "item",
      ["Happy Hour Discount", "receipt"],
    ]);
  });

  test("reads subtotal, tax, service charge, tip, and total rows by their labels", () => {
    const lines = linesOf(
      receiptRows([
        ["Subtotal", "1.00"],
        ["Sales Tax", "2.00"],
        ["Service Charge 18%", "3.00"],
        ["Gratuity", "4.00"],
        ["Total", "5.00"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "subtotal", amount: 100 },
      { kind: "tax", name: "Sales Tax", amount: 200 },
      { kind: "serviceCharge", name: "Service Charge 18%", amount: 300 },
      { kind: "tip", name: "Gratuity", amount: 400 },
      { kind: "total", amount: 500 },
    ]);
  });

  test("keeps Items whose names hold a label word, and reads a bare state name as tax", () => {
    const lines = linesOf(
      receiptRows([
        ["Table Wine", "8.00"],
        ["Side Order Fries", "4.00"],
        ["Kick Off Wings", "9.00"],
        ["Empire State Burger", "12.00"],
        ["NY State:", "1.92"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "item", name: "Table Wine", price: 800, quantity: null },
      { kind: "item", name: "Side Order Fries", price: 400, quantity: null },
      { kind: "item", name: "Kick Off Wings", price: 900, quantity: null },
      { kind: "item", name: "Empire State Burger", price: 1200, quantity: null },
      { kind: "tax", name: "NY State", amount: 192 },
    ]);
  });

  test("reads a suggested gratuity and a payment as noise", () => {
    const lines = linesOf(
      receiptRows([
        ["Suggested Gratuity", "3.00"],
        ["VISA", "25.00"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "noise", text: "Suggested Gratuity 3.00" },
      { kind: "noise", text: "VISA 25.00" },
    ]);
  });

  test("reads a trailing minus as a discount and a minus on a tax row as a misread", () => {
    const lines = linesOf(
      receiptRows([
        ["Burger", "12.00"],
        ["Happy Hour", "2.00-"],
        ["Tax", "-0.96"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "item", name: "Burger", price: 1200, quantity: null },
      { kind: "discount", name: "Happy Hour", amount: -200, appliesTo: "receipt", markedBy: "minusSign" },
      { kind: "tax", name: "Tax", amount: 96 },
    ]);
  });

  test("measures indentation from the Item, not from the modifier above", () => {
    const lines = linesOf([
      box("Ribeye", 20, 0),
      box("45.00", 400, 0),
      box("Blue cheese", 60, 1),
      box("5.00", 400, 1),
      box("Bacon", 60, 2),
      box("3.00", 400, 2),
    ]);

    expect(lines).toEqual([
      { kind: "item", name: "Ribeye", price: 4500, quantity: null },
      { kind: "modifier", name: "Blue cheese", price: 500 },
      { kind: "modifier", name: "Bacon", price: 300 },
    ]);
  });

  test("takes the printed extended price over count times unit price", () => {
    expect(linesOf(receiptRows([["Bagels 3 @ 1.67", "5.00"]]))).toEqual([{ kind: "item", name: "Bagels", price: 500, quantity: null }]);
  });
});

describe("groupRows", () => {
  test("levels a skewed price box by the slope of its neighbours", () => {
    const skewed = box("12.00", 400, 0);
    const [topLeft, topRight, bottomRight, bottomLeft] = skewed.corners;
    const tilted = {
      text: skewed.text,
      corners: [topLeft, { ...topRight, y: topRight.y + 30 }, { ...bottomRight, y: bottomRight.y + 30 }, bottomLeft] as const,
    };

    const rows = groupRows([box("Burger", 20, 0), tilted, box("Fries", 20, 1), box("4.00", 400, 1), box("Soda", 20, 2), box("2.50", 400, 2)]);

    expect(rows.map(({ text }) => text)).toEqual(["Burger 12.00", "Fries 4.00", "Soda 2.50"]);
  });
});
