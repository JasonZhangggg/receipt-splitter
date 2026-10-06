import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { MAX_CENTS, cents, price } from "./money";
import {
  MAX_CHANGE_BYTES,
  MAX_PARTICIPANT_NAME_LENGTH,
  MAX_ROW_NAME_LENGTH,
  RECENT_CHANGES_LIMIT,
  applyOperation,
  checkSplit,
  claimersOf,
  createSplit,
  type AdjustmentPatch,
  type Auth,
  type ItemPatch,
  type NewSplit,
  type Operation,
  type Rejected,
} from "./operations";
import { parseOperation, parseSplit } from "./parse";
import { computeShares } from "./shares";
import {
  SPLIT_BYTE_BUDGET,
  adjustmentId,
  deviceId,
  itemId,
  participantId,
  serializedBytes,
  RECEIPT_LEVEL_KINDS,
  type Item,
  type ParticipantId,
  type Receipt,
  type Split,
} from "./split";
import { mintedId } from "./test-ids";
import { runTotalCheck } from "./total-check";
import { bucketOne, bucketTwo, eachOf, jason, priya, topgolf } from "./topgolf.fixture";

const ann = participantId("ann");
const bob = participantId("bob");
const cat = participantId("cat");
const dan = participantId("dan");
const pasta = itemId("pasta");
const fries = itemId("fries");
const pitcher = itemId("pitcher");
const anyone: Auth = { creator: false };

const minted = mintedId("q7Xv0Lr9_aZ-3mKp");

const dinner: Receipt = {
  items: [
    { id: pasta, name: "Pasta", price: price(1400) },
    { id: fries, name: "Fries", price: price(800) },
    { id: pitcher, name: "Pitcher", price: price(3000) },
  ],
  adjustments: [],
  subtotal: cents(5200),
  total: cents(5200),
};

function created(receipt: Receipt = dinner): Split {
  const result = createSplit({
    id: minted,
    receipt,
    participants: [{ id: ann, name: "Ann" }],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  });
  if (!result.ok) throw new Error(`createSplit rejected: ${JSON.stringify(result.rejection)}`);
  return result.split;
}

function accepted(result: { readonly ok: true; readonly split: Split } | Rejected): Split {
  if (!result.ok) throw new Error(`rejected: ${JSON.stringify(result.rejection)}`);
  return result.split;
}

function apply(split: Split, ...ops: Operation[]): Split {
  return ops.reduce((current, op) => accepted(applyOperation(current, op, anyone)), split);
}

function reasonFor(split: Split, op: Operation, auth: Auth = anyone): string {
  const result = applyOperation(split, op, auth);
  return result.ok ? "accepted" : result.rejection.reason;
}

function withBobAndCat(): Split {
  return apply(
    created(),
    { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } },
    { by: ann, type: "addParticipant", participant: { id: cat, name: "Cat" } },
  );
}

function shareOf(split: Split, who: string) {
  return computeShares(split).shares.find((share) => share.participantId === who);
}

function priceEdit(by: ParticipantId, id: typeof fries, from: number, to: number): Operation {
  return {
    by,
    type: "editReceipt",
    items: [{ type: "edit", itemId: id, price: price(to) }],
    subtotalDelta: cents(to - from),
    totalDelta: cents(to - from),
  };
}

describe("createSplit", () => {
  test("starts a Split with the Host, every Item Unclaimed, and no changes", () => {
    expect(created()).toEqual({
      schemaVersion: 4,
      id: "q7Xv0Lr9_aZ-3mKp",
      currency: "USD",
      receipt: {
        items: [
          { id: "pasta", name: "Pasta", price: 1400, split: { by: "even", units: [[]] } },
          { id: "fries", name: "Fries", price: 800, split: { by: "even", units: [[]] } },
          { id: "pitcher", name: "Pitcher", price: 3000, split: { by: "even", units: [[]] } },
        ],
        adjustments: [],
        subtotal: 5200,
        total: 5200,
      },
      original: {
        items: [
          { id: "pasta", name: "Pasta", price: 1400 },
          { id: "fries", name: "Fries", price: 800 },
          { id: "pitcher", name: "Pitcher", price: 3000 },
        ],
        adjustments: [],
        subtotal: 5200,
        total: 5200,
      },
      participants: [{ id: "ann", name: "Ann" }],
      picks: [],
      payments: [],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
      revision: 0,
      recentChanges: [],
    });
  });

  test("starts with every name the Host typed, after the Host, and no one picked, so the Host picks a name too", () => {
    const result = createSplit({
      id: minted,
      receipt: dinner,
      participants: [
        { id: ann, name: "Me" },
        { id: bob, name: "Bob" },
        { id: cat, name: "Cat" },
      ],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });

    expect(accepted(result)).toMatchObject({
      participants: [
        { id: "ann", name: "Me" },
        { id: "bob", name: "Bob" },
        { id: "cat", name: "Cat" },
      ],
      picks: [],
      revision: 0,
      recentChanges: [],
    });
  });

  test("refuses two Participants with one id", () => {
    const result = createSplit({
      id: minted,
      receipt: dinner,
      participants: [
        { id: ann, name: "Me" },
        { id: ann, name: "Ann" },
      ],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });

    expect(result).toEqual({ ok: false, rejection: { reason: "duplicateId" } });
  });

  test("creates a Split whose Receipt fails the Total check, and the check still reports the gap", () => {
    const result = createSplit({
      id: minted,
      receipt: { ...dinner, subtotal: cents(5300), total: cents(5300) },
      participants: [{ id: ann, name: "Ann" }],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });

    expect(result.ok && [result.split.receipt.total, runTotalCheck(result.split.receipt)]).toEqual([
      5300,
      { ok: false, subtotalGap: 100, totalGap: 0, itemIds: [], adjustmentIds: [], suspects: [] },
    ]);
  });

  test("refuses a total above MAX_CENTS, so Share math never leaves the exact range", () => {
    const big = cents(MAX_CENTS + 1);
    const result = createSplit({
      id: minted,
      receipt: { items: [{ id: pitcher, name: "Pitcher", price: price(big) }], adjustments: [], subtotal: big, total: big },
      participants: [{ id: ann, name: "Ann" }],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });

    expect(result).toEqual({ ok: false, rejection: { reason: "amountOutOfRange" } });
  });

  test("stores Payment handles without the leading @ or $ that people type", () => {
    const result = createSplit({
      id: minted,
      receipt: dinner,
      participants: [{ id: ann, name: "Ann" }],
      paymentHandles: [
        { service: "venmo", handle: "@ann-host" },
        { service: "cashApp", handle: "$annpays" },
      ],
    });

    expect(accepted(result).paymentHandles).toEqual([
      { service: "venmo", handle: "ann-host" },
      { service: "cashApp", handle: "annpays" },
    ]);
  });

  test("creates a Split with no way to pay, which loads back as stored", () => {
    const split = accepted(createSplit({ id: minted, receipt: dinner, participants: [{ id: ann, name: "Ann" }], paymentHandles: [] }));

    expect(split.paymentHandles).toEqual([]);
    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
  });

  test("takes any PayPal or Zelle text, and holds Venmo and Cash App to their own rules", () => {
    const reason = (paymentHandles: NewSplit["paymentHandles"]) => {
      const result = createSplit({ id: minted, receipt: dinner, participants: [{ id: ann, name: "Ann" }], paymentHandles });
      return result.ok ? result.split.paymentHandles : result.rejection.reason;
    };

    expect({
      paypal: reason([{ service: "paypal", handle: "Ann Lee / tips" }]),
      zelle: reason([{ service: "zelle", handle: "text me" }]),
      hidden: reason([{ service: "paypal", handle: "ann‮lee" }]),
      venmo: reason([{ service: "venmo", handle: "test" }]),
      cashApp: reason([{ service: "cashApp", handle: "$1234" }]),
    }).toEqual({
      paypal: [{ service: "paypal", handle: "Ann Lee / tips" }],
      zelle: [{ service: "zelle", handle: "text me" }],
      hidden: "badHandle",
      venmo: "badHandle",
      cashApp: "badHandle",
    });
  });
});

describe("PayPal and Zelle handles with edge whitespace", () => {
  test("refuse a handle that starts or ends with a space, tab or newline, and keep inner spaces", () => {
    const created = (handle: string, service: "paypal" | "zelle") => createSplit({ id: minted, receipt: dinner, participants: [{ id: ann, name: "Ann" }], paymentHandles: [{ service, handle }] });
    const outcome = (handle: string, service: "paypal" | "zelle") => {
      const result = created(handle, service);
      return result.ok ? "ok" : result.rejection.reason;
    };

    expect([outcome(" ann", "paypal"), outcome("ann ", "zelle"), outcome("\tann", "paypal"), outcome("ann\n", "zelle"), outcome("a nn", "paypal")]).toEqual(["badHandle", "badHandle", "badHandle", "badHandle", "ok"]);
  });
});

describe("applyOperation", () => {
  test("adds a Participant and records the change", () => {
    const result = applyOperation(created(), { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } }, anyone);

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      split: {
        participants: [
          { id: "ann", name: "Ann" },
          { id: "bob", name: "Bob" },
        ],
        revision: 1,
        recentChanges: [
          {
            revision: 1,
            by: "ann",
            undoes: null,
            undoneBy: null,
            writes: [{ kind: "participant", id: "bob", added: { index: 1, name: "Bob" } }],
          },
        ],
      },
    });
  });

  test("a Participant can add themselves", () => {
    const joined = apply(withBobAndCat(), { by: dan, type: "addParticipant", participant: { id: dan, name: "Dan" } });

    expect(joined.recentChanges.at(-1)).toMatchObject({ by: "dan", writes: [{ kind: "participant", id: "dan" }] });
  });

  test("a Claim changes Shares but stays out of the recent changes, and a repeat Claim changes nothing", () => {
    const split = withBobAndCat();

    const claimed = apply(split, { by: bob, type: "claim", itemId: fries, participantId: bob });

    expect(shareOf(claimed, "bob")).toMatchObject({ share: 800 });
    expect(claimed.revision).toBe(split.revision + 1);
    expect(claimed.recentChanges).toEqual(split.recentChanges);
    expect(applyOperation(claimed, { by: cat, type: "claim", itemId: fries, participantId: bob }, anyone)).toEqual({
      ok: true,
      split: claimed,
      changed: false,
    });
  });

  test("orders claimers by code unit, so an uppercase id sorts before a lowercase one", () => {
    const zed = participantId("Zed");
    const split = apply(withBobAndCat(), { by: null, type: "addParticipant", participant: { id: zed, name: "Zed" } });

    const claimed = apply(
      split,
      { by: null, type: "claim", itemId: pasta, participantId: cat },
      { by: null, type: "claim", itemId: pasta, participantId: bob },
      { by: null, type: "claim", itemId: pasta, participantId: zed },
    );

    expect(claimed.receipt.items[0].split.units[0]).toEqual(["Zed", "bob", "cat"]);
    expect(computeShares(claimed).shares.map(({ participantId, share }) => [participantId, share])).toEqual([
      ["ann", 0],
      ["bob", 466],
      ["cat", 467],
      ["Zed", 467],
    ]);
  });

  test("undoes a price edit, restoring the price and the totals and marking the edit undone", () => {
    const split = withBobAndCat();
    const edited = apply(split, priceEdit(bob, fries, 800, 600));

    expect(edited.receipt.items[1]).toEqual({ id: "fries", name: "Fries", price: 600, split: { by: "even", units: [[]] } });
    expect(edited.receipt.total).toBe(5000);

    const undone = apply(edited, { by: cat, type: "undo", revision: 3 });

    expect(undone.receipt).toEqual(split.receipt);
    expect(undone.revision).toBe(4);
    expect(undone.recentChanges.slice(-2)).toEqual([
      {
        revision: 3,
        by: "bob",
        undoes: null,
        undoneBy: 4,
        writes: [
          { kind: "item", id: "fries", edit: { price: [800, 600] } },
          { kind: "totals", subtotalDelta: -200, totalDelta: -200 },
        ],
      },
      {
        revision: 4,
        by: "cat",
        undoes: 3,
        undoneBy: null,
        writes: [
          { kind: "totals", subtotalDelta: 200, totalDelta: 200 },
          { kind: "item", id: "fries", edit: { price: [600, 800] } },
        ],
      },
    ]);
  });
});

describe("picking a name", () => {
  const phone = deviceId("phone-one");
  const laptop = deviceId("laptop-two");
  const pick = (participantId: ParticipantId, device = phone, takeOver = false): Operation => ({ by: participantId, type: "pick", participantId, device, takeOver });

  test("holds each picked name with its device in id order, and records nothing", () => {
    const split = apply(withBobAndCat(), pick(cat, laptop), pick(bob));

    expect([split.picks, split.revision, split.recentChanges.length]).toEqual([
      [
        { participantId: "bob", device: "phone-one" },
        { participantId: "cat", device: "laptop-two" },
      ],
      4,
      2,
    ]);
  });

  test("a second device's pick of a taken name is refused as namePicked, the same device again changes nothing, and an unknown Participant is refused", () => {
    const picked = apply(withBobAndCat(), pick(bob));

    expect(reasonFor(picked, pick(bob, laptop))).toBe("namePicked");
    expect(applyOperation(picked, pick(bob), anyone)).toEqual({ ok: true, split: picked, changed: false });
    expect(reasonFor(picked, pick(dan))).toBe("unknownParticipant");
  });

  test("That's me moves a picked name to the second device, so the first holds no name, and records nothing", () => {
    const picked = apply(withBobAndCat(), pick(bob));

    const taken = apply(picked, pick(bob, laptop, true));

    expect(taken.picks).toEqual([{ participantId: "bob", device: "laptop-two" }]);
    expect(taken.recentChanges).toEqual(picked.recentChanges);
  });

  test("a vandal's unclaims leave no recent change, and Bob claims his Items again", () => {
    const claim = (itemId: typeof fries, claimed: boolean): Operation => ({ by: null, type: claimed ? "claim" : "unclaim", itemId, participantId: bob });
    const start = apply(withBobAndCat(), pick(bob), claim(fries, true), claim(pasta, true));
    const vandalized = apply(start, claim(fries, false), claim(pasta, false));
    const recovered = apply(vandalized, claim(fries, true), claim(pasta, true));

    expect(vandalized.recentChanges).toEqual(start.recentChanges);
    expect(recovered.receipt).toEqual(start.receipt);
  });

  test("a pick or Payment from a page that still sends the browser's raw device id holds the name under this Split's id for that browser", () => {
    const raw = deviceId("AbCdEfGh01234567");
    const perSplit = deviceId("nZstfGZMUIJIL7ugC8HRh8");
    const split = apply(withBobAndCat(), pick(bob, raw));

    expect(split.picks).toEqual([{ participantId: "bob", device: "nZstfGZMUIJIL7ugC8HRh8" }]);
    expect(applyOperation(split, pick(bob, perSplit), anyone)).toEqual({ ok: true, split, changed: false });
    expect(reasonFor(split, { by: bob, type: "recordPayment", participantId: bob, device: raw, amount: cents(100) })).toBe("accepted");
    expect(reasonFor(split, { by: bob, type: "recordPayment", participantId: bob, device: deviceId("ZZZZZZZZ01234567"), amount: cents(100) })).toBe("payerOnly");
  });

  test("keeps a picked Participant from being taken out by undoing their add", () => {
    const split = apply(withBobAndCat(), pick(bob));

    expect(reasonFor(split, { by: ann, type: "undo", revision: 1 })).toBe("participantInUse");
    expect(reasonFor(split, { by: ann, type: "undo", revision: 2 })).toBe("accepted");
  });
});

