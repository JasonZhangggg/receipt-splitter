import { describe, expect, test } from "vitest";

import { cents } from "../../core/money";
import { differenceNote, payState } from "./model";

describe("payState", () => {
  test("reads nothing for a $0.00 or negative Share with no Payment, and unpaid with the Share owed otherwise", () => {
    expect([payState(cents(0), null), payState(cents(-150), null), payState(cents(1420), null)]).toEqual([
      { kind: "nothing" },
      { kind: "nothing" },
      { kind: "unpaid", owe: 1420 },
    ]);
  });

  test("reads settled when the Payment matches the Share, over when the Share fell, and short when it rose", () => {
    expect([payState(cents(2200), cents(2200)), payState(cents(1400), cents(2200)), payState(cents(2600), cents(2200))]).toEqual([
      { kind: "settled", paid: 2200 },
      { kind: "over", paid: 2200, back: 800 },
      { kind: "short", paid: 2200, rest: 400 },
    ]);
  });
});

describe("differenceNote", () => {
  const over = payState(cents(1400), cents(2200));
  const short = payState(cents(2600), cents(2200));

  test("tells the payer, the Host, and anyone else what the Host owes back", () => {
    expect([differenceNote(over, "payer", "Sam", "Jason"), differenceNote(over, "host", "Sam", "Jason"), differenceNote(over, "other", "Sam", "Jason")]).toEqual([
      "You paid $22.00. Jason owes you $8.00.",
      "Sam paid $22.00. You owe Sam $8.00.",
      "Sam paid $22.00. Jason owes Sam $8.00.",
    ]);
  });

  test("groups amounts of $1,000 and up by thousands", () => {
    expect(differenceNote(payState(cents(100_000), cents(123_456)), "payer", "Sam", "Jason")).toBe("You paid $1,234.56. Jason owes you $234.56.");
    expect(differenceNote(payState(cents(10_099_999), cents(99_999)), "other", "Sam", "Jason")).toBe("Sam paid $999.99 and owes $100,000.00 more.");
  });

  test("tells the payer and everyone else what is still owed", () => {
    expect([differenceNote(short, "payer", "Sam", "Jason"), differenceNote(short, "host", "Sam", "Jason"), differenceNote(short, "other", "Sam", "Jason")]).toEqual([
      "You paid $22.00. You owe $4.00 more.",
      "Sam paid $22.00 and owes $4.00 more.",
      "Sam paid $22.00 and owes $4.00 more.",
    ]);
  });

  test("says nothing when the Payment matches the Share, and the over line once it doesn't", () => {
    expect([differenceNote(payState(cents(2200), cents(2200)), "payer", "Sam", "Jason"), differenceNote(payState(cents(2100), cents(2200)), "payer", "Sam", "Jason")]).toEqual([
      null,
      "You paid $22.00. Jason owes you $1.00.",
    ]);
  });
});
