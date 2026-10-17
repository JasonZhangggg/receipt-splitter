import { describe, expect, it } from "vitest";

import { cents, price } from "../core/money";
import { applyOperation, createSplit, landed, type Operation, type Optimistic, type ServerMessage } from "../core/operations";
import { computeShares } from "../core/shares";
import { adjustmentId, deviceId, itemId, participantId, type Split } from "../core/split";
import { mintedId } from "../core/test-ids";
import { fold, received, refOf, type Laid, type Seen } from "./layer";

const ann = participantId("ann");
const bob = participantId("bob");
const cat = participantId("cat");
const rice = itemId("rice");
const fries = itemId("fries");
const sprite = itemId("sprite");

function dinner(): Split {
  const made = createSplit({
    id: mintedId("q7Xv0Lr9_aZ-3mKp"),
    receipt: {
      items: [
        { id: rice, name: "Rice", price: price(800) },
        { id: fries, name: "Fries", price: price(100) },
        { id: sprite, name: "Sprite", price: price(250) },
      ],
      adjustments: [],
      subtotal: cents(1150),
      total: cents(1150),
    },
    participants: [{ id: ann, name: "Ann" }],
    paymentHandles: [],
  });
  if (!made.ok) throw new Error("fixture");
  let split = made.split;
  for (const [id, name] of [[bob, "Bob"], [cat, "Cat"]] as const) {
    const added = applyOperation(split, { by: ann, type: "addParticipant", participant: { id, name } }, { creator: false });
    if (!added.ok) throw new Error("fixture");
    split = added.split;
  }
  const picked = applyOperation(split, { by: bob, type: "pick", participantId: bob, device: deviceId("bob-phone"), takeOver: false }, { creator: false });
  if (!picked.ok) throw new Error("fixture");
  return picked.split;
}

const claim = (who: typeof bob, item: typeof rice): Optimistic => ({ by: who, type: "claim", itemId: item, participantId: who });
const unclaim = (who: typeof bob, item: typeof rice): Optimistic => ({ by: who, type: "unclaim", itemId: item, participantId: who });

/** What the server does: applies the op to its Split. */
function serve(split: Split, op: Operation): Split {
  const result = applyOperation(split, op, { creator: false });
  if (!result.ok) throw new Error(`the server refused ${op.type}: ${result.rejection.reason}`);
  return result.split;
}

const sharesOf = (split: Split) => Object.fromEntries(computeShares(split).shares.map(({ participantId: who, share }) => [who, share]));
const laid = (...ops: Optimistic[]): Laid[] => ops.map((op, seq) => ({ seq, ref: refOf(seq), op }));
const state = (split: Split, ref: string | null): ServerMessage => ({ type: "state", ref, photo: false, split });
const nobody = new Set<string>();

function seenOf(split: Split, queue: readonly Laid[]): Seen {
  return { id: "x", base: { status: "live", split, photo: false }, laid: queue };
}
const viewOf = (seen: Seen): Split => {
  if (seen.base.status !== "live") throw new Error("not live");
  return fold(seen.base.split, seen.laid);
};

