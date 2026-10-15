import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { cents, MAX_CENTS, price } from "./core/money";
import { applyOperation } from "./core/operations";
import { parseCreateSplitRequest } from "./core/parse";
import { computeShares } from "./core/shares";
import { mintedId } from "./core/test-ids";
import { adjustmentId, itemId, participantId, type Receipt, type SplitId } from "./core/split";
import { parseReceipt } from "./parse";
import { box, receiptRows } from "./parse/fixtures/boxes";
import { receiptOfReply } from "./scan/client";
import { readLines, toReply } from "../worker/scan/format";
import { emptyDraft, mismatchNote, newName, parseAmount, loadDraft, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction } from "./draft";

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

const file = { name: "IMG_4127.jpg" };

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
      noName: reasonOf(run(read1040(), { type: "setHandle", index: 0, handle: "@jason-z" })),
      ready: reasonOf(ready),
    }).toEqual({
      noReceipt: "Add a receipt first.",
      reading: "Reading the receipt.",
      noName: { kind: "noName" },
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

  test("lets an amount of exactly MAX_CENTS through", () => {
    const receipt: Receipt = { items: [{ id: itemId("i1"), name: "Car", price: price(MAX_CENTS) }], adjustments: [], subtotal: cents(MAX_CENTS), total: cents(MAX_CENTS) };
    expect(reasonOf(withVenmo(run(emptyDraft, { type: "read", file, receipt })))).toBeNull();
  });

  test("a failed Total check blocks nothing and reads as a note against the subtotal", () => {
    const ready = withVenmo(read1040());
    const perrierAt = (cost: number) => withVenmo(run(emptyDraft, { type: "read", file, receipt: { ...receipt1040, items: [receipt1040.items[0], ...receipt1040.items.slice(1, 4), { id: itemId("i5"), name: "Perrier Sparkling Water", price: price(cost) }] } }));
    const short = perrierAt(300);
    const over = perrierAt(400);
    expect({ blocker: reasonOf(short), short: mismatchNote(short), over: mismatchNote(over), ready: mismatchNote(ready), reading: mismatchNote(run(emptyDraft, { type: "reading", file })) }).toEqual({
      blocker: null,
      short: "Items are $0.50 short of the subtotal.",
      over: "Items are $0.50 over the subtotal.",
      ready: null,
      reading: null,
    });
  });

  test("notes an on-device reading whose total was not read, since the stand-in total always passes the check", () => {
    const unread = run(emptyDraft, { type: "read", file, receipt: receipt1040, totalUnread: true });

    expect({ unread: mismatchNote(unread), blocker: reasonOf(withVenmo(unread)), read: mismatchNote(read1040()) }).toEqual({
      unread: "Couldn't read the total, so check the rows.",
      blocker: null,
      read: null,
    });
  });

  test("notes tax and charges when the Items match the subtotal but the total does not", () => {
    const taxed = (amount: number) => run(emptyDraft, { type: "read", file, receipt: { ...receipt1040, adjustments: [{ id: adjustmentId("a1"), kind: "tax", name: "Tax", amount: cents(amount) }, receipt1040.adjustments[1]] } });
    expect(mismatchNote(taxed(100))).toBe("Tax and charges are $0.61 short of the total.");
    expect(mismatchNote(taxed(200))).toBe("Tax and charges are $0.39 over the total.");
  });

  test("creates with no way to pay, and sends no handle for an empty or blank field", () => {
    const named = run(read1040(), { type: "addName", name: "Jason" }, { type: "addHandle" });
    const sent = (handle: string) => {
      const found = readiness(run(named, { type: "setHandle", index: 0, handle }));
      return found.kind === "ready" ? found.paymentHandles : found;
    };

    expect({ empty: sent(""), blank: sent("   ") }).toEqual({ empty: [], blank: [] });
  });

  test("names the row whose handle its app would refuse, before Create sends it", () => {
    const named = run(read1040(), { type: "addName", name: "Jason" });
    const venmo = (handle: string) => reasonOf(run(named, { type: "setHandle", index: 0, handle }));
    const second = (service: "cashApp" | "paypal" | "zelle", handle: string) =>
      reasonOf(run(named, { type: "setHandle", index: 0, handle: "@jason-z" }, { type: "addHandle" }, { type: "setService", index: 1, service }, { type: "setHandle", index: 1, handle }));

    expect({
      short: venmo("test"),
      sigil: venmo("@test"),
      five: venmo("@testt"),
      space: venmo("jason z"),
      digits: second("cashApp", "$1234"),
      cashtag: second("cashApp", "$jz1234"),
      paypal: second("paypal", "Jason Z / tips"),
      zelle: second("zelle", "text me"),
    }).toEqual({
      short: { kind: "badHandle", index: 0, service: "venmo", problem: { kind: "short", length: 4, limit: 5 } },
      sigil: { kind: "badHandle", index: 0, service: "venmo", problem: { kind: "short", length: 4, limit: 5 } },
      five: null,
      space: { kind: "badHandle", index: 0, service: "venmo", problem: { kind: "character", character: " " } },
      digits: { kind: "badHandle", index: 1, service: "cashApp", problem: { kind: "noLetter" } },
      cashtag: null,
      paypal: null,
      zelle: null,
    });
  });
});

