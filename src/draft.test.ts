import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { cents, MAX_CENTS, price } from "./core/money";
import { applyOperation } from "./core/operations";
import { parseCreateSplitRequest } from "./core/parse";
import { computeShares } from "./core/shares";
import { mintedId } from "./core/test-ids";
import { adjustmentId, itemId, participantId, type Receipt, type SplitId } from "./core/split";
import { parseReceipt, type ParsedItem } from "./parse";
import { box } from "./parse/fixtures/boxes";
import { editsOnHome, emptyDraft, mismatchNote, flaggedRows, newName, parseAmount, loadDraft, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction } from "./draft";

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

const reasonOf = (draft: Draft) => {
  const found = readiness(draft);
  if (found.kind === "ready") return null;
  return found.kind === "note" ? found.note : found;
};

const requestOf = (draft: Draft, newId: () => ReturnType<typeof participantId>) => {
  const found = readiness(draft);
  return found.kind === "ready" ? splitRequest(found, newId) : null;
};

const withVenmo = (draft: Draft) => run(draft, { type: "setHandle", index: 0, handle: "@jason-z" }, { type: "addName", name: "Jason" });

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("readiness", () => {
  test("names the one thing that keeps Create split link off", () => {
    const ready = withVenmo(read1040());
    expect({
      noReceipt: reasonOf(withVenmo(emptyDraft)),
      reading: reasonOf(withVenmo(run(emptyDraft, { type: "reading", file }))),
      noHandle: reasonOf(read1040()),
      noName: reasonOf(run(read1040(), { type: "setHandle", index: 0, handle: "@jason-z" })),
      ready: reasonOf(ready),
    }).toEqual({
      noReceipt: "Add a receipt.",
      reading: "Reading the receipt.",
      noHandle: { kind: "noHandle" },
      noName: "Add your name.",
      ready: null,
    });
  });

  test("a ready draft carries the create body, so Create split link always has one to send", () => {
    const found = readiness(run(withVenmo(read1040()), { type: "addName", name: "Sam" }));

    expect(found.kind === "ready" && splitRequest(found, counter()).participants).toEqual([
      { id: "p0", name: "Jason" },
      { id: "p1", name: "Sam" },
    ]);
  });

  test("refuses an amount over MAX_CENTS, which Create split link would be refused for", () => {
    const withAdjustment = (amount: number): Receipt => ({ ...receipt1040, adjustments: [{ id: adjustmentId("a1"), kind: "tax", name: "Tax", amount: cents(amount) }] });
    const reason = "An amount is over $100,000.";
    expect({
      adjustment: reasonOf(withVenmo(run(emptyDraft, { type: "read", file, receipt: withAdjustment(99_999_999) }))),
      negativeAdjustment: reasonOf(withVenmo(run(emptyDraft, { type: "read", file, receipt: withAdjustment(-99_999_999) }))),
      total: reasonOf(withVenmo(run(emptyDraft, { type: "read", file, receipt: { ...receipt1040, total: cents(MAX_CENTS + 1) } }))),
      subtotal: reasonOf(withVenmo(run(emptyDraft, { type: "read", file, receipt: { ...receipt1040, subtotal: cents(MAX_CENTS + 1) } }))),
      tipOnTop: reasonOf(withVenmo(run(read1040(), { type: "editTip", amount: cents(MAX_CENTS) }))),
    }).toEqual({ adjustment: reason, negativeAdjustment: reason, total: reason, subtotal: reason, tipOnTop: reason });
  });

  test("lets an amount of exactly MAX_CENTS through", () => {
    const receipt: Receipt = { items: [{ id: itemId("i1"), name: "Car", price: price(MAX_CENTS) }], adjustments: [], subtotal: cents(MAX_CENTS), total: cents(MAX_CENTS) };
    expect(reasonOf(withVenmo(run(emptyDraft, { type: "read", file, receipt })))).toBeNull();
  });

  test("a failed Total check blocks nothing and reads as a note against the subtotal", () => {
    const ready = withVenmo(read1040());
    const short = run(ready, { type: "editItem", id: "i5", price: price(300) });
    const over = run(ready, { type: "editItem", id: "i5", price: price(400) });
    expect({ blocker: reasonOf(short), short: mismatchNote(short), over: mismatchNote(over), ready: mismatchNote(ready), reading: mismatchNote(run(emptyDraft, { type: "reading", file })) }).toEqual({
      blocker: null,
      short: "Items are $0.50 short of the subtotal.",
      over: "Items are $0.50 over the subtotal.",
      ready: null,
      reading: null,
    });
  });

  test("notes tax and charges when the Items match the subtotal but the total does not", () => {
    const draft = withVenmo(read1040());
    expect(mismatchNote(run(draft, { type: "editAdjustment", id: "a1", amount: cents(100) }))).toBe("Tax and charges are $0.61 short of the total.");
    expect(mismatchNote(run(draft, { type: "editAdjustment", id: "a1", amount: cents(200) }))).toBe("Tax and charges are $0.39 over the total.");
  });

  test("notes the Items against the total for a typed receipt, which has no subtotal", () => {
    const typed = run(emptyDraft, { type: "read", file, receipt: null }, { type: "addItem" }, { type: "editItem", id: "i1", name: "Pad thai", price: price(1800) });
    expect(mismatchNote(withVenmo(typed))).toBe("Items are $18.00 over the total.");
    expect(reasonOf(withVenmo(typed))).toBeNull();
  });

  test("a handle of only spaces is no way to pay the Host", () => {
    expect(reasonOf(run(read1040(), { type: "setHandle", index: 0, handle: "   " }))).toEqual({ kind: "noHandle" });
  });

  test("needs a named Item before a typed receipt can go out", () => {
    const typed = withVenmo(run(emptyDraft, { type: "reading", file }, { type: "read", file, receipt: null }));
    expect(reasonOf(typed)).toBe("Add an item.");
    const blank = run(typed, { type: "addItem" }, { type: "editItem", id: "i1", price: price(1000) }, { type: "editTotal", amount: cents(1000) });
    expect(reasonOf(blank)).toBe("Name every item.");
    expect(reasonOf(run(blank, { type: "editItem", id: "i1", name: "Pad thai" }))).toBeNull();
  });
});