describe("Payments", () => {
  const bobsPhone = deviceId("phone-bob");
  const catsLaptop = deviceId("laptop-cat");
  const pay = (participantId: ParticipantId, amount: number, device = bobsPhone): Operation => ({
    by: participantId,
    type: "recordPayment",
    participantId,
    device,
    amount: cents(amount),
  });

  function claimedDinner(): Split {
    return apply(
      withBobAndCat(),
      { by: bob, type: "pick", participantId: bob, device: bobsPhone, takeOver: false },
      { by: cat, type: "pick", participantId: cat, device: catsLaptop, takeOver: false },
      { by: ann, type: "claim", itemId: pitcher, participantId: ann },
      { by: bob, type: "claim", itemId: pitcher, participantId: bob },
      { by: cat, type: "claim", itemId: pitcher, participantId: cat },
      { by: bob, type: "claim", itemId: fries, participantId: bob },
      { by: cat, type: "claim", itemId: pasta, participantId: cat },
    );
  }

  test("a Payment followed by a price edit reports what each Participant who paid now owes or gets back", () => {
    const paid = apply(
      claimedDinner(),
      pay(bob, 1800),
      pay(cat, 2400, catsLaptop),
    );

    expect(computeShares(paid).shares).toEqual([
      { participantId: "ann", share: 1000 },
      { participantId: "bob", share: 1800, paid: 1800, owed: 0 },
      { participantId: "cat", share: 2400, paid: 2400, owed: 0 },
    ]);

    const edited = apply(paid, {
      by: ann,
      type: "editReceipt",
      items: [
        { type: "edit", itemId: fries, price: price(600) },
        { type: "edit", itemId: pasta, price: price(1650) },
      ],
      subtotalDelta: cents(50),
      totalDelta: cents(50),
    });

    expect(computeShares(edited).shares).toEqual([
      { participantId: "ann", share: 1000 },
      { participantId: "bob", share: 1600, paid: 1800, owed: -200 },
      { participantId: "cat", share: 2650, paid: 2400, owed: 250 },
    ]);
  });

  test("a Payment from the payer's device lands, and one from another device is refused", () => {
    const paid = apply(claimedDinner(), pay(bob, 1800));

    expect(paid.payments).toEqual([{ participantId: "bob", amount: 1800 }]);
    expect(reasonFor(claimedDinner(), pay(bob, 1800, catsLaptop))).toBe("payerOnly");
  });

  test("a clearPayment from another device is refused and the Payment stays, and the payer's own clears it", () => {
    const paid = apply(claimedDinner(), pay(bob, 1800));
    const clear = (device: typeof bobsPhone): Operation => ({ by: bob, type: "clearPayment", participantId: bob, device });

    expect(reasonFor(paid, clear(catsLaptop))).toBe("payerOnly");
    expect(apply(paid, clear(bobsPhone)).payments).toEqual([]);
  });

  test("a Payment for a name nobody picked is refused, and the Host cannot record one", () => {
    const unpicked = apply(withBobAndCat(), { by: bob, type: "pick", participantId: bob, device: bobsPhone, takeOver: false });

    expect(reasonFor(unpicked, pay(cat, 2400))).toBe("payerOnly");
    expect(reasonFor(claimedDinner(), pay(ann, 1000))).toBe("host");
  });

  test("History cannot undo a Payment", () => {
    const paid = apply(claimedDinner(), pay(bob, 1800));

    expect(reasonFor(paid, { by: bob, type: "undo", revision: paid.revision })).toBe("paymentNotRevertible");
  });
});

describe("Payment handles", () => {
  const redirect: Operation = { by: bob, type: "setPaymentHandles", handles: [{ service: "venmo", handle: "bob-steals" }] };

  test("a change without creator auth is rejected, and with it the change lands outside the recent changes", () => {
    const split = withBobAndCat();

    expect(applyOperation(split, redirect, { creator: false })).toEqual({ ok: false, rejection: { reason: "creatorRequired" } });

    const changed = accepted(applyOperation(split, redirect, { creator: true }));
    expect(changed.paymentHandles).toEqual([{ service: "venmo", handle: "bob-steals" }]);
    expect(changed.recentChanges).toEqual(split.recentChanges);
  });

  test("forged JSON that claims creator proof is malformed, and without the forged field the change is still refused", () => {
    const wire = '{"type":"setPaymentHandles","by":"bob","handles":[{"service":"venmo","handle":"bob-steals"}]';

    expect(parseOperation(JSON.parse(`${wire},"creatorProof":{"splitId":"s1"}}`))).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "creatorProof" },
    });
    expect(parseOperation(JSON.parse(`${wire},"creator":true}`))).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "creator" },
    });

    const parsed = parseOperation(JSON.parse(`${wire}}`));
    if (!parsed.ok) throw new Error(`parse rejected: ${JSON.stringify(parsed.rejection)}`);
    expect(applyOperation(withBobAndCat(), parsed.op, anyone)).toEqual({ ok: false, rejection: { reason: "creatorRequired" } });
  });

  test("a Zelle handle with a bidi override or a zero-width character is rejected", () => {
    const zelle = (handle: string): Operation => ({ by: null, type: "setPaymentHandles", handles: [{ service: "zelle", handle }] });

    expect(reasonFor(withBobAndCat(), zelle("ann\u202Emoc.elpmaxe@x.com"), { creator: true })).toBe("badHandle");
    expect(reasonFor(withBobAndCat(), zelle("ann\u200B@example.com"), { creator: true })).toBe("badHandle");
    expect(reasonFor(withBobAndCat(), zelle("ann@example.com"), { creator: true })).toBe("accepted");
  });

  test("a handle that could break out of a payment link is rejected even for the creator", () => {
    const split = withBobAndCat();
    const link = (handle: string): Operation => ({ by: null, type: "setPaymentHandles", handles: [{ service: "venmo", handle }] });

    expect(reasonFor(split, link("ann/../../evil"), { creator: true })).toBe("badHandle");
    expect(accepted(applyOperation(split, link("@ann-host2"), { creator: true })).paymentHandles).toEqual([
      { service: "venmo", handle: "ann-host2" },
    ]);
  });
});

describe("editing the Receipt", () => {
  test("a price edit that leaves the Items off the printed subtotal lands, and the subtotal and total stay as printed", () => {
    const split = apply(withBobAndCat(), { by: bob, type: "editReceipt", items: [{ type: "edit", itemId: fries, price: price(600) }] });

    expect(split.receipt.items.map(({ price }) => price)).toEqual([1400, 600, 3000]);
    expect([split.receipt.subtotal, split.receipt.total]).toEqual([5200, 5200]);
    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
  });

  test("two people editing different Items from the same view both land", () => {
    const split = withBobAndCat();

    const both = apply(split, priceEdit(bob, fries, 800, 600), priceEdit(cat, pasta, 1400, 1500));

    expect(both.receipt.items.map(({ price }) => price)).toEqual([1500, 600, 3000]);
    expect(both.receipt.total).toBe(5100);
  });

  test("a tip and the total change land together as one change", () => {
    const split = apply(withBobAndCat(), {
      by: ann,
      type: "editReceipt",
      adjustments: [{ type: "add", adjustment: { id: adjustmentId("tip"), kind: "tip", name: "Tip 20%", amount: cents(1040) }, index: 0 }],
      totalDelta: cents(1040),
    });

    expect(split.receipt.adjustments).toEqual([{ id: "tip", kind: "tip", name: "Tip 20%", amount: 1040 }]);
    expect(split.receipt.total).toBe(6240);
    expect(split.recentChanges.at(-1)?.writes).toEqual([
      { kind: "adjustment", id: "tip", added: { index: 0, kind: "tip", name: "Tip 20%", amount: 1040 } },
      { kind: "totals", subtotalDelta: 0, totalDelta: 1040 },
    ]);
  });

  test("undoing a deleted Item puts it back at its row with its Claims", () => {
    const claimed = apply(
      withBobAndCat(),
      { by: bob, type: "claim", itemId: fries, participantId: bob },
      { by: cat, type: "claim", itemId: fries, participantId: cat },
    );
    const deleted = apply(claimed, {
      by: ann,
      type: "editReceipt",
      items: [{ type: "delete", itemId: fries }],
      subtotalDelta: cents(-800),
      totalDelta: cents(-800),
    });

    expect(deleted.receipt.items.map(({ id }) => id)).toEqual(["pasta", "pitcher"]);

    const restored = apply(deleted, { by: bob, type: "undo", revision: deleted.revision });

    expect(restored.receipt).toEqual(claimed.receipt);
    expect(restored.receipt.items[1]).toEqual({ id: "fries", name: "Fries", price: 800, split: { by: "even", units: [["bob", "cat"]] } });
  });

  test("a detail edit lands as a receipt change, and undoing it restores the Item without one", () => {
    const split = withBobAndCat();
    const detailed = apply(split, { by: bob, type: "editReceipt", items: [{ type: "edit", itemId: fries, detail: "Large, $2.00 off" }] });

    expect(detailed.receipt.items[1]).toEqual({ id: "fries", name: "Fries", price: 800, detail: "Large, $2.00 off", split: { by: "even", units: [[]] } });
    expect(detailed.recentChanges.at(-1)?.writes).toEqual([{ kind: "item", id: "fries", edit: { detail: ["", "Large, $2.00 off"] } }]);
    expect(parseSplit(JSON.parse(JSON.stringify(detailed)))).toEqual({ ok: true, split: detailed });

    const undone = apply(detailed, { by: cat, type: "undo", revision: detailed.revision });

    expect(undone.receipt).toEqual(split.receipt);
    expect(undone.receipt.items[1]).toEqual({ id: "fries", name: "Fries", price: 800, split: { by: "even", units: [[]] } });

    const cleared = apply(detailed, { by: cat, type: "editReceipt", items: [{ type: "edit", itemId: fries, detail: "" }] });

    expect(cleared.receipt).toEqual(split.receipt);
    expect(reasonFor(split, { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: fries, detail: "x".repeat(121) }] })).toBe("badName");
    expect(reasonFor(split, { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: fries, detail: "Large\nfries" }] })).toBe("badName");
  });

  test("an edit that names no field is rejected, and one that changes nothing is accepted unchanged", () => {
    const split = withBobAndCat();

    expect(reasonFor(split, { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: fries }] })).toBe("emptyEdit");
    expect(reasonFor(split, { by: ann, type: "editReceipt" })).toBe("emptyEdit");
    expect(applyOperation(split, { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: fries, price: price(800) }] }, anyone)).toEqual({
      ok: true,
      split,
      changed: false,
    });
  });
});

