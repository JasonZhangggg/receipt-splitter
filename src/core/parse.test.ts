import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { cents, price } from "./money";
import { MAX_PARTICIPANTS, applyOperation, createSplit } from "./operations";
import { parseCreateSplitRequest, parseNewSplit, parseOperation, parseSplit } from "./parse";
import { computeShares } from "./shares";
import { adjustmentId, itemId, participantId, type Split } from "./split";
import { mintedId } from "./test-ids";
import { bucketOne, bucketTwo, eachOf, jason, priya, topgolf } from "./topgolf.fixture";

const badName = { ok: false, rejection: { reason: "badName" } };

function accepted(result: ReturnType<typeof parseSplit>): Split {
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));
  return result.split;
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
    { type: "claim", by: "ann", itemId: "pitcher", participantId: "ann" },
    { type: "claim", by: "ann", itemId: "pitcher", participantId: "bob" },
    { type: "pick", by: "bob", participantId: "bob", device: "bobs-phone", takeOver: false },
    { type: "recordPayment", by: "bob", participantId: "bob", device: "bobs-phone", amount: 2200 },
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

  test("reads a claim from a page loaded before quantities with unit 0 as a claim on the line, and refuses any other unit", () => {
    const claim = (unit: unknown) => ({ type: "claim", by: null, itemId: "fries", participantId: "bob", unit });

    expect(parseOperation(claim(0))).toEqual({ ok: true, op: { type: "claim", by: null, itemId: "fries", participantId: "bob" } });
    expect(parseOperation({ ...claim(0), type: "unclaim" })).toEqual({ ok: true, op: { type: "unclaim", by: null, itemId: "fries", participantId: "bob" } });
    expect(parseOperation(claim(1))).toEqual({ ok: false, rejection: { reason: "malformed", path: "unit" } });
    expect(parseOperation(claim("0"))).toEqual({ ok: false, rejection: { reason: "malformed", path: "unit" } });
  });

  test("reads a Split patch with one or more new ids, and refuses none, a bad id, a quantity edit, or a unit value", () => {
    const patch = (fields: object) => ({ type: "editReceipt", by: null, items: [{ type: "split", itemId: "beer", ...fields }] });

    expect(parseOperation(patch({ ids: ["beer-b", "beer-c"] }))).toEqual({ ok: true, op: { type: "editReceipt", by: null, items: [{ type: "split", itemId: "beer", ids: ["beer-b", "beer-c"] }] } });
    expect(parseOperation(patch({ ids: [] }))).toEqual({ ok: false, rejection: { reason: "malformed", path: "items[0].ids" } });
    expect(parseOperation(patch({ ids: ["x".repeat(25)] }))).toEqual({ ok: false, rejection: { reason: "malformed", path: "items[0].ids[0]" } });
    expect(parseOperation({ type: "editReceipt", by: null, items: [{ type: "edit", itemId: "beer", quantity: 2 }] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "items[0].quantity" } });
    expect(parseOperation({ type: "editReceipt", by: null, items: [{ type: "edit", itemId: "beer", by: "shares", values: [{ unit: 0, participantId: "bob", value: 2 }] }] })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "items[0].values[0].unit" },
    });
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

  test("refuses an added Item of 10,000,000 units at the quantity within 250 ms; reads 20", () => {
    const addPie = (quantity: number) => ({ type: "editReceipt", by: null, items: [{ type: "add", item: { id: "pie", name: "Pie", price: 100, quantity }, index: 0 }] });
    const started = performance.now();

    expect(parseOperation(addPie(10_000_000))).toEqual({ ok: false, rejection: { reason: "malformed", path: "items[0].item.quantity" } });
    expect(performance.now() - started).toBeLessThan(250);
    expect(parseOperation(addPie(20))).toEqual({
      ok: true,
      op: { type: "editReceipt", by: null, items: [{ type: "add", item: { id: "pie", name: "Pie", price: 100, quantity: 20 }, index: 0 }] },
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
      [2, 8],
      [7, null],
      [8, null],
    ]);
    expect(parseSplit(JSON.parse(JSON.stringify(split)))).toEqual({ ok: true, split });
  });

  test("refuses a stored Split from another schema version or one that breaks an invariant", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));

    expect(parseSplit({ ...stored, schemaVersion: 5 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "schemaVersion" } });
    expect(parseSplit({ ...stored, participants: [stored.participants[0]] })).toEqual({ ok: false, rejection: { reason: "unknownParticipant" } });
    expect(parseSplit({ ...stored, revision: 3 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "recentChanges" } });
  });

  test("reads a Split stored before joins, with joined ids, or with picks that have no device, as picked by no one for those names, and refuses picks out of order, twice, or for someone not in the Split", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const { picks, ...beforeJoins } = stored;
    const pick = (participantId: string) => ({ participantId, device: `${participantId}-phone` });

    expect(picks).toEqual([{ participantId: "bob", device: "bobs-phone" }]);
    expect(parseSplit(beforeJoins)).toMatchObject({ ok: true, split: { picks: [] } });
    expect(parseSplit({ ...beforeJoins, joined: ["ann", "bob"] })).toMatchObject({ ok: true, split: { picks: [] } });
    expect(parseSplit({ ...stored, picks: [{ participantId: "ann" }, pick("bob")] })).toMatchObject({ ok: true, split: { picks: [{ participantId: "bob", device: "bob-phone" }] } });
    expect(parseSplit({ ...stored, joined: ["ann"] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "joined" } });
    expect(parseSplit({ ...stored, picks: [pick("bob"), pick("ann")] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "picks" } });
    expect(parseSplit({ ...stored, picks: [pick("bob"), pick("bob")] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "picks" } });
    expect(parseSplit({ ...stored, picks: [pick("cat")] })).toEqual({ ok: false, rejection: { reason: "unknownParticipant" } });
  });

  test("reads a line-level claimedBy as one even unit, and refuses claimers out of order or repeated, in either shape", () => {
    const stored = JSON.parse(JSON.stringify(storedSplit()));
    const [fries, pitcher] = stored.receipt.items;
    const { split: _, ...pitcherRow } = pitcher;
    const withPitcher = (row: object) => ({ ...stored, receipt: { ...stored.receipt, items: [fries, row] } });
    const malformed = { ok: false, rejection: { reason: "malformed", path: "receipt.items[1].split" } };

    expect(pitcher.split).toEqual({ by: "even", units: [["ann", "bob"]] });
    expect(parseSplit(withPitcher({ ...pitcherRow, claimedBy: ["ann", "bob"] }))).toMatchObject({ ok: true, split: { receipt: { items: [{}, { split: pitcher.split }] } } });
    expect(parseSplit(withPitcher({ ...pitcherRow, claimedBy: ["bob", "ann"] }))).toEqual(malformed);
    expect(parseSplit(withPitcher({ ...pitcherRow, split: { by: "even", units: [["ann", "ann", "bob"]] } }))).toEqual(malformed);
    expect(parseSplit(withPitcher({ ...pitcher, claimedBy: ["ann"] }))).toEqual(malformed);
    expect(parseSplit(withPitcher(pitcherRow))).toEqual(malformed);
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
    const [addBob, priceEdit, third] = stored.recentChanges;
    const withChange = (index: number, change: object) => ({
      ...stored,
      recentChanges: stored.recentChanges.map((original: object, at: number) => (at === index ? change : original)),
    });
    const withPriceEdit = (price: unknown) => withChange(1, { ...priceEdit, writes: [{ ...priceEdit.writes[0], edit: { price } }, priceEdit.writes[1]] });
    const withClaims = (fields: object) =>
      withChange(2, { ...third, writes: [{ kind: "claims", itemIds: ["pitcher"], participantIds: ["ann"], claimed: true, ...fields }] });
    const [fries, pitcher] = stored.receipt.items;

    expect(priceEdit.writes[0]).toEqual({ kind: "item", id: "fries", edit: { price: [800, 600] } });
    expect.soft(parseSplit({ ...stored, participants: unreadable })).toEqual(refusedAt("participants"));
    expect.soft(parseSplit({ ...stored, payments: unreadable })).toEqual(refusedAt("payments"));
    expect.soft(parseSplit({ ...stored, recentChanges: unreadable })).toEqual(refusedAt("recentChanges"));
    const { split: _, ...friesRow } = fries;
    expect.soft(parseSplit({ ...stored, receipt: { ...stored.receipt, items: [{ ...friesRow, claimedBy: unreadable }, pitcher] } })).toEqual(
      refusedAt("receipt.items[0].claimedBy"),
    );
    expect.soft(parseSplit({ ...stored, receipt: { ...stored.receipt, items: [{ ...fries, split: { by: "even", units: unreadable } }, pitcher] } })).toEqual(
      refusedAt("receipt.items[0].split.units"),
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

    expect(parseSplit(withWrites(121))).toMatchObject({ ok: true, split: { recentChanges: [{ writes: { length: 121 } }, {}, {}, {}] } });
    expect(parseSplit(withWrites(122))).toEqual(refusedAt("recentChanges[0].writes"));
  });

  test("reads a stored Split with the most Participants, Payments, and recent changes a Split can hold", () => {
    const joiners = Array.from({ length: MAX_PARTICIPANTS - 2 }, (_, index) => `p${index}`);
    const ops: unknown[] = [
      ...joiners.map((id) => ({ type: "addParticipant", by: null, participant: { id, name: id } })),
      ...joiners.map((id) => ({ type: "claim", by: null, itemId: "pitcher", participantId: id })),
      ...joiners.map((id) => ({ type: "pick", by: id, participantId: id, device: `phone-${id}`, takeOver: false })),
      ...joiners.map((id) => ({ type: "recordPayment", by: null, participantId: id, device: `phone-${id}`, amount: 100 })),
      ...joiners.slice(0, 5).map((id) => ({ type: "recordPayment", by: null, participantId: id, device: `phone-${id}`, amount: 200 })),
    ];
    const split = ops.reduce<Split>((current, input) => {
      const parsed = parseOperation(input);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.rejection));
      const result = applyOperation(current, parsed.op, { creator: false });
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      return result.split;
    }, storedSplit());

    expect([split.participants.length, split.payments.length, split.recentChanges.length]).toEqual([30, 29, 64]);
    expect(split.receipt.items[1].split.units[0]).toHaveLength(30);
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
            { id: "fries", name: "Fries", price: 800, split: { by: "even", units: [[]] } },
            { id: "pitcher", name: "Pitcher", price: 3000, split: { by: "even", units: [[]] } },
          ],
          adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 337 }],
          subtotal: 3800,
          total: 4137,
        },
        original: {
          items: [
            { id: "fries", name: "Fries", price: 800 },
            { id: "pitcher", name: "Pitcher", price: 3000 },
          ],
          adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 337 }],
          subtotal: 3800,
          total: 4137,
        },
        participants: [{ id: "ann", name: "Ann" }],
        picks: [],
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

    expect(withPeople(30)).toMatchObject({ ok: true, split: { participants: { length: 30, 29: { id: "p29", name: "P29" } }, picks: [] } });
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
    expect(refused({ picks: [] })).toEqual({ ok: false, rejection: { reason: "malformed", path: "picks" } });
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

  test("refuses an Item of 10,000,000 units at its quantity within 250 ms, before building a unit", () => {
    const huge = { ...body, receipt: { ...body.receipt, items: [{ ...body.receipt.items[0], quantity: 10_000_000 }, body.receipt.items[1]] } };
    const started = performance.now();

    expect(parseNewSplit(huge, minted)).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items[0].quantity" } });
    expect(performance.now() - started).toBeLessThan(250);
  });

  test("refuses a Host named with a bidi override or left blank", () => {
    const hosted = (name: string) => parseNewSplit({ ...body, participants: [{ id: "ann", name }] }, minted);

    expect(hosted("\u202E")).toEqual(badName);
    expect(hosted("")).toEqual(badName);
    expect(hosted("   ")).toEqual(badName);
  });

  test("refuses a Split whose names repeat once Unicode form and width are set aside", () => {
    const named = (second: string) => parseNewSplit({ ...body, participants: [{ id: "ann", name: "Jos\u00E9" }, { id: "bob", name: second }] }, minted);

    expect(named("jose\u0301")).toEqual({ ok: false, rejection: { reason: "nameTaken" } });
    expect(named("\uFF2A\uFF4F\uFF53\u00E9")).toEqual({ ok: false, rejection: { reason: "nameTaken" } });
    expect(named("Josie")).toMatchObject({ ok: true });
  });

  test("accepts a Receipt that fails the Total check, since the gap is only a note", () => {
    expect(parseNewSplit({ ...body, receipt: { ...body.receipt, total: 4000 } }, minted)).toMatchObject({
      ok: true,
      split: { receipt: { total: 4000 } },
    });
  });
});

