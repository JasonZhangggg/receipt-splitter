import { describe, expect, test } from "vitest";

import { participantId } from "../../core/split";
import { amountStatus } from "./amount-status";

const jason = participantId("jason");
const sam = participantId("sam");
const priya = participantId("priya");

describe("amountStatus", () => {
  test("nothing typed leaves the whole price and names no one when two people are at $0.00", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 0 }, { participantId: sam, cents: 0 }])).toEqual({ by: "left", left: 8775, assigned: 0, fillsInto: null });
  });

  test("one amount typed leaves the rest for the one person still at $0.00", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 0 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "left", left: 6275, assigned: 2500, fillsInto: jason });
  });

  test("money left with everyone typed fills no one, so no typed amount is overwritten", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 1000 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "left", left: 5275, assigned: 3500, fillsInto: null });
  });

  test("three people with two at $0.00 fills no one", () => {
    expect(amountStatus(900, [{ participantId: jason, cents: 300 }, { participantId: sam, cents: 0 }, { participantId: priya, cents: 0 }])).toEqual({ by: "left", left: 600, assigned: 300, fillsInto: null });
  });

  test("amounts that add up to the price are exact", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 6275 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "exact" });
  });

  test("a $0.00 Item with nobody's amount is exact", () => {
    expect(amountStatus(0, [{ participantId: jason, cents: 0 }])).toEqual({ by: "exact" });
  });

  test("amounts past the price are over by the difference", () => {
    expect(amountStatus(8775, [{ participantId: jason, cents: 7000 }, { participantId: sam, cents: 2500 }])).toEqual({ by: "over", over: 725 });
  });

  test("one cent over is over", () => {
    expect(amountStatus(100, [{ participantId: jason, cents: 101 }])).toEqual({ by: "over", over: 1 });
  });
});
