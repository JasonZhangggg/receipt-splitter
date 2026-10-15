import { describe, expect, test } from "vitest";

import { cents, price } from "../../core/money";
import { adjustmentId, itemId, participantId, type Adjustment, type ItemSplit, type NonEmpty, type ParticipantId, type Receipt, type SplitItem } from "../../core/split";
import { computeShares, shareBreakdown } from "../../core/shares";
import { splitCopy } from "../split-copy";
import { breakdownCharges, breakdownLines, bundleNote, circleTap, itemParts, keepInPlace, lineAmounts, lineView, linesNear, nameParts, quantityText, payNote, receiptRows, splitIds, totalNote, claimedItems } from "./model";

const [ann, bob, cat] = ["ann", "bob", "cat"].map(participantId);
const item = (split: ItemSplit, cost = 100): SplitItem => ({ id: itemId("tostones"), name: "Tostones", price: price(cost), split });

describe("lineView", () => {
  const people = [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }, { id: cat, name: "Cat" }];
  const portions = (it: SplitItem, viewer: ParticipantId | null) => {
    if (viewer === null) return new Map();
    const receipt = { items: [it] as const, adjustments: [], subtotal: it.price, total: it.price };
    const [host, ...others] = people;
    return new Map(shareBreakdown({ receipt, participants: [host, ...others], payments: [] }, viewer).items.map(({ id, portion }) => [id, portion]));
  };
  const view = (it: SplitItem, viewer: ParticipantId | null = ann, me: ParticipantId | null = ann) => lineView(it, { people, me, viewer }, portions(it, viewer));

  test("the split line reads yours for the viewer and each for others", () => {
    expect([
      view(item({ by: "even", units: [[ann, bob, cat]] }, 1400)).split,
      view(item({ by: "even", units: [[bob, cat]] }, 1250)).split,
      view(item({ by: "even", units: [[bob, cat]] }, 1250), bob).split,
      view(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }, 900)).split,
      view(item({ by: "amount", units: [[[ann, cents(250)], [bob, cents(650)]]] }, 900)).split,
      view(item({ by: "shares", units: [[[bob, 2], [cat, 1]]] }, 900)).split,
      view(item({ by: "amount", units: [[[bob, cents(250)], [cat, cents(650)]]] }, 900)).split,
      view(item({ by: "even", units: [[bob]] })).split,
      view(item({ by: "even", units: [[]] })).split,
    ]).toEqual(["$4.67 yours", "$6.25 each", "$6.25 Bob's", "$6.00 yours", "$2.50 yours", "by shares", "by amount", null, null]);
  });

  test("$14.00 even across three people with the viewer sorted last reads $4.67 yours", () => {
    expect(view(item({ by: "even", units: [[ann, bob, cat]] }, 1400), cat, cat).split).toBe("$4.67 yours");
  });

  test("an even split whose parts differ by a cent says how many ways instead of each", () => {
    expect([view(item({ by: "even", units: [[ann, bob, cat]] }, 1400), null).split, view(item({ by: "even", units: [[ann, bob, cat]] }, 1500), null).split]).toEqual(["split 3 ways", "$5.00 each"]);
  });

  test("who had it lists the phone's owner as You first, then the others in the table's order, and says Nobody yet for an untouched line", () => {
    expect([
      view(item({ by: "even", units: [[cat, bob, ann]] })).who,
      view(item({ by: "even", units: [[cat, bob]] }), ann, null).who,
      view(item({ by: "even", units: [[bob]] }), ann, bob).who,
      view(item({ by: "even", units: [[]] })).who,
    ]).toEqual(["You, Bob, Cat", "Bob, Cat", "You", "Nobody yet"]);
  });
});

test("nameParts moves a printed size and what follows it to a second line, and leaves a name with no size, or one that starts with a count or a size, whole", () => {
  expect(["Michelob Ultra 16oz Aluminum Bottle", "Guinness Draught 14.9oz Can", "High Noon Watermelon 12oz Can", "Gameplay", "2 Tacos", "Coke 2", "Water 1L", "16oz Draft"].map((name) => nameParts({ name }))).toEqual([
    ["Michelob Ultra", "16oz Aluminum Bottle"],
    ["Guinness Draught", "14.9oz Can"],
    ["High Noon Watermelon", "12oz Can"],
    ["Gameplay", null],
    ["2 Tacos", null],
    ["Coke 2", null],
    ["Water", "1L"],
    ["16oz Draft", null],
  ]);
});