describe("Item split modes", () => {
  const edit = (patch: Omit<Extract<ItemPatch, { type: "edit" }>, "type" | "itemId">, itemId = pitcher): Operation => ({
    by: bob,
    type: "editReceipt",
    items: [{ type: "edit", itemId, ...patch }],
  });
  const claim = (itemId: typeof fries, participantId: ParticipantId): Operation => ({ by: participantId, type: "claim", itemId, participantId });

  test("switching to shares and setting 2:1 is one recorded change, and Undo puts back the even split while keeping a claim made since", () => {
    const claimed = apply(withBobAndCat(), claim(pitcher, ann), claim(pitcher, bob));
    const shaped = apply(claimed, edit({ by: "shares", values: [{ participantId: ann, value: 2 }] }));

    expect(shaped.receipt.items[2].split).toEqual({ by: "shares", units: [[["ann", 2], ["bob", 1]]] });
    expect(shaped.recentChanges.at(-1)?.writes).toEqual([
      { kind: "item", id: "pitcher", edit: { split: [{ by: "even", units: [["ann", "bob"]] }, { by: "shares", units: [[["ann", 2], ["bob", 1]]] }] } },
    ]);
    expect(computeShares(shaped).shares.map(({ share }) => share)).toEqual([2000, 1000, 0]);

    const undone = apply(shaped, claim(pitcher, cat), { by: cat, type: "undo", revision: shaped.revision });

    expect(undone.receipt.items[2].split).toEqual({ by: "even", units: [["ann", "bob", "cat"]] });
  });

  test("an amount split may leave cents Unclaimed, but one over the price is refused, and so is a price edit under it", () => {
    const claimed = apply(withBobAndCat(), claim(fries, bob), claim(fries, cat));
    const amounts = apply(claimed, edit({ by: "amount", values: [{ participantId: bob, value: 500 }, { participantId: cat, value: 200 }] }, fries));

    expect(computeShares(amounts).unclaimed).toEqual({ itemIds: ["pasta", "fries", "pitcher"], total: 1400 + 100 + 3000 });
    expect(reasonFor(amounts, edit({ values: [{ participantId: cat, value: 301 }] }, fries))).toBe("amountOverPrice");
    expect(reasonFor(amounts, edit({ price: price(600) }, fries))).toBe("amountOverPrice");
  });

  test("amounts that add up to the price exactly are accepted, and leave nothing Unclaimed on that line", () => {
    const claimed = apply(withBobAndCat(), claim(fries, bob), claim(fries, cat));
    const exact = apply(claimed, edit({ by: "amount", values: [{ participantId: bob, value: 500 }, { participantId: cat, value: 300 }] }, fries));

    expect(computeShares(exact).unclaimed.itemIds).toEqual(["pasta", "pitcher"]);
  });

  test("a value for someone who did not claim the line, or a share count of 0, is refused", () => {
    const claimed = apply(withBobAndCat(), claim(fries, bob));

    expect(reasonFor(claimed, edit({ by: "shares", values: [{ participantId: cat, value: 2 }] }, fries))).toBe("conflict");
    expect(reasonFor(claimed, edit({ by: "shares", values: [{ participantId: bob, value: 0 }] }, fries))).toBe("amountOutOfRange");
    expect(reasonFor(claimed, edit({ values: [{ participantId: bob, value: 2 }] }, fries))).toBe("conflict");
  });

  test("a share count of 99 is accepted and 100 is refused", () => {
    const claimed = apply(withBobAndCat(), claim(fries, bob), claim(fries, cat), edit({ by: "shares" }, fries));
    const most = apply(claimed, edit({ values: [{ participantId: bob, value: 99 }] }, fries));

    expect(most.receipt.items.find(({ id }) => id === fries)?.split).toEqual({ by: "shares", units: [[[bob, 99], [cat, 1]]] });
    expect(reasonFor(claimed, edit({ values: [{ participantId: bob, value: 100 }] }, fries))).toBe("amountOutOfRange");
  });

  test("the same mode sent again changes nothing", () => {
    const shaped = apply(withBobAndCat(), edit({ by: "shares" }));

    expect(applyOperation(shaped, edit({ by: "shares" }), anyone)).toEqual({ ok: true, split: shaped, changed: false });
  });

  test("a deleted Item comes back with its split on Undo", () => {
    const shaped = apply(withBobAndCat(), edit({ by: "shares" }, fries), claim(fries, bob));
    const deleted = apply(shaped, { by: ann, type: "editReceipt", items: [{ type: "delete", itemId: fries }] });

    expect(apply(deleted, { by: cat, type: "undo", revision: deleted.revision }).receipt).toEqual(shaped.receipt);
  });

  test("restoring the Receipt puts back each price, keeps the claims, and turns an amount split over the restored price back to even", () => {
    const priced = apply(withBobAndCat(), priceEdit(bob, fries, 800, 1200), claim(fries, bob), claim(pitcher, cat));
    const shaped = apply(priced, edit({ by: "amount", values: [{ participantId: bob, value: 1000 }] }, fries));

    const restored = apply(shaped, { by: cat, type: "restoreReceipt" });

    expect(restored.receipt.items.map(({ price: cents, split }) => [cents, split])).toEqual([
      [1400, { by: "even", units: [[]] }],
      [800, { by: "even", units: [["bob"]] }],
      [3000, { by: "even", units: [["cat"]] }],
    ]);
  });

  test("a change made at a known time carries it", () => {
    const result = applyOperation(withBobAndCat(), edit({ price: price(700) }, fries), anyone, 1_790_000_000_000);

    expect(result.ok && result.split.recentChanges.at(-1)?.at).toBe(1_790_000_000_000);
  });

  test("a Split with modes, picks, and change times survives a round trip through parseSplit", () => {
    const shaped = accepted(applyOperation(apply(withBobAndCat(), claim(fries, bob)), edit({ by: "amount" }, fries), anyone, 5));
    const picked = apply(shaped, { by: bob, type: "pick", participantId: bob, device: deviceId("phone-one"), takeOver: false });

    expect(parseSplit(JSON.parse(JSON.stringify(picked)))).toEqual({ ok: true, split: picked });
  });
});

describe("quantity lines", () => {
  const beer = itemId("beer");
  const beerB = itemId("beer-b");
  const beerC = itemId("beer-c");
  const pub: Receipt = {
    items: [
      { id: fries, name: "Fries", price: price(800) },
      { id: beer, name: "Guinness", price: price(2187), quantity: 3 },
    ],
    adjustments: [],
    subtotal: cents(2987),
    total: cents(2987),
  };
  const atThePub = () =>
    apply(
      created(pub),
      { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } },
      { by: ann, type: "addParticipant", participant: { id: cat, name: "Cat" } },
    );
  const claim = (participantId: ParticipantId, id = beer): Operation => ({ by: participantId, type: "claim", itemId: id, participantId });
  const unclaim = (participantId: ParticipantId, id = beer): Operation => ({ by: participantId, type: "unclaim", itemId: id, participantId });
  const edit = (patch: Omit<Extract<ItemPatch, { type: "edit" }>, "type" | "itemId">, id = beer): Operation => ({ by: bob, type: "editReceipt", items: [{ type: "edit", itemId: id, ...patch }] });
  const splitLine = (ids: readonly [typeof beer, ...(typeof beer)[]], id = beer): Operation => ({ by: bob, type: "editReceipt", items: [{ type: "split", itemId: id, ids }] });
  const shares = (split: Split) => computeShares(split).shares.map(({ share }) => share);
  const rows = (split: Split) => split.receipt.items.map(({ id, price: cents, quantity, split: shape }) => [id, cents, quantity ?? 1, shape]);

  test("a new Split stores the line once with its quantity and one empty claim set", () => {
    expect(atThePub().receipt.items[1]).toEqual({ id: "beer", name: "Guinness", price: 2187, quantity: 3, split: { by: "even", units: [[]] } });
  });

  test("a claim on a quantity line names the whole line", () => {
    const claimed = apply(atThePub(), claim(bob));

    expect(claimed.receipt.items[1]).toEqual({ id: "beer", name: "Guinness", price: 2187, quantity: 3, split: { by: "even", units: [["bob"]] } });
    expect(shares(claimed)).toEqual([0, 2187, 0]);
    expect(computeShares(claimed).unclaimed).toEqual({ itemIds: ["fries"], total: 800 });
    expect(shares(apply(claimed, claim(cat), unclaim(bob)))).toEqual([0, 0, 2187]);
  });

  test("by shares and by amount on a quantity line divide the whole line", () => {
    const claimed = apply(atThePub(), claim(bob), claim(cat));

    const byShares = apply(claimed, edit({ by: "shares", values: [{ participantId: bob, value: 2 }] }));
    expect(byShares.receipt.items[1].split).toEqual({ by: "shares", units: [[["bob", 2], ["cat", 1]]] });
    expect(shares(byShares)).toEqual([0, 1458, 729]);

    const byAmount = apply(claimed, edit({ by: "amount", values: [{ participantId: bob, value: 1500 }, { participantId: cat, value: 687 }] }));
    expect(byAmount.receipt.items[1].split).toEqual({ by: "amount", units: [[["bob", 1500], ["cat", 687]]] });
    expect(shares(byAmount)).toEqual([0, 1500, 687]);
    expect(reasonFor(byAmount, edit({ values: [{ participantId: cat, value: 688 }] }))).toBe("amountOverPrice");

    const evenAgain = apply(byAmount, edit({ by: "even" }));
    expect(evenAgain.receipt.items[1].split).toEqual({ by: "even", units: [["bob", "cat"]] });
  });

  test("Split turns 3x $21.87 into three $7.29 rows that keep the claims, as one recorded change", () => {
    const claimed = apply(atThePub(), claim(bob), claim(cat), edit({ by: "shares", values: [{ participantId: bob, value: 2 }] }));

    const split = apply(claimed, splitLine([beerB, beerC]));

    const owners = { by: "shares", units: [[["bob", 2], ["cat", 1]]] };
    expect(split.receipt.items.slice(1)).toEqual([
      { id: "beer", name: "Guinness", price: 729, split: owners },
      { id: "beer-b", name: "Guinness", price: 729, split: owners },
      { id: "beer-c", name: "Guinness", price: 729, split: owners },
    ]);
    expect(split.recentChanges.at(-1)?.writes).toEqual([{ kind: "split", id: "beer", ids: ["beer-b", "beer-c"], line: { quantity: 3, price: 2187, split: owners } }]);
    expect(shares(split)).toEqual(shares(claimed));
    expect(shares(split)).toEqual([0, 1458, 729]);
  });

  test("Split of an uneven price gives the first rows the extra cents, so the rows add up to the line", () => {
    const uneven = apply(atThePub(), edit({ price: price(1000) }));

    expect(rows(apply(uneven, splitLine([beerB, beerC])))).toEqual([
      ["fries", 800, 1, { by: "even", units: [[]] }],
      ["beer", 334, 1, { by: "even", units: [[]] }],
      ["beer-b", 333, 1, { by: "even", units: [[]] }],
      ["beer-c", 333, 1, { by: "even", units: [[]] }],
    ]);
  });

  test("Split of a by-amount line fills the rows in order with each claimer's cents, so they still pay the same", () => {
    const amounts = apply(atThePub(), claim(bob), claim(cat), edit({ by: "amount", values: [{ participantId: bob, value: 1000 }, { participantId: cat, value: 600 }] }));

    const split = apply(amounts, splitLine([beerB, beerC]));

    expect(rows(split).slice(1)).toEqual([
      ["beer", 729, 1, { by: "amount", units: [[["bob", 729], ["cat", 0]]] }],
      ["beer-b", 729, 1, { by: "amount", units: [[["bob", 271], ["cat", 458]]] }],
      ["beer-c", 729, 1, { by: "amount", units: [[["bob", 0], ["cat", 142]]] }],
    ]);
    expect(shares(split)).toEqual([0, 1000, 600]);
    expect(computeShares(split).unclaimed.total).toBe(1387);
  });

  test("Split of a by-amount line that covers the price keeps every row by amount and every Share to the cent", () => {
    const amounts = apply(atThePub(), claim(bob), claim(cat), edit({ by: "amount", values: [{ participantId: bob, value: 1094 }, { participantId: cat, value: 1093 }] }));

    const split = apply(amounts, splitLine([beerB, beerC]));

    expect(rows(split).slice(1)).toEqual([
      ["beer", 729, 1, { by: "amount", units: [[["bob", 729], ["cat", 0]]] }],
      ["beer-b", 729, 1, { by: "amount", units: [[["bob", 365], ["cat", 364]]] }],
      ["beer-c", 729, 1, { by: "amount", units: [[["bob", 0], ["cat", 729]]] }],
    ]);
    expect(shares(split)).toEqual([0, 1094, 1093]);
  });

  test("Split keeps every Share to the cent for any by-amount pair on the Topgolf Guinness", () => {
    const differences: string[] = [];
    for (let jasons = 0; jasons <= 2187; jasons += 1) {
      for (const priyas of [2187 - jasons, Math.floor((2187 - jasons) / 2), 0]) {
        const values = [{ participantId: jason, value: jasons }, { participantId: priya, value: priyas }];
        const amounts = apply(topgolf({ guinness1: [jason, priya] }), { by: jason, type: "editReceipt", items: [{ type: "edit", itemId: itemId("guinness1"), by: "amount", values }] });
        const split = apply(amounts, { by: jason, type: "editReceipt", items: [{ type: "split", itemId: itemId("guinness1"), ids: [itemId("g2"), itemId("g3")] }] });
        const before = computeShares(amounts);
        const after = computeShares(split);
        if (JSON.stringify(after.shares) !== JSON.stringify(before.shares) || after.unclaimed.total !== before.unclaimed.total) differences.push(`${jasons}/${priyas}`);
      }
    }

    expect(differences).toEqual([]);
  });

  test("Split keeps every Share to the cent for evenly and by-shares lines at any price", () => {
    const differences: string[] = [];
    for (const cents of [1, 2, 3, 4, 5, 999, 1000, 1001, 1002, 2186, 2187, 2188]) {
      for (const shape of [edit({ by: "even" }), edit({ by: "shares", values: [{ participantId: bob, value: 2 }, { participantId: cat, value: 7 }] })]) {
        const line = apply(atThePub(), claim(ann), claim(bob), claim(cat), edit({ price: price(cents) }), shape);
        const split = apply(line, splitLine([beerB, beerC]));
        if (JSON.stringify(computeShares(split)) !== JSON.stringify(computeShares(line))) differences.push(`${cents} ${line.receipt.items[1].split.by}`);
      }
    }

    expect(differences).toEqual([]);
  });

  test("Split inside a Bundle lists the new rows right after the line, and the Topgolf Shares stay $157.77 and $49.52", () => {
    const start = topgolf({ ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason) });

    const split = apply(start, { by: jason, type: "editReceipt", items: [{ type: "split", itemId: itemId("guinness1"), ids: [itemId("guinness1-b"), itemId("guinness1-c")] }] });

    expect(split.receipt.items.slice(1, 6).map(({ id, price: cents }) => [id, cents])).toEqual([
      ["ultra1", 629],
      ["guinness1", 729],
      ["guinness1-b", 729],
      ["guinness1-c", 729],
      ["pineapple1", 849],
    ]);
    expect(split.receipt.adjustments[0]).toMatchObject({ bundle: { name: "Beer Bucket", items: ["ultra1", "guinness1", "guinness1-b", "guinness1-c", "pineapple1", "watermelon1"] } });
    expect(split.recentChanges.at(-1)?.writes.map(({ kind }) => kind)).toEqual(["split"]);
    expect(computeShares(split).shares.map(({ share }) => share)).toEqual([15777, 4952]);
  });

  test("Split of a 20x line with 10 claimers, a long name and a long detail fits one recorded change, and Revert brings the line back", () => {
    const people = [bob, cat, ...Array.from({ length: 7 }, (_, at) => participantId(`guest-${String(at).padStart(2, "0")}-xxxxxxxxxxxxxxx`))];
    const big: Receipt = { items: [{ id: fries, name: "W".repeat(80), detail: "D".repeat(120), price: price(200000), quantity: 20 }], adjustments: [], subtotal: cents(200000), total: cents(200000) };
    const everyone = apply(
      created(big),
      ...people.map((id): Operation => ({ by: ann, type: "addParticipant", participant: { id, name: id } })),
      ...[ann, ...people].map((id) => claim(id, fries)),
      edit({ by: "amount", values: [ann, ...people].map((participantId, at) => ({ participantId, value: 6000 + at })) }, fries),
    );
    const ids = Array.from({ length: 19 }, (_, at) => itemId(`fries-row-${String(at + 2).padStart(2, "0")}-xxxxxxxxxx`));

    const result = applyOperation(everyone, splitLine([ids[0], ...ids.slice(1)], fries), anyone);

    expect(result.ok ? result.split.receipt.items.length : result.rejection).toBe(20);
    const split = accepted(result);
    expect(shares(split)).toEqual(shares(everyone));
    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
    const reverted = apply(split, { by: cat, type: "undo", revision: split.revision });
    expect(reverted.receipt).toEqual(everyone.receipt);
    expect(apply(reverted, { by: cat, type: "undo", revision: reverted.revision }).receipt).toEqual(split.receipt);
  });

  test("Split of a one-unit line, with the wrong number of ids, or with an id already used is refused", () => {
    const start = atThePub();

    expect(reasonFor(start, splitLine([beerB], fries))).toBe("conflict");
    expect(reasonFor(start, splitLine([beerB]))).toBe("conflict");
    expect(reasonFor(start, splitLine([beerB, beerC, itemId("beer-d")]))).toBe("conflict");
    expect(reasonFor(start, splitLine([fries, beerC]))).toBe("duplicateId");
    expect(reasonFor(start, splitLine([beerB, beerB]))).toBe("duplicateId");
    expect(reasonFor(start, splitLine([beer, beerB]))).toBe("duplicateId");
  });

  test("Revert of a Split brings back the one quantity line", () => {
    const amounts = apply(atThePub(), claim(bob), claim(cat), edit({ by: "amount", values: [{ participantId: bob, value: 1000 }, { participantId: cat, value: 600 }] }));
    const split = apply(amounts, splitLine([beerB, beerC]));

    expect(apply(split, { by: cat, type: "undo", revision: split.revision }).receipt).toEqual(amounts.receipt);
  });

  test("Revert of a Split answers conflict after any row's price, claims, mode or amounts change, so it never moves money", () => {
    const claimed = apply(atThePub(), claim(bob), claim(cat));
    const split = apply(claimed, splitLine([beerB, beerC]));
    const since = {
      "a claim on the second row": claim(ann, beerB),
      "an unclaim on the second row": unclaim(cat, beerB),
      "an unclaim on the first row": unclaim(cat),
      "a price on the second row": edit({ price: price(800) }, beerB),
      "a price on the last row": edit({ price: price(100) }, beerC),
      "a price on the first row": edit({ price: price(800) }),
      "a mode on the second row": edit({ by: "shares", values: [{ participantId: bob, value: 2 }] }, beerB),
    };

    for (const [what, op] of Object.entries(since)) {
      expect([what, reasonFor(apply(split, op), { by: cat, type: "undo", revision: split.revision })]).toEqual([what, "conflict"]);
    }
  });

  test("Revert of a Split on the Topgolf Guinness answers conflict after a row-2 price or amount edit, and the Shares stay put", () => {
    const amounts = apply(topgolf({ guinness1: [jason, priya] }), {
      by: jason,
      type: "editReceipt",
      items: [{ type: "edit", itemId: itemId("guinness1"), by: "amount", values: [{ participantId: jason, value: cents(1000) }, { participantId: priya, value: cents(900) }] }],
    });
    const split = apply(amounts, { by: jason, type: "editReceipt", items: [{ type: "split", itemId: itemId("guinness1"), ids: [itemId("g2"), itemId("g3")] }] });
    const pricier = apply(split, { by: priya, type: "editReceipt", items: [{ type: "edit", itemId: itemId("g2"), price: price(800) }] });
    const lessForJason = apply(split, { by: priya, type: "editReceipt", items: [{ type: "edit", itemId: itemId("g2"), values: [{ participantId: jason, value: cents(0) }] }] });

    expect(shares(pricier)).toEqual([1094, 985]);
    expect(reasonFor(pricier, { by: priya, type: "undo", revision: split.revision })).toBe("conflict");
    expect(reasonFor(lessForJason, { by: priya, type: "undo", revision: split.revision })).toBe("conflict");
  });

  test("Revert of a Split on the unclaimed Topgolf Guinness answers conflict after a row-2 price edit, and the edit stays", () => {
    const start = topgolf({});
    const split = apply(start, { by: jason, type: "editReceipt", items: [{ type: "split", itemId: itemId("guinness1"), ids: [itemId("g2"), itemId("g3")] }] });
    const edited = apply(split, { by: priya, type: "editReceipt", items: [{ type: "edit", itemId: itemId("g2"), price: price(650) }] });

    expect(reasonFor(edited, { by: priya, type: "undo", revision: split.revision })).toBe("conflict");
    expect(edited.receipt.items.find(({ id }) => id === "g2")?.price).toBe(650);
  });

  test("Revert of a Split answers conflict after every row takes the same new claimer or a row is renamed, since the rows no longer match the Split", () => {
    const claimed = apply(atThePub(), claim(bob), claim(cat));
    const split = apply(claimed, splitLine([beerB, beerC]));
    const since = {
      "the same claimer on every row": apply(split, claim(ann), claim(ann, beerB), claim(ann, beerC)),
      "a rename of the second row": apply(split, { by: bob, type: "editReceipt", items: [{ type: "edit", itemId: beerB, name: "Stout" }] }),
      "a detail on the first row": apply(split, edit({ detail: "Pint" })),
    };

    for (const [what, state] of Object.entries(since)) {
      expect([what, reasonFor(state, { by: cat, type: "undo", revision: split.revision })]).toEqual([what, "conflict"]);
    }
  });

  test("Revert of adding a 3x line after it was Split answers conflict instead of removing only the first row", () => {
    const added = apply(atThePub(), { by: bob, type: "editReceipt", items: [{ type: "add", index: 2, item: { id: itemId("ale"), name: "Ale", price: price(900), quantity: 3 } }] });
    const split = apply(added, splitLine([itemId("ale-b"), itemId("ale-c")], itemId("ale")));

    expect(reasonFor(split, { by: cat, type: "undo", revision: added.revision })).toBe("conflict");
  });

  test("Revert of a Split inside a Bundle restores the Bundle's list", () => {
    const start = topgolf({ ...eachOf(bucketOne, priya) });
    const split = apply(start, { by: jason, type: "editReceipt", items: [{ type: "split", itemId: itemId("guinness1"), ids: [itemId("guinness1-b"), itemId("guinness1-c")] }] });

    expect(apply(split, { by: jason, type: "undo", revision: split.revision }).receipt).toEqual(start.receipt);
  });

  test("Split of a line with a detail gives every row the detail, and Revert brings back the one line with it", () => {
    const detailed = apply(atThePub(), claim(bob), edit({ detail: "Pint" }));

    const split = apply(detailed, splitLine([beerB, beerC]));

    expect(split.receipt.items.slice(1)).toEqual([
      { id: "beer", name: "Guinness", price: 729, detail: "Pint", split: { by: "even", units: [["bob"]] } },
      { id: "beer-b", name: "Guinness", price: 729, detail: "Pint", split: { by: "even", units: [["bob"]] } },
      { id: "beer-c", name: "Guinness", price: 729, detail: "Pint", split: { by: "even", units: [["bob"]] } },
    ]);
    expect(split.schemaVersion).toBe(4);
    expect(apply(split, { by: cat, type: "undo", revision: split.revision }).receipt).toEqual(detailed.receipt);
    expect(detailed.receipt.items[1]).toEqual({ id: "beer", name: "Guinness", price: 2187, detail: "Pint", quantity: 3, split: { by: "even", units: [["bob"]] } });
  });

  test("restoring the Receipt brings a split line back as one line", () => {
    const claimed = apply(atThePub(), claim(bob));
    const split = apply(claimed, splitLine([beerB, beerC]));

    expect(rows(apply(split, { by: cat, type: "restoreReceipt" }))).toEqual([
      ["fries", 800, 1, { by: "even", units: [[]] }],
      ["beer", 2187, 3, { by: "even", units: [["bob"]] }],
    ]);
  });

  test("every write stores version 4, with or without a quantity, and a line with no quantity stores none", () => {
    const start = atThePub();
    const split = apply(start, splitLine([beerB, beerC]));

    expect([start.schemaVersion, split.schemaVersion]).toEqual([4, 4]);
    expect(apply({ ...split, recentChanges: [] }, claim(bob, beerB)).schemaVersion).toBe(4);
    expect(created().schemaVersion).toBe(4);
    expect(JSON.parse(JSON.stringify(created())).receipt.items[0]).toEqual({ id: "pasta", name: "Pasta", price: 1400, split: { by: "even", units: [[]] } });
  });

  test("a version 4 Split reads back unchanged", () => {
    const split = apply(atThePub(), claim(bob), splitLine([beerB, beerC]), claim(cat, beerC));

    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
  });
});

