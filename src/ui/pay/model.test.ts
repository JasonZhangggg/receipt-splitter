import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { computeShares, type Shares } from "../../core/shares";
import { itemId, participantId, type ItemSplit, type Split } from "../../core/split";
import { paidMarks, payState, shareStatus, statusWords } from "./model";

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

describe("shareStatus and statusWords", () => {
  const shares = {
    shares: [
      { participantId: "jason", share: cents(8436) },
      { participantId: "sam", share: cents(5347), paid: cents(10694), owed: cents(-5347) },
      { participantId: "priya", share: cents(931), paid: cents(931), owed: cents(0) },
      { participantId: "lee", share: cents(5347), paid: cents(4000), owed: cents(1347) },
      { participantId: "kim", share: cents(10694), paid: cents(0), owed: cents(10694) },
      { participantId: "ana", share: cents(0), paid: cents(0), owed: cents(0) },
    ],
    unclaimed: { itemIds: [], total: cents(0) },
  } as unknown as Shares;
  const payments = [
    { participantId: "sam", amount: cents(10694) },
    { participantId: "priya", amount: cents(931) },
    { participantId: "lee", amount: cents(4000) },
  ] as unknown as Split["payments"];
  const words = (person: string, viewer: string, paid = payments) => statusWords(shareStatus(shares, paid, participantId(person), participantId(viewer)));

  test("says nothing before a payment, then what was paid and how far off it is", () => {
    expect([words("kim", "jason"), words("ana", "jason"), words("priya", "jason"), words("lee", "lee"), words("sam", "priya")]).toEqual([
      null,
      null,
      "Paid $9.31",
      "Paid $40.00 · $13.47 still owed",
      "Paid $106.94 · $53.47 too much",
    ]);
  });

  test("counts for the Host who has paid them out of everyone who owes something, settled and overpaid as paid", () => {
    expect(shareStatus(shares, payments, participantId("jason"), participantId("jason"))).toEqual({ kind: "host", paid: 2, of: 4, started: true });
    expect(words("jason", "jason")).toBe("2 of 4 paid you");
  });

  test("stays quiet for the Host before anyone pays, counts from the first payment even a short one, and says nothing on the Host's share seen from another phone", () => {
    expect([words("jason", "jason", []), words("jason", "jason", payments.slice(2)), words("jason", "jason", payments.slice(1, 2)), words("jason", "sam")]).toEqual([
      null,
      "0 of 4 paid you",
      "1 of 4 paid you",
      null,
    ]);
  });
});

describe("paidMarks", () => {
  const shares = {
    shares: [
      { participantId: "jason", share: cents(1000) },
      { participantId: "sam", share: cents(2600), paid: cents(2200), owed: cents(400) },
      { participantId: "priya", share: cents(1400), paid: cents(1400), owed: cents(0) },
      { participantId: "kim", share: cents(900), paid: cents(0), owed: cents(900) },
      { participantId: "lee", share: cents(500), paid: cents(800), owed: cents(-300) },
    ],
    unclaimed: { itemIds: [], total: cents(0) },
  } as unknown as Shares;
  const payments = [
    { participantId: "sam", amount: cents(2200) },
    { participantId: "priya", amount: cents(1400) },
    { participantId: "lee", amount: cents(800) },
    { participantId: "jason", amount: cents(1000) },
  ] as unknown as Split["payments"];

  test("marks short, settled and over payers, and leaves the Host and anyone unpaid bare", () => {
    expect([...paidMarks(shares, payments)]).toEqual([
      ["sam", "short"],
      ["priya", "paid"],
      ["lee", "over"],
    ]);
  });

  test("marks over once a payer who paid exactly gets a co-claimer on their Item, so their share shrinks", () => {
    const [jason, sam, priya] = ["jason", "sam", "priya"].map(participantId);
    const people = [{ id: jason, name: "Jason" }, { id: sam, name: "Sam" }, { id: priya, name: "Priya" }] as const;
    const receipt = (rice: ItemSplit) => ({
      items: [{ id: itemId("rice"), name: "Rice", price: price(1200), split: rice }] as const,
      adjustments: [],
      subtotal: cents(1200),
      total: cents(1200),
    });
    const payments = [{ participantId: sam, amount: cents(1200) }] as unknown as Split["payments"];
    const before = computeShares({ receipt: receipt({ by: "even", units: [[sam]] }), participants: people, payments });
    const after = computeShares({ receipt: receipt({ by: "even", units: [[sam, priya]] }), participants: people, payments });
    expect([[...paidMarks(before, payments)], [...paidMarks(after, payments)]]).toEqual([[["sam", "paid"]], [["sam", "over"]]]);
  });
});