describe("fold", () => {
  it("shows a claim before the server has it", () => {
    const server = dinner();
    expect(sharesOf(server)).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(sharesOf(fold(server, laid(claim(bob, rice))))).toEqual({ ann: 0, bob: 800, cat: 0 });
  });

  it("a claim then an unclaim folds to unclaimed", () => {
    expect(sharesOf(fold(dinner(), laid(claim(bob, rice), unclaim(bob, rice))))).toEqual({ ann: 0, bob: 0, cat: 0 });
  });

  it("an op the server's Split already holds counts once: the echo plus a still-laid op", () => {
    const server = serve(dinner(), claim(bob, rice));
    expect(sharesOf(fold(server, laid(claim(bob, rice))))).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(fold(server, laid(claim(bob, rice)))).toBe(server);
  });

  it("the same holds for an add, a delete and a payment", () => {
    const added: Operation = { by: bob, type: "editReceipt", items: [{ type: "add", item: { id: itemId("nachos"), name: "Nachos", price: price(900) }, index: 3, who: [bob] }] };
    const server = serve(dinner(), added);
    expect(sharesOf(fold(server, laid(added as Optimistic)))).toEqual({ ann: 0, bob: 900, cat: 0 });
    expect(fold(server, laid(added as Optimistic)).receipt.total).toBe(2050);

    const deleted: Optimistic = { by: bob, type: "editReceipt", items: [{ type: "delete", itemId: sprite }] };
    const gone = serve(dinner(), deleted);
    expect(fold(gone, laid(deleted)).receipt.total).toBe(900);

    const owing = serve(dinner(), claim(bob, rice));
    const pay: Optimistic = { by: bob, type: "recordPayment", participantId: bob, device: deviceId("bob-phone"), amount: cents(800) };
    const paid = serve(owing, pay);
    expect(fold(paid, laid(pay)).payments).toEqual([{ participantId: bob, amount: 800 }]);
  });

  it("several pending ops apply in send order", () => {
    const view = fold(dinner(), laid(claim(bob, rice), claim(cat, rice), claim(cat, sprite), unclaim(bob, rice)));
    expect(sharesOf(view)).toEqual({ ann: 0, bob: 0, cat: 1050 });
  });

  it("a rejected op is skipped and the later ones still show", () => {
    const stranger = participantId("stranger");
    const view = fold(dinner(), laid(claim(stranger, rice), claim(cat, rice), claim(cat, sprite)));
    expect(sharesOf(view)).toEqual({ ann: 0, bob: 0, cat: 1050 });
  });

  it("a rejected add takes the claim on it with it, as the server will", () => {
    const nachos = itemId("nachos");
    const tooMany: Optimistic = { by: bob, type: "editReceipt", items: [{ type: "add", item: { id: nachos, name: "Nachos", price: price(900) }, index: 99 }] };
    const view = fold(dinner(), laid(tooMany, claim(bob, nachos), claim(bob, rice)));
    expect(sharesOf(view)).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(view.receipt.items.map(({ id }) => id)).toEqual([rice, fries, sprite]);
  });

  it("keeps the server's revision and history, so a Revert never names a guessed revision", () => {
    const server = serve(dinner(), { by: ann, type: "editReceipt", items: [{ type: "delete", itemId: fries }] });
    const view = fold(server, laid({ by: ann, type: "editReceipt", items: [{ type: "delete", itemId: sprite }] }));
    expect(view.receipt.items.map(({ id }) => id)).toEqual([rice]);
    expect(view.revision).toBe(server.revision);
    expect(view.recentChanges).toBe(server.recentChanges);
  });
});

describe("received", () => {
  it("an answer with a ref swaps in its Split and drops that op in one step, so one render never counts it twice", () => {
    const start = dinner();
    const queue = laid(claim(bob, rice), unclaim(bob, rice), claim(bob, fries));
    // The server has applied the first op and answers it.
    const afterFirst = serve(start, claim(bob, rice));
    const next = received(seenOf(start, queue), state(afterFirst, refOf(0)), nobody);
    expect(next.laid.map(({ ref }) => ref)).toEqual(["r1", "r2"]);
    expect(sharesOf(viewOf(next))).toEqual({ ann: 0, bob: 100, cat: 0 });
    // Then the second.
    const afterSecond = serve(afterFirst, unclaim(bob, rice));
    const last = received(next, state(afterSecond, refOf(1)), nobody);
    expect(last.laid.map(({ ref }) => ref)).toEqual(["r2"]);
    expect(sharesOf(viewOf(last))).toEqual({ ann: 0, bob: 100, cat: 0 });
  });

  it("a rejection or an unchanged answer drops that op and the Split goes back to the server's", () => {
    const start = dinner();
    const queue = laid(claim(bob, rice), claim(cat, sprite));
    const refused = received(seenOf(start, queue), { type: "rejected", ref: "r0", rejection: { reason: "unknownItem" } }, nobody);
    expect(refused.laid.map(({ ref }) => ref)).toEqual(["r1"]);
    expect(sharesOf(viewOf(refused))).toEqual({ ann: 0, bob: 0, cat: 250 });
    const same = received(refused, { type: "unchanged", ref: "r1", revision: start.revision }, nobody);
    expect(same.laid).toEqual([]);
    expect(sharesOf(viewOf(same))).toEqual({ ann: 0, bob: 0, cat: 0 });
  });

  it("another phone's Split arriving mid-flight is rebuilt under the ops still waiting", () => {
    const start = dinner();
    const queue = laid(claim(bob, rice));
    const theirs = serve(start, claim(cat, rice));
    const next = received(seenOf(start, queue), state(theirs, null), nobody);
    expect(next.laid).toHaveLength(1);
    expect(sharesOf(viewOf(next))).toEqual({ ann: 0, bob: 400, cat: 400 });
    // The server's answer for ours then carries both.
    const ours = serve(theirs, claim(bob, rice));
    const done = received(next, state(ours, refOf(0)), nobody);
    expect(done.laid).toEqual([]);
    expect(sharesOf(viewOf(done))).toEqual({ ann: 0, bob: 400, cat: 400 });
  });

  it("another phone deleting the Item under a laid claim removes the line at once", () => {
    const start = dinner();
    const theirs = serve(start, { by: cat, type: "editReceipt", items: [{ type: "delete", itemId: rice }] });
    const next = received(seenOf(start, laid(claim(bob, rice))), state(theirs, null), nobody);
    expect(sharesOf(viewOf(next))).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(viewOf(next).receipt.items.map(({ id }) => id)).toEqual([fries, sprite]);
  });

  it("the join snapshot settles the ops that were waiting across a reconnect, and keeps the ones sent since", () => {
    const start = dinner();
    const queue = laid(claim(bob, rice), claim(cat, sprite));
    const joined = received(seenOf(start, queue), state(start, null), new Set(["r0"]));
    expect(joined.laid.map(({ ref }) => ref)).toEqual(["r1"]);
    expect(sharesOf(viewOf(joined))).toEqual({ ann: 0, bob: 0, cat: 250 });
  });

  it("an answer for a later ref also clears an earlier op the server never answered by ref", () => {
    const start = dinner();
    const answered = serve(start, claim(cat, sprite));
    const next = received(seenOf(start, laid(claim(bob, rice), claim(cat, sprite))), state(answered, refOf(1)), nobody);
    expect(next.laid).toEqual([]);
    expect(sharesOf(viewOf(next))).toEqual({ ann: 0, bob: 0, cat: 250 });
  });
});