test("nameParts shows an Item's detail under its whole name instead of splitting the name", () => {
  expect(nameParts({ name: "Guinness Draught 14.9oz Can", detail: "$2.00 off" })).toEqual(["Guinness Draught 14.9oz Can", "$2.00 off"]);
});

test("payNote says how a shared Item is split, in the words the Pay sheet shows, and nothing for an Item one person had", () => {
  expect([
    payNote(item({ by: "even", units: [[ann, bob, cat]] }), ann),
    payNote(item({ by: "shares", units: [[[ann, 2], [bob, 1], [cat, 3]]] }), ann),
    payNote(item({ by: "amount", units: [[[ann, cents(75)], [bob, cents(25)]]] }), ann),
    payNote(item({ by: "even", units: [[ann]] }), ann),
  ]).toEqual(["Split 3 ways", "2 of 6 shares", "By amount", null]);
});

describe("linesNear", () => {
  test("lists the lines after the gone one, then the ones before it from nearest, and nothing for a line it never had", () => {
    const order = ["a", "b", "c", "d"].map(itemId);
    expect([linesNear(order, itemId("b")), linesNear(order, itemId("d")), linesNear(order, itemId("z"))]).toEqual([["c", "d", "a"], ["c", "b", "a"], []]);
  });
});

describe("keepInPlace", () => {
  const rows = (...ids: string[]) => ids.map((id) => ({ id }));
  const shown = (...ids: string[]) => ids.map((id) => ({ row: { id: id.replace("-", "") }, gone: id.startsWith("-") }));
  const read = (kept: readonly { row: { id: string }; gone: boolean }[]) => kept.map(({ row, gone }) => (gone ? `-${row.id}` : row.id));

  test("keeps a dropped row where it stood, marked gone, between the rows that were around it", () => {
    expect(read(keepInPlace(shown("a", "b", "c"), rows("a", "c")))).toEqual(["a", "-b", "c"]);
  });

  test("keeps both rows of a fast double delete in place, the first still leaving when the second goes", () => {
    expect(read(keepInPlace(shown("a", "-b", "c", "d"), rows("a", "d")))).toEqual(["a", "-b", "-c", "d"]);
  });

  test("brings a leaving row back in place when an undo restores it", () => {
    expect(read(keepInPlace(shown("a", "-b", "c"), rows("a", "b", "c")))).toEqual(["a", "b", "c"]);
  });

  test("shows the rows the list now has with their new values, and the gone row with the values it last had", () => {
    const kept = keepInPlace([{ row: { id: "a", price: 1 }, gone: false }, { row: { id: "b", price: 2 }, gone: false }], [{ id: "b", price: 5 }, { id: "c", price: 7 }]);
    expect(kept).toEqual([{ row: { id: "a", price: 1 }, gone: true }, { row: { id: "b", price: 5 }, gone: false }, { row: { id: "c", price: 7 }, gone: false }]);
  });
});

describe("circleTap", () => {
  test("checks the person on the whole line, whoever else has it, quantity or not", () => {
    expect(circleTap(item({ by: "even", units: [[ann]] }), bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob" }]);
    expect(circleTap({ ...item({ by: "even", units: [[]] }), quantity: 3 }, bob)).toEqual([{ by: "bob", type: "claim", itemId: "tostones", participantId: "bob" }]);
  });

  test("unchecks the person from the line", () => {
    expect(circleTap(item({ by: "shares", units: [[[ann, 1], [bob, 2]]] }), bob)).toEqual([{ by: "bob", type: "unclaim", itemId: "tostones", participantId: "bob" }]);
  });
});

test("totalNote says how far the Items or the charges are from the printed subtotal and total", () => {
  const receipt = (sprite: number, total = 250) => ({ items: [item({ by: "even", units: [[]] }, sprite)] as const, adjustments: [], subtotal: cents(250), total: cents(total) });

  expect([totalNote(receipt(275)), totalNote(receipt(200)), totalNote(receipt(250, 300)), totalNote(receipt(250))]).toEqual([
    "Items are $0.25 over the subtotal.",
    "Items are $0.50 short of the subtotal.",
    "Tax and charges are $0.50 short of the total.",
    null,
  ]);
});

test("lineAmounts divides the line's cents by largest remainder, and shows typed cents under amount", () => {
  expect(lineAmounts(item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }))).toEqual([
    { participantId: "ann", cents: 67 },
    { participantId: "bob", cents: 33 },
  ]);
  expect(lineAmounts({ ...item({ by: "even", units: [[ann, bob, cat]] }, 1001), quantity: 2 })).toEqual([
    { participantId: "ann", cents: 334 },
    { participantId: "bob", cents: 334 },
    { participantId: "cat", cents: 333 },
  ]);
  expect(lineAmounts(item({ by: "amount", units: [[[ann, cents(75)]]] }))).toEqual([{ participantId: "ann", cents: 75 }]);
});

