import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { runTotalCheck } from "../core/total-check";
import { parseReceipt } from ".";
import { box, receiptRows } from "./fixtures/boxes";
import receipt1019 from "./fixtures/srd-1019.json";
import receipt1040 from "./fixtures/srd-1040.json";
import receipt1046 from "./fixtures/srd-1046.json";
import receipt1099 from "./fixtures/srd-1099.json";
import receipt1127 from "./fixtures/srd-1127.json";

type Fixture = { boxes: Parameters<typeof parseReceipt>[0] };

const boxesOf = (fixture: unknown) => (fixture as Fixture).boxes;

describe("parseReceipt", () => {
  test("reads SRD receipt 1040 into its Items, tax, service charge, and total", () => {
    const receipt = parseReceipt(boxesOf(receipt1040));

    expect(receipt).toEqual({
      items: [
        { id: "i1", name: "Chicken Fried Rice And Egg", price: 799 },
        { id: "i2", name: "California Tropic And Miso", price: 799 },
        { id: "i3", name: "Add Two Tostones", price: 100 },
        { id: "i4", name: "Sprite", price: 250 },
        { id: "i5", name: "Perrier Sparkling Water", price: 350 },
      ],
      adjustments: [
        { id: "a1", kind: "tax", name: "Tax", amount: 161 },
        { id: "a2", kind: "serviceCharge", name: "Service fees on tables", amount: 345 },
      ],
      subtotal: 2298,
      total: 2804,
    });
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("keeps each price of the curled SRD receipt 1019 on its own Item", () => {
    const receipt = parseReceipt(boxesOf(receipt1019));

    expect(receipt?.items.map(({ name, price }) => [name, price])).toEqual([
      ["Ultra", 250],
      ["Bells Draft", 500],
      ["Cheese Bread", 600],
      ["APPS OUT FIRST", 0],
      ["Caprese", 700],
      ["SALAD OUT FIRST", 0],
      ["Reg Carnivore (s)", 1250],
      ["Reg Margherita (s)", 1000],
    ]);
    expect(receipt?.adjustments).toEqual([{ id: "a1", kind: "tax", name: "Tax 1", amount: 258 }]);
    expect([receipt?.subtotal, receipt?.total]).toEqual([4300, 4558]);
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("reads the Topgolf receipt into Gameplay and two Beer Bucket Bundles, each with its own discount", () => {
    const boxes = readFileSync(new URL("./fixtures/topgolf.tsv", import.meta.url), "utf8")
      .trim()
      .split("\n")
      .flatMap((line, row) => {
        const [label, amount] = line.split("\t");
        return [box(label, 20, row), box(amount, 600, row)];
      });

    const receipt = parseReceipt(boxes);

    expect(receipt).toEqual({
      items: [
        { id: "i1", name: "Gameplay", price: 8775 },
        { id: "i2", name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
        { id: "i3", name: "Guinness Draught 14.9oz Can", price: 2187, quantity: 3 },
        { id: "i4", name: "High Noon Pineapple 12oz Can", price: 849 },
        { id: "i5", name: "High Noon Watermelon 12oz Can", price: 849 },
        { id: "i6", name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
        { id: "i7", name: "Guinness Draught 14.9oz Can", price: 1458, quantity: 2 },
        { id: "i8", name: "High Noon Pineapple 12oz Can", price: 849 },
        { id: "i9", name: "High Noon Watermelon 12oz Can", price: 1698, quantity: 2 },
      ],
      adjustments: [
        { id: "a1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["i2", "i3", "i4", "i5"] } },
        { id: "a2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: { name: "Beer Bucket", items: ["i6", "i7", "i8", "i9"] } },
        { id: "a3", kind: "tax", name: "Tax", amount: 494 },
        { id: "a4", kind: "tip", name: "Tip", amount: 3226 },
      ],
      subtotal: 17923,
      total: 20729,
    });
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("keeps two Bundles with the same name apart and drops the Discount Total that sums their discounts", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Beer Bucket", "$0.00"],
        ["3x Guinness", "$20.00"],
        ["Beer Bucket Discount", "-$2.00"],
        ["Beer Bucket", "$0.00"],
        ["3x Guinness", "$20.00"],
        ["Beer Bucket Discount", "-$2.00"],
        ["Discount Total", "-$4.00"],
        ["Subtotal", "$36.00"],
        ["Total", "$36.00"],
      ]),
    );

    expect(receipt?.items).toEqual([
      { id: "i1", name: "Guinness", price: 2000, quantity: 3 },
      { id: "i2", name: "Guinness", price: 2000, quantity: 3 },
    ]);
    expect(receipt?.adjustments).toEqual([
      { id: "a1", kind: "bundleDiscount", name: "Beer Bucket Discount", amount: -200, bundle: { name: "Beer Bucket", items: ["i1"] } },
      { id: "a2", kind: "bundleDiscount", name: "Beer Bucket Discount", amount: -200, bundle: { name: "Beer Bucket", items: ["i2"] } },
    ]);
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("keeps a $0.00 line as an Item when no discount below it echoes its name", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Combo Meal", "$0.00"],
        ["Burger", "$12.00"],
        ["Fries", "$4.00"],
        ["Happy Hour Discount", "-$2.00"],
        ["Subtotal", "$14.00"],
        ["Total", "$14.00"],
      ]),
    );

    expect(receipt).toEqual({
      items: [
        { id: "i1", name: "Combo Meal", price: 0 },
        { id: "i2", name: "Burger", price: 1200 },
        { id: "i3", name: "Fries", price: 400 },
      ],
      adjustments: [{ id: "a1", kind: "discount", name: "Happy Hour Discount", amount: -200 }],
      subtotal: 1600,
      total: 1400,
    });
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("keeps a $0.00 header with no Items under it as an Item, and its discount on the whole receipt", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Burger", "$12.00"],
        ["Beer Bucket", "$0.00"],
        ["Beer Bucket Coupon", "-$2.00"],
        ["Subtotal", "$10.00"],
        ["Total", "$10.00"],
      ]),
    );

    expect(receipt?.items).toEqual([
      { id: "i1", name: "Burger", price: 1200 },
      { id: "i2", name: "Beer Bucket", price: 0 },
    ]);
    expect(receipt?.adjustments).toEqual([{ id: "a1", kind: "discount", name: "Beer Bucket Coupon", amount: -200 }]);
  });

  test("closes a Bundle at its discount, so a later discount that echoes its name stays on the whole receipt", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Beer Bucket", "$0.00"],
        ["3x Guinness", "$20.00"],
        ["Beer Bucket Discount", "-$2.00"],
        ["Nachos", "$8.00"],
        ["Beer Bucket Discount", "-$1.00"],
        ["Subtotal", "$25.00"],
        ["Total", "$25.00"],
      ]),
    );

    expect(receipt?.items).toEqual([
      { id: "i1", name: "Guinness", price: 2000, quantity: 3 },
      { id: "i2", name: "Nachos", price: 800 },
    ]);
    expect(receipt?.adjustments).toEqual([
      { id: "a1", kind: "bundleDiscount", name: "Beer Bucket Discount", amount: -200, bundle: { name: "Beer Bucket", items: ["i1"] } },
      { id: "a2", kind: "discount", name: "Beer Bucket Discount", amount: -100 },
    ]);
  });

  test("keeps a real discount whose label says total when only keeping it passes the Total check", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Burger", "20.00"],
        ["Fries", "10.00"],
        ["Promo Discount", "-5.00"],
        ["Total Savings Discount", "-5.00"],
        ["Total", "20.00"],
      ]),
    );

    expect(receipt?.adjustments).toEqual([
      { id: "a1", kind: "discount", name: "Promo Discount", amount: -500 },
      { id: "a2", kind: "discount", name: "Total Savings Discount", amount: -500 },
    ]);
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("reads a quantity 7 as 1 when only that makes the Total check pass", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Burger (7 @ 12.00)", ""],
        ["Fries", "4.00"],
        ["Subtotal", "16.00"],
        ["Total", "16.00"],
      ]),
    );

    expect(receipt?.items.map(({ name, price }) => [name, price])).toEqual([
      ["Burger", 1200],
      ["Fries", 400],
    ]);
  });

  test("keeps a quantity 7 when the Total check passes as read", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Wings (7 @ 1.00)", ""],
        ["Subtotal", "7.00"],
        ["Total", "7.00"],
      ]),
    );

    expect(receipt?.items.map(({ price }) => price)).toEqual([700]);
  });

  test("adds a tip and the total paid printed after the first total", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Coffee", "3.25"],
        ["Subtotal", "3.25"],
        ["Tax", "0.35"],
        ["Total", "3.60"],
        ["Gratuity 18.00%", "0.65"],
        ["Total", "4.25"],
        ["18% = $0.65", ""],
      ]),
    );

    expect(receipt?.adjustments.map(({ kind, amount }) => [kind, amount])).toEqual([
      ["tax", 35],
      ["tip", 65],
    ]);
    expect(receipt?.total).toBe(425);
  });

  test("returns null when the boxes hold no priced Item", () => {
    expect(parseReceipt([])).toBeNull();
  });

  test("returns null when a total is printed but no Item is", () => {
    expect(parseReceipt(receiptRows([["Subtotal", "10.00"], ["Total", "10.00"]]))).toBeNull();
  });

  test("returns null when no total is printed", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["Subtotal", "12.00"],
        ]),
      ),
    ).toBeNull();
  });

  test("prices an Item at zero when an indented comp exceeds it", () => {
    const receipt = parseReceipt([
      box("Burger", 20, 0),
      box("12.00", 400, 0),
      box("Comp", 60, 1),
      box("-15.00", 400, 1),
      box("Fries", 20, 2),
      box("4.00", 400, 2),
      box("Subtotal", 20, 3),
      box("4.00", 400, 3),
      box("Total", 20, 4),
      box("4.00", 400, 4),
    ]);

    expect(receipt?.items).toEqual([
      { id: "i1", name: "Burger", price: 0, discountExceededPrice: true },
      { id: "i2", name: "Fries", price: 400 },
    ]);
  });

  test("names the discount of SRD receipt 1046 from its label row", () => {
    expect(parseReceipt(boxesOf(receipt1046))?.adjustments).toEqual([
      { id: "a1", kind: "discount", name: "10% (10.00%)", amount: -340 },
      { id: "a2", kind: "serviceCharge", name: "Service Charge (18.00%)", amount: 612 },
      { id: "a3", kind: "tax", name: "Tax", amount: 214 },
    ]);
  });

  test("leaves the pen marks right of the prices of SRD receipt 1099 out of the Item names", () => {
    expect(parseReceipt(boxesOf(receipt1099))?.items).toEqual([
      { id: "i1", name: "Coffee", price: 325 },
      { id: "i2", name: "Enmoladas with Meat", price: 1495 },
      { id: "i3", name: "Chicken Tenders", price: 595 },
      { id: "i4", name: "Flautas Chicken", price: 995 },
      { id: "i5", name: "Coloradito", price: 1595 },
    ]);
  });

  test("leaves the line number and the count of SRD receipt 1127 out of the Item names", () => {
    expect(parseReceipt(boxesOf(receipt1127))?.items).toEqual([
      { id: "i1", name: "$FiveLU", price: 1249 },
      { id: "i2", name: "$FiveLl", price: 769 },
      { id: "i3", name: "PiTcher", price: 1350 },
    ]);
  });
});

