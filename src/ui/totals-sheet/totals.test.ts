import { describe, expect, test } from "vitest";

import { cents } from "../../core/money";
import { applyOperation } from "../../core/operations";
import type { Split } from "../../core/split";
import { jason, topgolf } from "../../core/topgolf.fixture";
import { addsUpTo, totalsEdit } from "./totals";

/** Topgolf with a Subtotal misread $10.00 high and the Total read right. */
const misread = (): Split => {
  const split = topgolf();
  return { ...split, receipt: { ...split.receipt, subtotal: cents(split.receipt.subtotal + 1000) } };
};

const applied = (split: Split, answer: ReturnType<typeof totalsEdit>) => {
  if (!answer?.ok) throw new Error(JSON.stringify(answer));
  const result = applyOperation(split, answer.op, { creator: false });
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));
  return result.split.receipt;
};

describe("addsUpTo", () => {
  test("sums the Items for the Subtotal and the Subtotal with the Adjustments for the Total", () => {
    const { receipt } = topgolf();
    expect(addsUpTo(receipt, "subtotal")).toBe(17923);
    expect(addsUpTo(misread().receipt, "subtotal")).toBe(17923);
    expect(addsUpTo(receipt, "total")).toBe(receipt.total);
  });
});

describe("totalsEdit", () => {
  test("sets a misread Subtotal to the Items' sum and leaves the Total where it is", () => {
    const split = misread();
    const answer = totalsEdit(split, "subtotal", "179.23", jason);
    expect(answer).toEqual({ ok: true, op: { by: jason, type: "editReceipt", subtotal: 17923 } });
    expect(applied(split, answer)).toMatchObject({ subtotal: 17923, total: topgolf().receipt.total });
  });

  test("sets the Total to the typed amount", () => {
    const split = topgolf();
    expect(applied(split, totalsEdit(split, "total", "$250", jason))).toMatchObject({ subtotal: split.receipt.subtotal, total: 25000 });
  });

  test("lands on the typed figure when it is sent twice", () => {
    const split = misread();
    const answer = totalsEdit(split, "subtotal", "179.23", jason);
    if (!answer?.ok) throw new Error("expected an edit");
    const once = applyOperation(split, answer.op, { creator: false });
    if (!once.ok) throw new Error("expected the first to apply");
    const twice = applyOperation(once.split, answer.op, { creator: false });
    expect(twice.ok && twice.split.receipt.subtotal).toBe(17923);
  });

  test("sends nothing for the amount already there, and says what is wrong with one that cannot be saved", () => {
    const split = topgolf();
    expect(totalsEdit(split, "subtotal", (split.receipt.subtotal / 100).toFixed(2), jason)).toBeNull();
    expect(totalsEdit(split, "total", "", jason)).toEqual({ ok: false, problem: "amount" });
    expect(totalsEdit(split, "total", "abc", jason)).toEqual({ ok: false, problem: "amount" });
    expect(totalsEdit(split, "total", "99999999", jason)).toEqual({ ok: false, problem: "overLimit" });
  });
});
