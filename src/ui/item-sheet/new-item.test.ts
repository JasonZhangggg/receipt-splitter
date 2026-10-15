import { describe, expect, test } from "vitest";

import { createSplit } from "../../core/operations";
import { cents, price } from "../../core/money";
import { itemId, participantId, type Split } from "../../core/split";
import { mintedId } from "../../core/test-ids";
import { newItem, readAmount, type NewItem } from "./new-item";

const ann = participantId("ann");
const bob = participantId("bob");

function splitWith(count: number): Split {
  const items = Array.from({ length: count }, (_, at) => ({ id: itemId(`i${at}`), name: `Item ${at}`, price: price(100) }));
  const result = createSplit({
    id: mintedId("q7Xv0Lr9_aZ-3mKp"),
    receipt: { items: [items[0], ...items.slice(1)], adjustments: [], subtotal: cents(100 * count), total: cents(100 * count) },
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
