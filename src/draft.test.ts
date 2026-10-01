import { describe, expect, test } from "vitest";

import { cents, MAX_CENTS, price } from "./core/money";
import { adjustmentId, itemId, type Receipt } from "./core/split";
import type { ParsedItem } from "./parse";
import { blockedReason, emptyDraft, flaggedRows, parseAmount, loadDraft, reduceDraft, saveDraft, type Draft, type DraftAction } from "./draft";

const receipt1040: Receipt = {
  items: [
    { id: itemId("i1"), name: "Chicken Fried Rice And Egg", price: price(799) },
    { id: itemId("i2"), name: "California Tropic And Miso", price: price(799) },
    { id: itemId("i3"), name: "Add Two Tostones", price: price(100) },
    { id: itemId("i4"), name: "Sprite", price: price(250) },
    { id: itemId("i5"), name: "Perrier Sparkling Water", price: price(350) },
  ],
  adjustments: [
    { id: adjustmentId("a1"), kind: "tax", name: "Tax", amount: cents(161) },
    { id: adjustmentId("a2"), kind: "serviceCharge", name: "Service fees on tables", amount: cents(345) },
  ],
  subtotal: cents(2298),
  total: cents(2804),
};

const file = { name: "IMG_4127.jpg", thumbnail: null };

const run = (draft: Draft, ...actions: DraftAction[]) => actions.reduce(reduceDraft, draft);

const read1040 = (draft = emptyDraft) => run(draft, { type: "reading", file }, { type: "read", file, receipt: receipt1040 });

const withVenmo = (draft: Draft) => run(draft, { type: "setHandle", index: 0, handle: "@jason-z" });

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("blockedReason", () => {
  test("names the one thing that keeps Create split link off", () => {
    const ready = withVenmo(read1040());
    expect({
      noReceipt: blockedReason(withVenmo(emptyDraft)),
      reading: blockedReason(withVenmo(run(emptyDraft, { type: "reading", file }))),
      short: blockedReason(run(ready, { type: "editItem", id: "i5", price: price(300) })),
      over: blockedReason(run(ready, { type: "editItem", id: "i5", price: price(400) })),
      noHandle: blockedReason(read1040()),
      ready: blockedReason(ready),
    }).toEqual({
      noReceipt: "Add a receipt.",
      reading: "Reading the receipt.",
      short: "Items are $0.50 short.",
      over: "Items are $0.50 over.",
      noHandle: "Add how to pay you.",
      ready: null,
    });
  });

  test("blames tax and charges when the Items match the subtotal but the total does not", () => {
    const draft = withVenmo(read1040());
    expect(blockedReason(run(draft, { type: "editAdjustment", id: "a1", amount: cents(100) }))).toBe("Tax and charges are $0.61 short.");
    expect(blockedReason(run(draft, { type: "editAdjustment", id: "a1", amount: cents(200) }))).toBe("Tax and charges are $0.39 over.");
  });

  test("blames the Items for a typed receipt, which has no subtotal to check them against", () => {
    const typed = run(emptyDraft, { type: "read", file, receipt: null }, { type: "addItem" }, { type: "editItem", id: "i1", name: "Pad thai", price: price(1800) });
    expect(blockedReason(withVenmo(typed))).toBe("Items are $18.00 over.");
  });

  test("a handle of only spaces is no way to pay the Host", () => {
    expect(blockedReason(run(read1040(), { type: "setHandle", index: 0, handle: "   " }))).toBe("Add how to pay you.");
  });

  test("needs a named Item before a typed receipt can go out", () => {
    const typed = withVenmo(run(emptyDraft, { type: "reading", file }, { type: "read", file, receipt: null }));
    expect(blockedReason(typed)).toBe("Add an item.");
    const blank = run(typed, { type: "addItem" }, { type: "editItem", id: "i1", price: price(1000) }, { type: "editTotal", amount: cents(1000) });
    expect(blockedReason(blank)).toBe("Name every item.");
    expect(blockedReason(run(blank, { type: "editItem", id: "i1", name: "Pad thai" }))).toBeNull();
  });
});

