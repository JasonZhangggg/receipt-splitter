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

const typed = (fields: Partial<NewItem> = {}): NewItem => ({ name: "Fries", price: "6.50", quantity: "", ...fields });
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

  test("with How many above 1, adds a quantity line whose price is the line's total, as the scanner reads one", () => {
    expect(newItem(splitWith(2), typed({ name: "Guinness Draught", price: "21.87", quantity: " 3 " }), fresh, ann)).toEqual({
      ok: true,
      op: { by: ann, type: "editReceipt", items: [{ type: "add", item: { id: fresh, name: "Guinness Draught", price: 2187, quantity: 3 }, index: 2, who: [] }] },
    });
  });

  test("reads an empty How many or 1 as one, with no quantity on the Item", () => {
    for (const quantity of ["", "1"]) {
      const answer = newItem(splitWith(2), typed({ quantity }), fresh, ann);
      expect(answer.ok && answer.op.type === "editReceipt" && answer.op.items?.[0]).toEqual({ type: "add", item: { id: fresh, name: "Fries", price: 650 }, index: 2, who: [] });
    }
  });

  test("refuses a How many that is not a whole number from 1 to 20", () => {
    expect(["0", "21", "1.5", "two", "-2"].map((quantity) => newItem(splitWith(2), typed({ quantity }), fresh, ann))).toEqual(Array(5).fill({ ok: false, problem: "quantity" }));
    expect(newItem(splitWith(2), typed({ quantity: "20" }), fresh, ann).ok).toBe(true);
  });

  test("adds the 100th Item and refuses the 101st as tooManyItems", () => {
    expect(newItem(splitWith(99), typed(), fresh, ann).ok).toBe(true);
    expect(newItem(splitWith(100), typed(), fresh, ann)).toEqual({ ok: false, problem: "tooManyItems" });
  });
});

describe("readAmount", () => {
  test("reads a price with a digit typed into the middle of a shown 12.00", () => {
    expect(readAmount("123.00", "USD")).toBe(12300);
    expect(readAmount("12.300", "USD")).toBe("price");
  });

  test("calls a shown 12.00 with 13 typed after it a price problem, not 12.00", () => {
    expect(readAmount("12.0013", "USD")).toBe("price");
  });

  test("calls an emptied field a price problem, not $0.00", () => {
    expect(readAmount("", "USD")).toBe("price");
    expect(readAmount(".", "USD")).toBe("price");
  });

  test("reads what a person types over the field", () => {
    expect(readAmount("13", "USD")).toBe(1300);
    expect(readAmount("$13.5", "USD")).toBe(1350);
    expect(readAmount("0", "USD")).toBe(0);
  });

  test("calls a price over $100,000 over the limit", () => {
    expect(readAmount("100000.01", "USD")).toBe("overLimit");
    expect(readAmount("100000", "USD")).toBe(10_000_000);
  });
});

describe("readAmount in another currency", () => {
  test("reads a comma as the decimal mark and a leading sign of the currency", () => {
    expect(readAmount("12,50", "EUR")).toBe(1250);
    expect(readAmount("€12.50", "EUR")).toBe(1250);
  });

  test("reads whole units only for a currency with no minor unit", () => {
    expect(readAmount("1200", "JPY")).toBe(1200);
    expect([readAmount("1,200", "JPY"), readAmount("¥1.200", "JPY")]).toEqual([1200, 1200]);
    expect(readAmount("12.5", "JPY")).toBe("price");
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
