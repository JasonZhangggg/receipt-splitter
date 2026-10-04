import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { adjustmentId, itemId, participantId, type Adjustment, type ItemSplit, type NonEmpty, type ParticipantId, type Receipt, type SplitItem } from "../../core/split";
import { shareBreakdown } from "../../core/shares";
import { barFor, breakdownCharges, bundleNote, circleTap, lineAmounts, lineTag, nameParts, receiptRows, shareLabel, totalNote, unclaimedUnits } from "./model";

const [ann, bob, cat] = ["ann", "bob", "cat"].map(participantId);
const item = (split: ItemSplit, cost = 100): SplitItem => ({ id: itemId("tostones"), name: "Tostones", price: price(cost), split });

describe("lineTag", () => {
  const order = [bob, ann, cat];

  test("reads ½ for two people on a line, a ratio for shares in the table's order of people, split for amounts, and nothing for one person or nobody", () => {
    expect([
      lineTag(item({ by: "even", units: [[ann, bob]] }), order),
      lineTag(item({ by: "even", units: [[ann, bob, cat]] }), order),
      lineTag(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }), order),
      lineTag(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }), [ann, bob, cat]),
      lineTag(item({ by: "amount", units: [[[ann, cents(75)], [bob, cents(25)]]] }), order),
      lineTag(item({ by: "even", units: [[ann]] }), order),
      lineTag(item({ by: "even", units: [[]] }), order),
    ]).toEqual(["½", "⅓", "1:2", "2:1", "split", null, null]);
  });
});

test("nameParts moves a printed size and what follows it to a second line, and leaves a name with no size, or one that starts with a count or a size, whole", () => {
  expect(["Michelob Ultra 16oz Aluminum Bottle", "Guinness Draught 14.9oz Can", "High Noon Watermelon 12oz Can", "Gameplay", "2 Tacos", "Coke 2", "Water 1L", "16oz Draft"].map((name) => nameParts({ name }))).toEqual([
    ["Michelob Ultra", "16oz Aluminum Bottle"],
    ["Guinness Draught", "14.9oz Can"],
    ["High Noon Watermelon", "12oz Can"],
    ["Gameplay", null],
    ["2 Tacos", null],
    ["Coke 2", null],
    ["Water", "1L"],
    ["16oz Draft", null],
  ]);
});

test("nameParts shows an Item's detail under its whole name instead of splitting the name", () => {
  expect(nameParts({ name: "Guinness Draught 14.9oz Can", detail: "$2.00 off" })).toEqual(["Guinness Draught 14.9oz Can", "$2.00 off"]);
});

test("shareLabel reads part of a line's price as ½ of 1.00, never as units of a quantity, and all of an Item as nothing", () => {
  expect([shareLabel([1, 3], "21.87"), shareLabel([1, 4], "24.00"), shareLabel([1, 2], "1.00"), shareLabel([2, 7], "7.00"), shareLabel([1, 1], "1.00")]).toEqual([
    "⅓ of 21.87",
    "¼ of 24.00",
    "½ of 1.00",
    "2/7 of 7.00",
    null,
  ]);
});