describe("undo", () => {
  test("any Participant's edit of any Item, price, charge, or the tip is one recorded change that another Participant's Undo reverses exactly", () => {
    const tax = adjustmentId("tax");
    const tip = adjustmentId("tip");
    const charged: Receipt = {
      ...dinner,
      adjustments: [
        { id: tax, kind: "tax", name: "Tax", amount: cents(520) },
        { id: tip, kind: "tip", name: "Tip", amount: cents(1040) },
      ],
      total: cents(6760),
    };
    const start = apply(created(charged), { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } }, { by: ann, type: "addParticipant", participant: { id: cat, name: "Cat" } });
    const edits: Record<string, Omit<Extract<Operation, { type: "editReceipt" }>, "by" | "type">> = {
      price: { items: [{ type: "edit", itemId: fries, price: price(600) }], subtotalDelta: cents(-200), totalDelta: cents(-200) },
      rename: { items: [{ type: "edit", itemId: fries, name: "Chips" }] },
      addItem: { items: [{ type: "add", item: { id: itemId("salad"), name: "Salad", price: price(900) }, index: 1 }], subtotalDelta: cents(900), totalDelta: cents(900) },
      deleteItem: { items: [{ type: "delete", itemId: pasta }], subtotalDelta: cents(-1400), totalDelta: cents(-1400) },
      tip: { adjustments: [{ type: "edit", adjustmentId: tip, amount: cents(1500) }], totalDelta: cents(460) },
      deleteTax: { adjustments: [{ type: "delete", adjustmentId: tax }], totalDelta: cents(-520) },
      addDiscount: { adjustments: [{ type: "add", adjustment: { id: adjustmentId("promo"), kind: "discount", name: "Promo", amount: cents(-300) }, index: 2 }], totalDelta: cents(-300) },
      renameCharge: { adjustments: [{ type: "edit", adjustmentId: tax, name: "Sales tax" }] },
      priceAndTip: {
        items: [{ type: "edit", itemId: pitcher, price: price(2800) }],
        adjustments: [{ type: "edit", adjustmentId: tip, amount: cents(1240) }],
        subtotalDelta: cents(-200),
      },
    };

    const outcomes = Object.entries(edits).map(([name, edit]) => {
      const edited = apply(start, { by: bob, type: "editReceipt", ...edit });
      const undone = apply(edited, { by: cat, type: "undo", revision: edited.revision });
      return [name, edited.recentChanges.at(-1)?.by, edited.receipt === start.receipt, undone.receipt];
    });

    expect(outcomes).toEqual(Object.keys(edits).map((name) => [name, "bob", false, start.receipt]));
  });

  test("an older price edit can be undone after someone edits another Item", () => {
    const split = apply(withBobAndCat(), priceEdit(bob, fries, 800, 600), priceEdit(cat, pasta, 1400, 1500));

    const undone = apply(split, { by: ann, type: "undo", revision: 3 });

    expect(undone.receipt.items.map(({ price }) => price)).toEqual([1500, 800, 3000]);
    expect([undone.receipt.subtotal, undone.receipt.total]).toEqual([5300, 5300]);
  });

  test("an undo whose Item was edited again since is a conflict, and undoing in reverse order works", () => {
    const split = apply(withBobAndCat(), priceEdit(bob, fries, 800, 600), priceEdit(bob, fries, 600, 700));

    expect(reasonFor(split, { by: cat, type: "undo", revision: 3 })).toBe("conflict");

    const reverted = apply(split, { by: cat, type: "undo", revision: 4 }, { by: cat, type: "undo", revision: 3 });

    expect(reverted.receipt).toEqual(withBobAndCat().receipt);
  });

  test("undoing an undo redoes the edit, and each change can be undone once", () => {
    const split = apply(withBobAndCat(), priceEdit(bob, fries, 800, 600), { by: cat, type: "undo", revision: 3 }, { by: bob, type: "undo", revision: 4 });

    expect(split.receipt.items[1].price).toBe(600);
    expect(split.recentChanges.map(({ revision, undoes, undoneBy }) => [revision, undoes, undoneBy])).toEqual([
      [1, null, null],
      [2, null, null],
      [3, null, 4],
      [4, 3, 5],
      [5, 4, null],
    ]);
    expect(reasonFor(split, { by: cat, type: "undo", revision: 3 })).toBe("alreadyUndone");
    expect(reasonFor(split, { by: cat, type: "undo", revision: 99 })).toBe("changeNotFound");
    expect(apply(split, { by: cat, type: "undo", revision: 5 }).receipt.items[1].price).toBe(800);
  });

  test("a redo puts a Participant back at the row they held when the add was undone", () => {
    const eve = participantId("eve");
    const split = apply(
      withBobAndCat(),
      { by: dan, type: "addParticipant", participant: { id: dan, name: "Dan" } },
      { by: eve, type: "addParticipant", participant: { id: eve, name: "Eve" } },
      { by: ann, type: "undo", revision: 1 },
    );
    const undone = apply(split, { by: ann, type: "undo", revision: 3 });

    expect(undone.participants.map(({ id }) => id)).toEqual(["ann", "cat", "eve"]);
    expect(apply(undone, { by: ann, type: "undo", revision: undone.revision }).participants.map(({ id }) => id)).toEqual([
      "ann",
      "cat",
      "dan",
      "eve",
    ]);
  });

  test("undoing an added Item that has been claimed since takes it out with its claims, and redo puts both back", () => {
    const dessert = itemId("dessert");
    const added = apply(withBobAndCat(), {
      by: ann,
      type: "editReceipt",
      items: [{ type: "add", item: { id: dessert, name: "Dessert", price: price(900) }, index: 3 }],
      subtotalDelta: cents(900),
      totalDelta: cents(900),
    });
    const claimed = apply(added, { by: bob, type: "claim", itemId: dessert, participantId: bob });

    const undone = apply(claimed, { by: cat, type: "undo", revision: 3 });
    expect(undone.receipt).toEqual(withBobAndCat().receipt);
    expect(apply(undone, { by: cat, type: "undo", revision: undone.revision }).receipt).toEqual(claimed.receipt);
  });
});

