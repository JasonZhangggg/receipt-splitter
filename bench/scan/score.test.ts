import { describe, expect, test } from "vitest";

import { meetsFloor, scoreReading, tableRows, type RunResult } from "./score.mjs";

const passed = { passed: true, gaps: { subtotal: 0, total: 0 } };

const market = {
  items: [650, -100, 925, -250, 599],
  tax: 150,
  total: 1974,
  lines: [
    { k: "i", cents: 650 },
    { k: "d", cents: -100, under: true },
    { k: "i", cents: 925 },
    { k: "d", cents: -250, under: true },
    { k: "i", cents: 599 },
  ],
};

const item = (name: string, price: number, discounts: number[] = []) => ({
  name,
  price,
  quantity: null,
  details: [],
  discounts: discounts.map((amount) => ({ name: "Deal", amount })),
});

const marketReply = (loaf: number[], honey: number[]) => ({
  items: [item("Sourdough Loaf", 650 + loaf.reduce((a, b) => a + b, 0), loaf), item("Wildflower Honey", 925 + honey.reduce((a, b) => a + b, 0), honey), item("Sparkling Water", 599)],
  bundles: [],
  adjustments: [{ kind: "tax", name: "Tax", amount: 150 }],
  subtotal: { amount: 1824, beforeDiscounts: false },
  total: 1974,
  check: passed,
});

describe("scoreReading", () => {
  test("a reading with every amount and discount in place is fully correct", () => {
    expect(scoreReading(market, marketReply([-100], [-250]))).toEqual({
      full: true,
      itemsF1: 1,
      split: true,
      bundles: null,
      taxRight: true,
      totalRight: true,
      reconciles: true,
      checkPassed: true,
    });
  });

  test("two Items whose discounts trade places keep every amount but get the split wrong", () => {
    expect(scoreReading(market, marketReply([-250], [-100]))).toEqual({
      full: false,
      itemsF1: 1,
      split: false,
      bundles: null,
      taxRight: true,
      totalRight: true,
      reconciles: true,
      checkPassed: true,
    });
  });

  test("a reading that misses an Item loses recall and stops reconciling", () => {
    const reply = marketReply([-100], [-250]);
    const missed = { ...reply, items: reply.items.slice(0, 2), check: { passed: false, gaps: { subtotal: 599, total: 599 }, problems: ["short by $5.99"] } };
    expect(scoreReading(market, missed)).toEqual({
      full: false,
      itemsF1: 0.8888888888888888,
      split: true,
      bundles: null,
      taxRight: true,
      totalRight: true,
      reconciles: false,
      checkPassed: false,
    });
  });

  test("a failed request scores as a wrong reading", () => {
    expect(scoreReading(market, null)).toEqual({
      full: false,
      itemsF1: 0,
      split: false,
      bundles: null,
      taxRight: false,
      totalRight: false,
      reconciles: false,
      checkPassed: false,
    });
  });

  test("a truth without item amounts or under lines scores tax and total only", () => {
    const totalsOnly = { items: null, tax: 150, total: 1974 };
    expect(scoreReading(totalsOnly, marketReply([-250], [-100]))).toEqual({
      full: true,
      itemsF1: null,
      split: null,
      bundles: null,
      taxRight: true,
      totalRight: true,
      reconciles: true,
      checkPassed: true,
    });
  });
});

