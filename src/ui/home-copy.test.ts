import { describe, expect, test } from "vitest";

import { historyCopy } from "./home-copy";

describe("a recent split's row", () => {
  test("names up to three people, then counts the rest", () => {
    expect([["Jason"], ["Jason", "Sam"], ["Jason", "Sam", "Priya"], ["Jason", "Sam", "Priya", "Ana", "Ben"]].map(historyCopy.names)).toEqual([
      "Jason",
      "Jason and Sam",
      "Jason, Sam, and Priya",
      "Jason, Sam, and 3 more",
    ]);
  });

  test("says the day this device first saw it", () => {
    const now = new Date(2026, 9, 4, 9, 30).getTime();
    const days = [new Date(2026, 9, 4, 0, 5), new Date(2026, 9, 3, 23, 50), new Date(2026, 8, 28, 12), new Date(2025, 8, 28, 12)];
    expect(days.map((day) => historyCopy.when(day.getTime(), now))).toEqual(["Today", "Yesterday", "Sep 28", "Sep 28, 2025"]);
  });
});