describe("the tip", () => {
  test("comes from the receipt's tip lines as one Tip, and is $0.00 when the receipt prints none", () => {
    const tipped: Receipt = {
      ...receipt1040,
      adjustments: [...receipt1040.adjustments, { id: adjustmentId("a3"), kind: "tip", name: "Tip", amount: cents(460) }],
      total: cents(3264),
    };
    const sent = (receipt: Receipt) => requestOf(withVenmo(run(emptyDraft, { type: "read", file, receipt })), counter())?.receipt;
    expect([sent(tipped)?.adjustments.map(({ name, amount }) => `${name} ${amount}`), sent(tipped)?.total]).toEqual([["Tax 161", "Service fees on tables 345", "Tip 460"], 3264]);
    expect(sent(receipt1040)?.adjustments.at(-1)).toEqual({ id: "tip", kind: "tip", name: "Tip", amount: 0 });
  });
});

const itemsOf = (draft: Draft) => (draft.scan.status === "read" && draft.scan.receipt ? draft.scan.receipt.items : []);

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
    const again = read1040(loadDraft(storage));
    const named = run(again, { type: "addName", name: "Jason" });
    expect(readiness(named)).toMatchObject({ kind: "ready", paymentHandles: [{ service: "venmo", handle: "@jason-z" }], names: ["Jason"] });
  });

  test("keeps only the handles of a full Draft the previous build saved", () => {
    const storage = new MemoryStorage();
    storage.setItem("receipt-splitter:draft", JSON.stringify({ version: 1, draft: withVenmo(read1040()) }));
    expect(loadDraft(storage)).toEqual({ scan: { status: "empty" }, handles: [{ service: "venmo", handle: "@jason-z" }], names: [] });
  });

  test("overwrites the previous build's Receipt on the first save", () => {
    const storage = new MemoryStorage();
    storage.setItem("receipt-splitter:draft", JSON.stringify({ version: 1, draft: withVenmo(read1040()) }));
    saveDraft(loadDraft(storage), storage);
    expect(JSON.parse(storage.getItem("receipt-splitter:draft") ?? "null")).toEqual({ version: 2, handles: [{ service: "venmo", handle: "@jason-z" }] });
  });

  test("blocked storage loads the empty draft and saves without throwing", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      expect(loadDraft()).toEqual({ scan: { status: "empty" }, handles: [{ service: "venmo", handle: "" }], names: [] });
      expect(() => saveDraft(emptyDraft)).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
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
    const draft = run(withVenmo(read1040()), { type: "addName", name: "Sam" }, { type: "reading", file: {} });
    expect(draft).toEqual({
      scan: { status: "reading", file: {} },
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
    expect(itemsOf(draft)[0]?.name).toBe(`${"👨‍👩‍👧".repeat(79)}L`);
  });

  test("drops blank OCR rows that carry no price", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: "  ", price: price(0) }] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    expect(itemsOf(draft).length).toBe(5);
  });

  test("keeps a 0-cent Item, such as a kitchen note printed as a line", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: "APPS OUT FIRST", price: price(0) }] };
    const draft = run(emptyDraft, { type: "read", file, receipt });
    expect(itemsOf(draft).at(-1)).toEqual({ id: "i6", name: "APPS OUT FIRST", price: 0 });
  });

  test("sends an Item's printed count to the Split", () => {
    const [first, ...rest] = receipt1040.items;
    const receipt: Receipt = { ...receipt1040, items: [{ ...first, name: "Guinness Draught", price: price(2187), quantity: 3 }, ...rest] };
    const draft = run(withVenmo(emptyDraft), { type: "read", file, receipt });

    const request = requestOf(draft, () => participantId("p1"));

    expect(request?.receipt.items[0]).toEqual({ id: "i1", name: "Guinness Draught", price: 2187, quantity: 3 });
  });

  test("sends an Item's detail to the Split", () => {
    const [first, ...rest] = receipt1040.items;
    const receipt: Receipt = { ...receipt1040, items: [{ ...first, price: price(899), detail: "Large, $2.00 off", quantity: 2 }, ...rest] };
    const draft = run(withVenmo(emptyDraft), { type: "read", file, receipt });

    const request = requestOf(draft, () => participantId("p1"));

    expect(request?.receipt.items[0]).toEqual({ id: "i1", name: "Chicken Fried Rice And Egg", price: 899, detail: "Large, $2.00 off", quantity: 2 });
  });

  test("a failed read keeps the file and no Receipt", () => {
    const draft = run(emptyDraft, { type: "reading", file }, { type: "read", file, receipt: null });
    expect(draft.scan).toEqual({ status: "read", file, receipt: null });
  });
});

