import { describe, expect, test } from "vitest";

import { cents, price } from "../core/money";
import { itemId, type PaymentService, type Receipt } from "../core/split";
import { emptyDraft, readiness, reduceDraft, type Draft, type DraftAction } from "../draft";
import { blockerText, historyCopy } from "./home-copy";

describe("a recent split's row", () => {
  test("names everyone who was there, three at most, and counts the rest", () => {
    expect([["Jason"], ["Jason", "Sam"], ["Jason", "Bin", "lei"], ["bob", "Ann", "Cy", "Dee"], ["bob", "a", "b", "c", "d"]].map(historyCopy.names)).toEqual([
      "Jason",
      "Jason and Sam",
      "Jason, Bin and lei",
      "bob, Ann and 2 more",
      "bob, a and 3 more",
    ]);
  });

  test("leads with the place when the Split has one, and moves everyone beside the day", () => {
    const who = historyCopy.names(["Jason", "Ana", "Sam"]);
    const when = "Today";
    expect([historyCopy.lines("Dinefine Restaurant", who, when, "3 people"), historyCopy.lines(undefined, who, when, "3 people")]).toEqual([
      { first: "Dinefine Restaurant", second: "Today \u00b7 Jason, Ana and Sam" },
      { first: "Jason, Ana and Sam", second: "Today \u00b7 3 people" },
    ]);
    expect([historyCopy.row(who, when, "3 people", "$51.30", "Dinefine Restaurant"), historyCopy.row(who, when, "3 people", "$51.30")]).toEqual([
      "Dinefine Restaurant, Jason, Ana and Sam, Today, 3 people, $51.30",
      "Jason, Ana and Sam, Today, 3 people, $51.30",
    ]);
  });

  test("says the day this device first saw it", () => {
    const now = new Date(2026, 9, 4, 9, 30).getTime();
    const days = [new Date(2026, 9, 4, 0, 5), new Date(2026, 9, 3, 23, 50), new Date(2026, 8, 28, 12), new Date(2025, 8, 28, 12)];
    expect(days.map((day) => historyCopy.when(day.getTime(), now))).toEqual(["Today", "Yesterday", "Sep 28", "Sep 28, 2025"]);
  });
});

const file = { name: "receipt.jpg" };
const lunch: Receipt = { items: [{ id: itemId("i1"), name: "Lunch", price: price(1000) }], adjustments: [], subtotal: cents(1000), total: cents(1000) };
const readLunch: DraftAction = { type: "read", file, receipt: lunch };

describe("why Create split link is off", () => {
  const why = (service: PaymentService, handle: string) => {
    const actions: DraftAction[] = [readLunch, { type: "setHost", name: "Jason" }, { type: "setService", index: 0, service }, { type: "setHandle", index: 0, handle }];
    return blockerText(readiness(actions.reduce<Draft>(reduceDraft, emptyDraft)));
  };

  test("says which Venmo rule the username breaks, the first that applies", () => {
    expect([why("venmo", "test"), why("venmo", "@"), why("venmo", "a".repeat(31)), why("venmo", "jason z"), why("venmo", "jason.z"), why("venmo", "jason-z")]).toEqual([
      "Venmo usernames need at least 5 characters.",
      "Add your Venmo username after the @.",
      "Venmo usernames have at most 30 characters.",
      "Venmo can't use spaces.",
      'Venmo can\'t use ".". Try letters, numbers, - or _.',
      null,
    ]);
  });

  test("says which Cash App rule the cashtag breaks, and holds PayPal and Zelle only to a length and visible characters", () => {
    expect([
      why("cashApp", "$"),
      why("cashApp", "j".repeat(21)),
      why("cashApp", "jz_1"),
      why("cashApp", "jason z"),
      why("venmo", "jason\u200bz"),
      why("cashApp", "$1234"),
      why("paypal", "p".repeat(81)),
      why("zelle", "ann​@example.com"),
      why("paypal", "Jason Z / tips"),
    ]).toEqual([
      "Add your cashtag after the $.",
      "Cashtags have at most 20 characters.",
      'Cash App can\'t use "_". Try letters and numbers.',
      "Cash App can't use spaces.",
      "Venmo can't use an invisible character.",
      "Cashtags need at least one letter.",
      "PayPal handles have at most 80 characters.",
      "Zelle can't use an invisible character.",
      null,
    ]);
  });

  test("asks for the Host's name once the handles are right, with no handle at all", () => {
    expect(blockerText(readiness(reduceDraft(emptyDraft, readLunch)))).toBe("Add your name first.");
  });
});