describe("scoreReading with Bundles", () => {
  const range = {
    items: [8775, 629, 2187, -451, 629, 1458, -463],
    tax: 494,
    tip: 3226,
    total: 16484,
    bundles: [{ name: "Beer Bucket" }, { name: "Beer Bucket" }],
    lines: [
      { k: "i", cents: 8775 },
      { k: "i", cents: 629, bundle: 0 },
      { k: "i", cents: 2187, bundle: 0, qty: 3 },
      { k: "d", cents: -451, bundle: 0 },
      { k: "i", cents: 629, bundle: 1 },
      { k: "i", cents: 1458, bundle: 1, qty: 2 },
      { k: "d", cents: -463, bundle: 1 },
    ],
  };

  const rangeReply = (first: number[], second: number[]) => ({
    items: [item("Gameplay", 8775), item("Michelob Ultra", 629), item("Guinness Draught", 2187), item("Michelob Ultra", 629), item("Guinness Draught", 1458)],
    bundles: [
      { name: "Beer Bucket", items: first, discounts: [{ name: "Bucket discount", amount: -451 }] },
      { name: "Beer Bucket", items: second, discounts: [{ name: "Bucket discount", amount: -463 }] },
    ],
    adjustments: [
      { kind: "tax", name: "Tax", amount: 494 },
      { kind: "tip", name: "Tip", amount: 3226 },
    ],
    subtotal: null,
    total: 16484,
    check: passed,
  });

  test("both Bundles with their members and discounts, and Gameplay outside them", () => {
    expect(scoreReading(range, rangeReply([1, 2], [3, 4]))).toEqual({
      full: true,
      itemsF1: 1,
      split: null,
      bundles: { count: true, members: true, discounts: true, outside: true, right: true },
      taxRight: true,
      totalRight: true,
      reconciles: true,
      checkPassed: true,
    });
  });

  test("Gameplay pulled into a Bundle gets the members and the Items outside wrong", () => {
    expect(scoreReading(range, rangeReply([0, 1, 2], [3, 4])).bundles).toEqual({
      count: true,
      members: false,
      discounts: true,
      outside: false,
      right: false,
    });
  });
});

const run = (id: string, full: boolean, extra: Partial<RunResult> = {}): RunResult => ({
  id,
  status: 200,
  ms: 3000,
  cost: 0.001,
  passes: 1,
  score: { full, itemsF1: full ? 1 : 0.5, split: null, bundles: null, taxRight: true, totalRight: true, reconciles: true, checkPassed: true },
  ...extra,
});

describe("tableRows", () => {
  test("one row per fixture and a totals row", () => {
    const results = [
      run("t1", true, { ms: 2000, score: { ...run("t1", true).score, bundles: { count: true, members: true, discounts: true, outside: true, right: true } } }),
      run("t1", true, { ms: 4000, passes: 2, cost: 0.003 }),
      run("t2", false, { ms: 9000, score: { ...run("t2", false).score, split: false } }),
      run("t2", false, { status: 502, ms: 1000, cost: null, passes: null, score: { ...run("t2", false).score, itemsF1: 0, split: false, checkPassed: false } }),
    ];
    expect(tableRows(results)).toEqual([
      ["fixture", "runs", "fully correct", "items F1", "split right", "Bundles right", "wrong, check passed", "pass 2", "median ms", "worst ms", "mean cost", "failed"],
      ["t1", "2", "2/2", "1.000", "n/a", "1/1", "0", "1", "3000", "4000", "$0.00200", ""],
      ["t2", "2", "0/2", "0.250", "0/2", "n/a", "1", "0", "5000", "9000", "$0.00100", "502"],
      ["all", "4", "2/4", "0.625", "0/2", "1/1", "1", "1", "3000", "9000", "$0.00167", "502"],
    ]);
  });
});

describe("meetsFloor", () => {
  const results = [run("t1", true), run("t1", true), run("t2", true), run("t2", false), run("t3", false)];

  test("passes when the fully correct fraction reaches the floor", () => {
    expect(meetsFloor(results, { fullyCorrect: 0.6 })).toEqual({ met: true, fullyCorrect: 0.6 });
  });

  test("fails below the floor", () => {
    expect(meetsFloor(results, { fullyCorrect: 0.8 })).toEqual({ met: false, fullyCorrect: 0.6 });
  });

  test("passes with no floor", () => {
    expect(meetsFloor(results, null)).toEqual({ met: true, fullyCorrect: 0.6 });
  });
});