describe("the tip", () => {
  test("reads $0.00 when the receipt prints none, and a tip edit moves the total by the same amount", () => {
    const draft = withVenmo(read1040());
    expect(draft.scan.status === "read" && [draft.scan.receipt.tip, totalOf(draft)]).toEqual([0, 2804]);
    const tipped = run(draft, { type: "editTip", amount: cents(460) });
    expect(tipped.scan.status === "read" && [tipped.scan.receipt.tip, totalOf(tipped)]).toEqual([460, 3264]);
    expect(blockedReason(tipped)).toBeNull();
  });

  test("comes from the receipt's tip lines", () => {
    const tipped: Receipt = {
      ...receipt1040,
      adjustments: [...receipt1040.adjustments, { id: adjustmentId("a3"), kind: "tip", name: "Tip", amount: cents(460) }],
      total: cents(3264),
    };
    const draft = run(emptyDraft, { type: "read", file, receipt: tipped });
    expect(draft.scan.status === "read" && [draft.scan.receipt.tip, draft.scan.receipt.adjustments.map((a) => a.name), totalOf(draft)]).toEqual([
      460,
      ["Tax", "Service fees on tables"],
      3264,
    ]);
  });
});

function totalOf(draft: Draft) {
  if (draft.scan.status !== "read") throw new Error("no receipt");
  const { totalBeforeTip, tip } = draft.scan.receipt;
  return totalBeforeTip + tip;
}

describe("loadDraft and saveDraft", () => {
  test("a saved draft loads back with its Receipt, tip, two Payment handles, and three names", () => {
    const storage = new MemoryStorage();
    const draft = run(
      read1040(),
      { type: "editTip", amount: cents(460) },
      { type: "setService", index: 0, service: "cashApp" },
      { type: "setHandle", index: 0, handle: "$jasonz" },
      { type: "addHandle" },
      { type: "setHandle", index: 1, handle: "@jason-z" },
      { type: "addName", name: "Sam" },
      { type: "addName", name: "Priya" },
      { type: "addName", name: "Lee" },
    );
    saveDraft(draft, storage);
    const loaded = loadDraft(storage);
    expect(loaded).toEqual(draft);
    expect(loaded.handles).toEqual([
      { service: "cashApp", handle: "$jasonz" },
      { service: "venmo", handle: "@jason-z" },
    ]);
    expect(loaded.names).toEqual(["Sam", "Priya", "Lee"]);
    expect(loaded.scan.status === "read" && loaded.scan.receipt.items.map((item) => item.price)).toEqual([799, 799, 100, 250, 350]);
  });

  test("a reload during a read keeps the Payment handles and starts over on the Receipt", () => {
    const storage = new MemoryStorage();
    saveDraft(withVenmo(run(emptyDraft, { type: "reading", file })), storage);
    expect(loadDraft(storage)).toEqual(withVenmo(emptyDraft));
  });

  test("an empty, unreadable, or foreign value loads the empty draft", () => {
    const storage = new MemoryStorage();
    expect(loadDraft(storage)).toEqual(emptyDraft);
    storage.setItem("receipt-splitter:draft", "{not json");
    expect(loadDraft(storage)).toEqual(emptyDraft);
    storage.setItem("receipt-splitter:draft", JSON.stringify({ version: 1, draft: { scan: { status: "read" }, handles: [], names: [] } }));
    expect(loadDraft(storage)).toEqual(emptyDraft);
  });

  test("replacing the Receipt keeps the Payment handles and the names", () => {
    const draft = run(withVenmo(read1040()), { type: "addName", name: "Sam" }, { type: "reading", file: { name: "IMG_4128.jpg", thumbnail: null } });
    expect(draft).toEqual({
      scan: { status: "reading", file: { name: "IMG_4128.jpg", thumbnail: null } },
      handles: [{ service: "venmo", handle: "@jason-z" }],
      names: ["Sam"],
    });
  });
});

