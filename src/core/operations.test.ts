import { describe, expect, test } from "vitest";
import { MAX_CENTS, cents, price } from "./money";
import {
  MAX_PARTICIPANT_NAME_LENGTH,
  MAX_ROW_NAME_LENGTH,
  applyOperation,
  checkSplit,
  createSplit,
  type Auth,
  type Operation,
  type Rejected,
} from "./operations";
import { parseOperation, parseSplit } from "./parse";
import { computeShares } from "./shares";
import {
  SPLIT_BYTE_BUDGET,
  adjustmentId,
  isMintedSplitId,
  itemId,
  participantId,
  serializedBytes,
  type Item,
  type MintedSplitId,
  type ParticipantId,
  type Receipt,
  type Split,
} from "./split";

const ann = participantId("ann");
const bob = participantId("bob");
const cat = participantId("cat");
const dan = participantId("dan");
const pasta = itemId("pasta");
const fries = itemId("fries");
const pitcher = itemId("pitcher");
const anyone: Auth = { creator: false };

function mintedId(value: string): MintedSplitId {
  if (!isMintedSplitId(value)) throw new RangeError(`${value} is not a minted Split id`);
  return value;
}

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
      schemaVersion: 1,
      id: "q7Xv0Lr9_aZ-3mKp",
      currency: "USD",
      receipt: {
        items: [
          { id: "pasta", name: "Pasta", price: 1400, claimedBy: [] },
          { id: "fries", name: "Fries", price: 800, claimedBy: [] },
          { id: "pitcher", name: "Pitcher", price: 3000, claimedBy: [] },
        ],
        adjustments: [],
        subtotal: 5200,
        total: 5200,
      },
      participants: [{ id: "ann", name: "Ann" }],
      joined: [],
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
      joined: [],
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

  test("refuses a Receipt that fails the Total check", () => {
    const result = createSplit({
      id: minted,
      receipt: { ...dinner, subtotal: cents(5300), total: cents(5300) },
      participants: [{ id: ann, name: "Ann" }],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        reason: "totalCheckFailed",
        check: { ok: false, subtotalGap: 100, totalGap: 0, itemIds: [], adjustmentIds: [], suspects: [] },
      },
    });
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

    expect(claimed.receipt.items[0].claimedBy).toEqual(["Zed", "bob", "cat"]);
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

    expect(edited.receipt.items[1]).toEqual({ id: "fries", name: "Fries", price: 600, claimedBy: [] });
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

describe("joining", () => {
  const join = (participantId: ParticipantId, joined = true): Operation => ({ by: participantId, type: "setJoined", participantId, joined });

  test("marks a Participant joined in id order without a recent change, and records an unmark that Undo reverses", () => {
    const split = apply(withBobAndCat(), join(cat), join(bob));
    const left = apply(split, { by: null, type: "setJoined", participantId: cat, joined: false });

    expect([split.joined, split.revision, split.recentChanges.length]).toEqual([["bob", "cat"], 4, 2]);
    expect([left.joined, left.revision, left.recentChanges.at(-1)?.writes]).toEqual([["bob"], 5, [{ kind: "joined", participantId: "cat", joined: false }]]);
    expect(apply(left, { by: ann, type: "undo", revision: 5 }).joined).toEqual(["bob", "cat"]);
  });

  test("a second device's pick of a taken name is refused as namePicked, an unmark of a free name changes nothing, and an unknown Participant is refused", () => {
    const picked = apply(withBobAndCat(), join(bob));

    expect(reasonFor(picked, join(bob))).toBe("namePicked");
    expect(applyOperation(picked, join(cat, false), anyone)).toEqual({ ok: true, split: picked, changed: false });
    expect(reasonFor(picked, { by: null, type: "setJoined", participantId: dan, joined: true })).toBe("unknownParticipant");
  });

  test("undoing an unmark is refused as namePicked once another device has picked the name, and lands once it is free again", () => {
    const released = apply(withBobAndCat(), join(bob), join(bob, false));
    const unmark = released.revision;
    const retaken = apply(released, join(bob));

    expect(reasonFor(retaken, { by: ann, type: "undo", revision: unmark })).toBe("namePicked");
    expect(apply(retaken, join(bob, false), { by: ann, type: "undo", revision: unmark }).joined).toEqual(["bob"]);
  });

  test("keeps a picked Participant from being taken out by undoing their add", () => {
    const split = apply(withBobAndCat(), join(bob));

    expect(reasonFor(split, { by: ann, type: "undo", revision: 1 })).toBe("participantInUse");
    expect(reasonFor(split, { by: ann, type: "undo", revision: 2 })).toBe("accepted");
  });
});

describe("Payments", () => {
  function claimedDinner(): Split {
    return apply(
      withBobAndCat(),
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
      { by: bob, type: "recordPayment", participantId: bob, amount: cents(1800) },
      { by: cat, type: "recordPayment", participantId: cat, amount: cents(2400) },
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

  test("a Payment can be undone, and the Host cannot record one", () => {
    const paid = apply(claimedDinner(), { by: bob, type: "recordPayment", participantId: bob, amount: cents(1800) });
    const undone = apply(paid, { by: bob, type: "undo", revision: paid.revision });

    expect(undone.payments).toEqual([]);
    expect(shareOf(undone, "bob")).toEqual({ participantId: "bob", share: 1800, paid: 0, owed: 1800 });
    expect(reasonFor(paid, { by: ann, type: "recordPayment", participantId: ann, amount: cents(1000) })).toBe("host");
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
  test("a price edit that breaks the Total check is rejected with the gap, naming the edited row", () => {
    const result = applyOperation(withBobAndCat(), { by: bob, type: "editReceipt", items: [{ type: "edit", itemId: fries, price: price(600) }] }, anyone);

    expect(result).toEqual({
      ok: false,
      rejection: {
        reason: "totalCheckFailed",
        check: { ok: false, subtotalGap: 200, totalGap: 0, itemIds: ["fries"], adjustmentIds: [], suspects: [] },
      },
    });
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
    expect(restored.receipt.items[1]).toEqual({ id: "fries", name: "Fries", price: 800, claimedBy: ["bob", "cat"] });
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

  test("undoing an added Item that has been Claimed since is a conflict until the Claim is gone", () => {
    const dessert = itemId("dessert");
    const added = apply(withBobAndCat(), {
      by: ann,
      type: "editReceipt",
      items: [{ type: "add", item: { id: dessert, name: "Dessert", price: price(900) }, index: 3 }],
      subtotalDelta: cents(900),
      totalDelta: cents(900),
    });
    const claimed = apply(added, { by: bob, type: "claim", itemId: dessert, participantId: bob });

    expect(reasonFor(claimed, { by: cat, type: "undo", revision: 3 })).toBe("conflict");

    const unclaimed = apply(claimed, { by: bob, type: "unclaim", itemId: dessert, participantId: bob });
    expect(apply(unclaimed, { by: cat, type: "undo", revision: 3 }).receipt).toEqual(withBobAndCat().receipt);
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
    const split = apply(
      withBobAndCat(),
      { by: bob, type: "claim", itemId: fries, participantId: bob },
      { by: cat, type: "recordPayment", participantId: cat, amount: cents(500) },
    );

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

  test("a redo of an undone add is refused once someone else has taken the name", () => {
    const removed = apply(withBobAndCat(), { by: cat, type: "undo", revision: 1 });
    const retaken = apply(removed, { by: null, type: "addParticipant", participant: { id: dan, name: "BOB" } });

    expect(reasonFor(retaken, { by: cat, type: "undo", revision: removed.revision })).toBe("nameTaken");
  });

  test("a stored Split that already repeats a name still reads, so the rule needs no schema change", () => {
    const stored = { ...withBobAndCat(), participants: [...withBobAndCat().participants, { id: dan, name: "BOB" }] };

    expect(parseSplit(JSON.parse(JSON.stringify(stored)))).toMatchObject({ ok: true, split: { participants: { 3: { name: "BOB" } } } });
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

describe("splitting Unclaimed items", () => {
  test("gives every Unclaimed item to every Participant in one change that undo reverses", () => {
    const split = apply(withBobAndCat(), { by: bob, type: "claim", itemId: fries, participantId: bob });
    const everyone = apply(split, { by: cat, type: "splitUnclaimed" });

    expect(everyone.receipt.items.map(({ id, claimedBy }) => [id, claimedBy])).toEqual([
      ["pasta", ["ann", "bob", "cat"]],
      ["fries", ["bob"]],
      ["pitcher", ["ann", "bob", "cat"]],
    ]);
    expect(everyone.recentChanges.at(-1)?.writes).toEqual([
      { kind: "claims", itemIds: ["pasta", "pitcher"], participantIds: ["ann", "bob", "cat"], claimed: true },
    ]);
    expect(computeShares(everyone).shares.map(({ share }) => share)).toEqual([1467, 2266, 1467]);
    expect(computeShares(everyone).unclaimed).toEqual({ itemIds: [], subtotal: 0, total: 0 });
    expect(apply(everyone, { by: bob, type: "undo", revision: everyone.revision }).receipt).toEqual(split.receipt);
  });

  test("its undo removes only the Claims still in place after someone unclaims, and redo puts back only those", () => {
    const everyone = apply(withBobAndCat(), { by: cat, type: "splitUnclaimed" });
    const corrected = apply(everyone, { by: ann, type: "unclaim", itemId: pitcher, participantId: ann });

    const undone = apply(corrected, { by: bob, type: "undo", revision: 3 });

    expect(undone.receipt).toEqual(withBobAndCat().receipt);
    expect(undone.recentChanges.at(-1)?.writes).toEqual([
      { kind: "claims", itemIds: ["pasta", "fries"], participantIds: ["ann", "bob", "cat"], claimed: false },
      { kind: "claims", itemIds: ["pitcher"], participantIds: ["bob", "cat"], claimed: false },
    ]);

    const redone = apply(undone, { by: bob, type: "undo", revision: undone.revision });
    expect(redone.receipt).toEqual(corrected.receipt);
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
    const split = withBobAndCat();

    expect(reasonFor(split, { by: bob, type: "recordPayment", participantId: bob, amount: cents(MAX_CENTS + 1) })).toBe("amountOutOfRange");
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

  function atTheCaps(): Split {
    const [first, ...rest] = Array.from({ length: 100 }, (_, index): Item => ({
      id: itemId(longId("item", index)),
      name: longItemName(index),
      price: price(100_000),
    }));
    const result = createSplit({
      id: mintedId(longId("split", 0)),
      receipt: { items: [first, ...rest], adjustments: [], subtotal: cents(MAX_CENTS), total: cents(MAX_CENTS) },
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

  test("Claims stop with tooLarge before the reserves, then every Payment and a large edit still fit and stay undoable", () => {
    let split = atTheCaps();
    const everyone = split.participants.map(({ id }) => id);
    let rejection = "none";
    for (let turn = 0; rejection === "none"; turn++) {
      const op: Operation = {
        by: null,
        type: "claim",
        itemId: split.receipt.items[turn % 100].id,
        participantId: everyone[Math.floor(turn / 100) % 30],
      };
      const result = applyOperation(split, op, anyone);
      if (result.ok) split = result.split;
      else rejection = result.rejection.reason;
    }

    expect(rejection).toBe("tooLarge");

    for (const paidBy of everyone.slice(1)) {
      split = apply(split, { by: paidBy, type: "recordPayment", participantId: paidBy, amount: cents(MAX_CENTS) });
      expect(serializedBytes(split)).toBeLessThanOrEqual(SPLIT_BYTE_BUDGET);
      expect(split.recentChanges.at(-1)?.revision).toBe(split.revision);
    }
    expect(split.payments).toHaveLength(29);
    expect(checkSplit(split)).toBeNull();

    const renamed = apply(split, {
      by: null,
      type: "editReceipt",
      items: split.receipt.items.slice(0, 25).map(({ id }, index) => ({ type: "edit", itemId: id, name: longItemName(1000 + index) })),
    });
    expect(serializedBytes(renamed)).toBeLessThanOrEqual(SPLIT_BYTE_BUDGET);
    expect(renamed.recentChanges.at(-1)?.revision).toBe(renamed.revision);
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
    split = apply(split, ...everyone.slice(0, 10).map((id): Operation => ({ by: null, type: "claim", itemId: deleted.id, participantId: id })));
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

describe("random operations", () => {
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

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
    return apply(split, ...joiners);
  }

  function randomOperation(split: Split, next: () => number, fresh: () => string): Operation {
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)];
    const items = split.receipt.items;
    const people = split.participants.map(({ id }) => id);
    const by = next() < 0.2 ? null : pick(people);
    const roll = next();
    if (roll < 0.4) return { by, type: next() < 0.6 ? "claim" : "unclaim", itemId: pick(items).id, participantId: pick(people) };
    if (roll < 0.43) return { by, type: "splitUnclaimed" };
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
      if (!tip) return { by, type: "splitUnclaimed" };
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
      return next() < 0.75
        ? { by, type: "recordPayment", participantId: paidBy, amount: cents(1 + Math.floor(next() * 5000)) }
        : { by, type: "clearPayment", participantId: paidBy };
    }
    if (roll < 0.78) {
      return next() < 0.5
        ? { by, type: "addParticipant", participant: { id: participantId(fresh()), name: "Joiner" } }
        : { by, type: "removeParticipant", participantId: pick(people) };
    }
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
          const exactMove = exactShareOf(item?.claimedBy, id) - exactShareOf(earlier?.claimedBy, id);
          const drift = Math.abs(share - (was.get(id) ?? 0) - exactMove);
          const claimer = item?.claimedBy.includes(id) || earlier?.claimedBy.includes(id);
          if (claimer) worstDrift.claimer = Math.max(worstDrift.claimer, drift);
          else worstDrift.nonClaimer = Math.max(worstDrift.nonClaimer, drift);
        }
      }

      const newest = split.recentChanges.at(-1);
      if (result.changed && newest?.revision === split.revision) {
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