describe("parseCreateSplitRequest with Bundles", () => {
  const { receipt } = topgolf();
  const request = (adjustments: readonly unknown[] = receipt.adjustments) => ({
    split: {
      receipt: {
        items: receipt.items.map(({ id, name, price, quantity }) => (quantity === undefined ? { id, name, price } : { id, name, price, quantity })),
        adjustments,
        subtotal: receipt.subtotal,
        total: receipt.total,
      },
      participants: [
        { id: "jason", name: "Jason" },
        { id: "priya", name: "Priya" },
      ],
      paymentHandles: [{ service: "venmo", handle: "jason-host" }],
    },
  });
  const claimAll = (split: Split, claims: Record<string, readonly string[]>) =>
    Object.entries(claims).reduce<Split>((current, [item, [who]]) => {
      const parsed = parseOperation({ type: "claim", by: who, itemId: item, participantId: who });
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.rejection));
      const result = applyOperation(current, parsed.op, { creator: true });
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      return result.split;
    }, split);

  test("stores the Topgolf request with its two Beer Bucket Bundles and its quantity lines at version 4, and Priya on the first Bundle owes $49.52", () => {
    const created = parseCreateSplitRequest(JSON.parse(JSON.stringify(request())), minted);
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));

    expect(created.split.schemaVersion).toBe(4);
    expect(created.split.receipt.items[2]).toEqual({ id: "guinness1", name: "Guinness Draught 14.9oz Can", price: 2187, quantity: 3, split: { by: "even", units: [[]] } });
    expect(created.split.original?.adjustments).toEqual([
      { id: "bucket1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["ultra1", "guinness1", "pineapple1", "watermelon1"] } },
      { id: "bucket2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: { name: "Beer Bucket", items: ["ultra2", "guinness2", "pineapple2", "watermelon2"] } },
      { id: "tax", kind: "tax", name: "Tax", amount: 494 },
      { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
    ]);
    const claimed = claimAll(created.split, { ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason) });
    expect(computeShares(claimed).shares.map(({ participantId, share }) => [participantId, share])).toEqual([
      ["jason", 15777],
      ["priya", 4952],
    ]);
    expect(parseSplit(JSON.parse(JSON.stringify(created.split)))).toEqual({ ok: true, split: created.split });
  });

  test("stores the same request without its Bundles at version 4, and without its quantities too at version 1", () => {
    const plain = receipt.adjustments.map((row) => (row.kind === "bundleDiscount" ? { id: row.id, kind: "discount", name: row.name, amount: row.amount } : row));
    const lineByLine = request(plain);
    const items = lineByLine.split.receipt.items.map(({ id, name, price }) => ({ id, name, price }));

    expect(parseCreateSplitRequest(request(plain), minted)).toMatchObject({ ok: true, split: { schemaVersion: 4 } });
    expect(parseCreateSplitRequest({ split: { ...lineByLine.split, receipt: { ...lineByLine.split.receipt, items } } }, minted)).toMatchObject({ ok: true, split: { schemaVersion: 1 } });
  });

  test("refuses a Bundle that names an Item the request does not hold", () => {
    const [first, ...rest] = receipt.adjustments;
    const stray = first.kind === "bundleDiscount" ? { ...first, bundle: { ...first.bundle, items: [...first.bundle.items, "nachos"] } } : first;

    expect(parseCreateSplitRequest(request([stray, ...rest]), minted)).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.adjustments[0].bundle.items" } });
  });
});

