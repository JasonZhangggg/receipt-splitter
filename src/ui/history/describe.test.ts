import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { applyOperation, createSplit, type Operation } from "../../core/operations";
import { parseSplit } from "../../core/parse";
import { adjustmentId, deviceId, itemId, participantId, type MintedSplitId, type Split } from "../../core/split";
import { historyOf, whenText } from "./describe";

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
        { by: ann, type: "editReceipt", items: [{ type: "edit", itemId: sprite, by: "shares", values: [{ participantId: sam, value: 2 }] }] },
        { by: ann, type: "undo", revision: 5 },
        { by: sam, type: "recordPayment", participantId: sam, device: deviceId("phone"), amount: cents(300) },
      ),
    );

    expect(history).toEqual([
      { revision: 7, lead: "Sam paid $3.00", more: 0, sentAs: "sam", name: "Sam", at: 7_000, reverted: false, revertible: false },
      { revision: 5, lead: "Sprite split", before: "evenly", after: "by shares", more: 0, sentAs: "ann", name: "Ann", at: 5_000, reverted: true, revertible: true },
      { revision: 4, lead: "Sprite", before: "2.50", after: "2.75", more: 0, sentAs: "sam", name: "Sam", at: 4_000, reverted: false, revertible: true },
    ]);
  });

  test("names a rename by its old and new names, and someone who sent no name as null", () => {
    expect(historyOf(split({ by: null, type: "editReceipt", items: [{ type: "edit", itemId: sprite, name: "Sprite Zero" }] }))).toEqual([
      { revision: 1, lead: "", before: "Sprite", after: "Sprite Zero", more: 0, sentAs: null, name: null, at: 1_000, reverted: false, revertible: true },
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
    { revision: 1, lead: "Split Guinness Draught 14.9oz Can into 3", more: 0, sentAs: "ann", name: "Ann", at: 1_000, reverted: false, revertible: true },
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
