import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { adjustmentId, itemId, participantId, type Adjustment, type ItemSplit, type NonEmpty, type ParticipantId, type Receipt, type SplitItem } from "../../core/split";
import { shareBreakdown } from "../../core/shares";
import { breakdownCharges, bundleNote, circleTap, lineTag, nameParts, receiptRows, shareLabel, totalNote, unclaimedUnits, unitAmounts } from "./model";

const [ann, bob, cat] = ["ann", "bob", "cat"].map(participantId);
const item = (split: ItemSplit, cost = 100): SplitItem => ({ id: itemId("tostones"), name: "Tostones", price: price(cost), split });

describe("lineTag", () => {
  const order = [bob, ann, cat];

  test("reads ½ for two people on a unit, a ratio for shares in the table's order of people, split for amounts, and nothing for one person or nobody", () => {
    expect([
      lineTag(item({ by: "even", units: [[ann, bob]] }), 0, order),
      lineTag(item({ by: "even", units: [[ann, bob, cat]] }), 0, order),
      lineTag(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }), 0, order),
      lineTag(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }), 0, [ann, bob, cat]),
      lineTag(item({ by: "amount", units: [[[ann, cents(75)], [bob, cents(25)]]] }), 0, order),
      lineTag(item({ by: "even", units: [[ann]] }), 0, order),
      lineTag(item({ by: "even", units: [[]] }), 0, order),
    ]).toEqual(["½", "⅓", "1:2", "2:1", "split", null, null]);
  });

  test("reads each unit of a line on its own, so the shared can of three says ½ and the others say nothing", () => {
    const cans = item({ by: "shares", units: [[[ann, 1]], [[ann, 1], [bob, 1]], [[cat, 3], [bob, 1]]] });
    expect([0, 1, 2].map((unit) => lineTag(cans, unit, order))).toEqual([null, "1:1", "1:3"]);
    expect([0, 1].map((unit) => lineTag(item({ by: "even", units: [[ann], [ann, bob]] }), unit, order))).toEqual([null, "½"]);
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

test("shareLabel reads whole units of a line as 1 of 2, part of the price as ½ of 1.00, and all of an Item as nothing", () => {
  expect([shareLabel([1, 2], 2, "3.50"), shareLabel([1, 4], 2, "24.00"), shareLabel([1, 2], 1, "1.00"), shareLabel([2, 7], 1, "7.00"), shareLabel([1, 1], 1, "1.00")]).toEqual([
    "1 of 2",
    "¼ of 24.00",
    "½ of 1.00",
    "2/7 of 7.00",
    null,
  ]);
});

describe("circleTap", () => {
  test("checks the person on the unit tapped, whoever else has it and whatever other units they have", () => {
    expect(circleTap(item({ by: "even", units: [[bob], []] }), 1, bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob", unit: 1 }]);
    expect(circleTap(item({ by: "even", units: [[ann], []] }), 0, bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob", unit: 0 }]);
    expect(circleTap(item({ by: "even", units: [[ann], [], [cat]] }), 2, bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob", unit: 2 }]);
  });

  test("unchecks the person from the unit tapped only, leaving their other units", () => {
    expect(circleTap(item({ by: "shares", units: [[[bob, 2]], [[ann, 1], [bob, 1]]] }), 1, bob)).toEqual([{ by: "bob", type: "unclaim", itemId: "tostones", participantId: "bob", unit: 1 }]);
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

test("unitAmounts divides each unit's cents by largest remainder, and shows typed cents under amount", () => {
  expect(unitAmounts(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }))).toEqual([
    [
      { participantId: "ann", cents: 67 },
      { participantId: "bob", cents: 33 },
    ],
  ]);
  expect(unitAmounts(item({ by: "even", units: [[ann, bob, cat], [bob]] }, 1001))).toEqual([
    [
      { participantId: "ann", cents: 167 },
      { participantId: "bob", cents: 167 },
      { participantId: "cat", cents: 167 },
    ],
    [{ participantId: "bob", cents: 500 }],
  ]);
  expect(unitAmounts(item({ by: "amount", units: [[[ann, cents(75)]]] }))).toEqual([[{ participantId: "ann", cents: 75 }]]);
});

describe("receiptRows at Topgolf", () => {
  const line = (id: string, name: string, cost: number, units: NonEmpty<readonly ParticipantId[]> = [[]]): SplitItem => ({
    id: itemId(id),
    name,
    price: price(cost),
    split: { by: "even", units },
  });
  const bucket = (id: string, amount: number, [first, ...rest]: NonEmpty<string>, name = "Beer Bucket Discount (10%)"): Adjustment => ({
    id: adjustmentId(id),
    kind: "bundleDiscount",
    name,
    amount: cents(amount),
    bundle: { name: "Beer Bucket", items: [itemId(first), ...rest.map(itemId)] },
  });
  const topgolf = (guinness: NonEmpty<readonly ParticipantId[]> = [[], [], []], firstDiscount = "Beer Bucket Discount (10%)"): Receipt<SplitItem> => ({
    items: [
      line("gameplay", "Gameplay", 8775),
      line("ultra1", "Michelob Ultra 16oz Aluminum Bottle", 629, [[ann]]),
      line("guinness1", "Guinness Draught 14.9oz Can", 2187, guinness),
      line("pineapple1", "High Noon Pineapple 12oz Can", 849, [[ann]]),
      line("watermelon1", "High Noon Watermelon 12oz Can", 849, [[bob]]),
      line("ultra2", "Michelob Ultra 16oz Aluminum Bottle", 629),
      line("guinness2", "Guinness Draught 14.9oz Can", 1458, [[], []]),
      line("pineapple2", "High Noon Pineapple 12oz Can", 849),
      line("watermelon2", "High Noon Watermelon 12oz Can", 1698, [[], []]),
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
      row.kind === "unit"
        ? [row.item.id, row.unit, row.price]
        : [row.bundle.name, row.bundle.summary, row.bundle.net, row.bundle.units.map(({ item: { id }, unit, price: cost }) => `${id} ${unit} ${cost}`), row.bundle.discount, unclaimedUnits(row.bundle)],
    );

  test("reads Gameplay, then each Beer Bucket with its drink count, percent, net price, discount, and units nobody had, and leaves only Tax and Tip as charges", () => {
    expect(read(topgolf())).toEqual([
      ["gameplay", 0, 8775],
      ["Beer Bucket", "6 items · 10% off", 4063, ["ultra1 0 629", "guinness1 0 729", "guinness1 1 729", "guinness1 2 729", "pineapple1 0 849", "watermelon1 0 849"], { label: "Discount (10%)", amount: -451 }, 3],
      ["Beer Bucket", "6 items · 10% off", 4171, ["ultra2 0 629", "guinness2 0 729", "guinness2 1 729", "pineapple2 0 849", "watermelon2 0 849", "watermelon2 1 849"], { label: "Discount (10%)", amount: -463 }, 6],
    ]);
    expect(receiptRows(topgolf()).charges.map(({ name }) => name)).toEqual(["Tax", "Tip"]);
  });

  test("gives a line of three at $10.00 one row per unit at 3.34, 3.33, and 3.33, the first row taking the extra cent", () => {
    const receipt: Receipt<SplitItem> = { items: [line("cans", "Cans", 1000, [[], [ann], []])], adjustments: [], subtotal: cents(1000), total: cents(1000) };
    expect(read(receipt)).toEqual([
      ["cans", 0, 334],
      ["cans", 1, 333],
      ["cans", 2, 333],
    ]);
  });

  test("counts one unit nobody had when two of three Guinness cans are checked, and none when all three are", () => {
    expect([read(topgolf([[ann], [bob], []]))[1][5], read(topgolf([[ann], [bob], [ann, bob]]))[1][5]]).toEqual([1, 0]);
  });

  test("names a Bundle's discount by its amount when the receipt prints no percent", () => {
    const [, bundle] = read(topgolf(undefined, "Bucket deal"));
    expect([bundle[1], bundle[4]]).toEqual(["6 items · $4.51 off", { label: "Bucket deal", amount: -451 }]);
  });

  test("tells a Bundle Item's sheet what its Bundle's discount takes off that unit's row, and says nothing outside a Bundle", () => {
    expect([
      bundleNote(topgolf(), itemId("guinness1"), 729),
      bundleNote(topgolf(undefined, "Bucket deal"), itemId("guinness1"), 729),
      bundleNote(topgolf(), itemId("ultra1"), 629),
      bundleNote(topgolf(), itemId("gameplay"), 8775),
    ]).toEqual(["In Beer Bucket. Its 10% off takes $0.73 off this line.", "In Beer Bucket. Its discount takes $0.73 off this line.", "In Beer Bucket. Its 10% off takes $0.63 off this line.", null]);
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
