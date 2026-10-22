import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { applyOperation, createSplit, type Operation } from "../../core/operations";
import { parseSplit } from "../../core/parse";
import { computeShares } from "../../core/shares";
import { adjustmentId, deviceId, itemId, participantId, type MintedSplitId, type Split } from "../../core/split";
import { historyOf, restoreChanges, whenText } from "./describe";

const [ann, sam] = [participantId("ann"), participantId("sam")];
const sprite = itemId("sprite");

function split(...ops: Operation[]): Split {
  const created = createSplit({
    id: "q7Xv0Lr9_aZ-3mKpAbCdEf" as MintedSplitId,
    receipt: {
      items: [{ id: sprite, name: "Sprite", price: price(250) }],
      adjustments: [{ id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(50) }],
      subtotal: cents(250),
      total: cents(300),
    },
    participants: [
      { id: ann, name: "Ann" },
      { id: sam, name: "Sam" },
    ],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  });
  if (!created.ok) throw new Error(JSON.stringify(created.rejection));
  return ops.reduce((current, op, index) => {
    const result = applyOperation(current, op, { creator: false }, 1_000 * (index + 1));
    if (!result.ok) throw new Error(JSON.stringify(result.rejection));
    return result.split;
  }, created.split);
}

describe("historyOf", () => {
  test("lists a price change, a split change, and a Payment newest first, and leaves out picks, Claims, added people, and the Undo itself, and only a Payment cannot be reverted", () => {
    const history = historyOf(
      split(
        { by: sam, type: "pick", participantId: sam, device: deviceId("phone"), takeOver: false },
        { by: sam, type: "claim", itemId: sprite, participantId: sam },
        { by: null, type: "addParticipant", participant: { id: participantId("lee"), name: "Lee" } },
        { by: sam, type: "editReceipt", items: [{ type: "edit", itemId: sprite, price: price(275) }] },
        { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "amount", values: [{ participantId: sam, value: 100 }] }] },
        { by: ann, type: "undo", revision: 5 },
        { by: sam, type: "recordPayment", participantId: sam, device: deviceId("phone"), amount: cents(300) },
      ),
    );

    expect(history).toEqual([
      { revision: 7, lead: "Sam paid $3.00", more: 0, sentAs: "sam", name: "Sam", byline: false, at: 7_000, reverted: false, revertible: false },
      { revision: 5, lead: "Sprite split", before: "evenly", after: "by amount", more: 0, sentAs: "ann", name: "Ann", byline: true, at: 5_000, reverted: true, revertible: true },
      { revision: 4, lead: "Sprite", before: "2.50", after: "2.75", more: 0, sentAs: "sam", name: "Sam", byline: true, at: 4_000, reverted: false, revertible: true },
    ]);
  });

  test("a removal is one revertible line naming the person, even when it unclaimed their Item and cleared their Payment", () => {
    const history = historyOf(
      split(
        { by: sam, type: "pick", participantId: sam, device: deviceId("phone"), takeOver: false },
        { by: sam, type: "claim", itemId: sprite, participantId: sam },
        { by: sam, type: "recordPayment", participantId: sam, device: deviceId("phone"), amount: cents(300) },
        { by: ann, type: "removeParticipant", participantId: sam },
      ),
    );

    expect(history[0]).toEqual({ revision: 4, lead: "Removed Sam from the split", more: 0, sentAs: "ann", name: "Ann", byline: true, at: 4_000, reverted: false, revertible: true });
  });

  test("a deleted Item reads Deleted, the word the undo bar uses", () => {
    const fries = itemId("fries");
    const history = historyOf(
      split(
        { by: sam, type: "editReceipt", items: [{ type: "add", item: { id: fries, name: "Fries", price: price(400) }, index: 1, who: [] }] },
        { by: sam, type: "editReceipt", items: [{ type: "delete", itemId: fries }] },
      ),
    );

    expect(history.map(({ lead }) => lead)).toEqual(["Deleted Fries", "Added Fries"]);
  });

  test("a change of split reads in words, never as a ratio, and back-to-back switches by one person read as one entry from the first to the last", () => {
    const history = historyOf(
      split(
        { by: sam, type: "claim", itemId: sprite, participantId: sam },
        { by: ann, type: "claim", itemId: sprite, participantId: ann },
        { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "shares", values: [{ participantId: sam, value: 1 }, { participantId: ann, value: 1 }] }] },
        { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "amount", values: [{ participantId: sam, value: 100 }, { participantId: ann, value: 150 }] }] },
      ),
    );

    expect(history.map(({ revision, lead, before, after, at }) => [revision, lead, before, after, at])).toEqual([[3, "Sprite split", "evenly", "by amount", 4_000]]);
  });

  test("leaves out a switch that moves nobody's money, alone or as a run that ends where it started", () => {
    const shares: Operation = { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "shares" }] };
    const amount: Operation = { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "amount" }] };
    const even: Operation = { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "even" }] };
    const claims: Operation[] = [
      { by: sam, type: "claim", itemId: sprite, participantId: sam },
      { by: ann, type: "claim", itemId: sprite, participantId: ann },
    ];

    expect(historyOf(split(...claims, shares))).toEqual([]);
    expect(historyOf(split(...claims, shares, amount, even, shares))).toEqual([]);
  });

  test("share counts typed one after another join the switch before them", () => {
    const shares = (value: number): Operation => ({ by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "shares", values: [{ participantId: sam, value }, { participantId: ann, value: 1 }] }] });
    const history = historyOf(split({ by: sam, type: "claim", itemId: sprite, participantId: sam }, { by: ann, type: "claim", itemId: sprite, participantId: ann }, shares(2), shares(3)));

    expect(history.map(({ lead, before, after }) => [lead, before, after])).toEqual([["Sprite split", "evenly", "by shares"]]);
    expect(historyOf(split({ by: sam, type: "claim", itemId: sprite, participantId: sam }, { by: ann, type: "claim", itemId: sprite, participantId: ann }, shares(1), shares(2))).map(({ lead }) => lead)).toEqual([
      "Sprite split",
    ]);
  });

  test("a run breaks at another person's switch, and each part keeps its own Revert", () => {
    const by = (who: typeof ann, value: number): Operation => ({ by: who, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "shares", values: [{ participantId: sam, value }, { participantId: ann, value: 1 }] }] });
    const history = historyOf(split({ by: sam, type: "claim", itemId: sprite, participantId: sam }, { by: ann, type: "claim", itemId: sprite, participantId: ann }, by(ann, 2), by(sam, 3)));

    expect(history.map(({ revision, lead, before, after, sentAs }) => [revision, lead, before, after, sentAs])).toEqual([
      [4, "Changed how Sprite is split", undefined, undefined, "sam"],
      [3, "Sprite split", "evenly", "by shares", "ann"],
    ]);
  });

  test("reverting a run's entry puts the Item back as it was before the run, and the entry reads as reverted", () => {
    const shares = (value: number): Operation => ({ by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "shares", values: [{ participantId: sam, value }, { participantId: ann, value: 1 }] }] });
    const ran = split({ by: sam, type: "claim", itemId: sprite, participantId: sam }, { by: ann, type: "claim", itemId: sprite, participantId: ann }, shares(2), shares(3));
    const [run] = historyOf(ran);
    const reverted = applyOperation(ran, { by: ann, type: "undo", revision: run.revision }, { creator: false }, 9_000);
    if (!reverted.ok) throw new Error(JSON.stringify(reverted.rejection));

    expect(computeShares(reverted.split).shares.map(({ share }) => share)).toEqual([150, 150]);
    expect(historyOf(reverted.split).map(({ revision, reverted }) => [revision, reverted])).toEqual([[run.revision, true]]);
  });

  test("groups a price change and a Payment of $1,000 and up by thousands", () => {
    const history = historyOf(
      split(
        { by: sam, type: "pick", participantId: sam, device: deviceId("phone"), takeOver: false },
        { by: sam, type: "editReceipt", items: [{ type: "edit", itemId: sprite, price: price(123_456) }] },
        { by: sam, type: "recordPayment", participantId: sam, device: deviceId("phone"), amount: cents(100_000) },
      ),
    );
    expect(history.map(({ lead, before, after }) => ({ lead, before, after }))).toEqual([
      { lead: "Sam paid $1,000.00", before: undefined, after: undefined },
      { lead: "Sprite", before: "2.50", after: "1,234.56" },
    ]);
  });

  test("names a rename by its old and new names, and someone who sent no name as null", () => {
    expect(historyOf(split({ by: null, type: "editReceipt", items: [{ type: "edit", itemId: sprite, name: "Sprite Zero" }] }))).toEqual([
      { revision: 1, lead: "", before: "Sprite", after: "Sprite Zero", more: 0, sentAs: null, name: null, byline: true, at: 1_000, reverted: false, revertible: true },
    ]);
  });

  test("names a detail added, changed, and removed, and each can be reverted", () => {
    const detail = (text: string): Operation => ({ by: sam, type: "editReceipt", items: [{ type: "edit", itemId: sprite, detail: text }] });

    expect(historyOf(split(detail("Large"), detail("Small"), detail(""))).map(({ lead, before, after, revertible }) => [lead, before, after, revertible])).toEqual([
      ['Removed "Small" from Sprite', undefined, undefined, true],
      ["Sprite", "Large", "Small", true],
      ['Added "Large" to Sprite', undefined, undefined, true],
    ]);
  });
});

