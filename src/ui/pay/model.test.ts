import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { computeShares, type Shares } from "../../core/shares";
import { itemId, participantId, type ItemSplit, type Split } from "../../core/split";
import { differenceNote, payState, paymentStatus } from "./model";

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

describe("paymentStatus", () => {
  const people = ["jason", "sam", "priya", "kim", "lee", "zoe"].map(participantId);
  const [jason, sam, priya, , lee, zoe] = people;
  const names = ["Jason", "Sam", "Priya", "Kim", "Lee", "Zoe"];
  const participants = people.map((id, index) => ({ id, name: names[index] })) as unknown as Split["participants"];
  const shares = (amounts: number[]) =>
    ({ shares: people.map((participantId, index) => ({ participantId, share: cents(amounts[index]) })), unclaimed: { itemIds: [], total: cents(0) } }) as unknown as Shares;
  const paying = (...pairs: [(typeof people)[number], number][]) => pairs.map(([participantId, amount]) => ({ participantId, amount: cents(amount) })) as unknown as Split["payments"];
  const mixed = shares([1000, 2600, 1400, 900, 500, 0]);
  const payments = paying([sam, 2200], [priya, 1400], [lee, 800]);

  test("lists everyone in chip order with the share and the paid state in words", () => {
    expect(paymentStatus({ participants, payments }, mixed, jason).rows.map(({ name, share, words }) => [name, share, words])).toEqual([
      ["Jason", 1000, "You get paid"],
      ["Sam", 2600, "Paid $22.00 · $4.00 still owed"],
      ["Priya", 1400, "Paid $14.00"],
      ["Kim", 900, "Not paid"],
      ["Lee", 500, "Paid $8.00 · $3.00 too much"],
      ["Zoe", 0, "Nothing to pay"],
    ]);
  });

  test("counts the people who paid out of the people who owe or paid, never the Host, and a $0 share owes nobody", () => {
    const status = paymentStatus({ participants, payments }, mixed, jason);
    expect([status.paid, status.owing, status.summary]).toEqual([3, 4, "3 of 4 paid you"]);
  });

  test("words the summary for everyone but the Host without 'you', and the Host row as theirs", () => {
    const status = paymentStatus({ participants, payments }, mixed, sam);
    expect([status.summary, status.rows[0].words]).toEqual(["3 of 4 paid", "Gets paid"]);
  });

  test("has no summary while nobody owes anything", () => {
    expect(paymentStatus({ participants, payments: paying() }, shares([1000, 0, 0, 0, 0, 0]), jason).summary).toBeNull();
  });

  test("reads a recorded $0 as no payment, and a payer whose share fell to $0 as paid too much", () => {
    const rows = paymentStatus({ participants, payments: paying([sam, 0], [zoe, 500]) }, mixed, jason).rows;
    expect([rows[1].words, rows[5].words]).toEqual(["Not paid", "Paid $5.00 · $5.00 too much"]);
  });

  test("moves a payer who paid exactly to paid too much once a co-claimer on their Item shrinks their share", () => {
    const three = [{ id: participantId("jason"), name: "Jason" }, { id: sam, name: "Sam" }, { id: priya, name: "Priya" }] as const;
    const receipt = (rice: ItemSplit) => ({
      items: [{ id: itemId("rice"), name: "Rice", price: price(1200), split: rice }] as const,
      adjustments: [],
      subtotal: cents(1200),
      total: cents(1200),
    });
    const recorded = paying([sam, 1200]);
    const wordsFor = (rice: ItemSplit) => {
      const split = { receipt: receipt(rice), participants: three, payments: recorded };
      return paymentStatus(split, computeShares(split), jason).rows[1].words;
    };
    expect([wordsFor({ by: "even", units: [[sam]] }), wordsFor({ by: "even", units: [[sam, priya]] })]).toEqual(["Paid $12.00", "Paid $12.00 · $6.00 too much"]);
  });
});
