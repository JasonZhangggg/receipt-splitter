import { describe, expect, test } from "vitest";

import { price } from "../../core/money";
import { participantId } from "../../core/split";
import { amountStatus, suggestedAmounts } from "./amount-status";

const jason = participantId("jason");
const sam = participantId("sam");
const priya = participantId("priya");

describe("amountStatus", () => {
  test("nothing typed leaves the whole price and names no one when two people are at $0.00", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 0 }, { participantId: sam, cents: 0 }])).toEqual({ by: "left", left: 8775, assigned: 0, fill: null });
  });

  test("one amount typed leaves the rest for the one person still at $0.00", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 0 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "left", left: 6275, assigned: 2500, fill: { participantId: jason, cents: 6275 } });
  });

  test("money left with everyone typed fills no one, so no typed amount is overwritten", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 1000 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "left", left: 5275, assigned: 3500, fill: null });
  });

  test("three people with two at $0.00 fills no one", () => {
    expect(amountStatus(900, [{ participantId: jason, cents: 300 }, { participantId: sam, cents: 0 }, { participantId: priya, cents: 0 }])).toEqual({ by: "left", left: 600, assigned: 300, fill: null });
  });

  test("amounts that add up to the price are exact", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 6275 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "exact" });
  });

  test("a $0.00 Item with nobody's amount is exact", () => {
    expect(amountStatus(0, [{ participantId: jason, cents: 0 }])).toEqual({ by: "exact" });
  });

  test("amounts past the price are over by the difference", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 7000 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "over", over: 725, fill: null });
  });

  test("one cent over is over", () => {
    expect(amountStatus(100, [{ participantId: jason, cents: 101 }])).toEqual({ by: "over", over: 1, fill: null });
  });

  test("over, the person who typed last can take the rest: their amount less the excess", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 7000 }, { participantId: sam, cents: 2500 }], jason)).toEqual({ by: "over", over: 725, fill: { participantId: jason, cents: 6275 } });
  });

  test("over, the last typed amount is taken down to $0.00 at most, and no rest is offered when it cannot cover the excess", () => {
    expect(amountStatus(1000, [{ participantId: jason, cents: 1000 }, { participantId: sam, cents: 300 }], sam)).toEqual({ by: "over", over: 300, fill: { participantId: sam, cents: 0 } });
    expect(amountStatus(1000, [{ participantId: jason, cents: 1200 }, { participantId: sam, cents: 100 }], sam)).toEqual({ by: "over", over: 300, fill: null });
  });
});

describe("suggestedAmounts", () => {
  const untouched = (...ids: typeof jason[]) => ids.map((participantId) => ({ participantId, cents: 0 }));

  test("offers an even split whose cents add up to the price, the first claimers taking the extra", () => {
    expect(suggestedAmounts(price(8775), untouched(jason, sam), null)).toEqual([{ participantId: jason, cents: 4388 }, { participantId: sam, cents: 4387 }]);
    expect(suggestedAmounts(price(1000), untouched(jason, sam, priya), null)).toEqual([{ participantId: jason, cents: 334 }, { participantId: sam, cents: 333 }, { participantId: priya, cents: 333 }]);
  });

  test("offers nothing once an amount is typed, a field holds money, the price is $0.00 or nobody has the Item", () => {
    expect(suggestedAmounts(price(8775), untouched(jason, sam), jason)).toBeNull();
    expect(suggestedAmounts(price(8775), [{ participantId: jason, cents: 100 }, { participantId: sam, cents: 0 }], null)).toBeNull();
    expect(suggestedAmounts(price(0), untouched(jason, sam), null)).toBeNull();
    expect(suggestedAmounts(price(8775), [], null)).toBeNull();
  });
});
