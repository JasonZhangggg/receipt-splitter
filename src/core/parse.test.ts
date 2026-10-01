import { describe, expect, test } from "vitest";
import { cents, price } from "./money";
import { MAX_PARTICIPANTS, applyOperation, createSplit } from "./operations";
import { parseNewSplit, parseOperation, parseSplit } from "./parse";
import { adjustmentId, isMintedSplitId, itemId, participantId, type MintedSplitId, type Split } from "./split";

const badName = { ok: false, rejection: { reason: "badName" } };

function mintedId(value: string): MintedSplitId {
  if (!isMintedSplitId(value)) throw new RangeError(`${value} is not a minted Split id`);
  return value;
}

const minted = mintedId("q7Xv0Lr9_aZ-3mKp");

function storedSplit(): Split {
  const created = createSplit({
    id: minted,
    receipt: {
      items: [
        { id: itemId("fries"), name: "Fries", price: price(800) },
        { id: itemId("pitcher"), name: "Pitcher", price: price(3000) },
      ],
      adjustments: [{ id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(337) }],
      subtotal: cents(3800),
      total: cents(4137),
    },
    participants: [{ id: participantId("ann"), name: "Ann" }],
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
    { type: "setJoined", by: "bob", participantId: "bob", joined: true },
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

  test("reads a Split stored before joins as joined by no one, and refuses joins out of order or by someone not in the Split", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const { joined, ...beforeJoins } = stored;

    expect(joined).toEqual(["ann", "bob"]);
    expect(parseSplit(beforeJoins)).toMatchObject({ ok: true, split: { joined: [] } });
    expect(parseSplit({ ...stored, joined: ["bob", "ann"] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "joined" } });
    expect(parseSplit({ ...stored, joined: ["ann", "bob", "bob"] })).toMatchObject({ ok: true, split: { joined: ["ann", "bob", "bob"] } });
    expect(parseSplit({ ...stored, joined: ["ann", "cat"] })).toEqual({ ok: false, rejection: { reason: "unknownParticipant" } });
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

  test("refuses a stored Split whose Host or another Participant has a name the Names rules refuse", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const [host, bob] = stored.participants;
    const named = (hostName: string, bobName: string) => parseSplit({ ...stored, participants: [{ ...host, name: hostName }, { ...bob, name: bobName }] });

    expect(named("\u202E", "Bob")).toEqual(badName);
    expect(named("", "Bob")).toEqual(badName);
    expect(named("Ann", "\u202E")).toEqual(badName);
    expect(named("Ann", "   ")).toEqual(badName);
    expect(named("Ann", "b".repeat(41))).toEqual(badName);
  });
});

describe("parseSplit bounds", () => {
  const unreadable = Array.from({ length: 10_000 }, () => null);
  const refusedAt = (path: string) => ({ ok: false, rejection: { reason: "malformed", path } });

  test("refuses each oversized array of a stored Split by its count, before reading the first element", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const [addBob, priceEdit, splitUnclaimed] = stored.recentChanges;
    const withChange = (index: number, change: object) => ({
      ...stored,
      recentChanges: stored.recentChanges.map((original: object, at: number) => (at === index ? change : original)),
    });
    const withPriceEdit = (price: unknown) => withChange(1, { ...priceEdit, writes: [{ ...priceEdit.writes[0], edit: { price } }, priceEdit.writes[1]] });
    const withClaims = (fields: object) => withChange(2, { ...splitUnclaimed, writes: [{ ...splitUnclaimed.writes[0], ...fields }] });
    const [fries, pitcher] = stored.receipt.items;

    expect(priceEdit.writes[0]).toEqual({ kind: "item", id: "fries", edit: { price: [800, 600] } });
    expect(splitUnclaimed.writes[0]).toMatchObject({ kind: "claims", itemIds: ["pitcher"] });
    expect.soft(parseSplit({ ...stored, participants: unreadable })).toEqual(refusedAt("participants"));
    expect.soft(parseSplit({ ...stored, payments: unreadable })).toEqual(refusedAt("payments"));
    expect.soft(parseSplit({ ...stored, recentChanges: unreadable })).toEqual(refusedAt("recentChanges"));
    expect.soft(parseSplit({ ...stored, receipt: { ...stored.receipt, items: [{ ...fries, claimedBy: unreadable }, pitcher] } })).toEqual(
      refusedAt("receipt.items[0].claimedBy"),
    );
    expect.soft(parseSplit(withChange(0, { ...addBob, writes: unreadable }))).toEqual(refusedAt("recentChanges[0].writes"));
    expect.soft(parseSplit(withPriceEdit(unreadable))).toEqual(refusedAt("recentChanges[1].writes[0].edit.price"));
    expect.soft(parseSplit(withPriceEdit([800, 600, null]))).toEqual(refusedAt("recentChanges[1].writes[0].edit.price"));
    expect.soft(parseSplit(withClaims({ itemIds: unreadable }))).toEqual(refusedAt("recentChanges[2].writes[0].itemIds"));
    expect.soft(parseSplit(withClaims({ participantIds: unreadable }))).toEqual(refusedAt("recentChanges[2].writes[0].participantIds"));
  });

  test("reads a stored Change of 121 writes, one per Item patch, one per Adjustment patch, and the totals, and refuses 122", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const withWrites = (count: number) => {
      const writes = Array.from({ length: count }, () => ({ kind: "totals", subtotalDelta: 0, totalDelta: 0 }));
      return { ...stored, recentChanges: [{ ...stored.recentChanges[0], writes }, ...stored.recentChanges.slice(1)] };
    };

    expect(parseSplit(withWrites(121))).toMatchObject({ ok: true, split: { recentChanges: [{ writes: { length: 121 } }, {}, {}, {}, {}] } });
    expect(parseSplit(withWrites(122))).toEqual(refusedAt("recentChanges[0].writes"));
  });

  test("reads a stored Split with the most Participants, Payments, and recent changes a Split can hold", () => {
    const joiners = Array.from({ length: MAX_PARTICIPANTS - 2 }, (_, index) => `p${index}`);
    const ops: unknown[] = [
      ...joiners.map((id) => ({ type: "addParticipant", by: null, participant: { id, name: id } })),
      ...joiners.map((id) => ({ type: "claim", by: null, itemId: "pitcher", participantId: id })),
      ...joiners.map((id) => ({ type: "recordPayment", by: null, participantId: id, amount: 100 })),
    ];
    const split = ops.reduce<Split>((current, input) => {
      const parsed = parseOperation(input);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.rejection));
      const result = applyOperation(current, parsed.op, { creator: false });
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      return result.split;
    }, storedSplit());

    expect([split.participants.length, split.payments.length, split.recentChanges.length]).toEqual([30, 29, 50]);
    expect(split.receipt.items[1].claimedBy).toHaveLength(30);
    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
  });
});

