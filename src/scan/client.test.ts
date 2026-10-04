import { describe, expect, test } from "vitest";
import { cropOf, receiptOfReply } from "./client";

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

describe("cropOf", () => {
  const box = (x: number, y: number) => ({ text: "x", corners: [{ x, y }, { x: x + 100, y }, { x: x + 100, y: y + 20 }, { x, y: y + 20 }] as const });

  test("covers the boxes with a margin of two box heights, inside the photo", () => {
    expect(cropOf([box(200, 300), box(250, 900)], 1000, 2000)).toEqual({ x: 160, y: 260, width: 230, height: 700 });
    expect(cropOf([box(10, 10)], 1000, 2000)).toEqual({ x: 0, y: 0, width: 150, height: 70 });
    expect(cropOf([], 1000, 2000)).toEqual({ x: 0, y: 0, width: 1000, height: 2000 });
  });
});