describe("parseReceipt when the Total check fails as read", () => {
  test("keeps tax positive and the check failing rather than flip its sign", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "10.00"],
          ["Subtotal", "10.00"],
          ["Tax", "1.00"],
          ["Total", "9.00"],
        ]),
      ),
    ).toEqual({
      items: [{ id: "i1", name: "Burger", price: 1000 }],
      adjustments: [{ id: "a1", kind: "tax", name: "Tax", amount: 100 }],
      subtotal: 1000,
      total: 900,
    });
  });

  test("keeps a service charge positive rather than flip its sign", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "10.00"],
          ["Subtotal", "10.00"],
          ["Service charge", "1.80"],
          ["Total", "8.20"],
        ]),
      ),
    ).toEqual({
      items: [{ id: "i1", name: "Burger", price: 1000 }],
      adjustments: [
        { id: "a1", kind: "serviceCharge", name: "Service charge", amount: 180 },
      ],
      subtotal: 1000,
      total: 820,
    });
  });

  test("keeps a coupon negative rather than turn it into a charge", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Beer", "5.00"],
          ["Wings", "8.00"],
          ["Subtotal", "13.00"],
          ["Coupon", "2.00"],
          ["Total", "15.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Beer", price: 500 },
        { id: "i2", name: "Wings", price: 800 },
      ],
      adjustments: [{ id: "a1", kind: "discount", name: "Coupon", amount: -200 }],
      subtotal: 1300,
      total: 1500,
    });
  });

  test("keeps every Item when later Items sum to an earlier one", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Steak", "20.00"],
          ["Wine", "12.00"],
          ["Salad", "8.00"],
          ["Subtotal", "20.00"],
          ["Total", "20.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Steak", price: 2000 },
        { id: "i2", name: "Wine", price: 1200 },
        { id: "i3", name: "Salad", price: 800 },
      ],
      adjustments: [],
      subtotal: 2000,
      total: 2000,
    });
  });

  test("keeps both Items when one matches the total, and takes the subtotal from the total less Adjustments", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "5.00"],
          ["Salad", "5.00"],
          ["Total", "5.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Burger", price: 500 },
        { id: "i2", name: "Salad", price: 500 },
      ],
      adjustments: [],
      subtotal: 500,
      total: 500,
    });
  });

  test("returns the Receipt as read when no repair passes either", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Wings (7 @ 1.00)", ""],
          ["Beer", "5.00"],
          ["Subtotal", "20.00"],
          ["Total", "20.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Wings", price: 700 },
        { id: "i2", name: "Beer", price: 500 },
      ],
      adjustments: [],
      subtotal: 2000,
      total: 2000,
    });
  });

  test("returns the Receipt as read when a quantity other than 7 would close the check", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Wings (3 @ 1.00)", ""],
        ["Beer", "5.00"],
        ["Subtotal", "6.00"],
        ["Total", "6.00"],
      ]),
    );

    expect(receipt).toEqual({
      items: [
        { id: "i1", name: "Wings", price: 300 },
        { id: "i2", name: "Beer", price: 500 },
      ],
      adjustments: [],
      subtotal: 600,
      total: 600,
    });
    expect(runTotalCheck(receipt!).ok).toBe(false);
  });

  test("keeps a quantity 7 when its printed extended price is 7 times the unit price", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Burger", ""],
        ["7 @ 2.00", "14.00"],
        ["Fries", "4.00"],
        ["Subtotal", "6.00"],
        ["Total", "6.00"],
      ]),
    );

    expect(receipt?.items.map(({ name, price }) => [name, price])).toEqual([
      ["Burger", 1400],
      ["Fries", 400],
    ]);
    expect(runTotalCheck(receipt!).ok).toBe(false);
  });

  test("reads a quantity 7 on its own line as 1 when no extended price is printed and only that makes the check pass", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Burger", ""],
        ["7 @ 12.00", ""],
        ["Fries", "4.00"],
        ["Subtotal", "16.00"],
        ["Total", "16.00"],
      ]),
    );

    expect(receipt?.items.map(({ name, price }) => [name, price])).toEqual([
      ["Burger", 1200],
      ["Fries", 400],
    ]);
  });

  test("keeps a labelled discount as a discount when only reading it as an Item would close the check", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["Beer", "5.00"],
        ["Happy Hour Discount", "2.00"],
        ["Subtotal", "7.00"],
        ["Total", "7.00"],
      ]),
    );

    expect(receipt).toEqual({
      items: [{ id: "i1", name: "Beer", price: 500 }],
      adjustments: [{ id: "a1", kind: "discount", name: "Happy Hour Discount", amount: -200 }],
      subtotal: 900,
      total: 700,
    });
    expect(runTotalCheck(receipt!).ok).toBe(false);
  });

  test("does not turn a minus row with no name into an Item", () => {
    const receipt = parseReceipt([
      box("Beer", 20, 0),
      box("5.00", 400, 0),
      box("-2.00", 400, 1),
      box("Subtotal", 20, 2),
      box("7.00", 400, 2),
      box("Total", 20, 3),
      box("7.00", 400, 3),
    ]);

    expect(receipt).toEqual({
      items: [{ id: "i1", name: "Beer", price: 500 }],
      adjustments: [{ id: "a1", kind: "discount", name: "", amount: -200 }],
      subtotal: 900,
      total: 700,
    });
    expect(runTotalCheck(receipt!).ok).toBe(false);
  });

  test("reads a minus sign on an unlabelled row as a stray mark when only that makes the check pass", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Beer", "5.00"],
          ["Happy Hour", "-2.00"],
          ["Subtotal", "7.00"],
          ["Total", "7.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Beer", price: 500 },
        { id: "i2", name: "Happy Hour", price: 200 },
      ],
      adjustments: [],
      subtotal: 700,
      total: 700,
    });
  });

  test("takes a later printed total when the first total row is a partial sum", () => {
    const receipt = parseReceipt(
      receiptRows([
        ["WEEKDAY DINNER", "29.88"],
        ["SUBTOTAL:", "29.88"],
        ["15% SERVICE CHARGE:", "4.48"],
        ["Tax(8.75%):", "3.01"],
        ["SALES TOTAL", "32.89"],
        ["TOTAL:", "37.37"],
      ]),
    );

    expect(receipt).toEqual({
      items: [{ id: "i1", name: "WEEKDAY DINNER", price: 2988 }],
      adjustments: [
        { id: "a1", kind: "serviceCharge", name: "15% SERVICE CHARGE", amount: 448 },
        { id: "a2", kind: "tax", name: "Tax(8.75%)", amount: 301 },
      ],
      subtotal: 2988,
      total: 3737,
    });
  });

  test("leaves a tip after the total out when the next total does not add it", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Coffee", "3.25"],
          ["Subtotal", "3.25"],
          ["Tax", "0.35"],
          ["Total", "3.60"],
          ["Tip", "0.65"],
          ["Total", "5.00"],
        ]),
      ),
    ).toEqual({
      items: [{ id: "i1", name: "Coffee", price: 325 }],
      adjustments: [{ id: "a1", kind: "tax", name: "Tax", amount: 35 }],
      subtotal: 325,
      total: 360,
    });
  });
});