describe("reading OCR into the draft", () => {
  test("cuts each OCR line to 80 graphemes", () => {
    const long = `${"👨‍👩‍👧".repeat(79)}Lasagna`;
    const receipt: Receipt = { ...receipt1040, items: [{ ...receipt1040.items[0], name: long }, ...receipt1040.items.slice(1)] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    const name = draft.scan.status === "read" ? draft.scan.receipt.items[0].name : "";
    expect(name).toBe(`${"👨‍👩‍👧".repeat(79)}L`);
  });

  test("drops blank OCR rows that carry no price", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: "  ", price: price(0) }] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    expect(draft.scan.status === "read" && draft.scan.receipt.items.length).toBe(5);
  });

  test("keeps a priced OCR row with a blank name, for the Host to name", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: " ", price: price(150) }] };
    const draft = run(withVenmo(emptyDraft), { type: "read", file, receipt });
    expect(draft.scan.status === "read" && draft.scan.receipt.items.at(-1)).toEqual({ id: "i6", name: "", price: 150 });
  });

  test("keeps a 0-cent Item, such as a kitchen note printed as a line", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: "APPS OUT FIRST", price: price(0) }] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    expect(draft.scan.status === "read" && draft.scan.receipt.items.at(-1)).toEqual({ id: "i6", name: "APPS OUT FIRST", price: 0 });
  });

  test("refuses an OCR price over MAX_CENTS by reading it as 0 and flagging the row", () => {
    const receipt: Receipt = { ...receipt1040, items: [{ ...receipt1040.items[0], price: price(MAX_CENTS + 1) }, ...receipt1040.items.slice(1)] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    expect(draft.scan.status === "read" && draft.scan.receipt.items[0]).toEqual({ id: "i1", name: "Chicken Fried Rice And Egg", price: 0, unreadPrice: true });
  });

  test("marks an Item that a discount took below zero", () => {
    const [first, ...rest] = receipt1040.items;
    const receipt: Receipt<ParsedItem> = { ...receipt1040, items: [{ ...first, price: price(0), discountExceededPrice: true }, ...rest] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    expect(draft.scan.status === "read" && draft.scan.receipt.items[0]).toEqual({ id: "i1", name: "Chicken Fried Rice And Egg", price: 0, discountExceededPrice: true });
  });

  test("a failed read opens the empty editor and keeps the file", () => {
    const draft = run(emptyDraft, { type: "reading", file }, { type: "read", file, receipt: null });
    expect(draft.scan).toEqual({
      status: "read",
      file,
      receipt: { items: [], adjustments: [{ id: "a1", kind: "tax", name: "Tax", amount: 0 }], subtotal: null, tip: 0, totalBeforeTip: 0, nextId: 1 },
    });
  });
});