describe("circleTap", () => {
  test("checks the person on the whole line, whoever else has it, quantity or not", () => {
    expect(circleTap(item({ by: "even", units: [[ann]] }), bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob" }]);
    expect(circleTap({ ...item({ by: "even", units: [[]] }), quantity: 3 }, bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob" }]);
  });

  test("unchecks the person from the line", () => {
    expect(circleTap(item({ by: "shares", units: [[[ann, 1], [bob, 2]]] }), bob)).toEqual([{ by: "bob", type: "unclaim", itemId: "tostones", participantId: "bob" }]);
  });
});

test("totalNote says how far the Items or the charges are from the printed subtotal and total", () => {
  const receipt = (sprite: number, total = 250) => ({ items: [item({ by: "even", units: [[]] }, sprite)] as const, adjustments: [], subtotal: cents(250), total: cents(total) });

  expect([totalNote(receipt(275)), totalNote(receipt(200)), totalNote(receipt(250, 300)), totalNote(receipt(250))]).toEqual([
    "Items are $0.25 over the subtotal.",
    "Items are $0.50 short of the subtotal.",
    "Tax and charges are $0.50 short of the total.",
    null,
  ]);
});

test("lineAmounts divides the line's cents by largest remainder, and shows typed cents under amount", () => {
  expect(lineAmounts(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }))).toEqual([
    { participantId: "ann", cents: 67 },
    { participantId: "bob", cents: 33 },
  ]);
  expect(lineAmounts({ ...item({ by: "even", units: [[ann, bob, cat]] }, 1001), quantity: 2 })).toEqual([
    { participantId: "ann", cents: 334 },
    { participantId: "bob", cents: 334 },
    { participantId: "cat", cents: 333 },
  ]);
  expect(lineAmounts(item({ by: "amount", units: [[[ann, cents(75)]]] }))).toEqual([{ participantId: "ann", cents: 75 }]);
});

describe("receiptRows at Topgolf", () => {
  const line = (id: string, name: string, cost: number, claimers: readonly ParticipantId[] = [], quantity = 1): SplitItem => {
    const row: SplitItem = { id: itemId(id), name, price: price(cost), split: { by: "even", units: [claimers] } };
    return quantity === 1 ? row : { ...row, quantity };
  };
  const bucket = (id: string, amount: number, [first, ...rest]: NonEmpty<string>, name = "Beer Bucket Discount (10%)"): Adjustment => ({
    id: adjustmentId(id),
    kind: "bundleDiscount",
    name,
    amount: cents(amount),
    bundle: { name: "Beer Bucket", items: [itemId(first), ...rest.map(itemId)] },
  });
  const topgolf = (guinness: readonly ParticipantId[] = [], firstDiscount = "Beer Bucket Discount (10%)"): Receipt<SplitItem> => ({
    items: [
      line("gameplay", "Gameplay", 8775),
      line("ultra1", "Michelob Ultra 16oz Aluminum Bottle", 629, [ann]),
      line("guinness1", "Guinness Draught 14.9oz Can", 2187, guinness, 3),
      line("pineapple1", "High Noon Pineapple 12oz Can", 849, [ann]),
      line("watermelon1", "High Noon Watermelon 12oz Can", 849, [bob]),
      line("ultra2", "Michelob Ultra 16oz Aluminum Bottle", 629),
      line("guinness2", "Guinness Draught 14.9oz Can", 1458, [], 2),
      line("pineapple2", "High Noon Pineapple 12oz Can", 849),
      line("watermelon2", "High Noon Watermelon 12oz Can", 1698, [], 2),
    ],
    adjustments: [
      bucket("bucket1", -451, ["ultra1", "guinness1", "pineapple1", "watermelon1"], firstDiscount),
      bucket("bucket2", -463, ["ultra2", "guinness2", "pineapple2", "watermelon2"]),
      { id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(494) },
      { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(3226) },
    ],
    subtotal: cents(17923),
    total: cents(20729),
  });
  const read = (receipt: Receipt<SplitItem>) =>
    receiptRows(receipt).rows.map((row) =>
      row.kind === "item"
        ? [row.item.id, row.item.price]
        : [row.bundle.name, row.bundle.summary, row.bundle.net, row.bundle.items.map(({ id, price: cost, quantity = 1 }) => `${quantity}x ${id} ${cost}`), row.bundle.discount, unclaimedUnits(row.bundle)],
    );

  test("reads Gameplay, then each Beer Bucket with one row per line, its unit count, percent, net price, discount, and units nobody had, and leaves only Tax and Tip as charges", () => {
    expect(read(topgolf())).toEqual([
      ["gameplay", 8775],
      ["Beer Bucket", "6 items · 10% off", 4063, ["1x ultra1 629", "3x guinness1 2187", "1x pineapple1 849", "1x watermelon1 849"], { label: "Discount (10%)", amount: -451 }, 3],
      ["Beer Bucket", "6 items · 10% off", 4171, ["1x ultra2 629", "2x guinness2 1458", "1x pineapple2 849", "2x watermelon2 1698"], { label: "Discount (10%)", amount: -463 }, 6],
    ]);
    expect(receiptRows(topgolf()).charges.map(({ name }) => name)).toEqual(["Tax", "Tip"]);
  });

  test("gives a line of three at $10.00 one row at its full price", () => {
    const receipt: Receipt<SplitItem> = { items: [line("cans", "Cans", 1000, [ann], 3)], adjustments: [], subtotal: cents(1000), total: cents(1000) };
    expect(read(receipt)).toEqual([["cans", 1000]]);
  });

  test("counts the three units of the Guinness line as unclaimed until someone claims the line", () => {
    expect([read(topgolf())[1][5], read(topgolf([ann]))[1][5]]).toEqual([3, 0]);
  });

  test("names a Bundle's discount by its amount when the receipt prints no percent", () => {
    const [, bundle] = read(topgolf(undefined, "Bucket deal"));
    expect([bundle[1], bundle[4]]).toEqual(["6 items · $4.51 off", { label: "Bucket deal", amount: -451 }]);
  });

  test("tells a Bundle Item's sheet what its Bundle's discount takes off that line, and says nothing outside a Bundle", () => {
    expect([
      bundleNote(topgolf(), itemId("guinness1"), 2187),
      bundleNote(topgolf(undefined, "Bucket deal"), itemId("guinness1"), 2187),
      bundleNote(topgolf(), itemId("ultra1"), 629),
      bundleNote(topgolf(), itemId("gameplay"), 8775),
    ]).toEqual(["In Beer Bucket. Its 10% off takes $2.19 off this line.", "In Beer Bucket. Its discount takes $2.19 off this line.", "In Beer Bucket. Its 10% off takes $0.63 off this line.", null]);
  });

  test("lists in Ann's breakdown only the first Beer Bucket's discount, the one her drinks were in, with Tax and Tip", () => {
    const receipt = topgolf();
    const split = { receipt, participants: [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }] as const, payments: [] };
    expect(breakdownCharges(receipt, shareBreakdown(split, ann)).map(({ id, portion }) => [id, portion])).toEqual([
      ["bucket1", -148],
      ["tax", 39],
      ["tip", 252],
    ]);
  });
});

test("barFor asks for a name until someone picks, then shows the picker's share collapsed and the selected person's breakdown expanded", () => {
  expect(barFor(null, false, null)).toEqual({ kind: "ask" });
  expect(barFor(null, true, bob)).toEqual({ kind: "ask" });
  expect(barFor(ann, false, bob)).toEqual({ kind: "share", me: ann });
  expect(barFor(ann, true, bob)).toEqual({ kind: "breakdown", me: ann, person: bob });
  expect(barFor(ann, true, null)).toEqual({ kind: "breakdown", me: ann, person: ann });
});