describe("the tip", () => {
  test("reads $0.00 when the receipt prints none, and a tip edit moves the total by the same amount", () => {
    const draft = withVenmo(read1040());
    expect(draft.scan.status === "read" && [draft.scan.receipt.tip, totalOf(draft)]).toEqual([0, 2804]);
    const tipped = run(draft, { type: "editTip", amount: cents(460) });
    expect(tipped.scan.status === "read" && [tipped.scan.receipt.tip, totalOf(tipped)]).toEqual([460, 3264]);
    expect(reasonOf(tipped)).toBeNull();
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

describe("a reload of home", () => {
  test("starts a new split: no Receipt and no names, and the two Payment handles in their order", () => {
    const storage = new MemoryStorage();
    const draft = run(
      read1040(),
      { type: "setService", index: 0, service: "cashApp" },
      { type: "setHandle", index: 0, handle: "$jasonz" },
      { type: "addHandle" },
      { type: "setHandle", index: 1, handle: "@jason-z" },
      { type: "addName", name: "Sam" },
      { type: "addName", name: "Priya" },
    );
    saveDraft(draft, storage);
    expect(loadDraft(storage)).toEqual({
      scan: { status: "empty" },
      handles: [
        { service: "cashApp", handle: "$jasonz" },
        { service: "venmo", handle: "@jason-z" },
      ],
      names: [],
    });
  });

  test("lets a kept handle create the link once a Receipt and a name are back", () => {
    const storage = new MemoryStorage();
    saveDraft(withVenmo(read1040()), storage);
    const again = run(loadDraft(storage), { type: "example" }, { type: "addName", name: "Jason" });
    expect(readiness(again)).toMatchObject({ kind: "ready", paymentHandles: [{ service: "venmo", handle: "@jason-z" }], names: ["Jason"] });
  });

  test("keeps only the handles of a full Draft the previous build saved", () => {
    const storage = new MemoryStorage();
    storage.setItem("receipt-splitter:draft", JSON.stringify({ version: 1, draft: withVenmo(read1040()) }));
    expect(loadDraft(storage)).toEqual({ scan: { status: "empty" }, handles: [{ service: "venmo", handle: "@jason-z" }], names: [] });
  });

  test("overwrites the previous build's Receipt and thumbnail on the first save", () => {
    const storage = new MemoryStorage();
    storage.setItem("receipt-splitter:draft", JSON.stringify({ version: 1, draft: withVenmo(read1040()) }));
    saveDraft(loadDraft(storage), storage);
    expect(JSON.parse(storage.getItem("receipt-splitter:draft") ?? "null")).toEqual({ version: 2, handles: [{ service: "venmo", handle: "@jason-z" }] });
  });

  test("an empty, unreadable, or foreign value loads the empty draft", () => {
    const storage = new MemoryStorage();
    const loads = (value: unknown) => {
      storage.setItem("receipt-splitter:draft", typeof value === "string" ? value : JSON.stringify(value));
      return loadDraft(storage);
    };
    expect(loadDraft(storage)).toEqual(emptyDraft);
    expect(loads("{not json")).toEqual(emptyDraft);
    expect(loads({ version: 2, handles: [] })).toEqual(emptyDraft);
    expect(loads({ version: 2, handles: [{ service: "bank", handle: "x" }] })).toEqual(emptyDraft);
    expect(loads({ version: 1, draft: { handles: [] } })).toEqual(emptyDraft);
    expect(loads({ version: 3, handles: [{ service: "venmo", handle: "@jason-z" }] })).toEqual(emptyDraft);
  });

  test("saving does nothing where there is no storage, and survives a storage that refuses", () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveDraft(emptyDraft, undefined)).not.toThrow();
    expect(() => saveDraft(emptyDraft, refusing)).not.toThrow();
  });
});

describe("the Draft", () => {
  test("replacing the Receipt keeps the Payment handles and the names", () => {
    const draft = run(withVenmo(read1040()), { type: "addName", name: "Sam" }, { type: "reading", file: { name: "IMG_4128.jpg", thumbnail: null } });
    expect(draft).toEqual({
      scan: { status: "reading", file: { name: "IMG_4128.jpg", thumbnail: null } },
      handles: [{ service: "venmo", handle: "@jason-z" }],
      names: ["Jason", "Sam"],
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

  test("an Item added after a dropped blank row gets an id no row has, and editing it touches only it", () => {
    const receipt: Receipt = {
      items: [
        { id: itemId("i1"), name: "Fries", price: price(100) },
        { id: itemId("i2"), name: "", price: price(0) },
        { id: itemId("i3"), name: "Soda", price: price(200) },
      ],
      adjustments: [],
      subtotal: cents(300),
      total: cents(300),
    };
    const draft = run(emptyDraft, { type: "read", file, receipt }, { type: "addItem" }, { type: "editItem", id: "i4", name: "Water", price: price(0) });
    if (draft.scan.status !== "read") throw new Error("no receipt");
    expect(draft.scan.receipt.items.map(({ id, name, price }) => `${id} ${name} ${price}`)).toEqual(["i1 Fries 100", "i3 Soda 200", "i4 Water 0"]);
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

  test("sends an Item's printed count to the Split, through a price edit", () => {
    const [first, ...rest] = receipt1040.items;
    const receipt: Receipt = { ...receipt1040, items: [{ ...first, name: "Guinness Draught", quantity: 3 }, ...rest] };
    const draft = run(withVenmo(emptyDraft), { type: "read", file, receipt }, { type: "editItem", id: "i1", price: price(2187) });

    const request = requestOf(draft, () => participantId("p1"));

    expect(request?.receipt.items[0]).toEqual({ id: "i1", name: "Guinness Draught", price: 2187, quantity: 3 });
  });

  test("a failed read opens the empty editor and keeps the file", () => {
    const draft = run(emptyDraft, { type: "reading", file }, { type: "read", file, receipt: null });
    expect(draft.scan).toEqual({
      status: "read",
      file,
      receipt: { items: [], adjustments: [{ id: "a1", kind: "tax", name: "Tax", amount: 0 }], subtotal: null, tip: 0, totalBeforeTip: 0, nextId: 1 },
      fixOnHome: true,
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

  test("cuts a name to 40 graphemes, the longest a Split takes", () => {
    expect(run(emptyDraft, { type: "addName", name: "S".repeat(45) }).names).toEqual(["S".repeat(40)]);
  });

  test("skips a name that repeats one already added once Unicode form, width, spacing and hidden characters are set aside, and drops hidden characters from a new name", () => {
    const draft = run(
      emptyDraft,
      { type: "addName", name: "Jos\u00E9" },
      { type: "addName", name: "Jose\u0301" },
      { type: "addName", name: "Sam" },
      { type: "addName", name: "Sam\u200B" },
      { type: "addName", name: "\uFF33am" },
      { type: "addName", name: "Mary  Ann" },
      { type: "addName", name: "mary ann" },
      { type: "addName", name: "\u202EBob" },
      { type: "addName", name: "Lee \u200B Ann" },
      { type: "addName", name: "\u{1F469}\u200D\u{1F373} Kim" },
      { type: "addName", name: "Jo \u2764\uFE0F" },
    );
    expect(draft.names).toEqual(["Jos\u00E9", "Sam", "Mary Ann", "Bob", "Lee Ann", "\u{1F469}\u200D\u{1F373} Kim", "Jo \u2764\uFE0F"]);
  });

  test("refuses a name that repeats one in the draft but for an invisible format character or case folding, and takes a different one", () => {
    const lookalikes = ["Sam\u00AD", "Sa\u200Cm", "Sam\u200D", "Sam\u180E", "Sam\u206A", "Sam\u{E0041}", "Sam\uFFF9", "Sam\uFE0F", "Sam\u3164", "STRAU\u1E9E", "\u039F\u0394\u039F\u03A3"];

    expect(lookalikes.map((typed) => newName(typed, ["Sam", "Strauss", "\u03BF\u03B4\u03BF\u03C3"]))).toEqual(lookalikes.map(() => ({ ok: false, reason: "nameTaken" })));
    expect(newName("Sbm", ["Sam"])).toEqual({ ok: true, name: "Sbm" });
  });

  test("calls a name that draws nothing a bad name, not a taken one, and keeps it out of the draft", () => {
    const blanks = ["", "   ", "\u200B", "\u0007", "\u2800", "\u00AD", "\uFFF9", "\u3164 \u3164", "\u00AD \u00AD", "\u2800 \u2800", "\u200D \u200D", "\u0600 \u2800", "\uFFF9 \uFFF9"];

    expect(blanks.map((typed) => newName(typed, ["Sam"]))).toEqual(blanks.map(() => ({ ok: false, reason: "badName" })));
    expect(run(emptyDraft, ...blanks.map((name): DraftAction => ({ type: "addName", name }))).names).toEqual([]);
  });

  test("adds trimmed names, skips blanks and repeats, and removes one", () => {
    const draft = run(emptyDraft, { type: "addName", name: " Sam " }, { type: "addName", name: "" }, { type: "addName", name: "sam" }, { type: "addName", name: "Me" }, { type: "addName", name: "Priya" });
    expect(draft.names).toEqual(["Sam", "Me", "Priya"]);
    expect(run(draft, { type: "removeName", name: "Sam" }).names).toEqual(["Me", "Priya"]);
  });
});

describe("where the Host fixes Items", () => {
  test("a read the Split can take as it is leaves the Items to the Split page", () => {
    expect(editsOnHome(read1040())).toBe(false);
    expect(editsOnHome(run(emptyDraft, { type: "example" }))).toBe(false);
  });

  test("a failed read keeps the editor on home while the Host types Items", () => {
    const typing = run(emptyDraft, { type: "read", file, receipt: null }, { type: "addItem" }, { type: "editItem", id: "i1", name: "Pad thai", price: price(1400) });
    expect(editsOnHome(typing)).toBe(true);
  });

  test("a read with a priced Item it could not name keeps the editor on home", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: " ", price: price(150) }] };
    expect(editsOnHome(run(emptyDraft, { type: "read", file, receipt }))).toBe(true);
  });

  test("replacing a failed read with a good one leaves the Items to the Split page", () => {
    expect(editsOnHome(run(emptyDraft, { type: "read", file, receipt: null }, { type: "read", file, receipt: receipt1040 }))).toBe(false);
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
    expect(reasonOf(draft)).toBeNull();
  });
});

const splitId = "q7Xv0Lr9_aZ-3mKpAbCdEf" as SplitId;

const counter = () => {
  let next = 0;
  return () => participantId(`p${next++}`);
};

describe("Bundles", () => {
  const topgolfBoxes = readFileSync(new URL("./parse/fixtures/topgolf.tsv", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .flatMap((line, row) => {
      const [label, amount] = line.split("\t");
      return [box(label, 20, row), box(amount, 600, row)];
    });
  const topgolf = parseReceipt(topgolfBoxes)!;
  const readTopgolf = (draft = emptyDraft) => run(withVenmo(draft), { type: "addName", name: "Priya" }, { type: "read", file, receipt: topgolf });
  const adjustmentsOf = (draft: Draft) => requestOf(draft, counter())?.receipt.adjustments;
  const bucketOne = { name: "Beer Bucket", items: ["i2", "i3", "i4", "i5"] };
  const bucketTwo = { name: "Beer Bucket", items: ["i6", "i7", "i8", "i9"] };

  test("carry the Topgolf Bundles from the read, through a price edit, into the create body, where Priya on the first owes $49.52", () => {
    const draft = run(readTopgolf(), { type: "editItem", id: "i3", price: price(2190) }, { type: "editItem", id: "i3", price: price(2187) });

    const request = requestOf(draft, counter());

    expect(request?.receipt.adjustments).toEqual([
      { id: "a1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: bucketOne },
      { id: "a2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: bucketTwo },
      { id: "a3", kind: "tax", name: "Tax", amount: 494 },
      { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
    ]);
    const created = parseCreateSplitRequest(JSON.parse(JSON.stringify({ split: request })), mintedId("topgolf-draft-000000"));
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));
    const owner = (id: string) => (bucketOne.items.includes(id) ? "p1" : "p0");
    const claimed = created.split.receipt.items.reduce((split, { id, split: { units } }) =>
      units.reduce((next, _, unit) => {
        const result = applyOperation(next, { type: "claim", by: null, itemId: id, participantId: participantId(owner(id)), unit }, { creator: true });
        if (!result.ok) throw new Error(JSON.stringify(result.rejection));
        return result.split;
      }, split),
    created.split);
    expect(created.split.schemaVersion).toBe(2);
    expect(computeShares(claimed).shares.map(({ participantId, share }) => [participantId, share])).toEqual([
      ["p0", 15777],
      ["p1", 4952],
    ]);
  });

  test("deleting a Bundle's Item drops it from its Bundle, and deleting its last Item drops its discount", () => {
    const draft = run(readTopgolf(), { type: "removeItem", id: "i2" });

    expect(adjustmentsOf(draft)?.slice(0, 2)).toEqual([
      { id: "a1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["i3", "i4", "i5"] } },
      { id: "a2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: bucketTwo },
    ]);
    expect(adjustmentsOf(run(draft, ...["i3", "i4", "i5"].map((id): DraftAction => ({ type: "removeItem", id }))))?.map(({ id }) => id)).toEqual(["a2", "a3", "tip"]);
  });

  test("a Bundle read with a blank Item leaves that Item out, since the draft drops it", () => {
    const [first, ...rest] = topgolf.items.map((item) => (item.id === "i2" ? { ...item, name: " ", price: price(0) } : item));
    const blank: Receipt<ParsedItem> = { ...topgolf, items: [first, ...rest] };

    expect(adjustmentsOf(run(readTopgolf(), { type: "read", file, receipt: blank }))?.[0]).toEqual({
      id: "a1",
      kind: "bundleDiscount",
      name: "Beer Bucket Discount (10%)",
      amount: -451,
      bundle: { name: "Beer Bucket", items: ["i3", "i4", "i5"] },
    });
  });

  test("a Bundle read with only blank Items keeps its discount on the whole receipt", () => {
    const blank = new Set(["i2", "i3", "i4", "i5"]);
    const [first, ...rest] = topgolf.items.map((item) => (blank.has(item.id) ? { ...item, name: "", price: price(0) } : item));
    const read: Receipt<ParsedItem> = { ...topgolf, items: [first, ...rest] };

    expect(adjustmentsOf(run(readTopgolf(), { type: "read", file, receipt: read }))?.[0]).toEqual({ id: "a1", kind: "discount", name: "Beer Bucket Discount (10%)", amount: -451 });
  });

});

describe("the Split link", () => {
  test("the create body carries the Receipt with its tip as an Adjustment, the Host first as the first name typed, and every handle the Host filled in", () => {
    const draft = run(withVenmo(read1040()), { type: "editTip", amount: cents(460) }, { type: "addHandle" }, { type: "setHandle", index: 1, handle: "$jasonz" }, { type: "addName", name: "Jason" }, { type: "addName", name: "Sam" }, { type: "addName", name: "Priya" });

    expect(requestOf(draft, counter())).toEqual({
      receipt: {
        items: [
          { id: "i1", name: "Chicken Fried Rice And Egg", price: 799 },
          { id: "i2", name: "California Tropic And Miso", price: 799 },
          { id: "i3", name: "Add Two Tostones", price: 100 },
          { id: "i4", name: "Sprite", price: 250 },
          { id: "i5", name: "Perrier Sparkling Water", price: 350 },
        ],
        adjustments: [
          { id: "a1", kind: "tax", name: "Tax", amount: 161 },
          { id: "a2", kind: "serviceCharge", name: "Service fees on tables", amount: 345 },
          { id: "tip", kind: "tip", name: "Tip", amount: 460 },
        ],
        subtotal: 2298,
        total: 3264,
      },
      participants: [
        { id: "p0", name: "Jason" },
        { id: "p1", name: "Sam" },
        { id: "p2", name: "Priya" },
      ],
      paymentHandles: [
        { service: "venmo", handle: "@jason-z" },
        { service: "cashApp", handle: "$jasonz" },
      ],
    });
  });

  test("a typed receipt goes out with the Items' sum as its subtotal and trimmed names, and an unnamed Adjustment is called by its kind", () => {
    const typed = run(
      withVenmo(emptyDraft),
      { type: "read", file, receipt: null },
      { type: "addItem" },
      { type: "editItem", id: "i1", name: " Fries ", price: price(800) },
      { type: "editAdjustment", id: "a1", amount: cents(72) },
      { type: "editTotal", amount: cents(872) },
    );
    const unnamed = run(withVenmo(emptyDraft), {
      type: "read",
      file,
      receipt: { ...receipt1040, adjustments: [{ id: adjustmentId("a1"), kind: "discount", name: " ", amount: cents(-100) }], total: cents(2198) },
    });

    expect(requestOf(typed, counter())?.receipt).toEqual({
      items: [{ id: "i1", name: "Fries", price: 800 }],
      adjustments: [
        { id: "a1", kind: "tax", name: "Tax", amount: 72 },
        { id: "tip", kind: "tip", name: "Tip", amount: 0 },
      ],
      subtotal: 800,
      total: 872,
    });
    expect(requestOf(unnamed, counter())?.receipt.adjustments[0]).toEqual({ id: "a1", kind: "discount", name: "Discount", amount: -100 });
  });

  test("creating the Split starts a fresh draft that keeps only the Payment handles", () => {
    const created = run(withVenmo(read1040()), { type: "addName", name: "Sam" }, { type: "created" });

    expect(created).toEqual({ scan: { status: "empty" }, handles: [{ service: "venmo", handle: "@jason-z" }], names: [] });
  });

  test("a reload after creating opens a fresh draft, and one saved while linked to a Split by an older build does too", () => {
    const storage = new MemoryStorage();
    saveDraft(run(withVenmo(read1040()), { type: "addName", name: "Sam" }, { type: "created" }), storage);
    const fresh = loadDraft(storage);
    const older = new MemoryStorage();
    const read = run(withVenmo(read1040()), { type: "addName", name: "Sam" });
    older.setItem("receipt-splitter:draft", JSON.stringify({ version: 1, draft: { ...read, names: [], scan: { ...read.scan, status: "linked", splitId } } }));

    expect([fresh, loadDraft(older)]).toEqual([
      { scan: { status: "empty" }, handles: [{ service: "venmo", handle: "@jason-z" }], names: [] },
      { scan: { status: "empty" }, handles: [{ service: "venmo", handle: "@jason-z" }], names: [] },
    ]);
  });
});