describe("editing", () => {
  test("refuses a typed price over MAX_CENTS and keeps the price it had", () => {
    const draft = read1040();
    expect(run(draft, { type: "editItem", id: "i1", price: price(MAX_CENTS + 1) })).toEqual(draft);
  });

  test("cuts a typed Item name to 80 graphemes", () => {
    const draft = run(read1040(), { type: "editItem", id: "i1", name: "x".repeat(81) });
    expect(draft.scan.status === "read" && draft.scan.receipt.items[0].name).toBe("x".repeat(80));
  });

  test("adds an Item with a fresh id and deletes rows in one step each", () => {
    const draft = run(read1040(), { type: "addItem" }, { type: "removeItem", id: "i2" }, { type: "removeAdjustment", id: "a2" });
    if (draft.scan.status !== "read") throw new Error("no receipt");
    expect(draft.scan.receipt.items.map(({ id, name }) => `${id} ${name}`)).toEqual([
      "i1 Chicken Fried Rice And Egg",
      "i3 Add Two Tostones",
      "i4 Sprite",
      "i5 Perrier Sparkling Water",
      "i6 ",
    ]);
    expect(draft.scan.receipt.adjustments.map(({ id }) => id)).toEqual(["a1"]);
  });

  test("flags the row a misread explains, and the rows the Host retyped, while the Total check fails", () => {
    const misread: Receipt = { ...receipt1040, items: [{ ...receipt1040.items[0], price: price(7990) }, ...receipt1040.items.slice(1)] };
    expect(flaggedRows(run(emptyDraft, { type: "read", file, receipt: misread }))).toEqual(["i1"]);
    const retyped = run(read1040(), { type: "editItem", id: "i5", price: price(300) });
    expect(flaggedRows(retyped)).toEqual(["i5"]);
    expect(flaggedRows(run(retyped, { type: "editItem", id: "i5", price: price(350) }))).toEqual([]);
    expect(flaggedRows(read1040())).toEqual([]);
  });

  test("a typed total sets the Total the Host sees, with the tip on top", () => {
    const typed = run(emptyDraft, { type: "read", file, receipt: null }, { type: "editTip", amount: cents(200) }, { type: "editTotal", amount: cents(1200) });
    expect(totalOf(typed)).toBe(1200);
    expect(totalOf(run(typed, { type: "editTip", amount: cents(300) }))).toBe(1300);
  });
});

describe("parseAmount", () => {
  test("reads what the Host types into a price, and refuses anything over MAX_CENTS", () => {
    expect(["3", "3.5", "3.50", ".5", "", "100000.00", "100000.01", "3.505", "1e3", "-2.00"].map((text) => parseAmount(text))).toEqual([
      300, 350, 350, 50, 0, MAX_CENTS, null, null, null, null,
    ]);
    expect(["-2.00", "-", "--1"].map((text) => parseAmount(text, true))).toEqual([-200, -0, null]);
  });
});

describe("the Payment handles and names", () => {
  test("+ adds the next app the Host has not used, and stops at four", () => {
    const draft = run(emptyDraft, { type: "setService", index: 0, service: "cashApp" }, { type: "addHandle" }, { type: "addHandle" }, { type: "addHandle" }, { type: "addHandle" });
    expect(draft.handles.map(({ service }) => service)).toEqual(["cashApp", "venmo", "paypal", "zelle"]);
    expect(run(draft, { type: "removeHandle", index: 1 }).handles.map(({ service }) => service)).toEqual(["cashApp", "paypal", "zelle"]);
  });

  test("adds trimmed names, skips blanks and repeats, and removes one", () => {
    const draft = run(emptyDraft, { type: "addName", name: " Sam " }, { type: "addName", name: "" }, { type: "addName", name: "sam" }, { type: "addName", name: "Me" }, { type: "addName", name: "Priya" });
    expect(draft.names).toEqual(["Sam", "Priya"]);
    expect(run(draft, { type: "removeName", name: "Sam" }).names).toEqual(["Priya"]);
  });
});

describe("the Example", () => {
  test("is SRD receipt 1040 as its checked label reads, and keeps the Host's handles", () => {
    const draft = run(withVenmo(emptyDraft), { type: "example" });
    expect(draft.handles).toEqual([{ service: "venmo", handle: "@jason-z" }]);
    expect(draft.scan.status === "read" && draft.scan.file).toEqual({ name: "Example receipt", thumbnail: null });
    if (draft.scan.status !== "read") throw new Error("no receipt");
    expect(draft.scan.receipt.items.map(({ name, price }) => `${name} ${price}`)).toEqual([
      "Chicken Fried Rice And Egg 799",
      "California Tropic And Miso 799",
      "Add Two Tostones 100",
      "Sprite 250",
      "Perrier Sparkling Water 350",
    ]);
    expect([draft.scan.receipt.subtotal, draft.scan.receipt.tip, totalOf(draft)]).toEqual([2298, 0, 2804]);
    expect(blockedReason(draft)).toBeNull();
  });
});