describe("restoring the original Receipt", () => {
  const restore: Operation = { by: cat, type: "restoreReceipt" };

  test("after a flood pushes a price change out of the recent changes, restoreReceipt puts every name and price back and keeps the Claims, and Undo reverses it", () => {
    const rename = (index: number): Operation => ({ by: null, type: "editReceipt", items: [{ type: "edit", itemId: pasta, name: `Pasta ${index}` }] });
    const priced = apply(withBobAndCat(), { by: bob, type: "claim", itemId: pasta, participantId: bob }, priceEdit(bob, fries, 800, 1));
    const flooded = apply(priced, ...Array.from({ length: RECENT_CHANGES_LIMIT }, (_, index) => rename(index)));
    const restored = apply(flooded, restore);
    const rows = (split: Split) => split.receipt.items.map(({ id, name, price, split }) => [id, name, price, split.units[0]]);

    expect(reasonFor(flooded, { by: ann, type: "undo", revision: priced.revision })).toBe("changeNotFound");
    expect([rows(restored), restored.receipt.subtotal, restored.receipt.total]).toEqual([
      [
        ["pasta", "Pasta", 1400, ["bob"]],
        ["fries", "Fries", 800, []],
        ["pitcher", "Pitcher", 3000, []],
      ],
      5200,
      5200,
    ]);
    expect(rows(apply(restored, { by: ann, type: "undo", revision: restored.revision }))).toEqual([
      ["pasta", "Pasta 63", 1400, ["bob"]],
      ["fries", "Fries", 1, []],
      ["pitcher", "Pitcher", 3000, []],
    ]);
  });

  test("25 chained price edits after a vandal's can be undone newest first back to $8.00, and restoreReceipt gets there in one change", () => {
    let split = apply(withBobAndCat(), priceEdit(bob, fries, 800, 1));
    for (let cents = 1; cents <= 25; cents += 1) split = apply(split, priceEdit(bob, fries, cents, cents + 1));
    let undone = split;
    for (let revision = split.revision; revision > 2; revision -= 1) undone = apply(undone, { by: ann, type: "undo", revision });
    const restored = apply(split, restore);

    expect([undone.receipt.items[1].price, restored.receipt.items[1].price, restored.revision - split.revision]).toEqual([800, 800, 1]);
  });

  test("puts deleted rows back in place, drops added ones, moves a moved one back with its Claims, and Undo and redo swap the two Receipts exactly", () => {
    const junk = itemId("junk");
    const vandalized = apply(
      withBobAndCat(),
      { by: bob, type: "claim", itemId: pitcher, participantId: bob },
      {
        by: null,
        type: "editReceipt",
        items: [
          { type: "delete", itemId: pasta },
          { type: "add", item: { id: junk, name: "Junk", price: price(500) }, index: 0 },
          { type: "edit", itemId: fries, name: "Chips" },
        ],
        adjustments: [{ type: "add", adjustment: { id: adjustmentId("off"), kind: "discount", name: "Off", amount: cents(-500) }, index: 0 }],
        subtotalDelta: cents(-900),
        totalDelta: cents(-1400),
      },
      {
        by: null,
        type: "editReceipt",
        items: [
          { type: "delete", itemId: fries },
          { type: "add", item: { id: fries, name: "Chips", price: price(800) }, index: 2 },
        ],
      },
      { by: cat, type: "claim", itemId: junk, participantId: cat },
      { by: cat, type: "claim", itemId: fries, participantId: cat },
    );
    const restored = apply(vandalized, restore);
    const undone = apply(restored, { by: ann, type: "undo", revision: restored.revision });
    const redone = apply(undone, { by: ann, type: "undo", revision: undone.revision });

    const steps = restored.recentChanges.at(-1)?.writes.map((write) => {
      if (write.kind !== "item" && write.kind !== "adjustment") return [write.kind];
      return [write.kind, write.id, "added" in write ? "added" : "removed" in write ? "removed" : "edit"];
    });

    expect(vandalized.receipt.items.map(({ id }) => id)).toEqual(["junk", "pitcher", "fries"]);
    expect(steps).toEqual([
      ["item", "junk", "removed"],
      ["item", "pasta", "added"],
      ["item", "fries", "removed"],
      ["item", "fries", "added"],
      ["adjustment", "off", "removed"],
      ["totals"],
    ]);
    expect(restored.receipt).toEqual({
      items: [
        { id: "pasta", name: "Pasta", price: 1400, split: { by: "even", units: [[]] } },
        { id: "fries", name: "Fries", price: 800, split: { by: "even", units: [["cat"]] } },
        { id: "pitcher", name: "Pitcher", price: 3000, split: { by: "even", units: [["bob"]] } },
      ],
      adjustments: [],
      subtotal: 5200,
      total: 5200,
    });
    expect([undone.receipt, redone.receipt]).toEqual([vandalized.receipt, restored.receipt]);
  });

  test("changes nothing on a Receipt as created, and a Split stored before the original was kept refuses it as noOriginal", () => {
    const split = withBobAndCat();
    const { original, ...stored } = split;
    const legacy = accepted(parseSplit(JSON.parse(JSON.stringify(stored))));

    expect(original?.items.length).toBe(3);
    expect(applyOperation(split, restore, anyone)).toEqual({ ok: true, split, changed: false });
    expect(reasonFor(legacy, restore)).toBe("noOriginal");
  });

  test("a restore too large to record still lands, and leaves the recent changes as they were", () => {
    const [first, ...rest] = Array.from({ length: 45 }, (_, index): Item => ({
      id: itemId(`item${String(index).padStart(20, "0")}`),
      name: `${index} `.padEnd(70, "x"),
      price: price(100),
    }));
    const split = accepted(
      createSplit({
        id: minted,
        receipt: { items: [first, ...rest], adjustments: [], subtotal: cents(4500), total: cents(4500) },
        participants: [{ id: ann, name: "Ann" }],
        paymentHandles: [{ service: "venmo", handle: "ann-host" }],
      }),
    );
    const deleted = (rows: readonly Item[]): Operation => ({
      by: null,
      type: "editReceipt",
      items: rows.map(({ id }) => ({ type: "delete", itemId: id })),
      subtotalDelta: cents(-100 * rows.length),
      totalDelta: cents(-100 * rows.length),
    });
    const emptied = apply(split, deleted(rest.slice(0, 22)), deleted(rest.slice(22)));
    const restored = apply(emptied, { by: null, type: "restoreReceipt" });

    expect([emptied.receipt.items.length, emptied.recentChanges.length]).toEqual([1, 2]);
    expect([restored.receipt, restored.recentChanges, restored.revision]).toEqual([split.receipt, emptied.recentChanges, 3]);
  });
});

