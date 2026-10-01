import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { itemId, participantId, type ItemSplit, type SplitItem } from "../../core/split";
import { circleTap, itemsGap, lineTag, shareLabel, unitAmounts } from "./model";

const [ann, bob, cat] = ["ann", "bob", "cat"].map(participantId);
const item = (split: ItemSplit, cost = 100): SplitItem => ({ id: itemId("tostones"), name: "Tostones", price: price(cost), split });

describe("lineTag", () => {
  const order = [bob, ann, cat];

  test("reads ½ for two people, a ratio for shares in the table's order of people, split for amounts, ×2 for two units, and nothing for one person", () => {
    expect([
      lineTag(item({ by: "even", units: [[ann, bob]] }), order),
      lineTag(item({ by: "even", units: [[ann, bob, cat]] }), order),
      lineTag(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }), order),
      lineTag(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }), [ann, bob, cat]),
      lineTag(item({ by: "amount", units: [[[ann, cents(75)], [bob, cents(25)]]] }), order),
      lineTag(item({ by: "even", units: [[ann], [bob]] }), order),
      lineTag(item({ by: "even", units: [[ann]] }), order),
    ]).toEqual(["½", "⅓", "1:2", "2:1", "split", "×2", null]);
  });
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
  test("checks the first unit nobody had, or the first unit when every unit is taken", () => {
    expect(circleTap(item({ by: "even", units: [[ann], []] }), bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob", unit: 1 }]);
    expect(circleTap(item({ by: "even", units: [[ann], [cat]] }), bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob", unit: 0 }]);
  });

  test("unchecks the person from every unit they had", () => {
    expect(circleTap(item({ by: "shares", units: [[[bob, 2]], [[ann, 1], [bob, 1]]] }), bob)).toEqual([
      { by: "bob", type: "unclaim", itemId: "tostones", participantId: "bob", unit: 0 },
      { by: "bob", type: "unclaim", itemId: "tostones", participantId: "bob", unit: 1 },
    ]);
  });
});

test("itemsGap is positive when the Items run over the printed subtotal and negative when short", () => {
  const receipt = (sprite: number) => ({ items: [item({ by: "even", units: [[]] }, sprite)] as const, adjustments: [], subtotal: cents(250), total: cents(250) });

  expect([itemsGap(receipt(275)), itemsGap(receipt(200)), itemsGap(receipt(250))]).toEqual([25, -50, 0]);
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