describe("a row with a printed size", () => {
  const ultra = itemId("ultra");
  const sized = (edit: object): Split => {
    const created = createSplit({
      id: "q7Xv0Lr9_aZ-3mKpAbCdEf" as MintedSplitId,
      receipt: { items: [{ id: ultra, name: "Michelob Ultra 16oz Aluminum Bottle", price: price(700) }], adjustments: [], subtotal: cents(700), total: cents(700) },
      participants: [{ id: ann, name: "Ann" }],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));
    const edited = applyOperation(created.split, { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: ultra, ...edit }] }, { creator: false }, 1_000);
    if (!edited.ok) throw new Error(JSON.stringify(edited.rejection));
    return edited.split;
  };
  const read = (edit: object) => historyOf(sized(edit)).map(({ lead, before, after }) => [lead, before, after]);

  test("reads a first edit to the Detail field as the size changing", () => {
    expect(read({ name: "Michelob Ultra", detail: "16oz Can" })).toEqual([["Michelob Ultra", "16oz Aluminum Bottle", "16oz Can"]]);
  });

  test("reads a rename by the old and new names", () => {
    expect(read({ name: "Miller Lite", detail: "16oz Aluminum Bottle" })).toEqual([["", "Michelob Ultra 16oz Aluminum Bottle", "Miller Lite"]]);
  });

  test("reads clearing the Detail field as the name losing its size", () => {
    expect(read({ name: "Michelob Ultra", detail: "" })).toEqual([["", "Michelob Ultra 16oz Aluminum Bottle", "Michelob Ultra"]]);
  });
});

