import { describe, expect, test } from "vitest";

import { applyOperation } from "../../core/operations";
import { adjustmentId, type Split } from "../../core/split";
import { jason, topgolf } from "../../core/topgolf.fixture";
import { adjustmentEdit, newAdjustment, typedFrom, type TypedAdjustment } from "./adjustment";

const tax = adjustmentId("tax");
const bucket = adjustmentId("bucket1");
const fresh = adjustmentId("fresh");

const typedOn = (split: Split, id: typeof tax, change: Partial<TypedAdjustment>) => {
  const row = split.receipt.adjustments.find((adjustment) => adjustment.id === id);
  if (!row) throw new Error(`no ${id}`);
  return { ...typedFrom(row), ...change };
};

const applied = (split: Split, answer: ReturnType<typeof newAdjustment> | null) => {
  if (!answer?.ok) throw new Error(JSON.stringify(answer));
  const result = applyOperation(split, answer.op, { creator: false });
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));
  return result.split;
};

describe("typedFrom", () => {
  test("shows a charge as it is and a discount as the positive amount it takes off", () => {
    const [bucketRow, , taxRow] = topgolf().receipt.adjustments;
    expect(typedFrom(taxRow)).toEqual({ kind: "tax", name: "Tax", amount: "4.94" });
    expect(typedFrom(bucketRow)).toMatchObject({ kind: "bundleDiscount", amount: "4.51" });
  });
});

describe("adjustmentEdit", () => {
  test("sends the new tax amount with the Total following", () => {
    const split = topgolf();
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { amount: "6.00" }), jason)).toEqual({
      ok: true,
      op: { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: tax, amount: 600 }], totalFollows: true },
    });
  });

  test("sends nothing when the fields still match the row, or the name is cleared", () => {
    const split = topgolf();
    expect(adjustmentEdit(split, tax, typedOn(split, tax, {}), jason)).toBeNull();
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { name: "  " }), jason)).toBeNull();
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { amount: "$4.94" }), jason)).toBeNull();
  });

  test("turns a tax into a discount by flipping the stored sign of the same typed amount", () => {
    const split = topgolf();
    const answer = adjustmentEdit(split, tax, typedOn(split, tax, { kind: "discount", name: "Coupon" }), jason);
    expect(answer?.ok && answer.op.type === "editReceipt" && answer.op.adjustments).toEqual([{ type: "edit", adjustmentId: tax, kind: "discount", name: "Coupon", amount: -494 }]);
    expect(applied(split, answer).receipt.total).toBe(20729 - 988);
  });

  test("edits a Bundle discount's amount as a positive amount off, and never its kind", () => {
    const split = topgolf();
    const answer = adjustmentEdit(split, bucket, typedOn(split, bucket, { amount: "5" }), jason);
    expect(answer?.ok && answer.op.type === "editReceipt" && answer.op.adjustments).toEqual([{ type: "edit", adjustmentId: bucket, amount: -500 }]);
    expect(applied(split, answer).receipt.total).toBe(20680);
  });

  test("says what is wrong with an amount it cannot save", () => {
    const split = topgolf();
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { amount: "" }), jason)).toEqual({ ok: false, problem: "amount" });
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { amount: "4.9.4" }), jason)).toEqual({ ok: false, problem: "amount" });
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { amount: "100000.01" }), jason)).toEqual({ ok: false, problem: "overLimit" });
    expect(adjustmentEdit(split, tax, typedOn(split, tax, { kind: "discount", amount: "300" }), jason)).toEqual({ ok: false, problem: "negativeTotal" });
  });
});

describe("newAdjustment", () => {
  test("adds a tip after the other Adjustments, named for its kind when the name is empty", () => {
    const split = topgolf();
    expect(newAdjustment(split, { kind: "tip", name: " ", amount: "5" }, fresh, jason)).toEqual({
      ok: true,
      op: { by: jason, type: "editReceipt", adjustments: [{ type: "add", adjustment: { id: fresh, kind: "tip", name: "Tip", amount: 500 }, index: 4 }], totalFollows: true },
    });
  });

  test("adds a discount below zero and lowers the Total by it", () => {
    const split = topgolf();
    const added = applied(split, newAdjustment(split, { kind: "discount", name: "Birthday coupon", amount: "10.00" }, fresh, jason));
    expect(added.receipt.adjustments.at(-1)).toEqual({ id: fresh, kind: "discount", name: "Birthday coupon", amount: -1000 });
    expect(added.receipt.total).toBe(19729);
  });

  test("refuses the 21st Adjustment and an empty amount", () => {
    let split = topgolf();
    for (let at = 0; at < 16; at += 1) split = applied(split, newAdjustment(split, { kind: "serviceCharge", name: "", amount: "0.10" }, adjustmentId(`fee${at}`), jason));
    expect(split.receipt.adjustments).toHaveLength(20);
    expect(newAdjustment(split, { kind: "tip", name: "", amount: "1" }, fresh, jason)).toEqual({ ok: false, problem: "tooManyAdjustments" });
    expect(newAdjustment(topgolf(), { kind: "tip", name: "", amount: "" }, fresh, jason)).toEqual({ ok: false, problem: "amount" });
  });
});
