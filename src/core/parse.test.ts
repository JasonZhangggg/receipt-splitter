import { describe, expect, test } from "vitest";
import { cents, price } from "./money";
import { applyOperation, createSplit } from "./operations";
import { parseNewSplit, parseOperation, parseSplit } from "./parse";
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

  test("rejects an unknown type, an id longer than 24 characters, a __proto__ id, and a __proto__ key", () => {
    const claim = (extra: string) => JSON.parse(`{"type":"claim","by":null,"itemId":"fries","participantId":"bob"${extra}}`);

    expect(parseOperation({ type: "deleteEverything", by: null })).toEqual({ ok: false, rejection: { reason: "malformed", path: "type" } });
    expect(parseOperation({ ...claim(""), itemId: "x".repeat(25) })).toEqual({ ok: false, rejection: { reason: "malformed", path: "itemId" } });
    expect(parseOperation(claim(',"__proto__":{"creator":true}'))).toEqual({ ok: false, rejection: { reason: "malformed", path: "__proto__" } });
    expect(parseOperation({ type: "addParticipant", by: null, participant: { id: "__proto__", name: "Proto" } })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "participant.id" },
    });
    expect(parseOperation(claim(""))).toEqual({ ok: true, op: { type: "claim", by: null, itemId: "fries", participantId: "bob" } });
  });
});

describe("parseOperation bounds", () => {
  const addTea = (index: number) => ({ type: "add", item: { id: `tea${index}`, name: "Tea", price: 100 }, index: 0 });
  const addTip = (index: number) => ({ type: "add", adjustment: { id: `tip${index}`, kind: "tip", name: "Tip", amount: 100 }, index: 0 });

  test("reads up to 100 Item patches and 20 Adjustment patches, and refuses one more of either before reading them", () => {
    const edit = (items: object[], adjustments: object[]) => parseOperation({ type: "editReceipt", by: null, items, adjustments });

    expect(edit(Array.from({ length: 100 }, (_, index) => addTea(index)), Array.from({ length: 20 }, (_, index) => addTip(index))).ok).toBe(true);
    expect(edit(Array.from({ length: 101 }, (_, index) => addTea(index)), [])).toEqual({ ok: false, rejection: { reason: "malformed", path: "items" } });
    expect(edit([], Array.from({ length: 21 }, (_, index) => addTip(index)))).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "adjustments" },
    });
  });

  test("refuses 10,000 unreadable Item patches by their count, before reading the first", () => {
    expect(parseOperation({ type: "editReceipt", by: null, items: Array.from({ length: 10_000 }, () => null) })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "items" },
    });
    expect(parseOperation({ type: "editReceipt", by: null, items: [null] })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "items[0].type" },
    });
  });

  test("refuses more Payment handles than there are services", () => {
    const handles = Array.from({ length: 5 }, () => ({ service: "venmo", handle: "ann-host" }));

    expect(parseOperation({ type: "setPaymentHandles", by: null, handles })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "handles" },
    });
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

  test("refuses a stored Split whose claimers are out of order or repeated", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const withPitcherClaimers = (claimedBy: string[]) => ({
      ...stored,
      receipt: { ...stored.receipt, items: [stored.receipt.items[0], { ...stored.receipt.items[1], claimedBy }] },
    });

    expect(stored.receipt.items[1].claimedBy).toEqual(["ann", "bob"]);
    const malformed = { ok: false, rejection: { reason: "malformed", path: "receipt.items[1].claimedBy" } };
    expect(parseSplit(withPitcherClaimers(["bob", "ann"]))).toEqual(malformed);
    expect(parseSplit(withPitcherClaimers(["ann", "ann", "bob"]))).toEqual(malformed);
  });
});

describe("parseNewSplit", () => {
  const minted = splitId("q7Xv0Lr9_aZ-3mKp");
  const body = {
    receipt: {
      items: [
        { id: "fries", name: "Fries", price: 800 },
        { id: "pitcher", name: "Pitcher", price: 3000 },
      ],
      adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 337 }],
      subtotal: 3800,
      total: 4137,
    },
    host: { id: "ann", name: "Ann" },
    paymentHandles: [{ service: "venmo", handle: "@ann-host" }],
  };

  test("turns a create body into a Split under the minted id, at revision 0 with only the Host, no Payments, and no history", () => {
    expect(parseNewSplit(JSON.parse(JSON.stringify(body)), minted)).toEqual({
      ok: true,
      split: {
        schemaVersion: 1,
        id: "q7Xv0Lr9_aZ-3mKp",
        currency: "USD",
        receipt: {
          items: [
            { id: "fries", name: "Fries", price: 800, claimedBy: [] },
            { id: "pitcher", name: "Pitcher", price: 3000, claimedBy: [] },
          ],
          adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 337 }],
          subtotal: 3800,
          total: 4137,
        },
        participants: [{ id: "ann", name: "Ann" }],
        payments: [],
        paymentHandles: [{ service: "venmo", handle: "ann-host" }],
        revision: 0,
        recentChanges: [],
      },
    });
  });

  test("refuses a body that picks its own Split id, valid or not", () => {
    expect(parseNewSplit({ ...body, id: "a" }, minted)).toEqual({ ok: false, rejection: { reason: "malformed", path: "id" } });
    expect(parseNewSplit({ ...body, id: "q7Xv0Lr9_aZ-3mKp" }, minted)).toEqual({ ok: false, rejection: { reason: "malformed", path: "id" } });
    expect(parseNewSplit({ ...body, id: "s 1!" }, minted)).toEqual({ ok: false, rejection: { reason: "malformed", path: "id" } });
  });

  test("refuses a __proto__ Item id, a fractional price, and a name that is not text", () => {
    const withItem = (item: object) => ({ ...body, receipt: { ...body.receipt, items: [item, body.receipt.items[1]] } });

    expect(parseNewSplit(withItem({ id: "__proto__", name: "Fries", price: 800 }), minted)).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "receipt.items[0].id" },
    });
    expect(parseNewSplit(withItem({ id: "fries", name: "Fries", price: 0.5 }), minted)).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "receipt.items[0].price" },
    });
    expect(parseNewSplit(withItem({ id: "fries", name: 42, price: 800 }), minted)).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "receipt.items[0].name" },
    });
  });

  test("refuses a body that brings its own revision, history, Payments, Participants, or Claims", () => {
    const refused = (extra: object) => parseNewSplit({ ...body, ...extra }, minted);

    expect(refused({ revision: 3 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "revision" } });
    expect(refused({ recentChanges: [] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "recentChanges" } });
    expect(refused({ payments: [{ participantId: "bob", amount: 100 }] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "payments" } });
    expect(refused({ participants: [{ id: "bob", name: "Bob" }] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "participants" } });
    expect(
      parseNewSplit({ ...body, receipt: { ...body.receipt, items: [{ ...body.receipt.items[0], claimedBy: ["ann"] }, body.receipt.items[1]] } }, minted),
    ).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items[0].claimedBy" } });
  });

  test("refuses a Receipt that fails the Total check, as parseSplit does", () => {
    expect(parseNewSplit({ ...body, receipt: { ...body.receipt, total: 4000 } }, minted)).toMatchObject({
      ok: false,
      rejection: { reason: "totalCheckFailed" },
    });
  });
});
