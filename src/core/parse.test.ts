import { describe, expect, test } from "vitest";
import { cents, price } from "./money";
import { applyOperation, createSplit } from "./operations";
import { parseOperation, parseSplit } from "./parse";
import { adjustmentId, itemId, participantId, splitId, type Split } from "./split";

function storedSplit(): Split {
  const created = createSplit({
    id: splitId("s1"),
    receipt: {
      items: [
        { id: itemId("fries"), name: "Fries", price: price(800) },
        { id: itemId("pitcher"), name: "Pitcher", price: price(3000) },
      ],
      adjustments: [{ id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(337) }],
      subtotal: cents(3800),
      total: cents(4137),
    },
    host: { id: participantId("ann"), name: "Ann" },
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  });
  if (!created.ok) throw new Error(JSON.stringify(created.rejection));
  const ops: unknown[] = [
    { type: "addParticipant", by: null, participant: { id: "bob", name: "Bob" } },
    { type: "editReceipt", by: "bob", items: [{ type: "edit", itemId: "fries", price: 600 }], subtotalDelta: -200, totalDelta: -200 },
    { type: "claim", by: "bob", itemId: "fries", participantId: "bob" },
    { type: "splitUnclaimed", by: "ann" },
    { type: "recordPayment", by: "bob", participantId: "bob", amount: 2200 },
    { type: "undo", by: "ann", revision: 2 },
  ];
  return ops.reduce<Split>((split, input) => {
    const parsed = parseOperation(input);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.rejection));
    const result = applyOperation(split, parsed.op, { creator: false });
    if (!result.ok) throw new Error(JSON.stringify(result.rejection));
    return result.split;
  }, created.split);
}

describe("parseOperation", () => {
  test("reports the path of a malformed value inside a patch", () => {
    expect(parseOperation({ type: "editReceipt", by: null, items: [{ type: "edit", itemId: "fries", price: -5 }] })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "items[0].price" },
    });
  });

  test("rejects an unknown type, an id longer than 24 characters, and a __proto__ key", () => {
    const claim = (extra: string) => JSON.parse(`{"type":"claim","by":null,"itemId":"fries","participantId":"bob"${extra}}`);

    expect(parseOperation({ type: "deleteEverything", by: null })).toEqual({ ok: false, rejection: { reason: "malformed", path: "type" } });
    expect(parseOperation({ ...claim(""), itemId: "x".repeat(25) })).toEqual({ ok: false, rejection: { reason: "malformed", path: "itemId" } });
    expect(parseOperation(claim(',"__proto__":{"creator":true}'))).toEqual({ ok: false, rejection: { reason: "malformed", path: "__proto__" } });
    expect(parseOperation(claim(""))).toEqual({ ok: true, op: { type: "claim", by: null, itemId: "fries", participantId: "bob" } });
  });
});

describe("parseSplit", () => {
  test("reads a stored Split back unchanged, recent changes included", () => {
    const split = storedSplit();

    expect(split.recentChanges.map(({ revision, undoneBy }) => [revision, undoneBy])).toEqual([
      [1, null],
      [2, 6],
      [4, null],
      [5, null],
      [6, null],
    ]);
    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
  });

  test("refuses a stored Split from another schema version or one that breaks an invariant", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));

    expect(parseSplit({ ...stored, schemaVersion: 2 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "schemaVersion" } });
    expect(parseSplit({ ...stored, participants: [stored.participants[0]] })).toEqual({ ok: false, rejection: { reason: "unknownParticipant" } });
    expect(parseSplit({ ...stored, revision: 3 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "recentChanges" } });
  });
});