describe("Participants", () => {
  test("a direct removal is refused for anyone, the creator included, and Undo of an add takes the Participant out and a redo puts them back at their row", () => {
    const split = withBobAndCat();
    const removed = apply(split, { by: cat, type: "undo", revision: 1 });

    expect(reasonFor(split, { by: ann, type: "removeParticipant", participantId: bob }, { creator: true })).toBe("removalNotAllowed");
    expect(removed.participants.map(({ id }) => id)).toEqual(["ann", "cat"]);
    expect(apply(removed, { by: cat, type: "undo", revision: removed.revision }).participants).toEqual([
      { id: "ann", name: "Ann" },
      { id: "bob", name: "Bob" },
      { id: "cat", name: "Cat" },
    ]);
  });

  test("Undo of an add is refused once the Participant has a Claim or a Payment", () => {
    const paid = apply(
      withBobAndCat(),
      { by: bob, type: "claim", itemId: fries, participantId: bob },
      { by: cat, type: "pick", participantId: cat, device: deviceId("phone-cat"), takeOver: false },
      { by: cat, type: "recordPayment", participantId: cat, device: deviceId("phone-cat"), amount: cents(500) },
    );
    const split: Split = { ...paid, picks: [] };

    expect(reasonFor(split, { by: ann, type: "undo", revision: 1 })).toBe("participantInUse");
    expect(reasonFor(split, { by: ann, type: "undo", revision: 2 })).toBe("participantInUse");
  });

  test("an Undo from a tampered stored history cannot take the Host out", () => {
    const stored = {
      ...created(),
      revision: 1,
      recentChanges: [{ revision: 1, by: null, undoes: null, undoneBy: null, writes: [{ kind: "participant", id: "ann", added: { index: 0, name: "Ann" } }] }],
    };
    const tampered = accepted(parseSplit(JSON.parse(JSON.stringify(stored))));

    expect(reasonFor(tampered, { by: null, type: "undo", revision: 1 })).toBe("host");
  });

  test("an operation by someone who is not a Participant is rejected", () => {
    expect(reasonFor(created(), { by: bob, type: "claim", itemId: fries, participantId: ann })).toBe("unknownParticipant");
  });

  test("a second Participant with a name already at the table is refused, whatever its case or spacing", () => {
    const split = withBobAndCat();

    expect(reasonFor(split, { by: null, type: "addParticipant", participant: { id: dan, name: " bob " } })).toBe("nameTaken");
    expect(reasonFor(split, { by: null, type: "addParticipant", participant: { id: dan, name: "Bobby" } })).toBe("accepted");
  });

  test("a name that differs from one at the table only by an invisible format character or by case folding is refused, and an emoji family is a name", () => {
    const join = (id: string, name: string): Operation => ({ by: null, type: "addParticipant", participant: { id: participantId(id), name } });
    const table = apply(withBobAndCat(), join("strauss", "Strauss"), join("odos", "\u03BF\u03B4\u03BF\u03C3"), join("sam", "Sam"));
    const lookalikes = ["Ann\u00AD", "A\u200Cnn", "An\u200Dn", "Ann\u180E", "Ann\u206A", "Ann\uFFF9", "Ann\u{E0020}", "Ann\uFE0F", "An\u034Fn", "Ann\u3164", "STRAU\u1E9E", "Strau\u00DF", "\u039F\u0394\u039F\u03A3", "Sam\u2800", "\u2800Sam"];

    expect(lookalikes.map((name) => reasonFor(table, join("dan", name)))).toEqual(lookalikes.map(() => "nameTaken"));
    expect(reasonFor(table, join("dan", "Sbm"))).toBe("accepted");
    expect(reasonFor(table, join("dan", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"))).toBe("accepted");
  });

  test("a name that differs from one at the table only in Unicode form, width, inner spacing, or a hidden character is refused", () => {
    const join = (split: Split, id: string, name: string): Operation => ({ by: null, type: "addParticipant", participant: { id: participantId(id), name } });
    const withJose = apply(withBobAndCat(), join(withBobAndCat(), "jose", "Jos\u00E9"), join(withBobAndCat(), "mary", "Mary Ann"));

    expect(reasonFor(withJose, join(withJose, "dan", "Jose\u0301"))).toBe("nameTaken");
    expect(reasonFor(withJose, join(withJose, "dan", "\uFF22ob"))).toBe("nameTaken");
    expect(reasonFor(withJose, join(withJose, "dan", "Mary \u00A0Ann"))).toBe("nameTaken");
    expect(reasonFor(withJose, join(withJose, "dan", "Bob\u200B"))).toBe("badName");
    expect(reasonFor(withJose, join(withJose, "dan", "\u202EboB"))).toBe("badName");
    expect(reasonFor(withJose, join(withJose, "dan", "Josie"))).toBe("accepted");
  });

  test("a redo of an undone add is refused once someone else has taken the name", () => {
    const removed = apply(withBobAndCat(), { by: cat, type: "undo", revision: 1 });
    const retaken = apply(removed, { by: null, type: "addParticipant", participant: { id: dan, name: "BOB" } });

    expect(reasonFor(retaken, { by: cat, type: "undo", revision: removed.revision })).toBe("nameTaken");
  });

  test("a stored Split that already repeats a name still reads, so the rule needs no schema change", () => {
    const stored = { ...withBobAndCat(), participants: [...withBobAndCat().participants, { id: dan, name: "BOB" }] };

    expect(parseSplit(JSON.parse(JSON.stringify(stored)))).toMatchObject({ ok: true, split: { participants: { 3: { name: "BOB" } } } });
  });

  test("a stored Split that already repeats a name still takes a Claim and a new name, and refuses another repeat", () => {
    const stored = { ...withBobAndCat(), participants: [...withBobAndCat().participants, { id: dan, name: "BOB" }] };
    const legacy = accepted(parseSplit(JSON.parse(JSON.stringify(stored))));
    const eve = participantId("eve");

    expect(reasonFor(legacy, { by: dan, type: "claim", itemId: fries, participantId: dan })).toBe("accepted");
    expect(reasonFor(legacy, { by: null, type: "addParticipant", participant: { id: eve, name: "Eve" } })).toBe("accepted");
    expect(reasonFor(legacy, { by: null, type: "addParticipant", participant: { id: eve, name: "cat" } })).toBe("nameTaken");
  });

  test("a new Split with two Participants of one name is refused", () => {
    const result = createSplit({
      id: minted,
      receipt: dinner,
      participants: [
        { id: ann, name: "Me" },
        { id: bob, name: "me" },
      ],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });

    expect(result.ok ? "accepted" : result.rejection.reason).toBe("nameTaken");
  });
});

describe("changes stored before per-unit claims and device picks", () => {
  function stored(fields: object, writes: readonly object[]): Split {
    const split = withBobAndCat();
    const { picks: _, ...json } = JSON.parse(JSON.stringify(split));
    const items = json.receipt.items.map(({ split: _, ...item }: { id: string; split: unknown }) => ({ ...item, claimedBy: item.id === "fries" ? [] : ["ann", "bob", "cat"] }));
    const revision = split.revision + 1;
    const parsed = parseSplit({
      ...json,
      schemaVersion: 1,
      ...fields,
      receipt: { ...json.receipt, items },
      revision,
      recentChanges: [...json.recentChanges, { revision, by: "cat", undoes: null, undoneBy: null, writes }],
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.rejection));
    return parsed.split;
  }

  test("read a line's claimedBy as one even unit, and joined as picked by no one", () => {
    const split = stored({ joined: ["bob"] }, [{ kind: "claims", itemIds: [pasta, pitcher], participantIds: [ann, bob, cat], claimed: true }]);

    expect(split.receipt.items.map(({ split: shape }) => shape)).toEqual([
      { by: "even", units: [["ann", "bob", "cat"]] },
      { by: "even", units: [[]] },
      { by: "even", units: [["ann", "bob", "cat"]] },
    ]);
    expect(split.picks).toEqual([]);
  });

  test("a stored Claims change or unmark stays in the recent changes, and Undo refuses it as a conflict", () => {
    const claims = stored({}, [{ kind: "claims", itemIds: [pasta, pitcher], participantIds: [ann, bob, cat], claimed: true }]);
    const unmark = stored({}, [{ kind: "joined", participantId: bob, joined: false }]);

    expect(reasonFor(claims, { by: bob, type: "undo", revision: claims.revision })).toBe("conflict");
    expect(reasonFor(unmark, { by: bob, type: "undo", revision: unmark.revision })).toBe("conflict");
  });

  test("an operation named splitUnclaimed or setJoined is refused as malformed", () => {
    expect(parseOperation({ type: "splitUnclaimed", by: null })).toEqual({ ok: false, rejection: { reason: "malformed", path: "type" } });
    expect(parseOperation({ type: "setJoined", by: null, participantId: "bob", joined: true })).toEqual({ ok: false, rejection: { reason: "malformed", path: "type" } });
  });
});

describe("limits", () => {
  test("rejects a 31st Participant", () => {
    const joined = Array.from({ length: 29 }, (_, index): Operation => ({
      by: null,
      type: "addParticipant",
      participant: { id: participantId(`p${index}`), name: `Person ${index}` },
    }));
    const full = apply(created(), ...joined);

    expect(full.participants).toHaveLength(30);
    expect(reasonFor(full, { by: null, type: "addParticipant", participant: { id: participantId("late"), name: "Late" } })).toBe(
      "tooManyParticipants",
    );
  });

  test("rejects an amount above MAX_CENTS, a blank name, an index outside the list, and deleting the last Item", () => {
    const split = apply(withBobAndCat(), { by: bob, type: "pick", participantId: bob, device: deviceId("phone-bob"), takeOver: false });

    expect(reasonFor(split, { by: bob, type: "recordPayment", participantId: bob, device: deviceId("phone-bob"), amount: cents(MAX_CENTS + 1) })).toBe(
      "amountOutOfRange",
    );
    expect(reasonFor(split, { by: null, type: "addParticipant", participant: { id: dan, name: "  " } })).toBe("badName");
    expect(
      reasonFor(split, { by: null, type: "editReceipt", items: [{ type: "add", item: { id: itemId("tea"), name: "Tea", price: price(0) }, index: 4 }] }),
    ).toBe("badIndex");

    const single = created({ items: [{ id: pitcher, name: "Pitcher", price: price(3000) }], adjustments: [], subtotal: cents(3000), total: cents(3000) });
    expect(
      reasonFor(single, { by: null, type: "editReceipt", items: [{ type: "delete", itemId: pitcher }], subtotalDelta: cents(-3000), totalDelta: cents(-3000) }),
    ).toBe("lastItem");
  });
});

describe("totals", () => {
  test("a discount that drives the total below zero is rejected even when the Total check balances", () => {
    const discount = { id: adjustmentId("promo"), kind: "discount" as const, name: "Promo", amount: cents(-6000) };

    expect(
      reasonFor(created(), { by: null, type: "editReceipt", adjustments: [{ type: "add", adjustment: discount, index: 0 }], totalDelta: cents(-6000) }),
    ).toBe("negativeTotal");
  });
});

describe("names", () => {
  const join = (name: string) => reasonFor(withBobAndCat(), { by: null, type: "addParticipant", participant: { id: dan, name } });

  test("refuses control characters, bidi overrides, zero-width characters, and lone surrogates", () => {
    expect(["Dan\u0000", "Dan\nSmith", "Dan\u007F", "\u202Enad", "Dan\u2066", "Da\u200Bn", "Dan\uFEFF", "Dan\uD800", "\uDC00Dan"].map(join)).toEqual(
      Array.from({ length: 9 }, () => "badName"),
    );
  });

  test("allows accents, other scripts, and emoji up to 40 characters, and refuses a 41st", () => {
    expect(["José", "Đặng", "王小明", "Dan 🍕", "🍕".repeat(40), "d".repeat(40)].map(join)).toEqual(Array.from({ length: 6 }, () => "accepted"));
    expect(join("d".repeat(41))).toBe("badName");
  });

  test("allows joined emoji, flags, and a Persian name with a zero-width non-joiner", () => {
    const mahrokh = "\u0645\u0627\u0647\u200C\u0631\u062E";
    expect(["👩\u200D🍳", "👨\u200D👩\u200D👧\u200D👦", "Zoë", "José", "李明", mahrokh, "🇺🇸", "❤\uFE0F", "✈\uFE0E"].map(join)).toEqual(
      Array.from({ length: 9 }, () => "accepted"),
    );
  });

  test("counts a joined emoji as one character toward the 40", () => {
    expect(join("👨\u200D👩\u200D👧\u200D👦".repeat(40))).toBe("accepted");
    expect(join("🇺🇸".repeat(40))).toBe("accepted");
    expect(join("👨\u200D👩\u200D👧\u200D👦".repeat(41))).toBe("badName");
  });

  test("refuses one character stacked past 31 accents, and keeps the longest skin-toned emoji sequences", () => {
    const kiss = "👩🏽\u200D❤\uFE0F\u200D💋\u200D👨🏿";
    const family = "👨🏻\u200D👩🏻\u200D👧🏻\u200D👦🏻";
    expect([kiss, family, family.repeat(40)].map(join)).toEqual(["accepted", "accepted", "accepted"]);
    const stacked = (accents: number) => `Z${"\u0301".repeat(accents)}`;
    expect([stacked(31), stacked(31).repeat(40)].map(join)).toEqual(["accepted", "accepted"]);
    expect([stacked(32), `${stacked(31).repeat(40)}d`].map(join)).toEqual(["badName", "badName"]);
  });

  test("refuses a lone bidi override, a null, a newline, a zero-width space, a lone surrogate, and a name made only of joiners", () => {
    expect(["\u202E", "a\u0000b", "a\nb", "\u200B", "\uD800", "\u200D", "\u200C\uFE0F"].map(join)).toEqual(
      Array.from({ length: 7 }, () => "badName"),
    );
  });

  test("refuses the line and paragraph separators, and a name made only of characters that draw nothing", () => {
    expect(["a\u2028b", "a\u2029b"].map(join)).toEqual(["badName", "badName"]);
    expect(["\u3164", "\u2800", "\u00AD", "\u034F", "\u180E", " \u3164\u200D "].map(join)).toEqual(
      Array.from({ length: 6 }, () => "badName"),
    );
    expect(["Jo\u00ADsé", "\u3131\u3164"].map(join)).toEqual(["accepted", "accepted"]);
  });

  test("refuses a name made only of format characters that are not default-ignorable, which leave an empty key", () => {
    expect(["\uFFF9", "\u0600", "\u06DD", "\u{110BD}", "\u{13430}", "\uFFFB\u2800"].map(join)).toEqual(
      Array.from({ length: 6 }, () => "badName"),
    );
  });

  test("refuses a name made of characters that draw nothing with a space between them, and still takes short and non-Latin names", () => {
    expect(["\u3164 \u3164", "\u00AD \u00AD", "\u2800 \u2800", "\u200D \u200D", "\u0600 \u2800", "\uFFF9 \uFFF9"].map(join)).toEqual(
      Array.from({ length: 6 }, () => "badName"),
    );
    expect(["Jo", "Jos\u00E9", "\u674E", "\u{1F600}"].map(join)).toEqual(Array.from({ length: 4 }, () => "accepted"));
  });

  test("an Item from a long OCR line keeps up to 80 characters, and an Adjustment too", () => {
    const line = (length: number) => "Grilled chicken sandwich, extra pickles, no onion, sub fries ".padEnd(length, "x");
    const tip = { id: adjustmentId("tip"), kind: "tip" as const, name: "Tip", amount: cents(500) };
    const receipt = (itemName: string, tipName = "Tip"): Receipt => ({
      items: [{ id: pasta, name: itemName, price: price(1400) }],
      adjustments: [{ ...tip, name: tipName }],
      subtotal: cents(1400),
      total: cents(1900),
    });
    const create = (itemName: string, tipName?: string) => {
      const result = createSplit({
        id: minted,
        receipt: receipt(itemName, tipName),
        participants: [{ id: ann, name: "Ann" }],
        paymentHandles: [{ service: "venmo", handle: "ann-host" }],
      });
      return result.ok ? "accepted" : result.rejection.reason;
    };

    expect([line(60), line(80), "🍔".repeat(80)].map((name) => create(name))).toEqual(["accepted", "accepted", "accepted"]);
    expect(create(line(81))).toBe("badName");
    expect(create("Tip", line(80))).toBe("accepted");
    expect(create("Tip", line(81))).toBe("badName");
    expect(reasonFor(created(), { by: null, type: "editReceipt", items: [{ type: "edit", itemId: fries, name: line(81) }] })).toBe("badName");
    expect(join("d".repeat(41))).toBe("badName");
  });

  test("refuses a blank or invisible Item or Adjustment name when the Receipt is created, and when a row is added or renamed", () => {
    const blanks = ["", "   ", "\u3164", "\u200D"];
    const tip = { id: adjustmentId("tip"), kind: "tip" as const, name: "Tip", amount: cents(500) };
    const tipped: Receipt = { ...dinner, adjustments: [tip], total: cents(5700) };
    const [first, ...rest] = tipped.items;
    const create = (receipt: Receipt) => {
      const result = createSplit({ id: minted, receipt, participants: [{ id: ann, name: "Ann" }], paymentHandles: [{ service: "venmo", handle: "ann-host" }] });
      return result.ok ? "accepted" : result.rejection.reason;
    };
    const split = created(tipped);
    const addItem = (name: string): Operation => ({
      by: null,
      type: "editReceipt",
      items: [{ type: "add", item: { id: itemId("tea"), name, price: price(300) }, index: 0 }],
      subtotalDelta: cents(300),
      totalDelta: cents(300),
    });
    const refused = Array.from({ length: 4 }, () => "badName");

    expect(blanks.map((name) => create({ ...tipped, items: [{ ...first, name }, ...rest] }))).toEqual(refused);
    expect(blanks.map((name) => create({ ...tipped, adjustments: [{ ...tip, name }] }))).toEqual(refused);
    expect(blanks.map((name) => reasonFor(split, addItem(name)))).toEqual(refused);
    expect(blanks.map((name) => reasonFor(split, { by: null, type: "editReceipt", items: [{ type: "edit", itemId: fries, name }] }))).toEqual(refused);
    expect(blanks.map((name) => reasonFor(split, { by: null, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: tip.id, name }] }))).toEqual(
      refused,
    );
    expect(reasonFor(split, addItem("Tea"))).toBe("accepted");
    expect(reasonFor(split, { by: null, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: tip.id, name: "Tip 20%" }] })).toBe("accepted");
  });

  test("an undo cannot bring back a refused name from a tampered stored history", () => {
    const deleted = apply(created(), { by: null, type: "editReceipt", items: [{ type: "delete", itemId: fries }], subtotalDelta: cents(-800), totalDelta: cents(-800) });
    const stored = JSON.parse(JSON.stringify(deleted));
    const [change] = stored.recentChanges;
    const tampered = parseSplit({
      ...stored,
      recentChanges: [{ ...change, writes: [{ ...change.writes[0], removed: { ...change.writes[0].removed, name: "\u3164" } }, change.writes[1]] }],
    });
    const split = accepted(tampered);

    expect(reasonFor(split, { by: null, type: "undo", revision: change.revision })).toBe("badName");
    expect(reasonFor(deleted, { by: null, type: "undo", revision: change.revision })).toBe("accepted");
  });

  test("an Item renamed with a bidi override is refused", () => {
    expect(reasonFor(created(), { by: null, type: "editReceipt", items: [{ type: "edit", itemId: fries, name: "Fries\u202E" }] })).toBe("badName");
  });
});

describe("the 32 KB budget", () => {
  const longId = (prefix: string, index: number) => `${prefix}${String(index).padStart(24 - prefix.length, "0")}`;
  const longName = (index: number) => `${index} `.padEnd(MAX_PARTICIPANT_NAME_LENGTH, "x");
  const longItemName = (index: number) => `${index} `.padEnd(MAX_ROW_NAME_LENGTH, "x");

  function atTheCaps(itemCount = 100): Split {
    const [first, ...rest] = Array.from({ length: itemCount }, (_, index): Item => ({
      id: itemId(longId("item", index)),
      name: longItemName(index),
      price: price(100_000),
    }));
    const result = createSplit({
      id: mintedId(longId("split", 0)),
      receipt: { items: [first, ...rest], adjustments: [], subtotal: cents(itemCount * 100_000), total: cents(itemCount * 100_000) },
      participants: [{ id: participantId(longId("person", 0)), name: longName(0) }],
      paymentHandles: [{ service: "zelle", handle: `${"a".repeat(60)}@example.com` }],
    });
    if (!result.ok) throw new Error(`createSplit rejected: ${JSON.stringify(result.rejection)}`);
    const joined = Array.from({ length: 29 }, (_, index): Operation => ({
      by: null,
      type: "addParticipant",
      participant: { id: participantId(longId("person", index + 1)), name: longName(index + 1) },
    }));
    return apply(result.split, ...joined);
  }

  const deviceOf = (index: number) => deviceId(`device${String(index).padStart(10, "0")}`);
  const itemsBesideEveryPick = 80;

  function pickedByEveryone(): Split {
    const split = atTheCaps(itemsBesideEveryPick);
    return apply(
      split,
      ...split.participants.slice(1).map(({ id }, index): Operation => ({ by: id, type: "pick", participantId: id, device: deviceOf(index + 1), takeOver: false })),
    );
  }

  function payment(split: Split, index: number, amount: number): Operation {
    const paidBy = split.participants[index].id;
    return { by: paidBy, type: "recordPayment", participantId: paidBy, device: deviceOf(index), amount: cents(amount) };
  }

  test("Claims stop with tooLarge before the reserves, then every Payment and a large edit still fit and stay undoable", () => {
    let split = pickedByEveryone();
    const everyone = split.participants.map(({ id }) => id);
    let rejection = "none";
    for (let turn = 0; rejection === "none"; turn++) {
      const op: Operation = {
        by: null,
        type: "claim",
        itemId: split.receipt.items[turn % 80].id,
        participantId: everyone[Math.floor(turn / 80) % 30],
      };
      const result = applyOperation(split, op, anyone);
      if (result.ok) split = result.split;
      else rejection = result.rejection.reason;
    }

    expect(rejection).toBe("tooLarge");

    for (let index = 1; index < everyone.length; index++) {
      split = apply(split, payment(split, index, MAX_CENTS));
      expect(serializedBytes(split)).toBeLessThanOrEqual(SPLIT_BYTE_BUDGET);
      expect(split.recentChanges.at(-1)?.revision).toBe(split.revision);
    }
    expect(split.payments).toHaveLength(29);
    expect(checkSplit(split)).toBeNull();

    const renamed = apply(split, {
      by: null,
      type: "editReceipt",
      items: split.receipt.items.slice(0, 20).map(({ id }, index) => ({ type: "edit", itemId: id, name: longItemName(1000 + index) })),
    });
    expect(serializedBytes(renamed)).toBeLessThanOrEqual(SPLIT_BYTE_BUDGET);
    expect(renamed.recentChanges.at(-1)?.revision).toBe(renamed.revision);
  });

  test("a Receipt too large to keep twice is created without its original, so restoreReceipt refuses it as noOriginal", () => {
    const split = atTheCaps();

    expect(["original" in split, reasonFor(split, { by: null, type: "restoreReceipt" })]).toEqual([false, "noOriginal"]);
  });

  test("with Claims filling the Split, a change of the largest size survives a full history burst after it, so Undo still reaches it", () => {
    let split = pickedByEveryone();
    const everyone = split.participants.map(({ id }) => id);
    for (let turn = 0; ; turn++) {
      const result = applyOperation(
        split,
        { by: null, type: "claim", itemId: split.receipt.items[turn % 80].id, participantId: everyone[Math.floor(turn / 80) % 30] },
        anyone,
      );
      if (!result.ok) break;
      split = result.split;
    }
    const victim = apply(split, {
      by: null,
      type: "editReceipt",
      items: split.receipt.items.slice(0, 20).map(({ id }, index) => ({ type: "edit", itemId: id, name: longItemName(2000 + index) })),
    });
    let flooded = victim;
    let written = 0;
    for (let turn = 0; turn < 100; turn++) {
      const next = apply(flooded, { ...payment(flooded, 1 + (turn % 29), 100 + turn), by: null });
      written += serializedBytes(next.recentChanges.at(-1));
      if (written > MAX_CHANGE_BYTES) break;
      flooded = next;
    }

    expect(serializedBytes(victim.recentChanges.at(-1))).toBeGreaterThan(MAX_CHANGE_BYTES - 1024);
    expect(flooded.revision - victim.revision).toBeGreaterThan(30);
    expect(reasonFor(flooded, { by: null, type: "undo", revision: victim.revision })).toBe("accepted");
  });

  test("a change too big for the history reserve is rejected, so no change lands without its record", () => {
    const split = atTheCaps();
    const doomed = split.receipt.items.slice(0, 50);

    expect(
      reasonFor(split, {
        by: null,
        type: "editReceipt",
        items: doomed.map(({ id }) => ({ type: "delete", itemId: id })),
        subtotalDelta: cents(-50 * 100_000),
        totalDelta: cents(-50 * 100_000),
      }),
    ).toBe("tooLarge");
  });
  test("undoing the delete of a claimed Item is refused as tooLarge once Claims have filled the space it left", () => {
    let split = atTheCaps();
    const everyone = split.participants.map(({ id }) => id);
    const [deleted, ...kept] = split.receipt.items;
    split = apply(split, ...everyone.slice(0, 4).map((id): Operation => ({ by: null, type: "claim", itemId: deleted.id, participantId: id })));
    split = apply(split, {
      by: null,
      type: "editReceipt",
      items: [{ type: "delete", itemId: deleted.id }],
      subtotalDelta: cents(-deleted.price),
      totalDelta: cents(-deleted.price),
    });
    const deletedAt = split.revision;
    let rejection = "none";
    for (let turn = 0; rejection === "none"; turn++) {
      const result = applyOperation(
        split,
        { by: null, type: "claim", itemId: kept[turn % kept.length].id, participantId: everyone[Math.floor(turn / kept.length)] },
        anyone,
      );
      if (result.ok) split = result.split;
      else rejection = result.rejection.reason;
    }

    expect(rejection).toBe("tooLarge");
    expect(split.recentChanges.at(-1)?.revision).toBe(deletedAt);
    expect(reasonFor(split, { by: null, type: "undo", revision: deletedAt })).toBe("tooLarge");
  });
});

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