describe("landed", () => {
  const split = serve(serve(dinner(), claim(bob, rice)), { by: bob, type: "recordPayment", participantId: bob, device: deviceId("bob-phone"), amount: cents(500) });

  it.each([
    ["a claim already on the Item", claim(bob, rice), true],
    ["a claim not on the Item", claim(cat, rice), false],
    ["a claim on an Item that is gone", claim(bob, itemId("nope")), false],
    ["an unclaim of someone who is on the Item", unclaim(bob, rice), false],
    ["an unclaim of someone who is off it", unclaim(cat, rice), true],
    ["the amount already recorded", { by: bob, type: "recordPayment", participantId: bob, device: deviceId("bob-phone"), amount: cents(500) }, true],
    ["another amount", { by: bob, type: "recordPayment", participantId: bob, device: deviceId("bob-phone"), amount: cents(800) }, false],
    ["clearing a payment that exists", { by: bob, type: "clearPayment", participantId: bob, device: deviceId("bob-phone") }, false],
    ["clearing a payment that is gone", { by: cat, type: "clearPayment", participantId: cat, device: deviceId("cat-phone") }, true],
    ["adding an Item the Split lacks", { by: bob, type: "editReceipt", items: [{ type: "add", item: { id: itemId("nachos"), name: "Nachos", price: price(900) }, index: 3 }] }, false],
    ["deleting an Item the Split has", { by: bob, type: "editReceipt", items: [{ type: "delete", itemId: rice }] }, false],
    ["deleting an Item the Split lacks", { by: bob, type: "editReceipt", items: [{ type: "delete", itemId: itemId("nope") }] }, true],
    ["adding a charge the Split lacks", { by: bob, type: "editReceipt", adjustments: [{ type: "add", adjustment: { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(200) }, index: 0 }] }, false],
  ] satisfies [string, Optimistic, boolean][])("%s", (_, op, expected) => {
    expect(landed(split, op)).toBe(expected);
  });

  it("an undo is landed once the change it names is marked undone", () => {
    const edited = serve(dinner(), { by: ann, type: "editReceipt", items: [{ type: "delete", itemId: sprite }] });
    const undo: Optimistic = { by: ann, type: "undo", revision: edited.revision };
    expect(landed(edited, undo)).toBe(false);
    expect(landed(serve(edited, undo), undo)).toBe(true);
  });
});