describe("Splits stored by each shipped release", () => {
  const golden = (label: string): unknown => JSON.parse(readFileSync(new URL(`./golden/${label}.json`, import.meta.url), "utf8"));
  const read = (label: string) => {
    const parsed = parseSplit(golden(label));
    if (!parsed.ok) throw new Error(`${label}: ${JSON.stringify(parsed.rejection)}`);
    return parsed.split;
  };
  const claimers = (split: Split) => split.receipt.items.map(({ split: { units } }) => units);
  const lines = (split: Split) => split.receipt.items.map(({ id, price: cents, quantity, split: { units } }) => [id, cents, quantity ?? 1, units[0]]);
  const shares = (split: Split) => computeShares(split).shares.map(({ participantId, share }) => [participantId, share]);

  test("every golden row reads", () => {
    const labels = readdirSync(new URL("./golden/", import.meta.url)).map((file) => file.replace(/\.json$/, ""));

    expect(labels.filter((label) => !parseSplit(golden(label)).ok)).toEqual([]);
    expect(labels).toEqual(expect.arrayContaining(["v2-1", "v2-2", "v2-q"]));
  });

  test("the V2-1 row reads each Topgolf quantity line, whose units all had Priya or all had Jason, as one line with its quantity", () => {
    const split = read("v2-1");

    expect(split.schemaVersion).toBe(4);
    expect(split.receipt.adjustments.map((adjustment) => (adjustment.kind === "bundleDiscount" ? [adjustment.amount, adjustment.bundle.items.length] : adjustment.kind))).toEqual([
      [-451, 4],
      [-463, 4],
      "tax",
      "tip",
    ]);
    expect(lines(split)).toEqual([
      ["gameplay", 8775, 1, ["jason"]],
      ["ultra1", 629, 1, ["priya"]],
      ["guinness1", 2187, 3, ["priya"]],
      ["pineapple1", 849, 1, ["priya"]],
      ["watermelon1", 849, 1, ["priya"]],
      ["ultra2", 629, 1, ["jason"]],
      ["guinness2", 1458, 2, ["jason"]],
      ["pineapple2", 849, 1, ["jason"]],
      ["watermelon2", 1698, 2, ["jason"]],
    ]);
    expect(shares(split)).toEqual([
      ["jason", 15777],
      ["priya", 4952],
    ]);
  });

  test("the V2-2 row, written by creating the Topgolf Split with its Bundles, is the row V2-1 expected V2-2 to write", () => {
    const split = read("v2-2");

    expect(shares(split)).toEqual([
      ["jason", 15777],
      ["priya", 4952],
    ]);
    expect(golden("v2-2")).toEqual(golden("v2-1"));
  });

  test("the V2-7b row reads its Item details onto the mapped lines, and its other fields unchanged", () => {
    const split = read("v2-7b");

    expect(split.schemaVersion).toBe(4);
    expect(split.receipt.items.flatMap(({ id, detail }) => (detail === undefined ? [] : [[id, detail]]))).toEqual([
      ["gameplay", "2 bays, 1 hour"],
      ["ultra1", "Ice cold"],
      ["guinness1", "$2.00 off"],
    ]);
    expect(split.recentChanges.at(-1)?.writes).toEqual([{ kind: "item", id: "ultra1", edit: { detail: ["", "Ice cold"] } }]);
    expect(computeShares(split).shares.map(({ participantId, share }) => [participantId, share])).toEqual([
      ["jason", 15777],
      ["priya", 4952],
    ]);
    expect(lines(split)).toEqual([
      ["gameplay", 8775, 1, ["jason"]],
      ["ultra1", 629, 1, ["priya"]],
      ["guinness1", 2187, 3, ["priya"]],
      ["pineapple1", 849, 1, ["priya"]],
      ["watermelon1", 849, 1, ["priya"]],
      ["ultra2", 629, 1, ["jason"]],
      ["guinness2", 1458, 2, ["jason"]],
      ["pineapple2", 849, 1, ["jason"]],
      ["watermelon2", 1698, 2, ["jason"]],
    ]);
    const stored = golden("v2-7b") as Split;
    expect({ ...JSON.parse(JSON.stringify(split)), schemaVersion: 3, receipt: { ...split.receipt, items: stored.receipt.items } }).toEqual(stored);
  });

  test("refuses a detail over 120 characters, and a detail in a row stored before version 3", () => {
    const stored = golden("v2-7b") as Split;
    const [first, ...rest] = stored.receipt.items;
    const long = { ...stored, receipt: { ...stored.receipt, items: [{ ...first, detail: "x".repeat(121) }, ...rest] } };

    expect(parseSplit({ ...long, receipt: { ...long.receipt, items: [{ ...first, detail: "x".repeat(120) }, ...rest] } }).ok).toBe(true);
    expect(parseSplit(long)).toEqual(badName);
    expect(parseSplit({ ...stored, schemaVersion: 2 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items[0].detail" } });
  });

  test("a version 2 quantity line whose units differ reads as one-unit rows with <id>-2 ids in its place and in its Bundle, with the same Shares", () => {
    const row = JSON.parse(JSON.stringify(golden("v2-1")));
    row.receipt.items[2].split.units = [["priya"], ["jason"], ["priya"]];

    const split = accepted(parseSplit(row));

    expect(lines(split).slice(1, 6)).toEqual([
      ["ultra1", 629, 1, ["priya"]],
      ["guinness1", 729, 1, ["priya"]],
      ["guinness1-2", 729, 1, ["jason"]],
      ["guinness1-3", 729, 1, ["priya"]],
      ["pineapple1", 849, 1, ["priya"]],
    ]);
    expect(split.receipt.adjustments[0]).toMatchObject({ bundle: { items: ["ultra1", "guinness1", "guinness1-2", "guinness1-3", "pineapple1", "watermelon1"] } });
    expect(split.receipt.items.find(({ id }) => id === "guinness1")?.name).toBe("Guinness Draught 14.9oz Can");
    expect(shares(split)).toEqual([
      ["jason", 16577],
      ["priya", 4152],
    ]);
  });

  const legacyRow = (items: readonly object[]) => {
    const subtotal = items.reduce((total: number, item) => total + ("price" in item && typeof item.price === "number" ? item.price : 0), 0);
    return {
      schemaVersion: 1,
      id: "q7Xv0Lr9_aZ-3mKp",
      currency: "USD",
      receipt: { items, adjustments: [], subtotal, total: subtotal },
      participants: [
        { id: "ann", name: "Ann" },
        { id: "bob", name: "Bob" },
      ],
      picks: [],
      payments: [],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
      revision: 0,
      recentChanges: [],
    };
  };

  test("a version 1 line whose units hold the same amounts reads as one line whose amounts scale by the quantity", () => {
    const split = accepted(parseSplit(legacyRow([{ id: "beer", name: "Beer", price: 300, split: { by: "amount", units: [[["ann", 50]], [["ann", 50]], [["ann", 50]]] } }])));

    expect(split.receipt.items).toEqual([{ id: "beer", name: "Beer", price: 300, quantity: 3, split: { by: "amount", units: [[["ann", 150]]] } }]);
    expect(shares(split)).toEqual([
      ["ann", 150],
      ["bob", 0],
    ]);
  });

  test("a version 3 quantity line with a detail whose units are the same reads as one line with the detail and its quantity", () => {
    const row = { ...legacyRow([{ id: "beer", name: "Beer", price: 300, detail: "Pint", split: { by: "even", units: [["ann"], ["ann"], ["ann"]] } }]), schemaVersion: 3 };

    const split = accepted(parseSplit(row));

    expect(split.schemaVersion).toBe(4);
    expect(split.receipt.items).toEqual([{ id: "beer", name: "Beer", price: 300, detail: "Pint", quantity: 3, split: { by: "even", units: [["ann"]] } }]);
  });

  test("a version 3 quantity line with a detail whose units differ reads as rows that each keep the detail", () => {
    const row = { ...legacyRow([{ id: "beer", name: "Beer", price: 300, detail: "Pint", split: { by: "even", units: [["ann"], ["bob"], []] } }]), schemaVersion: 3 };

    expect(accepted(parseSplit(row)).receipt.items).toEqual([
      { id: "beer", name: "Beer", price: 100, detail: "Pint", split: { by: "even", units: [["ann"]] } },
      { id: "beer-2", name: "Beer", price: 100, detail: "Pint", split: { by: "even", units: [["bob"]] } },
      { id: "beer-3", name: "Beer", price: 100, detail: "Pint", split: { by: "even", units: [[]] } },
    ]);
  });

  test("a version 3 history keeps the detail on each Item write it maps", () => {
    const pitcher = { name: "Pitcher", price: 1000, detail: "Lager", split: { by: "even", units: [["ann"], ["bob"]] } };
    const writes = [
      { kind: "item", id: "pitcher", added: { index: 1, ...pitcher } },
      { kind: "item", id: "wings", removed: { index: 2, name: "Wings", price: 500, detail: "Hot", split: { by: "even", units: [[]] } } },
      { kind: "item", id: "beer", edit: { detail: ["", "Pint"], split: [{ by: "even", units: [["ann"]] }, { by: "even", units: [["ann"], ["bob"]] }] } },
    ];
    const row = { ...legacyRow([{ id: "beer", name: "Beer", price: 300, claimedBy: [] }]), schemaVersion: 3, revision: 1, recentChanges: [{ revision: 1, by: "ann", writes }] };

    expect(accepted(parseSplit(row)).recentChanges[0].writes).toEqual([
      { kind: "item", id: "pitcher", added: { index: 1, name: "Pitcher", price: 1000, detail: "Lager", quantity: 2, split: { by: "even", units: [["ann", "bob"]] } } },
      { kind: "item", id: "wings", removed: { index: 2, name: "Wings", price: 500, detail: "Hot", split: { by: "even", units: [[]] } } },
      { kind: "item", id: "beer", edit: { detail: ["", "Pint"], quantity: [1, 2], split: [{ by: "even", units: [["ann"]] }, { by: "even", units: [["ann", "bob"]] }] } },
    ]);
  });

  test("a line whose rows would pass 100 Items, take an id in use, or take an id over 24 characters reads as one line claimed by everyone who had a unit", () => {
    const fillers = Array.from({ length: 98 }, (_, index) => ({ id: `i${index}`, name: "Tea", price: 100, claimedBy: [] }));
    const differing = (id: string) => ({ id, name: "Beer", price: 300, split: { by: "even", units: [["ann"], ["bob"], []] } });

    expect(accepted(parseSplit(legacyRow([...fillers, differing("beer")]))).receipt.items.at(-1)).toEqual({
      id: "beer",
      name: "Beer",
      price: 300,
      quantity: 3,
      split: { by: "even", units: [["ann", "bob"]] },
    });
    expect(lines(accepted(parseSplit(legacyRow([differing("beer"), { id: "beer-3", name: "Tea", price: 100, claimedBy: [] }]))))).toEqual([
      ["beer", 300, 3, ["ann", "bob"]],
      ["beer-3", 100, 1, []],
    ]);
    expect(lines(accepted(parseSplit(legacyRow([differing("b".repeat(23))]))))).toEqual([["b".repeat(23), 300, 3, ["ann", "bob"]]]);
    const amounts = { id: "beer", name: "Beer", price: 200, split: { by: "amount", units: [[["ann", 60]], [["ann", 40], ["bob", 50]]] } };
    expect(lines(accepted(parseSplit(legacyRow([amounts, { id: "beer-2", name: "Tea", price: 100, claimedBy: [] }]))))).toEqual([
      ["beer", 200, 2, [["ann", 100], ["bob", 50]]],
      ["beer-2", 100, 1, []],
    ]);
  });

  test("a version 4 row refuses a split with more than one claim set, and a stored quantity of 1", () => {
    const row = JSON.parse(JSON.stringify(golden("v2-q")));
    const withItem = (change: object) => ({ ...row, receipt: { ...row.receipt, items: [{ ...row.receipt.items[0], ...change }, ...row.receipt.items.slice(1)] } });

    expect(parseSplit(withItem({ split: { by: "even", units: [[], []] } }))).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items[0].split.units" } });
    expect(parseSplit(withItem({ quantity: 1 }))).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.items[0].quantity" } });
  });

  test("a row the current release writes reads back unchanged, with a split Guinness line and the Topgolf Shares", () => {
    const split = read("v2-q");

    expect(split.schemaVersion).toBe(4);
    expect(JSON.parse(JSON.stringify(split))).toEqual(golden("v2-q"));
    expect(lines(split).filter(([id]) => String(id).startsWith("guinness"))).toEqual([
      ["guinness1", 2187, 3, ["priya"]],
      ["guinness2", 729, 1, ["jason"]],
      ["guinness2-b", 729, 1, ["jason"]],
    ]);
    expect(shares(split)).toEqual([
      ["jason", 15777],
      ["priya", 4952],
    ]);
  });

  test("RS-11 rows read the pitcher whose two units differ as two rows, and its old quantity change as a quantity pair", () => {
    const split = read("rs-11");

    expect(split.schemaVersion).toBe(4);
    expect(lines(split)).toEqual([
      ["fries", 900, 1, ["bob"]],
      ["pitcher", 1500, 1, ["ann", "bob"]],
      ["pitcher-2", 1500, 1, []],
    ]);
    expect(split.recentChanges.find(({ revision }) => revision === 8)?.writes).toEqual([
      { kind: "item", id: "pitcher", edit: { quantity: [1, 2], split: [{ by: "even", units: [["ann", "bob"]] }, { by: "even", units: [["ann", "bob"]] }] } },
    ]);
  });

  test("RS-10 rows read with their device picks, split rows and original Receipt", () => {
    const split = read("rs-10");

    expect(split.picks).toEqual([{ participantId: "bob", device: "bobs-phone" }]);
    expect(claimers(split)).toEqual([[["bob"]], [["ann", "bob"]], [[]]]);
    expect(split.original?.items.map(({ name }) => name)).toEqual(["Fries", "Pitcher"]);
  });

  test("RS-9 rows read their joined names as picked by no one, and line claims as the line's claim set", () => {
    const split = read("rs-9");

    expect(split.picks).toEqual([]);
    expect(claimers(split)).toEqual([[["bob"]], [["ann", "bob"]]]);
    expect(split.participants.map(({ name }) => name)).toEqual(["Ann", "Bob", "Cat"]);
  });

  test("RS-8 rows read as picked by no one, with line claims as the line's claim set", () => {
    const split = read("rs-8");

    expect(split.picks).toEqual([]);
    expect(claimers(split)).toEqual([[["bob"]], [["ann", "bob"]]]);
    expect(split.recentChanges.length).toBe(5);
  });
});

describe("Bundles in a stored Split", () => {
  const stored = (split: Split = topgolf({ ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason) })) => JSON.parse(JSON.stringify(split));
  const withBundle = (row: ReturnType<typeof stored>, at: number, change: (bundle: { name: string; items: string[]; amount: number }) => object) => {
    const adjustments = [...row.receipt.adjustments];
    adjustments[at] = { ...adjustments[at], ...change({ ...adjustments[at].bundle, amount: adjustments[at].amount }) };
    return { ...row, receipt: { ...row.receipt, adjustments } };
  };
  const items = (list: string[]) => (bundle: { name: string }) => ({ bundle: { name: bundle.name, items: list } });

  test("reads a version 4 row with two Bundles and its quantity lines back unchanged", () => {
    const split = topgolf({ ...eachOf(bucketOne, priya) });

    expect(parseSplit(stored(split))).toEqual({ ok: true, split });
  });

  test("refuses a Bundle that names a missing Item, an Item twice, or an Item of another Bundle", () => {
    const malformed = { ok: false, rejection: { reason: "malformed", path: "receipt.adjustments[1].bundle.items" } };

    expect(parseSplit(withBundle(stored(), 1, items(["ultra2", "nachos"])))).toEqual(malformed);
    expect(parseSplit(withBundle(stored(), 1, items(["ultra2", "ultra2"])))).toEqual(malformed);
    expect(parseSplit(withBundle(stored(), 1, items(["ultra2", "ultra1"])))).toEqual(malformed);
  });

  test("refuses a Bundle discount above $0.00", () => {
    expect(parseSplit(withBundle(stored(), 0, () => ({ amount: 451 })))).toEqual({ ok: false, rejection: { reason: "amountOutOfRange" } });
    expect(parseSplit(withBundle(stored(), 0, () => ({ amount: 0 }))).ok).toBe(true);
  });

  test("refuses a Bundle discount in a version 1 row, and a Bundle on another kind of Adjustment", () => {
    const row = stored();
    const lineByLine = { ...row, receipt: { ...row.receipt, items: row.receipt.items.map(({ quantity: _, ...item }: { quantity?: number }) => item) } };
    expect(parseSplit({ ...lineByLine, schemaVersion: 1 })).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.adjustments[0].kind" } });
    expect(parseSplit(withBundle(stored(), 0, () => ({ kind: "discount" })))).toEqual({ ok: false, rejection: { reason: "malformed", path: "receipt.adjustments[0].bundle" } });
  });

  test("refuses an Operation that adds a Bundle discount or turns a row into one, since only a new Split writes one", () => {
    const bucket = stored().receipt.adjustments[0];

    expect(parseOperation({ by: null, type: "editReceipt", adjustments: [{ type: "add", adjustment: bucket, index: 0 }] })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "adjustments[0].adjustment.kind" },
    });
    expect(parseOperation({ by: null, type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: "tax", kind: "bundleDiscount" }] })).toEqual({
      ok: false,
      rejection: { reason: "malformed", path: "adjustments[0].kind" },
    });
  });

  test("reads back a row whose history dropped an Item from its Bundle and then removed the emptied Bundle", () => {
    const one = topgolf();
    const lone = { ...one, receipt: { ...one.receipt, adjustments: one.receipt.adjustments.map((row) => (row.kind === "bundleDiscount" && row.id === "bucket2" ? { ...row, bundle: { ...row.bundle, items: [itemId("ultra2")] as const } } : row)) } };
    const deleted = applyOperation(lone, { by: null, type: "editReceipt", items: [{ type: "delete", itemId: itemId("ultra1") }, { type: "delete", itemId: itemId("ultra2") }] }, { creator: false });
    if (!deleted.ok) throw new Error(JSON.stringify(deleted.rejection));

    expect(deleted.split.recentChanges[0].writes.map((write) => [write.kind, "edit" in write ? "edit" : "removed" in write ? "removed" : "added"])).toEqual([
      ["item", "removed"],
      ["adjustment", "edit"],
      ["item", "removed"],
      ["adjustment", "removed"],
    ]);
    expect(parseSplit(stored(deleted.split))).toEqual({ ok: true, split: deleted.split });
  });
});
