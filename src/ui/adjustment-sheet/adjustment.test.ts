import { describe, expect, test } from "vitest";

import { applyOperation } from "../../core/operations";
import { adjustmentId, type Split } from "../../core/split";
import { jason, topgolf } from "../../core/topgolf.fixture";
import { adjustmentEdit, newAdjustment, switchKind, tidyAmount, typedFrom, type AdjustmentAnswer } from "./adjustment";

const tax = adjustmentId("tax");
const bucket = adjustmentId("bucket1");
const fresh = adjustmentId("fresh");

const applied = (split: Split, answer: AdjustmentAnswer | null) => {
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

describe("tidyAmount", () => {
  test("writes a readable amount with two decimals and leaves anything else as typed", () => {
    expect(["4", "4.5", ".5", "$12", "4.00", "", "4.", "abc"].map(tidyAmount)).toEqual(["4.00", "4.50", "0.50", "12.00", "4.00", "", "4.00", "abc"]);
  });
});

describe("switchKind", () => {
  test("renames a line still called by its old kind's word and keeps a name someone gave it", () => {
    expect(switchKind({ kind: "tax", name: "Tax", amount: "1.00" }, "discount")).toEqual({ kind: "discount", name: "Discount" });
    expect(switchKind({ kind: "serviceCharge", name: "Fee ", amount: "1.00" }, "tip")).toEqual({ kind: "tip", name: "Tip" });
    expect(switchKind({ kind: "tax", name: "Sales tax", amount: "1.00" }, "discount")).toEqual({ kind: "discount" });
    expect(switchKind({ kind: "tip", name: "", amount: "" }, "tax")).toEqual({ kind: "tax" });
  });

  test("sends the new kind and its word together from the edit sheet", () => {
    const switched = switchKind(typedFrom(topgolf().receipt.adjustments[2]), "discount");
    expect(adjustmentEdit(topgolf(), tax, switched, jason)).toEqual({
      ok: true,
      op: { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: tax, kind: "discount", name: "Discount", amount: -494 }], totalFollows: true },
    });
  });
});

describe("adjustmentEdit", () => {
  test("sends the new tax amount with the Total following", () => {
    expect(adjustmentEdit(topgolf(), tax, { amount: "6.00" }, jason)).toEqual({
      ok: true,
      op: { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: tax, amount: 600 }], totalFollows: true },
    });
  });

  test("sends a rename alone, with the Total left as it is", () => {
    expect(adjustmentEdit(topgolf(), tax, { name: " Sales tax " }, jason)).toEqual({
      ok: true,
      op: { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: tax, name: "Sales tax" }] },
    });
  });

  test("sends only the typed field, so another phone's fix to the name stays", () => {
    const renamed = applied(topgolf(), adjustmentEdit(topgolf(), tax, { name: "Sales tax" }, jason));
    const answer = adjustmentEdit(renamed, tax, { amount: "6" }, jason);
    expect(answer?.ok && answer.op.type === "editReceipt" && answer.op.adjustments).toEqual([{ type: "edit", adjustmentId: tax, amount: 600 }]);
  });

  test("sends nothing when the typed fields still match the row", () => {
    expect(adjustmentEdit(topgolf(), tax, {}, jason)).toBeNull();
    expect(adjustmentEdit(topgolf(), tax, { name: "Tax", amount: "$4.94", kind: "tax" }, jason)).toBeNull();
  });

  test("turns a tax into a discount by flipping the stored sign of the amount", () => {
    const split = topgolf();
    const answer = adjustmentEdit(split, tax, { kind: "discount", name: "Coupon" }, jason);
    expect(answer?.ok && answer.op.type === "editReceipt" && answer.op.adjustments).toEqual([{ type: "edit", adjustmentId: tax, kind: "discount", name: "Coupon", amount: -494 }]);
    expect(applied(split, answer).receipt.total).toBe(19741);
  });

  test("edits a Bundle discount's amount as a positive amount off, and never its kind", () => {
    const split = topgolf();
    const answer = adjustmentEdit(split, bucket, { kind: "tax", amount: "5" }, jason);
    expect(answer?.ok && answer.op.type === "editReceipt" && answer.op.adjustments).toEqual([{ type: "edit", adjustmentId: bucket, amount: -500 }]);
    expect(applied(split, answer).receipt.total).toBe(20680);
  });

  test("says what is wrong with a name or an amount it cannot save", () => {
    const split = topgolf();
    expect(adjustmentEdit(split, tax, { name: "  " }, jason)).toEqual({ ok: false, problem: "name" });
    expect(adjustmentEdit(split, tax, { amount: "" }, jason)).toEqual({ ok: false, problem: "amount" });
    expect(adjustmentEdit(split, tax, { amount: "4.9.4" }, jason)).toEqual({ ok: false, problem: "amount" });
    expect(adjustmentEdit(split, tax, { amount: "100000.01" }, jason)).toEqual({ ok: false, problem: "overLimit" });
    expect(adjustmentEdit(split, tax, { kind: "discount", amount: "300" }, jason)).toEqual({ ok: false, problem: "negativeTotal" });
  });
});

describe("newAdjustment", () => {
  test("adds a tip after the other Adjustments, named for its kind when the name is empty", () => {
    expect(newAdjustment(topgolf(), { kind: "tip", name: " ", amount: "5" }, fresh, jason)).toEqual({
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