describe("itemParts", () => {
  const people = [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }, { id: cat, name: "Cat" }] as const;
  const splitOf = (it: SplitItem, others: readonly SplitItem[] = []) => {
    const items = [it, ...others] as const;
    const sum = items.reduce((total, { price }) => total + price, 0);
    return { receipt: { items, adjustments: [], subtotal: cents(sum), total: cents(sum) }, participants: people, payments: [] };
  };

  test("$14.00 even across three people gives the viewer sorted last the $4.67 the list and Pay sheet show", () => {
    const tostones = item({ by: "even", units: [[ann, bob, cat]] }, 1400);
    const split = splitOf(tostones);

    expect(itemParts(split, tostones)).toEqual([
      { participantId: "ann", cents: 467 },
      { participantId: "bob", cents: 466 },
      { participantId: "cat", cents: 467 },
    ]);
    expect(itemParts(split, tostones).find(({ participantId }) => participantId === cat)?.cents).toBe(shareBreakdown(split, cat).items[0].portion);
  });

  test("reads a shown Item that differs from the Split's row, such as an unsaved switch to by shares", () => {
    const even = item({ by: "even", units: [[ann, bob]] }, 900);
    const shares = item({ by: "shares", units: [[[ann, 2], [bob, 1]]] }, 900);

    expect(itemParts(splitOf(even), shares)).toEqual([
      { participantId: "ann", cents: 600 },
      { participantId: "bob", cents: 300 },
    ]);
  });

  test("keeps the typed cents by amount", () => {
    const typed = item({ by: "amount", units: [[[ann, cents(250)], [bob, cents(0)]]] }, 900);

    expect(itemParts(splitOf(typed), typed)).toEqual([
      { participantId: "ann", cents: 250 },
      { participantId: "bob", cents: 0 },
    ]);
  });
});