describe("parseNewSplit", () => {
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
    participants: [{ id: "ann", name: "Ann" }],
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
        joined: ["ann"],
        payments: [],
        paymentHandles: [{ service: "venmo", handle: "ann-host" }],
        revision: 0,
        recentChanges: [],
      },
    });
  });

  test("reads the names the Host typed after the Host, and refuses no Participants or 31", () => {
    const withPeople = (count: number) =>
      parseNewSplit({ ...body, participants: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `P${index}` })) }, minted);

    expect(withPeople(30)).toMatchObject({ ok: true, split: { participants: { length: 30, 29: { id: "p29", name: "P29" } }, joined: ["p0"] } });
    expect(withPeople(0)).toEqual({ ok: false, rejection: { reason: "malformed", path: "participants" } });
    expect(withPeople(31)).toEqual({ ok: false, rejection: { reason: "malformed", path: "participants" } });
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

  test("refuses a body that brings its own revision, history, Payments, joins, or Claims", () => {
    const refused = (extra: object) => parseNewSplit({ ...body, ...extra }, minted);

    expect(refused({ revision: 3 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "revision" } });
    expect(refused({ recentChanges: [] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "recentChanges" } });
    expect(refused({ payments: [{ participantId: "bob", amount: 100 }] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "payments" } });
    expect(refused({ host: { id: "bob", name: "Bob" } })).toEqual({ ok: false, rejection: { reason: "malformed", path: "host" } });
    expect(refused({ joined: ["ann"] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "joined" } });
    expect(
      parseNewSplit({ ...body, receipt: { ...body.receipt, items: [{ ...body.receipt.items[0], claimedBy: ["ann"] }, body.receipt.items[1]] } }, minted),
    ).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items[0].claimedBy" } });
  });

  test("reads a Receipt of 100 Items and 20 Adjustments, and refuses one more of either at the array's path", () => {
    const withRows = (itemCount: number, adjustmentCount: number) =>
      parseNewSplit(
        {
          ...body,
          receipt: {
            items: Array.from({ length: itemCount }, (_, index) => ({ id: `tea${index}`, name: "Tea", price: 100 })),
            adjustments: Array.from({ length: adjustmentCount }, (_, index) => ({ id: `tip${index}`, kind: "tip", name: "Tip", amount: 1 })),
            subtotal: itemCount * 100,
            total: itemCount * 100 + adjustmentCount,
          },
        },
        minted,
      );

    expect(withRows(100, 20)).toMatchObject({ ok: true, split: { receipt: { items: { length: 100 }, adjustments: { length: 20 }, total: 10_020 } } });
    expect(withRows(101, 0)).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items" } });
    expect(withRows(1, 21)).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.adjustments" } });
  });

  test("refuses a Host named with a bidi override or left blank", () => {
    const hosted = (name: string) => parseNewSplit({ ...body, participants: [{ id: "ann", name }] }, minted);

    expect(hosted("\u202E")).toEqual(badName);
    expect(hosted("")).toEqual(badName);
    expect(hosted("   ")).toEqual(badName);
  });

  test("refuses a Receipt that fails the Total check, as parseSplit does", () => {
    expect(parseNewSplit({ ...body, receipt: { ...body.receipt, total: 4000 } }, minted)).toMatchObject({
      ok: false,
      rejection: { reason: "totalCheckFailed" },
    });
  });
});