test("reads a stored-detail row whose name shortens while its detail changes as a rename, not a size change", () => {
  const foo = itemId("foo");
  const created = createSplit({
    id: "q7Xv0Lr9_aZ-3mKpAbCdEf" as MintedSplitId,
    receipt: { items: [{ id: foo, name: "Foo 12oz Bar", detail: "Large", price: price(700) }], adjustments: [], subtotal: cents(700), total: cents(700) },
    participants: [{ id: ann, name: "Ann" }],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  });
  if (!created.ok) throw new Error(JSON.stringify(created.rejection));
  const edited = applyOperation(created.split, { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: foo, name: "Foo", detail: "Mega" }] }, { creator: false }, 1_000);
  if (!edited.ok) throw new Error(JSON.stringify(edited.rejection));
  expect(historyOf(edited.split).map(({ lead, before, after }) => [lead, before, after])).toEqual([["", "Foo 12oz Bar", "Foo"]]);
});

test("reads a Split as one entry, Split Guinness Draught 14.9oz Can into 3, that can be reverted", () => {
  const guinness = itemId("guinness");
  const created = createSplit({
    id: "q7Xv0Lr9_aZ-3mKpAbCdEf" as MintedSplitId,
    receipt: {
      items: [{ id: guinness, name: "Guinness Draught 14.9oz Can", price: price(2187), quantity: 3 }],
      adjustments: [{ id: adjustmentId("bucket"), kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: cents(-219), bundle: { name: "Beer Bucket", items: [guinness] } }],
      subtotal: cents(1968),
      total: cents(1968),
    },
    participants: [{ id: ann, name: "Ann" }],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  });
  if (!created.ok) throw new Error(JSON.stringify(created.rejection));
  const result = applyOperation(created.split, { by: ann, type: "editReceipt", items: [{ type: "split", itemId: guinness, ids: [itemId("guinness-2"), itemId("guinness-3")] }] }, { creator: false }, 1_000);
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));

  expect(historyOf(result.split)).toEqual([
    { revision: 1, lead: "Split Guinness Draught 14.9oz Can into 3", more: 0, sentAs: "ann", name: "Ann", byline: true, at: 1_000, reverted: false, revertible: true },
  ]);
});

