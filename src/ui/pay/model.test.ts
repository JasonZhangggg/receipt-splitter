import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { computeShares, type Shares } from "../../core/shares";
import { adjustmentId, itemId, participantId, type ItemSplit, type Split } from "../../core/split";
import { foldedRows, hostCollected, justPaid, payState, paymentStatus, paymentSections, pickedRow, shareStatus, statusWords } from "./model";

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
  const words = (person: string, viewer: string, paid = payments) => statusWords(shareStatus(shares, paid, participantId(person), participantId(viewer)), "USD");

  test("says nothing before a payment, then what was paid and how far off it is", () => {
    expect([words("kim", "jason"), words("ana", "jason"), words("priya", "jason"), words("lee", "lee"), words("sam", "priya")]).toEqual([
      null,
      null,
      "Paid $9.31",
      "Paid $40.00 · $13.47 still owed",
      "Paid $106.94 · $53.47 too much",
    ]);
  });

  test("writes the amounts in the Split's currency", () => {
    expect(statusWords(shareStatus(shares, payments, participantId("priya"), participantId("jason")), "EUR")).toBe("Paid €9.31");
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
    expect(paymentStatus({ participants, payments, currency: "USD" }, mixed, jason).rows.map(({ name, share, state, words }) => [name, share, state, words])).toEqual([
      ["Jason", 1000, "host", "You get paid"],
      ["Sam", 2600, "short", "Paid $22.00 · $4.00 still owed"],
      ["Priya", 1400, "settled", "Paid $14.00"],
      ["Kim", 900, "unpaid", "Not paid"],
      ["Lee", 500, "over", "Paid $8.00 · $3.00 too much"],
      ["Zoe", 0, "nothing", "Nothing to pay"],
    ]);
  });

  test("words settled, short and over exactly as the line under the share does", () => {
    const rows = paymentStatus({ participants, payments, currency: "USD" }, mixed, jason).rows;
    const line = (person: (typeof people)[number]) => statusWords(shareStatus(mixed, payments, person, jason), "USD");
    expect([sam, priya, lee].map((id) => rows.find((row) => row.id === id)?.words)).toEqual([sam, priya, lee].map(line));
  });

  test("counts the people paid in full (settled or over, not short) out of the people who owe or paid, never the Host, and a $0 share owes nobody", () => {
    const status = paymentStatus({ participants, payments, currency: "USD" }, mixed, jason);
    expect([status.paid, status.owing, status.summary]).toEqual([2, 4, "2 of 4 paid you"]);
  });

  test("words the summary for everyone but the Host without 'you', and the Host row as theirs", () => {
    const status = paymentStatus({ participants, payments, currency: "USD" }, mixed, sam);
    expect([status.summary, status.rows[0].words]).toEqual(["2 of 4 paid", "Gets paid"]);
  });

  test("has no summary while nobody owes anything", () => {
    expect(paymentStatus({ participants, payments: paying(), currency: "USD" }, shares([1000, 0, 0, 0, 0, 0]), jason).summary).toBeNull();
  });

  test("reads a payer whose share fell to $0 as paid too much, and counts them paid", () => {
    const status = paymentStatus({ participants, payments: paying([zoe, 500]), currency: "USD" }, mixed, jason);
    expect([status.rows[5].words, status.paid, status.owing]).toEqual(["Paid $5.00 · $5.00 too much", 1, 5]);
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
      const split = { receipt: receipt(rice), participants: three, payments: recorded, currency: "USD" as const };
      return paymentStatus(split, computeShares(split), jason).rows[1].words;
    };
    expect([wordsFor({ by: "even", units: [[sam]] }), wordsFor({ by: "even", units: [[sam, priya]] })]).toEqual(["Paid $12.00", "Paid $12.00 · $6.00 too much"]);
  });
});

describe("pickedRow", () => {
  const rows = ["jason", "sam", "priya"].map((id) => ({ id: participantId(id), name: id })) as unknown as Parameters<typeof pickedRow>[0];
  const [jason, sam, priya] = rows.map(({ id }) => id);

  test("shows the person tapped, else the viewer's own row, else the first row", () => {
    expect([pickedRow(rows, sam, priya), pickedRow(rows, null, priya), pickedRow(rows, null, null)].map((row) => row.id)).toEqual([sam, priya, jason]);
  });

  test("falls back to the viewer when the person tapped was removed from the Split", () => {
    expect(pickedRow(rows.filter(({ id }) => id !== sam), sam, priya).id).toBe(priya);
  });
});