describe("random operations", () => {
  function content(split: Split) {
    return { receipt: split.receipt, participants: split.participants, payments: split.payments };
  }

  function startingSplit(next: () => number): Split {
    const [first, ...rest] = Array.from({ length: 20 }, (_, index): Item => ({
      id: itemId(`i${index}`),
      name: `Item ${index}`,
      price: price(next() < 0.1 ? 0 : 100 + Math.floor(next() * 4900)),
    }));
    const subtotal = [first, ...rest].reduce((sum, item) => sum + item.price, 0);
    const tax = Math.round(subtotal * 0.08875);
    const tip = Math.round(subtotal * 0.2);
    const split = accepted(
      createSplit({
        id: minted,
        receipt: {
          items: [first, ...rest],
          adjustments: [
            { id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(tax) },
            { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(tip) },
          ],
          subtotal: cents(subtotal),
          total: cents(subtotal + tax + tip),
        },
        participants: [{ id: participantId("p00"), name: "Host" }],
        paymentHandles: [{ service: "venmo", handle: "the-host" }],
      }),
    );
    const joiners = Array.from({ length: 11 }, (_, index): Operation => ({
      by: null,
      type: "addParticipant",
      participant: { id: participantId(`p${String(index + 1).padStart(2, "0")}`), name: `Person ${index + 1}` },
    }));
    const joined = apply(split, ...joiners);
    return apply(
      joined,
      ...joined.participants.slice(1, 7).map(({ id }): Operation => ({ by: id, type: "pick", participantId: id, device: deviceId(`device-${id}`), takeOver: false })),
    );
  }

  function randomOperation(split: Split, next: () => number, fresh: () => string): Operation {
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)];
    const items = split.receipt.items;
    const people = split.participants.map(({ id }) => id);
    const by = next() < 0.2 ? null : pick(people);
    const roll = next();
    if (roll < 0.4) return { by, type: next() < 0.6 ? "claim" : "unclaim", itemId: pick(items).id, participantId: pick(people) };
    if (roll < 0.53) {
      const item = pick(items);
      const to = next() < 0.2 ? 0 : 100 + Math.floor(next() * 4900);
      return next() < 0.15
        ? { by, type: "editReceipt", items: [{ type: "edit", itemId: item.id, price: price(to) }] }
        : priceEdit(by ?? people[0], item.id, item.price, to);
    }
    if (roll < 0.57) {
      const to = Math.floor(next() * 3000);
      const tip = split.receipt.adjustments.find(({ kind }) => kind === "tip");
      if (!tip) return { by, type: "restoreReceipt" };
      return {
        by,
        type: "editReceipt",
        adjustments: [{ type: "edit", adjustmentId: tip.id, amount: cents(to) }],
        totalDelta: cents(to - tip.amount),
      };
    }
    if (roll < 0.61) {
      const amount = Math.floor(next() * 2000);
      return {
        by,
        type: "editReceipt",
        items: [{ type: "add", item: { id: itemId(fresh()), name: "Added", price: price(amount) }, index: Math.floor(next() * (items.length + 1)) }],
        subtotalDelta: cents(amount),
        totalDelta: cents(amount),
      };
    }
    if (roll < 0.65) {
      const item = pick(items);
      return {
        by,
        type: "editReceipt",
        items: [{ type: "delete", itemId: item.id }],
        subtotalDelta: cents(0 - item.price),
        totalDelta: cents(0 - item.price),
      };
    }
    if (roll < 0.73) {
      const paidBy = pick(people);
      const held = split.picks.find((name) => name.participantId === paidBy)?.device;
      const device = held && next() < 0.8 ? held : deviceId("stranger");
      return next() < 0.75
        ? { by, type: "recordPayment", participantId: paidBy, device, amount: cents(1 + Math.floor(next() * 5000)) }
        : { by, type: "clearPayment", participantId: paidBy, device };
    }
    if (roll < 0.78) {
      return next() < 0.5
        ? { by, type: "addParticipant", participant: { id: participantId(fresh()), name: "Joiner" } }
        : { by, type: "removeParticipant", participantId: pick(people) };
    }
    if (roll < 0.8) return { by, type: "restoreReceipt" };
    const target = split.recentChanges.length > 0 ? pick(split.recentChanges).revision : 0;
    return { by, type: "undo", revision: target };
  }

  test.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i keeps Shares, parsing, undo, and Claim bounds across 300 random operations; the caps tests prove the byte budget", (seed) => {
    const next = random(seed);
    let counter = 0;
    const fresh = () => `n${seed}x${counter++}`;
    let split = startingSplit(next);
    const tally = { accepted: 0, rejected: 0, undone: 0 };
    const worstDrift = { claimer: 0, nonClaimer: 0 };

    for (let step = 0; step < 300; step++) {
      const op = randomOperation(split, next, fresh);
      expect(parseOperation(JSON.parse(JSON.stringify(op)))).toEqual({ ok: true, op });

      const before = JSON.stringify(split);
      const result = applyOperation(split, op, anyone);
      expect(JSON.stringify(split)).toBe(before);
      if (!result.ok) {
        tally.rejected += 1;
        continue;
      }
      tally.accepted += 1;
      const previous = split;
      split = result.split;

      const { shares, unclaimed } = computeShares(split);
      expect(shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total).toBe(split.receipt.total);
      expect(checkSplit(split)).toBeNull();
      expect(serializedBytes(split)).toBeLessThanOrEqual(SPLIT_BYTE_BUDGET);
      expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });

      if ((op.type === "claim" || op.type === "unclaim") && result.changed) {
        const item = split.receipt.items.find(({ id }) => id === op.itemId);
        const earlier = previous.receipt.items.find(({ id }) => id === op.itemId);
        const { items: rows, total } = split.receipt;
        const weights = rows.some(({ price }) => price > 0) ? rows.map(({ price }) => price) : rows.map(() => 1);
        const load = (total * weights[rows.findIndex(({ id }) => id === op.itemId)]) / weights.reduce((sum, weight) => sum + weight, 0);
        const exactShareOf = (claimedBy: readonly ParticipantId[] = [], id: ParticipantId) =>
          claimedBy.includes(id) ? load / claimedBy.length : 0;
        const was = new Map(computeShares(previous).shares.map(({ participantId, share }) => [participantId, share]));
        for (const { participantId: id, share } of shares) {
          const exactMove = exactShareOf(item && claimersOf(item.split), id) - exactShareOf(earlier && claimersOf(earlier.split), id);
          const drift = Math.abs(share - (was.get(id) ?? 0) - exactMove);
          const claimer = (item && claimersOf(item.split).includes(id)) || (earlier && claimersOf(earlier.split).includes(id));
          if (claimer) worstDrift.claimer = Math.max(worstDrift.claimer, drift);
          else worstDrift.nonClaimer = Math.max(worstDrift.nonClaimer, drift);
        }
      }

      const newest = split.recentChanges.at(-1);
      const payment = op.type === "recordPayment" || op.type === "clearPayment";
      if (result.changed && newest?.revision === split.revision && !payment) {
        const reverted = accepted(applyOperation(split, { by: null, type: "undo", revision: newest.revision }, anyone));
        expect(content(reverted)).toEqual(content(previous));
        const redone = accepted(applyOperation(reverted, { by: null, type: "undo", revision: reverted.revision }, anyone));
        expect(content(redone)).toEqual(content(split));
        if (op.type === "undo") tally.undone += 1;
      }
    }

    expect(tally.accepted).toBeGreaterThan(150);
    expect(tally.rejected).toBeGreaterThan(10);
    expect(tally.undone).toBeGreaterThan(3);
    expect(worstDrift.nonClaimer).toBeLessThanOrEqual(1);
    expect(worstDrift.claimer).toBeLessThan(2);
  });
});

describe("Bundles", () => {
  const claimed = () => topgolf({ ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason) });
  const bundleItems = (split: Split) => split.receipt.adjustments.flatMap((row) => (row.kind === "bundleDiscount" ? [[row.id, ...row.bundle.items]] : []));
  const deleteItem = (id: string): Operation => {
    const amount = topgolf().receipt.items.find((row) => row.id === id)?.price ?? 0;
    return { by: jason, type: "editReceipt", items: [{ type: "delete", itemId: itemId(id) }], subtotalDelta: cents(-amount), totalDelta: cents(-amount) };
  };

  test("deleting a Bundle's Item drops it from the Bundle in the same Change, and one Revert brings both back", () => {
    const start = claimed();

    const deleted = apply(start, deleteItem("guinness1"));

    expect(bundleItems(deleted)).toEqual([
      ["bucket1", "ultra1", "pineapple1", "watermelon1"],
      ["bucket2", "ultra2", "guinness2", "pineapple2", "watermelon2"],
    ]);
    expect(deleted.recentChanges.map(({ revision }) => revision)).toEqual([1]);
    expect(shareOf(deleted, priya)?.share).toBe(2347);

    const reverted = apply(deleted, { by: priya, type: "undo", revision: 1 });

    expect(reverted.receipt).toEqual(start.receipt);
  });

  test("deleting a Bundle's last Item removes its discount in the same Change, and one Revert brings both back", () => {
    const start = apply(claimed(), deleteItem("guinness1"), deleteItem("pineapple1"), deleteItem("watermelon1"));

    const emptied = apply(start, deleteItem("ultra1"));

    expect(emptied.receipt.adjustments.map(({ id }) => id)).toEqual(["bucket2", "tax", "tip"]);
    expect(emptied.recentChanges.at(-1)?.writes.map(({ kind }) => kind)).toEqual(["item", "adjustment", "totals"]);

    const reverted = apply(emptied, { by: priya, type: "undo", revision: emptied.revision });

    expect(reverted.receipt).toEqual(start.receipt);
    expect(bundleItems(reverted)[0]).toEqual(["bucket1", "ultra1"]);
  });

  test("restoring the original Receipt brings back a Bundle whose Items were all deleted", () => {
    const start = claimed();
    const [first, ...rest] = start.receipt.items.map(({ id, name, price, quantity }): Item => ({ id, name, price, quantity }));
    const original = { ...start.receipt, items: [first, ...rest] as const };
    const emptied = apply({ ...start, original }, ...bucketOne.map(deleteItem));

    const restored = apply(emptied, { by: priya, type: "restoreReceipt" });

    expect(emptied.receipt.adjustments.map(({ id }) => id)).toEqual(["bucket2", "tax", "tip"]);
    expect(bundleItems(restored)).toEqual(bundleItems(start));
    expect(restored.receipt.total).toBe(20729);
  });

  const lineByLine = (split: Split): Split => {
    const [first, ...rest] = split.receipt.items.map(({ quantity, ...row }) => row);
    return { ...split, receipt: { ...split.receipt, items: [first, ...rest] } };
  };

  test("a Bundle discount keeps its kind and stays at or below $0.00", () => {
    const start = lineByLine(claimed());
    const bucket = adjustmentId("bucket1");

    expect(reasonFor(start, { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: bucket, kind: "discount" }] })).toBe("conflict");
    expect(reasonFor(start, { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: bucket, amount: cents(451) }], totalDelta: cents(902) })).toBe("amountOutOfRange");

    const renamed = apply(start, { by: jason, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: bucket, name: "Bucket" }] });

    expect(bundleItems(renamed)).toEqual(bundleItems(start));
  });

  const withOriginal = (start: Split, adjustments: Split["receipt"]["adjustments"] = start.receipt.adjustments): Split => {
    const [first, ...rest] = start.receipt.items.map(({ id, name, price, quantity }): Item => ({ id, name, price, quantity }));
    return { ...start, original: { ...start.receipt, items: [first, ...rest], adjustments } };
  };
  const reloaded = (split: Split) => parseSplit(JSON.parse(JSON.stringify(split)));

  test("restoring a Bundle whose id a plain discount took over stores a Split the Worker can load", () => {
    const start = withOriginal(claimed());
    const bucket = adjustmentId("bucket1");
    const replaced = apply(
      start,
      { by: jason, type: "editReceipt", adjustments: [{ type: "delete", adjustmentId: bucket }], totalDelta: cents(451) },
      { by: jason, type: "editReceipt", adjustments: [{ type: "add", adjustment: { id: bucket, kind: "discount", name: "Coupon", amount: cents(-500) }, index: 0 }], totalDelta: cents(-500) },
    );

    const restored = apply(replaced, { by: priya, type: "restoreReceipt" });

    expect(reloaded(restored)).toEqual({ ok: true, split: restored });
    expect(bundleItems(restored)).toEqual(bundleItems(start));
    expect(restored.receipt.total).toBe(20729);
    const reverted = apply(restored, { by: priya, type: "undo", revision: restored.revision });
    expect(reloaded(reverted)).toEqual({ ok: true, split: reverted });
    expect(reverted.receipt.adjustments[0]).toEqual({ id: bucket, kind: "discount", name: "Coupon", amount: -500 });
  });

  test("restoring a plain discount whose id a Bundle took over stores a Split the Worker can load", () => {
    const start = claimed();
    const bucket = adjustmentId("bucket1");
    const coupon = { id: bucket, kind: "discount", name: "Coupon", amount: cents(-451) } as const;
    const bundled = withOriginal(start, [coupon, ...start.receipt.adjustments.slice(1)]);

    const restored = apply(bundled, { by: priya, type: "restoreReceipt" });

    expect(reloaded(restored)).toEqual({ ok: true, split: restored });
    expect(restored.receipt.adjustments[0]).toEqual(coupon);
    expect(bundleItems(restored)).toEqual([["bucket2", ...bucketTwo]]);
  });
});

