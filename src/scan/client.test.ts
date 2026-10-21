import { describe, expect, test } from "vitest";
import { cropOf, placeOfReply, receiptOfReply } from "./client";

const reply = {
  items: [
    { name: "Cold Brew", price: 575, quantity: null, details: ["Large", "oat milk"], discounts: [] },
    { name: "Club Sandwich", price: 1050, quantity: null, details: [], discounts: [{ name: "Member discount", amount: -200 }] },
    { name: "Hot Wings", price: 900, quantity: null, details: [], discounts: [] },
    { name: "Garlic Fries", price: 500, quantity: null, details: [], discounts: [] },
    { name: "Lemonade", price: 600, quantity: 2, details: [], discounts: [] },
  ],
  bundles: [{ name: "Wing Bucket", items: [2, 3], discounts: [{ name: "Bucket discount", amount: -300 }] }],
  adjustments: [
    { kind: "fee", name: "Bag fee", amount: 10 },
    { kind: "discount", name: "Coupon", amount: -100 },
    { kind: "tax", name: "Tax", amount: 290 },
  ],
  subtotal: { amount: 3235, beforeDiscounts: false },
  total: 3525,
  check: { passed: true, gaps: { subtotal: 0, total: 0 } },
};

describe("receiptOfReply", () => {
  test("maps a reply to a Receipt with joined details, the folded discount as $ off, a Bundle, and the fee as a service charge", () => {
    expect(receiptOfReply(reply)).toEqual({
      items: [
        { id: "i1", name: "Cold Brew", price: 575, detail: "Large, oat milk" },
        { id: "i2", name: "Club Sandwich", price: 1050, detail: "$2.00 off" },
        { id: "i3", name: "Hot Wings", price: 900 },
        { id: "i4", name: "Garlic Fries", price: 500 },
        { id: "i5", name: "Lemonade", price: 600, quantity: 2 },
      ],
      adjustments: [
        { id: "b1", kind: "bundleDiscount", name: "Bucket discount", amount: -300, bundle: { name: "Wing Bucket", items: ["i3", "i4"] } },
        { id: "a1", kind: "serviceCharge", name: "Bag fee", amount: 10 },
        { id: "a2", kind: "discount", name: "Coupon", amount: -100 },
        { id: "a3", kind: "tax", name: "Tax", amount: 290 },
      ],
      subtotal: 3625,
      total: 3525,
    });
  });

  test("a subtotal printed before discounts becomes the Items' sum after their own discounts, less fees", () => {
    const before = { ...reply, subtotal: { amount: 3835, beforeDiscounts: true } };

    expect(receiptOfReply(before)?.subtotal).toBe(3625);
    expect(receiptOfReply({ ...reply, subtotal: null })?.subtotal).toBe(3625);
  });

  test("leaves a Bundle with no discount as plain Items, and reads a kind named like an Object method as malformed", () => {
    const plain = receiptOfReply({ ...reply, bundles: [{ ...reply.bundles[0], discounts: [] }] });

    expect(plain?.adjustments.map(({ id, kind }) => [id, kind])).toEqual([
      ["a1", "serviceCharge"],
      ["a2", "discount"],
      ["a3", "tax"],
    ]);
    expect(receiptOfReply({ ...reply, adjustments: [{ kind: "constructor", name: "Fuel", amount: 10 }] })).toBeNull();
  });

  test("clamps an Item a coupon takes below $0.00 to $0.00 with its own coupon, and sends only the excess as a discount on the whole receipt", () => {
    const coupons = {
      items: [
        { name: "Granola Bar", price: 150, quantity: null, details: [], discounts: [] },
        { name: "Dog Treats", price: -300, quantity: null, details: ["Bacon"], discounts: [{ name: "Store coupon", amount: -450 }] },
        { name: "Dog Treats", price: 150, quantity: null, details: [], discounts: [] },
      ],
      bundles: [],
      adjustments: [{ kind: "tax", name: "Tax", amount: 12 }],
      subtotal: { amount: 0, beforeDiscounts: false },
      total: 12,
      check: { passed: true, gaps: { subtotal: 0, total: 0 } },
    };

    expect(receiptOfReply(coupons)).toEqual({
      items: [
        { id: "i1", name: "Granola Bar", price: 150 },
        { id: "i2", name: "Dog Treats", price: 0, detail: "Bacon, $1.50 off" },
        { id: "i3", name: "Dog Treats", price: 150 },
      ],
      adjustments: [
        { id: "c2", kind: "discount", name: "Store coupon", amount: -300 },
        { id: "a1", kind: "tax", name: "Tax", amount: 12 },
      ],
      subtotal: 300,
      total: 12,
    });
    expect(receiptOfReply({ ...coupons, subtotal: { amount: 450, beforeDiscounts: true } })?.subtotal).toBe(300);
  });

  test("sends a negative Item with no printed discount, such as a return line, as $0.00 and a discount of its whole price", () => {
    const returned = {
      items: [
        { name: "Granola Bar", price: 150, quantity: null, details: [], discounts: [] },
        { name: "Returned Mug", price: -250, quantity: null, details: [], discounts: [] },
      ],
      bundles: [],
      adjustments: [],
      subtotal: null,
      total: -100,
      check: { passed: true, gaps: { subtotal: 0, total: 0 } },
    };

    expect(receiptOfReply(returned)).toEqual({
      items: [
        { id: "i1", name: "Granola Bar", price: 150 },
        { id: "i2", name: "Returned Mug", price: 0 },
      ],
      adjustments: [{ id: "c2", kind: "discount", name: "Returned Mug", amount: -250 }],
      subtotal: 150,
      total: -100,
    });
  });

  test("clips a long detail to 120 characters", () => {
    const [first, ...rest] = reply.items;
    const detail = receiptOfReply({ ...reply, items: [{ ...first, details: ["x".repeat(130)] }, ...rest] })?.items[0].detail;

    expect(detail).toBe(`${"x".repeat(119)}…`);
  });

  test("returns null for a reply that does not have the reply's shape", () => {
    expect(receiptOfReply({ refused: "rateLimited" })).toBeNull();
    expect(receiptOfReply({ ...reply, items: [] })).toBeNull();
    expect(receiptOfReply({ ...reply, total: "35.25" })).toBeNull();
    expect(receiptOfReply({ ...reply, bundles: [{ ...reply.bundles[0], items: [2, 9] }] })).toBeNull();
    expect(receiptOfReply({ ...reply, adjustments: [{ kind: "surcharge", name: "Fuel", amount: 10 }] })).toBeNull();
    expect(receiptOfReply("<html>")).toBeNull();
  });
});

describe("placeOfReply", () => {
  test("tidies the business name for the sentence, and gives null when the reply has none", () => {
    expect([{ place: "  Joe's   Diner. " }, { place: "" }, { place: null }, {}].map(placeOfReply)).toEqual(["Joe\u2019s Diner", null, null, null]);
  });

  test("cuts a long name to 32 characters with an ellipsis", () => {
    expect(placeOfReply({ place: "The Very Long Name Of A Restaurant Group" })).toBe("The Very Long Name Of A Restaur\u2026");
  });
});

describe("cropOf", () => {
  const box = (x: number, y: number) => ({ text: "x", corners: [{ x, y }, { x: x + 100, y }, { x: x + 100, y: y + 20 }, { x, y: y + 20 }] as const });

  test("covers the boxes with a margin of two box heights, inside the photo", () => {
    expect(cropOf([box(200, 300), box(250, 900)], 1000, 2000)).toEqual({ x: 160, y: 260, width: 230, height: 700 });
    expect(cropOf([box(10, 10)], 1000, 2000)).toEqual({ x: 0, y: 0, width: 150, height: 70 });
    expect(cropOf([], 1000, 2000)).toEqual({ x: 0, y: 0, width: 1000, height: 2000 });
  });
});