describe("parseAmount", () => {
  test("reads what the Host types into a price, and refuses anything over MAX_CENTS", () => {
    expect(["3", "3.5", "3.50", ".5", "", "100000.00", "100000.01", "3.505", "1e3", "-2.00"].map((text) => parseAmount(text))).toEqual([
      300, 350, 350, 50, 0, MAX_CENTS, null, null, null, null,
    ]);
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

describe("a read the Split would refuse as it is", () => {
  const readReady = (receipt: Receipt | null) => withVenmo(run(emptyDraft, { type: "reading", file }, { type: "read", file, receipt }));
  const sentOf = (receipt: Receipt) => {
    const request = requestOf(readReady(receipt), counter());
    if (!request) throw new Error(`not ready: ${JSON.stringify(reasonOf(readReady(receipt)))}`);
    const created = parseCreateSplitRequest(JSON.parse(JSON.stringify({ split: request })), mintedId("problem-read-0000000"));
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));
    return request.receipt;
  };

  test("sends a priced Item it could not name as Item and its place, for the Split page to rename", () => {
    const receipt: Receipt = { ...receipt1040, items: [...receipt1040.items, { id: itemId("i6"), name: " ", price: price(150) }], subtotal: cents(2448), total: cents(2954) };
    expect(sentOf(receipt).items.at(-1)).toEqual({ id: "i6", name: "Item 6", price: 150 });
  });

  test("calls an Item or Adjustment whose name draws nothing by its place or kind, since the Split refuses such a name", () => {
    const receipt: Receipt = {
      ...receipt1040,
      items: [...receipt1040.items, { id: itemId("i6"), name: "​", price: price(150) }],
      adjustments: [{ id: adjustmentId("a1"), kind: "tax", name: "​", amount: cents(161) }, receipt1040.adjustments[1]],
      subtotal: cents(2448),
      total: cents(2954),
    };
    const sent = sentOf(receipt);
    expect([sent.items.at(-1)?.name, sent.adjustments[0].name]).toEqual(["Item 6", "Tax"]);
  });

  test("sends a price over the limit as $0.00, and the note names the gap the Split page fixes", () => {
    const [first, ...rest] = receipt1040.items;
    const receipt: Receipt = { ...receipt1040, items: [first, ...rest.slice(0, 3), { ...rest[3], price: price(MAX_CENTS + 350) }] };
    expect(sentOf(receipt).items.at(-1)).toEqual({ id: "i5", name: "Perrier Sparkling Water", price: 0 });
    expect(mismatchNote(readReady(receipt))).toBe("Items are $3.50 short of the subtotal.");
  });

  test("sends an Adjustment over the limit as $0.00", () => {
    const receipt: Receipt = { ...receipt1040, adjustments: [{ id: adjustmentId("a1"), kind: "tax", name: "Tax", amount: cents(MAX_CENTS + 161) }, receipt1040.adjustments[1]] };
    expect(sentOf(receipt).adjustments.map(({ name, amount }) => `${name} ${amount}`)).toEqual(["Tax 0", "Service fees on tables 345", "Tip 0"]);
  });

  test("sends a Subtotal over the limit as the Items' sum, and a Total over the limit as the Subtotal and Adjustments", () => {
    const sent = sentOf({ ...receipt1040, subtotal: cents(MAX_CENTS + 2298), total: cents(MAX_CENTS + 2804) });
    expect([sent.subtotal, sent.total]).toEqual([2298, 2804]);
  });

  test("a read with no Items keeps Create split link off, since a Split holds at least one Item", () => {
    expect(reasonOf(readReady(null))).toBe("Couldn't read any items. Try another photo.");
  });

  const device = (rows: [string, string][]) => parseReceipt(receiptRows(rows));
  const server = (lines: string[]) => {
    const reading = readLines(lines);
    return reading && receiptOfReply(JSON.parse(JSON.stringify(toReply(reading, { passed: true, gaps: { subtotal: null, total: cents(0) } }))));
  };
  const totalsOf = (receipt: Receipt | null) => {
    const sent = sentOf(receipt!);
    return [sent.subtotal, sent.total];
  };

  test("sends a negative Subtotal or Total, from either reader, as the sum it should be", () => {
    expect(totalsOf({ ...receipt1040, subtotal: cents(-200), total: cents(-500) })).toEqual([2298, 2804]);
    expect(totalsOf(device([["Fries", "5.00"], ["Subtotal", "-2.00"], ["Tax", "1.00"], ["Total", "6.00"]]))).toEqual([500, 600]);
    expect(totalsOf(device([["Fries", "5.00"], ["Total", "2.00-"]]))).toEqual([500, 500]);
    expect(totalsOf(server(["i|Fries|500", "tot|-500"]))).toEqual([500, 500]);
  });

  test("keeps a rebuilt Subtotal and Total within $0.00 and the limit", () => {
    const big: Receipt = {
      items: [
        { id: itemId("i1"), name: "Car", price: price(MAX_CENTS) },
        { id: itemId("i2"), name: "Boat", price: price(MAX_CENTS) },
      ],
      adjustments: [],
      subtotal: cents(MAX_CENTS + 1),
      total: cents(-1),
    };
    expect(totalsOf(big)).toEqual([10_000_000, 10_000_000]);
    const credited: Receipt = { ...receipt1040, adjustments: [{ id: adjustmentId("a1"), kind: "discount", name: "Voucher", amount: cents(-MAX_CENTS) }], total: cents(MAX_CENTS + 1) };
    expect(totalsOf(credited)).toEqual([2298, 0]);
  });

  test("a price over the limit with no readable Subtotal still leaves a note on the gap", () => {
    const [first, ...rest] = receipt1040.items;
    const receipt: Receipt = { ...receipt1040, items: [first, ...rest.slice(0, 3), { ...rest[3], price: price(MAX_CENTS + 350) }], subtotal: cents(-1), total: cents(MAX_CENTS + 2804) };
    expect(totalsOf(receipt)).toEqual([10_000_000, 10_000_000]);
    expect(mismatchNote(readReady(receipt))).toBe("Items are $99,980.52 short of the subtotal.");
  });

  test("a read with more Items than a Split holds keeps Create split link off and says why", () => {
    const things = (n: number) => Array.from({ length: n }, (_, k): [string, string] => [`Thing ${k}`, "1.00"]);
    expect(reasonOf(readReady(device([...things(101), ["Total", "101.00"]])))).toBe("A split holds up to 100 items. This receipt has 101.");
    expect(reasonOf(readReady(device([...things(100), ["Total", "100.00"]])))).toBe(null);
  });

  test("a read with more charges and discounts than a Split holds keeps Create split link off and says why", () => {
    const fees = (n: number) => Array.from({ length: n }, () => "f|Fee|100");
    expect(reasonOf(readReady(server(["i|Fries|500", ...fees(20), "p|Tip|100", "tot|2600"])))).toBe("A split holds up to 19 taxes, fees and discounts. This receipt has 20.");
    expect(reasonOf(readReady(server(["i|Fries|500", ...fees(19), "p|Tip|100", "tot|2500"])))).toBe(null);
  });

  test("calls an unnamed Item by its place on the receipt, counting the blank $0.00 rows left out", () => {
    const receipt: Receipt = {
      items: [
        { id: itemId("i1"), name: "Fries", price: price(500) },
        { id: itemId("i2"), name: "", price: price(0) },
        { id: itemId("i3"), name: "", price: price(300) },
        { id: itemId("i4"), name: "", price: price(200), quantity: 2 },
      ],
      adjustments: [{ id: adjustmentId("b1"), kind: "bundleDiscount", name: "Combo off", amount: cents(-100), bundle: { name: "", items: [itemId("i2"), itemId("i3")] } }],
      subtotal: cents(1000),
      total: cents(900),
    };
    const sent = sentOf(receipt);
    expect(sent.items.map(({ name }) => name)).toEqual(["Fries", "Item 3", "Item 4"]);
  });

  test("calls a Bundle read with no name by its place among the Bundles", () => {
    const sent = sentOf(server(["i|Fries|500", "b|Wings", ">i|Wings|900", ">d|Wing deal|100", "b|", ">i|Soda|300", ">i|Pie|200", ">d|Combo off|100", "tot|1400"])!);
    expect(sent.adjustments.flatMap((row) => (row.kind === "bundleDiscount" ? [row.bundle.name] : []))).toEqual(["Wings", "Bundle 2"]);
  });
});

const splitId = "q7Xv0Lr9_aZ-3mKpAbCdEf" as SplitId;

const counter = () => {
  let next = 0;
  return () => participantId(`p${next++}`);
};

describe("a coupon worth more than its Item", () => {
  test("reads to a Split that adds up, and Shares stay at or above $0.00", () => {
    const reply = {
      items: [
        { name: "Beans", price: 150, quantity: null, details: [], discounts: [] },
        { name: "Treats", price: -300, quantity: null, details: [], discounts: [{ name: "Coupon", amount: -450 }] },
        { name: "Treats", price: 150, quantity: null, details: [], discounts: [] },
      ],
      bundles: [],
      adjustments: [{ kind: "tax", name: "Tax", amount: 12 }],
      subtotal: { amount: 0, beforeDiscounts: false },
      total: 12,
      check: { passed: true, gaps: { subtotal: 0, total: 0 } },
    };
    const draft = run(emptyDraft, { type: "read", file, receipt: receiptOfReply(reply) }, { type: "addName", name: "Ann" }, { type: "addName", name: "Bob" });
    const request = requestOf(draft, counter());
    if (!request) throw new Error(JSON.stringify(readiness(draft)));
    const created = parseCreateSplitRequest(JSON.parse(JSON.stringify({ split: request })), mintedId("coupon-read-00000000"));
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));
    const claimed = [["i1", "p0"], ["i2", "p1"], ["i3", "p0"]].reduce((split, [item, who]) => {
      const result = applyOperation(split, { type: "claim", by: null, itemId: itemId(item), participantId: participantId(who) }, { creator: true });
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      return result.split;
    }, created.split);

    expect({ note: mismatchNote(draft), shares: computeShares(claimed).shares.map(({ participantId, share }) => [participantId, share]) }).toEqual({
      note: null,
      shares: [
        ["p0", 12],
        ["p1", 0],
      ],
    });
  });
});

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

  test("carry the Topgolf Bundles from the read into the create body, where Priya on the first owes $49.52", () => {
    const draft = readTopgolf();

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
    const claimed = created.split.receipt.items.reduce((split, { id }) => {
      const result = applyOperation(split, { type: "claim", by: null, itemId: id, participantId: participantId(owner(id)) }, { creator: true });
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      return result.split;
    }, created.split);
    expect(created.split.schemaVersion).toBe(4);
    expect(computeShares(claimed).shares.map(({ participantId, share }) => [participantId, share])).toEqual([
      ["p0", 15777],
      ["p1", 4952],
    ]);
  });

  test("a Bundle read with a blank Item leaves that Item out, since the draft drops it", () => {
    const [first, ...rest] = topgolf.items.map((item) => (item.id === "i2" ? { ...item, name: " ", price: price(0) } : item));
    const blank: Receipt = { ...topgolf, items: [first, ...rest] };

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
    const read: Receipt = { ...topgolf, items: [first, ...rest] };

    expect(adjustmentsOf(run(readTopgolf(), { type: "read", file, receipt: read }))?.[0]).toEqual({ id: "a1", kind: "discount", name: "Beer Bucket Discount (10%)", amount: -451 });
  });
});