describe("paymentStatus on a Split with no Items", () => {
  test("shows everyone at $0.00 and nobody owing, with a tip on the bill", () => {
    const split = {
      receipt: { items: [], adjustments: [{ id: adjustmentId("tip"), kind: "tip" as const, name: "Tip", amount: cents(200) }], subtotal: cents(0), total: cents(200) },
      participants: [
        { id: participantId("ann"), name: "Ann" },
        { id: participantId("bob"), name: "Bob" },
      ],
      payments: [],
    } as unknown as Split;
    const status = paymentStatus(split, computeShares(split), participantId("ann"));
    expect([status.rows.map(({ share, state }) => [share, state]), status.owing, status.summary]).toEqual([[[0, "host"], [0, "nothing"]], 0, null]);
  });
});

describe("hostCollected", () => {
  const row = (id: string, share: number, isHost = false) => ({ id: participantId(id), name: id, isHost, share: cents(share), state: "unpaid" as const, words: "" });
  const rows = [row("jason", 6335, true), row("sam", 3000), row("priya", 2828), row("lee", 0)];

  test("adds what friends paid the Host out of what friends owe, leaving the Host's own part out", () => {
    const payments = [{ participantId: participantId("sam"), amount: cents(3000) }, { participantId: participantId("priya"), amount: cents(1000) }] as unknown as Split["payments"];
    expect(hostCollected(rows, payments)).toEqual({ paid: 4000, owed: 5828 });
  });

  test("counts an overpayment as paid in full and nothing paid as $0.00", () => {
    const over = [{ participantId: participantId("sam"), amount: cents(3500) }] as unknown as Split["payments"];
    expect(hostCollected(rows, over)).toEqual({ paid: 3500, owed: 5828 });
    expect(hostCollected(rows, [])).toEqual({ paid: 0, owed: 5828 });
  });
});

describe("foldedRows", () => {
  const rows = [
    { id: participantId("jason"), state: "host" as const },
    { id: participantId("sam"), state: "unpaid" as const },
    { id: participantId("priya"), state: "nothing" as const },
    { id: participantId("lee"), state: "nothing" as const },
  ];

  test("folds everyone who owes $0.00 but the Host and the viewer", () => {
    expect(foldedRows(rows, participantId("sam")).quiet.map(({ id }) => id)).toEqual(["priya", "lee"]);
    expect(foldedRows(rows, participantId("sam")).shown.map(({ id }) => id)).toEqual(["jason", "sam"]);
    expect(foldedRows(rows, participantId("priya")).shown.map(({ id }) => id)).toEqual(["jason", "sam", "priya"]);
  });
});

describe("paymentSections", () => {
  const rows = [
    { id: participantId("jason"), state: "host" as const, share: cents(0) },
    { id: participantId("sam"), state: "settled" as const, share: cents(1420) },
    { id: participantId("priya"), state: "unpaid" as const, share: cents(1400) },
    { id: participantId("lee"), state: "over" as const, share: cents(1000) },
    { id: participantId("ana"), state: "short" as const, share: cents(2200) },
    { id: participantId("kim"), state: "unpaid" as const, share: cents(600) },
  ];
  const payments = [
    { participantId: participantId("sam"), amount: cents(1420) },
    { participantId: participantId("lee"), amount: cents(1600) },
    { participantId: participantId("ana"), amount: cents(800) },
  ] as unknown as Split["payments"];
  const read = (viewer: string | null) =>
    paymentSections(rows, payments, viewer === null ? null : participantId(viewer)).map(({ kind, rows: part, amount }) => ({ kind, ids: part.map(({ id }) => id), amount }));

  test("puts everyone not paid or paid short first with what is left, then the Host and everyone paid with what came in", () => {
    expect(read(null)).toEqual([
      { kind: "owed", ids: ["priya", "ana", "kim"], amount: 3400 },
      { kind: "paid", ids: ["jason", "sam", "lee"], amount: 3020 },
    ]);
  });

  test("puts the viewer first within their own part", () => {
    expect(read("kim").map(({ ids }) => ids)).toEqual([["kim", "priya", "ana"], ["jason", "sam", "lee"]]);
    expect(read("sam").map(({ ids }) => ids)).toEqual([["priya", "ana", "kim"], ["sam", "jason", "lee"]]);
  });

  test("leaves out a part with nobody in it", () => {
    expect(paymentSections(rows.slice(0, 2), payments, null).map(({ kind }) => kind)).toEqual(["paid"]);
  });
});

describe("justPaid", () => {
  test("is the whole Share before any payment and only the rest after a short one", () => {
    expect([justPaid(cents(3020), null), justPaid(cents(3020), cents(1420))]).toEqual([3020, 1600]);
  });
});
