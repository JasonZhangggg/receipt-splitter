import { describe, expect, test } from "vitest";

import type { PaymentService } from "../core/split";
import { emptyDraft, readiness, reduceDraft, type Draft, type DraftAction } from "../draft";
import { blockerText, historyCopy } from "./home-copy";

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

describe("why Create split link is off", () => {
  const why = (service: PaymentService, handle: string) => {
    const actions: DraftAction[] = [{ type: "example" }, { type: "addName", name: "Jason" }, { type: "setService", index: 0, service }, { type: "setHandle", index: 0, handle }];
    return blockerText(readiness(actions.reduce<Draft>(reduceDraft, emptyDraft)));
  };

  test("says which Venmo rule the username breaks, the first that applies", () => {
    expect([why("venmo", "test"), why("venmo", "@"), why("venmo", "a".repeat(31)), why("venmo", "jason z"), why("venmo", "jason.z"), why("venmo", "jason-z")]).toEqual([
      "Venmo usernames need at least 5 characters. This one has 4.",
      "Add your Venmo username after the @.",
      "Venmo usernames can have at most 30 characters. This one has 31.",
      "Venmo usernames can't have a space. Use letters, numbers, hyphens or underscores.",
      'Venmo usernames can\'t have ".". Use letters, numbers, hyphens or underscores.',
      null,
    ]);
  });

  test("says which Cash App rule the cashtag breaks, and holds PayPal and Zelle only to a length and visible characters", () => {
    expect([
      why("cashApp", "$"),
      why("cashApp", "j".repeat(21)),
      why("cashApp", "jz_1"),
      why("cashApp", "$1234"),
      why("paypal", "p".repeat(81)),
      why("zelle", "ann​@example.com"),
      why("paypal", "Jason Z / tips"),
    ]).toEqual([
      "Add your cashtag after the $.",
      "Cashtags can have at most 20 characters. This one has 21.",
      'Cashtags can\'t have "_". Use letters and numbers.',
      "Cashtags need at least one letter.",
      "PayPal handles can have at most 80 characters. This one has 81.",
      "Zelle handles can't have an invisible character.",
      null,
    ]);
  });

  test("asks for the Host's name once the handles are right, with no handle at all", () => {
    expect(blockerText(readiness(reduceDraft(emptyDraft, { type: "example" })))).toBe("Add your name.");
  });
});