describe("random operations on the golden rows", () => {
  const goldenDir = new URL("./golden/", import.meta.url);
  const labels = readdirSync(goldenDir).map((file) => file.replace(/\.json$/, ""));
  const loaded = (label: string): Split => accepted(parseSplit(JSON.parse(readFileSync(new URL(`${label}.json`, goldenDir), "utf8"))));

  function randomOperation(split: Split, next: () => number, fresh: () => string): Operation {
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)];
    const { items, adjustments } = split.receipt;
    const people = split.participants.map(({ id }) => id);
    const adjustmentIds = [...new Set([...adjustments, ...(split.original?.adjustments ?? [])].map(({ id }) => id))];
    const by = pick(people);
    const roll = next();
    if (roll < 0.25) {
      const item = pick(items);
      return { by, type: next() < 0.6 ? "claim" : "unclaim", itemId: item.id, participantId: pick(people) };
    }
    if (roll < 0.35) {
      const item = pick(items);
      return { by, type: "editReceipt", items: [{ type: "delete", itemId: item.id }], subtotalDelta: cents(0 - item.price), totalDelta: cents(0 - item.price) };
    }
    if (roll < 0.45) {
      const item = pick(items);
      const quantity = item.quantity ?? 1;
      const [first, ...rest] = Array.from({ length: Math.max(1, quantity - 1) }, () => itemId(fresh()));
      return { by, type: "editReceipt", items: [{ type: "split", itemId: item.id, ids: [first, ...rest] }] };
    }
    if (roll < 0.55 && adjustments.length > 0) {
      const row = pick(adjustments);
      return { by, type: "editReceipt", adjustments: [{ type: "delete", adjustmentId: row.id }], totalDelta: cents(0 - row.amount) };
    }
    if (roll < 0.65) {
      const id = next() < 0.7 && adjustmentIds.length > 0 ? pick(adjustmentIds) : adjustmentId(fresh());
      const kind = pick(RECEIPT_LEVEL_KINDS);
      const amount = cents(kind === "discount" ? -Math.floor(next() * 800) : Math.floor(next() * 800));
      return { by, type: "editReceipt", adjustments: [{ type: "add", adjustment: { id, kind, name: "Row", amount }, index: Math.floor(next() * (adjustments.length + 1)) }], totalDelta: amount };
    }
    if (roll < 0.72 && adjustments.length > 0) {
      const row = pick(adjustments);
      return next() < 0.5
        ? { by, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: row.id, kind: pick(RECEIPT_LEVEL_KINDS) }] }
        : { by, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: row.id, name: `Renamed ${fresh()}` }] };
    }
    if (roll < 0.8) return { by, type: "restoreReceipt" };
    if (roll < 0.84) return { by, type: "addParticipant", participant: { id: participantId(fresh()), name: `Joiner ${fresh()}` } };
    const target = split.recentChanges.length > 0 ? pick(split.recentChanges).revision : 0;
    return { by, type: "undo", revision: target };
  }

  test.each(labels.flatMap((label) => [1, 2, 3, 4, 5].map((seed) => [label, seed] as const)))(
    "%s, seed %i: every accepted operation stores a Split the Worker can load",
    (label, seed) => {
      const next = random(seed);
      let counter = 0;
      const fresh = () => `g${seed}x${counter++}`;
      let split = loaded(label);
      let kept = 0;
      for (let step = 0; step < 200; step++) {
        const result = applyOperation(split, randomOperation(split, next, fresh), anyone);
        if (!result.ok) continue;
        kept += 1;
        split = result.split;
        expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
      }
      expect(kept).toBeGreaterThan(60);
    },
  );
});

describe("adding an Item with who had it", () => {
  const tea = itemId("tea");
  const addTea = (who: readonly ParticipantId[], index = 3): Operation => ({
    by: bob,
    type: "editReceipt",
    items: [{ type: "add", item: { id: tea, name: "Tea", price: price(300) }, index, who }],
  });

  // The printed Subtotal already counts the Tea the reading missed, as on most adds.
  const missingTea = () =>
    apply(
      created({ ...dinner, subtotal: cents(5500), total: cents(5500) }),
      { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } },
      { by: ann, type: "addParticipant", participant: { id: cat, name: "Cat" } },
    );

  test("lands claimed evenly by the people named, so their Shares hold it to the cent", () => {
    const split = apply(missingTea(), addTea([ann, bob]));

    expect(split.receipt.items.at(-1)).toEqual({ id: tea, name: "Tea", price: 300, split: { by: "even", units: [[ann, bob]] } });
    expect(shareOf(split, "ann")?.share).toBe(150);
    expect(shareOf(split, "bob")?.share).toBe(150);
    expect(shareOf(split, "cat")?.share).toBe(0);
  });

  test("takes who in any order, as people were tapped, and stores the claim the same as in id order", () => {
    const split = apply(missingTea(), addTea([cat, ann]));

    expect(split.receipt.items.at(-1)).toEqual({ id: tea, name: "Tea", price: 300, split: { by: "even", units: [[ann, cat]] } });
    expect(shareOf(split, "ann")?.share).toBe(150);
    expect(shareOf(split, "bob")?.share).toBe(0);
    expect(shareOf(split, "cat")?.share).toBe(150);
  });

  test("is one History change, and its Revert takes the row and its claims off", () => {
    const before = missingTea();
    const split = apply(before, addTea([cat]));
    const reverted = apply(split, { by: ann, type: "undo", revision: split.recentChanges.at(-1)!.revision });

    expect(split.recentChanges).toHaveLength(before.recentChanges.length + 1);
    expect(reverted.receipt.items.map(({ id }) => id)).toEqual([pasta, fries, pitcher]);
    expect(shareOf(split, "cat")?.share).toBe(300);
    expect(shareOf(reverted, "cat")?.share).toBe(0);
  });

  test("refuses a person not in the Split as unknownParticipant and a person named twice as duplicateId", () => {
    expect(reasonFor(withBobAndCat(), addTea([ann, dan]))).toBe("unknownParticipant");
    expect(reasonFor(withBobAndCat(), addTea([bob, bob]))).toBe("duplicateId");
  });

  test("reads who from the wire, and an add without it lands unclaimed", () => {
    const add = { type: "add", item: { id: "tea", name: "Tea", price: 300 }, index: 3 };
    expect(parseOperation({ by: "bob", type: "editReceipt", items: [{ ...add, who: ["ann"] }] })).toEqual({
      ok: true,
      op: { by: bob, type: "editReceipt", items: [{ type: "add", item: { id: tea, name: "Tea", price: 300 }, index: 3, who: [ann] }] },
    });
    expect(parseOperation({ by: "bob", type: "editReceipt", items: [{ ...add, who: [7] }] }).ok).toBe(false);

    const unclaimed = apply(withBobAndCat(), { by: bob, type: "editReceipt", items: [{ type: "add", item: { id: tea, name: "Tea", price: price(300) }, index: 3 }] });
    expect(unclaimed.receipt.items.at(-1)?.split).toEqual({ by: "even", units: [[]] });
  });

  test("at the end of a Split with Bundles joins no Bundle", () => {
    const split = topgolf();
    const added = apply(split, { by: jason, type: "editReceipt", items: [{ type: "add", item: { id: tea, name: "Fries", price: price(650) }, index: split.receipt.items.length, who: [priya] }] });

    expect(added.receipt.items.at(-1)).toMatchObject({ id: tea, name: "Fries", split: { by: "even", units: [[priya]] } });
    expect(added.receipt.adjustments.flatMap((row) => (row.kind === "bundleDiscount" ? row.bundle.items : []))).toEqual([...bucketOne, ...bucketTwo]);
  });
});

describe("an Adjustment edit with the Total following", () => {
  const tax = adjustmentId("tax");
  const tip = adjustmentId("tip");
  const bucket = adjustmentId("bucket1");
  const fix = (by: ParticipantId, ...adjustments: AdjustmentPatch[]): Operation => ({ by, type: "editReceipt", adjustments, totalFollows: true });
  const totals = ({ receipt }: Split) => [receipt.subtotal, receipt.total];
  const misread = () => created({ ...dinner, adjustments: [{ id: tax, kind: "tax", name: "Tax", amount: cents(300) }], total: cents(6000) });

  test("moves the Total by the change when the receipt added up, and the Shares add up to it", () => {
    const split = apply(topgolf({ ...eachOf(bucketOne, jason), ...eachOf(bucketTwo, priya) }), fix(jason, { type: "edit", adjustmentId: tax, amount: cents(600) }));
    const { shares, unclaimed } = computeShares(split);

    expect(totals(split)).toEqual([17923, 20835]);
    expect(shares.reduce((sum: number, { share }) => sum + share, unclaimed.total)).toBe(20835);
  });

  test("keeps the printed Total when the edit fixes a misread tax, so the Total check passes", () => {
    expect(runTotalCheck(misread().receipt).ok).toBe(false);

    const split = apply(misread(), fix(ann, { type: "edit", adjustmentId: tax, amount: cents(800) }));

    expect(totals(split)).toEqual([5200, 6000]);
    expect(runTotalCheck(split.receipt)).toEqual({ ok: true });
  });

  test("adds up after two phones fix different Adjustments from the same Split", () => {
    const fromJason = fix(jason, { type: "edit", adjustmentId: tax, amount: cents(600) });
    const fromPriya = fix(priya, { type: "edit", adjustmentId: tip, amount: cents(3000) });

    expect(totals(apply(topgolf(), fromJason, fromPriya))).toEqual([17923, 20609]);
  });

  test("adds a fee, deletes a Bundle discount and edits one, each moving the Total by its amount", () => {
    const fee = { id: adjustmentId("fee"), kind: "serviceCharge" as const, name: "Bag fee", amount: cents(10) };
    const added = apply(topgolf(), fix(jason, { type: "add", adjustment: fee, index: 4 }));
    const deleted = apply(topgolf(), fix(jason, { type: "delete", adjustmentId: bucket }));
    const edited = apply(topgolf(), fix(jason, { type: "edit", adjustmentId: bucket, name: "Beer Bucket Discount (12%)", amount: cents(-500) }));

    expect(totals(added)).toEqual([17923, 20739]);
    expect(totals(deleted)).toEqual([17923, 21180]);
    expect(totals(edited)).toEqual([17923, 20680]);
    expect(edited.receipt.adjustments[0]).toMatchObject({ id: bucket, kind: "bundleDiscount", name: "Beer Bucket Discount (12%)", amount: -500, bundle: { items: [...bucketOne] } });
  });

  test("is one History change whose Revert puts back the amount and the Total", () => {
    const before = apply(misread(), { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } });
    const split = apply(before, fix(bob, { type: "edit", adjustmentId: tax, amount: cents(900) }));
    const reverted = apply(split, { by: ann, type: "undo", revision: split.revision });

    expect(split.recentChanges.at(-1)?.writes).toEqual([
      { kind: "adjustment", id: tax, edit: { amount: [300, 900] } },
      { kind: "totals", subtotalDelta: 0, totalDelta: 100 },
    ]);
    expect(reverted.receipt).toEqual(before.receipt);
  });

  test("refuses a Total delta sent with it as a conflict, and a discount that takes the Total under zero", () => {
    const promo = (amount: number) => ({ type: "add" as const, adjustment: { id: adjustmentId("promo"), kind: "discount" as const, name: "Promo", amount: cents(amount) }, index: 0 });

    expect(reasonFor(created(), { by: ann, type: "editReceipt", adjustments: [promo(-100)], totalFollows: true, totalDelta: cents(-100) })).toBe("conflict");
    expect(reasonFor(created(), fix(ann, promo(-5300)))).toBe("negativeTotal");
  });

  test("reads totalFollows from the wire only as true", () => {
    const wire = { by: "ann", type: "editReceipt", adjustments: [{ type: "delete", adjustmentId: "tax" }] };

    expect(parseOperation({ ...wire, totalFollows: true })).toEqual({ ok: true, op: { ...wire, totalFollows: true } });
    expect(parseOperation({ ...wire, totalFollows: false })).toEqual({ ok: false, rejection: { reason: "malformed", path: "totalFollows" } });
  });
});
