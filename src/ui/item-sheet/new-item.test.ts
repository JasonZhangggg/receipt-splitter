import { describe, expect, test } from "vitest";

import { createSplit } from "../../core/operations";
import { cents, price } from "../../core/money";
import { adjustmentId, itemId, participantId, type Adjustment, type Split } from "../../core/split";
import { mintedId } from "../../core/test-ids";
import { newItem, readAmount, sharedCharges, shortfall, type NewItem } from "./new-item";

const ann = participantId("ann");
const bob = participantId("bob");

function splitWith(count: number, printed: { subtotal?: number; adjustments?: Adjustment[] } = {}): Split {
  const adjustments = printed.adjustments ?? [];
  const subtotal = printed.subtotal ?? 100 * count;
  const items = Array.from({ length: count }, (_, at) => ({ id: itemId(`i${at}`), name: `Item ${at}`, price: price(100) }));
  const result = createSplit({
    id: mintedId("q7Xv0Lr9_aZ-3mKp"),
    receipt: { items: [items[0], ...items.slice(1)], adjustments, subtotal: cents(subtotal), total: cents(subtotal + adjustments.reduce((sum, { amount }) => sum + amount, 0)) },
    participants: [
      { id: ann, name: "Ann" },
      { id: bob, name: "Bob" },
    ],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  });
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));
  return result.split;
}

const typed = (fields: Partial<NewItem> = {}): NewItem => ({ name: "Fries", price: "6.50", ...fields });
const fresh = itemId("fresh");

describe("newItem", () => {
  test("sends one add at the end of the receipt with nobody having it", () => {
    expect(newItem(splitWith(2), typed({ name: "  Fries " }), fresh, ann)).toEqual({
      ok: true,
      op: { by: ann, type: "editReceipt", items: [{ type: "add", item: { id: fresh, name: "Fries", price: 650 }, index: 2, who: [] }] },
    });
  });

  test("asks for a name first, then a price", () => {
    expect(newItem(splitWith(2), typed({ name: "   ", price: "" }), fresh, ann)).toEqual({ ok: false, problem: "name" });
    expect(newItem(splitWith(2), typed({ price: "" }), fresh, ann)).toEqual({ ok: false, problem: "price" });
    expect(newItem(splitWith(2), typed({ price: "six" }), fresh, ann)).toEqual({ ok: false, problem: "price" });
    expect(newItem(splitWith(2), typed({ price: "-1" }), fresh, ann)).toEqual({ ok: false, problem: "price" });
  });

  test("takes a price of $0.00 and refuses one over the limit", () => {
    const zero = newItem(splitWith(2), typed({ price: "0" }), fresh, ann);
    expect(zero.ok && zero.op.type === "editReceipt" && zero.op.items?.[0]).toMatchObject({ item: { price: 0 } });
    expect(newItem(splitWith(2), typed({ price: "100000.01" }), fresh, ann)).toEqual({ ok: false, problem: "overLimit" });
  });

  test("adds the 100th Item and refuses the 101st as tooManyItems", () => {
    expect(newItem(splitWith(99), typed(), fresh, ann).ok).toBe(true);
    expect(newItem(splitWith(100), typed(), fresh, ann)).toEqual({ ok: false, problem: "tooManyItems" });
  });
});

describe("readAmount", () => {
  test("reads a price with a digit typed into the middle of a shown 12.00", () => {
    expect(readAmount("123.00")).toBe(12300);
    expect(readAmount("12.300")).toBe("price");
  });

  test("calls a shown 12.00 with 13 typed after it a price problem, not 12.00", () => {
    expect(readAmount("12.0013")).toBe("price");
  });

  test("calls an emptied field a price problem, not $0.00", () => {
    expect(readAmount("")).toBe("price");
    expect(readAmount(".")).toBe("price");
  });

  test("reads what a person types over the field", () => {
    expect(readAmount("13")).toBe(1300);
    expect(readAmount("$13.5")).toBe(1350);
    expect(readAmount("0")).toBe(0);
  });

  test("calls a price over $100,000 over the limit", () => {
    expect(readAmount("100000.01")).toBe("overLimit");
    expect(readAmount("100000")).toBe(10_000_000);
  });
});

describe("shortfall", () => {
  test("is how far the Items are under the printed Subtotal", () => {
    expect(shortfall(splitWith(3, { subtotal: 950 }))).toBe(650);
  });

  test("is null when the Items add up to the Subtotal or are over it", () => {
    expect([shortfall(splitWith(3)), shortfall(splitWith(3, { subtotal: 200 }))]).toEqual([null, null]);
  });
});

describe("sharedCharges", () => {
  const charge = (kind: "tax" | "tip" | "serviceCharge", amount: number): Adjustment => ({ id: adjustmentId(kind), kind, name: kind, amount: cents(amount) });

  test("names the tax and the tip a new Item would share, in that order", () => {
    expect(sharedCharges(splitWith(2, { adjustments: [charge("tip", 40), charge("tax", 20)] }))).toEqual(["tax", "tip"]);
  });

  test("leaves out a $0.00 tip, fees, and a receipt with neither", () => {
    expect(sharedCharges(splitWith(2, { adjustments: [charge("tip", 0), charge("serviceCharge", 50)] }))).toEqual([]);
    expect(sharedCharges(splitWith(2))).toEqual([]);
  });
});
