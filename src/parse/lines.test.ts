import { describe, expect, test } from "vitest";
import type { Point, TextBox } from "../ocr/types";
import { box, receiptRows } from "./fixtures/boxes";
import { classifyLines } from "./lines";
import { groupRows } from "./rows";

const linesOf = (boxes: TextBox[]) => classifyLines(groupRows(boxes));

describe("classifyLines", () => {
  test("reads a quantity line as its extended price, and keeps its count and unit price only when no printed price agrees", () => {
    const lines = linesOf([
      box("Iced Tea", 20, 0),
      box("2 @ 1.50", 40, 1),
      box("3.00", 400, 1),
      box("Burger", 20, 2),
      box("7 @ 12.00", 40, 3),
    ]);

    expect(lines).toEqual([
      { kind: "noise", text: "Iced Tea" },
      { kind: "quantity", price: 300, quantity: null },
      { kind: "noise", text: "Burger" },
      { kind: "quantity", price: 8400, quantity: { count: 7, unitPrice: 1200 } },
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

  test("reads the subtotal and tax spellings of bench receipts 1019, docjay131-078, docjay131-170 and docjay131-005", () => {
    const lines = linesOf(
      receiptRows([
        ["SUB TOTAL:", "43.00"],
        ["Sub-Total:", "$27.62"],
        ["TXTL", "2.43"],
        ["TAXABLE T1", "21.49"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "subtotal", amount: 4300 },
      { kind: "subtotal", amount: 2762 },
      { kind: "tax", name: "TXTL", amount: 243 },
      { kind: "item", name: "TAXABLE T1", price: 2149, quantity: null },
    ]);
  });

  test("keeps Items whose names hold a label word, and reads a bare state name as tax", () => {
    const lines = linesOf(
      receiptRows([
        ["Table Wine", "8.00"],
        ["Side Order Fries", "4.00"],
        ["Kick Off Wings", "9.00"],
        ["Empire State Burger", "12.00"],
        ["State Fair Corn Dog", "6.00"],
        ["Empire State", "6.00"],
        ["NY State:", "1.92"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "item", name: "Table Wine", price: 800, quantity: null },
      { kind: "item", name: "Side Order Fries", price: 400, quantity: null },
      { kind: "item", name: "Kick Off Wings", price: 900, quantity: null },
      { kind: "item", name: "Empire State Burger", price: 1200, quantity: null },
      { kind: "item", name: "State Fair Corn Dog", price: 600, quantity: null },
      { kind: "item", name: "Empire State", price: 600, quantity: null },
      { kind: "tax", name: "NY State", amount: 192 },
    ]);
  });

  test("strips one zero-padded line number and one count from the front of an Item name, and no more", () => {
    const lines = linesOf(
      receiptRows([
        ["16 12 oz Steak", "24.00"],
        ["01 02 03 Steak", "30.00"],
      ]),
    );

    expect(lines).toEqual([
      { kind: "item", name: "12 oz Steak", price: 2400, quantity: null },
      { kind: "item", name: "03 Steak", price: 3000, quantity: null },
    ]);
  });

  test.each([
    ["SRD receipt 1094 prints its tip as", "Tip $1.48", { kind: "tip", name: "Tip", amount: 148 }],
    ["SRD receipt 1072 prints its total as", "AMoUNT DuE: $21.69", { kind: "total", amount: 2169 }],
    ["docjay131-170 prints its total as", "TOTL 30.58", { kind: "total", amount: 3058 }],
    ["SRD receipt 1106 prints a phone number row as", "Tel93.773710 X 97.73.101", { kind: "noise", text: "Tel93.773710 X 97.73.101" }],
  ])("reads the row %s %s", (_receipt, text, expected) => {
    expect(linesOf([box(text, 20, 0)])).toEqual([expected]);
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

  test("reads a leading 3x as the Item's count and keeps the line total as its price", () => {
    expect(
      linesOf(
        receiptRows([
          ["3x Guinness Draught 14.9oz Can", "$21.87"],
          ["2X High Noon Watermelon 12oz Can", "$16.98"],
          ["1x Gameplay", "$87.75"],
          ["20x Wings", "$40.00"],
          ["21x Wings", "$42.00"],
          ["0x Wings", "$0.00"],
          ["3 x Beer", "$21.00"],
          ["3 X Beer", "$21.00"],
        ]),
      ),
    ).toEqual([
      { kind: "item", name: "Guinness Draught 14.9oz Can", price: 2187, quantity: null, count: 3 },
      { kind: "item", name: "High Noon Watermelon 12oz Can", price: 1698, quantity: null, count: 2 },
      { kind: "item", name: "Gameplay", price: 8775, quantity: null },
      { kind: "item", name: "Wings", price: 4000, quantity: null, count: 20 },
      { kind: "item", name: "21x Wings", price: 4200, quantity: null },
      { kind: "item", name: "0x Wings", price: 0, quantity: null },
      { kind: "item", name: "Beer", price: 2100, quantity: null, count: 3 },
      { kind: "item", name: "Beer", price: 2100, quantity: null, count: 3 },
    ]);
  });

  test("takes the printed extended price over count times unit price", () => {
    expect(linesOf(receiptRows([["Bagels 3 @ 1.67", "5.00"]]))).toEqual([
      { kind: "item", name: "Bagels", price: 500, quantity: { count: 3, unitPrice: 167 } },
    ]);
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

  test("joins a sagging word to its own line when the next line's first box levels above it", () => {
    const at = (text: string, left: number, top: number) => {
      const right = left + 12 * text.length;
      return { text, corners: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: top + 20 }, { x: left, y: top + 20 }] as const };
    };

    const rows = groupRows([at("Chicken", 20, 0), at("Seasoned French Fries", 20, 7), at("Sandwich", 120, 9)]);

    expect(rows.map(({ text }) => text)).toEqual(["Chicken Sandwich", "Seasoned French Fries"]);
  });

  test("reads a photo taken sideways or upside down in the order of its text", () => {
    const lines = [box("Burger", 20, 0), box("12.00", 400, 0), box("Fries", 20, 1), box("4.00", 400, 1)];
    const turned = (turn: (point: Point) => Point) => lines.map(({ text, corners }) => ({ text, corners: corners.map(turn) as unknown as TextBox["corners"] }));

    expect(groupRows(turned(({ x, y }) => ({ x: 1000 - y, y: x }))).map(({ text }) => text)).toEqual(["Burger 12.00", "Fries 4.00"]);
    expect(groupRows(turned(({ x, y }) => ({ x: 1000 - x, y: 1000 - y }))).map(({ text }) => text)).toEqual(["Burger 12.00", "Fries 4.00"]);
    expect(groupRows(turned(({ x, y }) => ({ x: y, y: 1000 - x }))).map(({ text }) => text)).toEqual(["Burger 12.00", "Fries 4.00"]);
  });
});