describe("receiptRows at Topgolf", () => {
  const line = (id: string, name: string, cost: number, claimers: readonly ParticipantId[] = [], quantity = 1): SplitItem => {
    const row: SplitItem = { id: itemId(id), name, price: price(cost), split: { by: "even", units: [claimers] } };
    return quantity === 1 ? row : { ...row, quantity };
  };
  const bucket = (id: string, amount: number, [first, ...rest]: NonEmpty<string>, name = "Beer Bucket Discount (10%)"): Adjustment => ({
    id: adjustmentId(id),
    kind: "bundleDiscount",
    name,
    amount: cents(amount),
    bundle: { name: "Beer Bucket", items: [itemId(first), ...rest.map(itemId)] },
  });
  const topgolf = (guinness: readonly ParticipantId[] = [], firstDiscount = "Beer Bucket Discount (10%)"): Receipt<SplitItem> => ({
    items: [
      line("gameplay", "Gameplay", 8775),
      line("ultra1", "Michelob Ultra 16oz Aluminum Bottle", 629, [ann]),
      line("guinness1", "Guinness Draught 14.9oz Can", 2187, guinness, 3),
      line("pineapple1", "High Noon Pineapple 12oz Can", 849, [ann]),
      line("watermelon1", "High Noon Watermelon 12oz Can", 849, [bob]),
      line("ultra2", "Michelob Ultra 16oz Aluminum Bottle", 629),
      line("guinness2", "Guinness Draught 14.9oz Can", 1458, [], 2),
      line("pineapple2", "High Noon Pineapple 12oz Can", 849),
      line("watermelon2", "High Noon Watermelon 12oz Can", 1698, [], 2),
    ],
    adjustments: [
      bucket("bucket1", -451, ["ultra1", "guinness1", "pineapple1", "watermelon1"], firstDiscount),
      bucket("bucket2", -463, ["ultra2", "guinness2", "pineapple2", "watermelon2"]),
      { id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(494) },
      { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(3226) },
    ],
    subtotal: cents(17923),
    total: cents(20729),
  });
  const read = (receipt: Receipt<SplitItem>) =>
    receiptRows(receipt).rows.map((row) =>
      row.kind === "item"
        ? [row.item.id, row.item.price]
        : [row.bundle.name, row.bundle.summary, row.bundle.net, row.bundle.items.map(({ id, price: cost, quantity = 1 }) => `${quantity}x ${id} ${cost}`), row.bundle.discount, claimedItems(row.bundle, computeShares({ receipt, participants: [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }], payments: [] }).unclaimed.itemIds)],
    );

  test("reads Gameplay, then each Beer Bucket with one row per line, its unit count, percent, net price, discount, and Items claimed, and leaves only Tax and Tip as charges", () => {
    expect(read(topgolf())).toEqual([
      ["gameplay", 8775],
      ["Beer Bucket", "4 items · 10% off", 4063, ["1x ultra1 629", "3x guinness1 2187", "1x pineapple1 849", "1x watermelon1 849"], { label: "Discount (10%)", amount: -451 }, 3],
      ["Beer Bucket", "4 items · 10% off", 4171, ["1x ultra2 629", "2x guinness2 1458", "1x pineapple2 849", "2x watermelon2 1698"], { label: "Discount (10%)", amount: -463 }, 0],
    ]);
    expect(receiptRows(topgolf()).charges.map(({ name }) => name)).toEqual(["Tax", "Tip"]);
  });

  test("keeps a deleted Gameplay row in place above both Beer Buckets, and a Bucket whose last line goes leaves as one row", () => {
    const shownRows = (receipt: Receipt<SplitItem>) => receiptRows(receipt).rows.map((row) => ({ row, gone: false }));
    const without = (receipt: Receipt<SplitItem>, ...gone: string[]): Receipt<SplitItem> => {
      const [first, ...rest] = receipt.items.filter(({ id }) => !gone.includes(id));
      if (!first) throw new Error("the test deleted every line");
      const adjustments = receipt.adjustments.filter((row) => row.kind !== "bundleDiscount" || row.bundle.items.some((id) => !gone.includes(id)));
      return { ...receipt, items: [first, ...rest], adjustments };
    };
    const ids = (receipt: Receipt<SplitItem>, ...gone: string[]) => keepInPlace(shownRows(receipt), receiptRows(without(receipt, ...gone)).rows).map(({ row, gone }) => `${gone ? "-" : ""}${row.kind} ${row.id}`);
    expect(ids(topgolf(), "gameplay")).toEqual(["-item gameplay", "bundle bucket1", "bundle bucket2"]);
    expect(ids(topgolf(), "ultra1", "guinness1", "pineapple1", "watermelon1")).toEqual(["item gameplay", "-bundle bucket1", "bundle bucket2"]);
  });

  test("gives a line of three at $10.00 one row at its full price", () => {
    const receipt: Receipt<SplitItem> = { items: [line("cans", "Cans", 1000, [ann], 3)], adjustments: [], subtotal: cents(1000), total: cents(1000) };
    expect(read(receipt)).toEqual([["cans", 1000]]);
  });

  test("counts the 3x Guinness line as one claimed Item once someone claims it, not as three", () => {
    expect([read(topgolf())[1][5], read(topgolf([ann]))[1][5]]).toEqual([3, 4]);
  });

  test("names a Bundle's discount by its amount when the receipt prints no percent", () => {
    const [, bundle] = read(topgolf(undefined, "Bucket deal"));
    expect([bundle[1], bundle[4]]).toEqual(["4 items · $4.51 off", { label: "Bucket deal", amount: -451 }]);
  });

  test("tells a Bundle Item's sheet what its Bundle's discount takes off that line, and says nothing outside a Bundle", () => {
    expect([
      bundleNote(topgolf(), itemId("guinness1"), 2187),
      bundleNote(topgolf(undefined, "Bucket deal"), itemId("guinness1"), 2187),
      bundleNote(topgolf(), itemId("ultra1"), 629),
      bundleNote(topgolf(), itemId("gameplay"), 8775),
    ]).toEqual(["In Beer Bucket. Its 10% off takes $2.19 off this line.", "In Beer Bucket. Its discount takes $2.19 off this line.", "In Beer Bucket. Its 10% off takes $0.63 off this line.", null]);
  });

  test("shows 3x on the Guinness line and nothing on a line of one", () => {
    expect(topgolf().items.map((row) => [row.id, quantityText(row)])).toEqual([
      ["gameplay", null],
      ["ultra1", null],
      ["guinness1", "3x"],
      ["pineapple1", null],
      ["watermelon1", null],
      ["ultra2", null],
      ["guinness2", "2x"],
      ["pineapple2", null],
      ["watermelon2", "2x"],
    ]);
  });

  test("lists the Guinness line Ann and Bob had in Ann's breakdown as one 3x line at half its price, with no 1 of 3", () => {
    const receipt = topgolf([ann, bob]);
    const split = { receipt, participants: [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }] as const, payments: [] };
    expect(breakdownLines(shareBreakdown(split, ann), receipt.items, ann)).toEqual([
      { id: "ultra1", quantity: null, name: "Michelob Ultra 16oz Aluminum Bottle", part: null, portion: 629 },
      { id: "guinness1", quantity: "3x", name: "Guinness Draught 14.9oz Can", part: "Split 2 ways", portion: 1094 },
      { id: "pineapple1", quantity: null, name: "High Noon Pineapple 12oz Can", part: null, portion: 849 },
    ]);
  });

  test("mints guinness1-2 and guinness1-3 for Splitting the 3x line, and skips an id already on the receipt", () => {
    const receipt = topgolf();
    const guinness = receipt.items[2];
    expect(splitIds(receipt, guinness)).toEqual(["guinness1-2", "guinness1-3"]);
    const taken: Receipt<SplitItem> = { ...receipt, items: [receipt.items[0], ...receipt.items.slice(1), line("guinness1-2", "Sprite", 250)] };
    expect(splitIds(taken, guinness)).toEqual(["guinness1-3", "guinness1-4"]);
  });

  test("keeps minted ids within 24 characters when the line's id is already 24 long", () => {
    const long = line("abcdefghijklmnopqrstuvwx", "Cans", 1000, [], 3);
    expect(splitIds({ items: [long], adjustments: [], subtotal: cents(1000), total: cents(1000) }, long)).toEqual(["abcdefghijklmnopqrstuv-2", "abcdefghijklmnopqrstuv-3"]);
  });

  test("lists in Ann's breakdown only the first Beer Bucket's discount, the one her drinks were in, with Tax and Tip", () => {
    const receipt = topgolf();
    const split = { receipt, participants: [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }] as const, payments: [] };
    expect(breakdownCharges(receipt, shareBreakdown(split, ann)).map(({ id, portion }) => [id, portion])).toEqual([
      ["bucket1", -148],
      ["tax", 39],
      ["tip", 252],
    ]);
  });

  test("the Unclaimed line counts six lines nobody had, a 3x and two 2x lines as one each, and five once Ann and Bob take the 3x Guinness", () => {
    const participants = [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }] as const;
    const line = (receipt: Receipt<SplitItem>) => splitCopy.unclaimedTotal(computeShares({ receipt, participants, payments: [] }).unclaimed.itemIds.length);
    expect([line(topgolf()), line(topgolf([ann, bob]))]).toEqual(["Unclaimed · 6 items", "Unclaimed · 5 items"]);
  });

  test("a collapsed Beer Bucket counts Items claimed, leaves a By amount line with money left over out of them as the Unclaimed line does, and counts an untouched 2x line as one Item", () => {
    const participants = [{ id: ann, name: "Ann" }, { id: bob, name: "Bob" }] as const;
    const shared = topgolf([ann, bob]);
    const partly = (row: SplitItem): SplitItem => (row.id === "pineapple1" ? { ...row, split: { by: "amount", units: [[[ann, cents(500)]]] } } : row);
    const [first, ...rest] = shared.items;
    const receipt = { ...shared, items: [partly(first), ...rest.map(partly)] as const };
    const { itemIds } = computeShares({ receipt, participants, payments: [] }).unclaimed;
    const buckets = receiptRows(receipt).rows.flatMap((row) => (row.kind === "bundle" ? [claimedItems(row.bundle, itemIds)] : []));
    expect([buckets, splitCopy.unclaimedTotal(itemIds.length)]).toEqual([[3, 0], "Unclaimed · 6 items"]);
  });
});