test("an old claim change whose Revert would move money, marked perUnit, shows no Revert", () => {
  const read = parseSplit({
    schemaVersion: 3,
    id: "q7Xv0Lr9_aZ-3mKpAbCdEf",
    currency: "USD",
    receipt: { items: [{ id: "beer", name: "Beer", price: 300, split: { by: "even", units: [["ann"], ["sam"], []] } }], adjustments: [], subtotal: 300, total: 300 },
    participants: [{ id: "ann", name: "Ann" }, { id: "sam", name: "Sam" }],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    payments: [],
    picks: [],
    revision: 2,
    recentChanges: [{ revision: 1, by: "ann", undoes: null, undoneBy: null, at: 1_000, writes: [{ kind: "item", id: "beer", edit: { split: [{ by: "even", units: [[], [], []] }, { by: "even", units: [["ann"], ["sam"], []] }] } }] }],
  });
  if (!read.ok) throw new Error(JSON.stringify(read.rejection));

  expect(historyOf(read.split).map(({ revision, revertible }) => [revision, revertible])).toEqual([[1, false]]);
});

test("whenText reads Just now, minutes, then the clock time", () => {
  const at = Date.UTC(2026, 9, 1, 0, 31);
  expect([whenText(at, at + 30_000), whenText(at, at + 2 * 60_000), whenText(undefined, at)]).toEqual(["Just now", "2 min ago", null]);
  expect(whenText(at, at + 61 * 60_000)).toMatch(/^\d{1,2}:31 [AP]M$/);
});

describe("restoreChanges", () => {
  test("is false while the receipt matches the scan and true once an Item's price moved", () => {
    expect(restoreChanges(split())).toBe(false);
    expect(restoreChanges(split({ by: sam, type: "editReceipt", items: [{ type: "edit", itemId: sprite, price: price(275) }] }))).toBe(true);
    expect(restoreChanges(split({ by: sam, type: "editReceipt", items: [{ type: "edit", itemId: sprite, price: price(275) }] }, { by: sam, type: "editReceipt", items: [{ type: "edit", itemId: sprite, price: price(250) }] }))).toBe(false);
  });

  test("is false on a Split typed in by hand, even once it has Items", () => {
    const created = createSplit({
      id: "q7Xv0Lr9_aZ-3mKpAbCdEf" as MintedSplitId,
      receipt: { items: [], adjustments: [], subtotal: cents(0), total: cents(0) },
      participants: [{ id: ann, name: "Ann" }],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    });
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));
    const added = applyOperation(created.split, { by: ann, type: "editReceipt", items: [{ type: "add", item: { id: sprite, name: "Sprite", price: price(250) }, index: 0 }], totalFollows: true }, { creator: true }, 1_000);
    if (!added.ok) throw new Error(JSON.stringify(added.rejection));
    expect(added.split.receipt.items).toHaveLength(1);
    expect(restoreChanges(added.split)).toBe(false);
  });
});