describe("the Split link", () => {
  test("the create body carries the Receipt with its tip as an Adjustment, the Host first as the first name typed, and every handle the Host filled in", () => {
    const tipped: Receipt = { ...receipt1040, adjustments: [...receipt1040.adjustments, { id: adjustmentId("a3"), kind: "tip", name: "Tip", amount: cents(460) }], total: cents(3264) };
    const draft = run(withVenmo(read1040()), { type: "read", file, receipt: tipped }, { type: "addHandle" }, { type: "setHandle", index: 1, handle: "$jasonz" }, { type: "addName", name: "Jason" }, { type: "addName", name: "Sam" }, { type: "addName", name: "Priya" });

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

  test("an OCR row goes out with its name trimmed, and an unnamed Adjustment is called by its kind", () => {
    const read = run(withVenmo(emptyDraft), {
      type: "read",
      file,
      receipt: { ...receipt1040, items: [{ ...receipt1040.items[0], name: " Fries " }, ...receipt1040.items.slice(1)], adjustments: [{ id: adjustmentId("a1"), kind: "discount", name: " ", amount: cents(-100) }], total: cents(2198) },
    });

    expect(requestOf(read, counter())?.receipt.items[0]).toEqual({ id: "i1", name: "Fries", price: 799 });
    expect(requestOf(read, counter())?.receipt.adjustments[0]).toEqual({ id: "a1", kind: "discount", name: "Discount", amount: -100 });
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

describe("a reading with odd numbers still creates a Split", () => {
  const item = (name: string, amount: number, discounts: number[] = []) => ({ name, price: amount, quantity: null, details: [], discounts: discounts.map((off) => ({ name: "Coupon", amount: off })) });
  const reply = (items: ReturnType<typeof item>[], adjustments: { kind: string; name: string; amount: number }[], total: number) => ({
    items,
    bundles: [],
    adjustments,
    subtotal: null,
    total,
    check: { passed: true, gaps: { subtotal: 0, total: 0 } },
  });
  const sharesOf = (body: unknown, owners: string[]) => {
    const draft = run(emptyDraft, { type: "read", file, receipt: receiptOfReply(body) }, { type: "addName", name: "Ann" }, { type: "addName", name: "Bob" });
    const request = requestOf(draft, counter());
    if (!request) throw new Error(JSON.stringify(readiness(draft)));
    const created = parseCreateSplitRequest(JSON.parse(JSON.stringify({ split: request })), mintedId("odd-numbers-0000000"));
    if (!created.ok) throw new Error(JSON.stringify(created.rejection));
    const claimed = created.split.receipt.items.reduce((split, { id }, place) => {
      const result = applyOperation(split, { type: "claim", by: null, itemId: id, participantId: participantId(owners[place] ?? "p0") }, { creator: true });
      if (!result.ok) throw new Error(JSON.stringify(result.rejection));
      return result.split;
    }, created.split);
    return { receipt: created.split.receipt, shares: computeShares(claimed).shares.map(({ participantId, share }) => [participantId, share]) };
  };

  test("a coupon worth more than its Item leaves the other person's Share alone", () => {
    const { shares } = sharesOf(reply([item("Beans", 300), item("Treats", -100, [-500])], [{ kind: "tax", name: "Tax", amount: 20 }], 220), ["p0", "p1"]);

    expect(shares).toEqual([
      ["p0", 220],
      ["p1", 0],
    ]);
  });

  test("a receipt that nets to $0.00 shares out $0.00, with and without tax", () => {
    const beans = [item("Beans", 300), item("Treats", -300, [-700])];

    expect(sharesOf(reply(beans, [], 0), ["p0", "p1"]).shares).toEqual([
      ["p0", 0],
      ["p1", 0],
    ]);
    expect(sharesOf(reply(beans, [{ kind: "tax", name: "Tax", amount: 12 }], 12), ["p0", "p1"]).shares).toEqual([
      ["p0", 12],
      ["p1", 0],
    ]);
  });

  test("a cash line the reading calls a negative tip adds no Tip and leaves the Shares unchanged", () => {
    const items = [item("Beans", 1000), item("Milk", 500)];
    const withCash = sharesOf(reply(items, [{ kind: "tip", name: "CASH", amount: -112 }], 1500), ["p0", "p1"]);
    const without = sharesOf(reply(items, [], 1500), ["p0", "p1"]);

    expect(withCash.receipt.adjustments.map(({ kind, amount }) => [kind, amount])).toEqual([["tip", 0]]);
    expect(withCash.shares).toEqual(without.shares);
    expect(withCash.shares).toEqual([
      ["p0", 1000],
      ["p1", 500],
    ]);
  });

  test("more oversized coupons than a Split holds merge into one discount row, so Create stays on", () => {
    const coupons = Array.from({ length: 20 }, (_, i) => item(`Treat ${i + 1}`, -100, [-200]));
    const { receipt, shares } = sharesOf(reply([item("Beans", 5000), ...coupons], [{ kind: "tax", name: "Tax", amount: 20 }], 3020), ["p0"]);

    expect(receipt.adjustments.map(({ kind, name, amount }) => [kind, name, amount])).toEqual([
      ["discount", "Discounts", -2000],
      ["tax", "Tax", 20],
      ["tip", "Tip", 0],
    ]);
    expect(shares).toEqual([
      ["p0", 3020],
      ["p1", 0],
    ]);
  });
});