describe("parseReceipt assembling rows", () => {
  test("names a quantity line after the unpriced row above it", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Iced Tea", ""],
          ["2 @ 1.50", "3.00"],
          ["Subtotal", "3.00"],
          ["Total", "3.00"],
        ]),
      )?.items,
    ).toEqual([{ id: "i1", name: "Iced Tea", price: 300 }]);
  });

  test("prices the Item above from a quantity line under it", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["2 @ 12.00", "24.00"],
          ["Subtotal", "24.00"],
          ["Total", "24.00"],
        ]),
      )?.items,
    ).toEqual([{ id: "i1", name: "Burger", price: 2400 }]);
  });

  test("folds an indented modifier into the Item above", () => {
    const receipt = parseReceipt([
      box("Burger", 20, 0),
      box("12.00", 400, 0),
      box("Bacon", 60, 1),
      box("2.00", 400, 1),
      box("Fries", 20, 2),
      box("4.00", 400, 2),
      box("Total", 20, 3),
      box("18.00", 400, 3),
    ]);

    expect(receipt).toEqual({
      items: [
        { id: "i1", name: "Burger", price: 1400 },
        { id: "i2", name: "Fries", price: 400 },
      ],
      adjustments: [],
      subtotal: 1800,
      total: 1800,
    });
  });

  test("folds an Item-level discount into its Item and keeps a Receipt-level one as an Adjustment", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["Burger discount", "-2.00"],
          ["Fries", "4.00"],
          ["Happy Hour Discount", "-1.00"],
          ["Subtotal", "13.00"],
          ["Total", "13.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Burger", price: 1000 },
        { id: "i2", name: "Fries", price: 400 },
      ],
      adjustments: [
        { id: "a1", kind: "discount", name: "Happy Hour Discount", amount: -100 },
      ],
      subtotal: 1400,
      total: 1300,
    });
  });

  test("adds back a discount printed above the subtotal", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["Fries", "4.00"],
          ["Happy Hour Discount", "-2.00"],
          ["Subtotal", "14.00"],
          ["Tax", "1.00"],
          ["Total", "15.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Burger", price: 1200 },
        { id: "i2", name: "Fries", price: 400 },
      ],
      adjustments: [
        { id: "a1", kind: "discount", name: "Happy Hour Discount", amount: -200 },
        { id: "a2", kind: "tax", name: "Tax", amount: 100 },
      ],
      subtotal: 1600,
      total: 1500,
    });
  });

  test("skips a tax row that restates the taxes above it", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "10.00"],
          ["Subtotal", "10.00"],
          ["State Tax", "0.60"],
          ["City Tax", "0.40"],
          ["Tax", "1.00"],
          ["Total", "11.00"],
        ]),
      )?.adjustments,
    ).toEqual([
      { id: "a1", kind: "tax", name: "State Tax", amount: 60 },
      { id: "a2", kind: "tax", name: "City Tax", amount: 40 },
    ]);
  });

  test("sums the subtotals of separate sections when only their sum matches the Items", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["Beer", "4.00"],
          ["Food Subtotal", "12.00"],
          ["Bar Subtotal", "4.00"],
          ["Total", "16.00"],
        ]),
      ),
    ).toEqual({
      items: [
        { id: "i1", name: "Burger", price: 1200 },
        { id: "i2", name: "Beer", price: 400 },
      ],
      adjustments: [],
      subtotal: 1600,
      total: 1600,
    });
  });

  test("ignores Item-shaped rows below the subtotal", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["Subtotal", "12.00"],
          ["Rewards Balance", "5.00"],
          ["Tax", "1.00"],
          ["Total", "13.00"],
        ]),
      )?.items,
    ).toEqual([{ id: "i1", name: "Burger", price: 1200 }]);
  });

  test("ignores a price printed with no label", () => {
    const receipt = parseReceipt([
      box("Burger", 20, 0),
      box("12.00", 400, 0),
      box("3.00", 400, 1),
      box("Subtotal", 20, 2),
      box("12.00", 400, 2),
      box("Total", 20, 3),
      box("12.00", 400, 3),
    ]);

    expect(receipt?.items).toEqual([{ id: "i1", name: "Burger", price: 1200 }]);
  });

  test("ignores a price in brackets under an Item", () => {
    expect(
      parseReceipt(
        receiptRows([
          ["Burger", "12.00"],
          ["Regular, Avocado ($1.00)", ""],
          ["Subtotal", "12.00"],
          ["Total", "12.00"],
        ]),
      )?.items,
    ).toEqual([{ id: "i1", name: "Burger", price: 1200 }]);
  });
});
