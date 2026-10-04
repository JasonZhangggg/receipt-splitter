import { describe, expect, it } from "vitest";
import { applyEdits, readLines, replyLines } from "./format";

const read = (reply: string) => readLines(replyLines(reply));

describe("readLines", () => {
  it("reads the invented receipt from Compact formats into Items, Bundles, and Adjustments, folding the discount under an Item into its price", () => {
    const reply = [
      "```",
      "SUB|3235",
      "TOT|3525",
      "i|Cold Brew|575",
      "+|Large, oat milk",
      "i|Club Sandwich|1250",
      "-|Member discount|-200",
      "b|Wing Bucket",
      ">i|Hot Wings|900",
      ">i|Garlic Fries|500",
      ">d|Bucket discount|-300",
      "i|Lemonade|600|2",
      "d|Coupon|-100",
      "f|Bag fee|10",
      "t|Tax|290",
      "```",
    ].join("\n");
    expect(read(reply)).toEqual({
      subtotal: { amount: 3235, beforeDiscounts: false },
      total: 3525,
      items: [
        { name: "Cold Brew", price: 575, quantity: null, details: ["Large, oat milk"], discounts: [] },
        { name: "Club Sandwich", price: 1050, quantity: null, details: [], discounts: [{ name: "Member discount", amount: -200 }] },
        { name: "Hot Wings", price: 900, quantity: null, details: [], discounts: [] },
        { name: "Garlic Fries", price: 500, quantity: null, details: [], discounts: [] },
        { name: "Lemonade", price: 600, quantity: 2, details: [], discounts: [] },
      ],
      bundles: [{ name: "Wing Bucket", items: [2, 3], discounts: [{ name: "Bucket discount", amount: -300 }] }],
      adjustments: [
        { kind: "discount", name: "Coupon", amount: -100 },
        { kind: "fee", name: "Bag fee", amount: 10 },
        { kind: "tax", name: "Tax", amount: 290 },
      ],
      skipped: 0,
    });
  });

  it("makes an unsigned or trailing-minus discount negative, on an Item, in a Bundle, and on the order", () => {
    const reading = read("TOT|1000\ni|Soup|800\n-|Promo|150\nb|Combo\n>i|Taco|500\n>d|Combo deal|50-\nd|Coupon|100");
    expect([reading?.items[0].price, reading?.items[0].discounts, reading?.bundles[0].discounts, reading?.adjustments]).toEqual([
      650,
      [{ name: "Promo", amount: -150 }],
      [{ name: "Combo deal", amount: -50 }],
      [{ kind: "discount", name: "Coupon", amount: -100 }],
    ]);
  });

  it("sends a decimal after the amount to the detail as a weight, not to the quantity", () => {
    expect(read("TOT|189\ni|Apples|189|1.35")?.items).toEqual([{ name: "Apples", price: 189, quantity: null, details: ["1.35"], discounts: [] }]);
  });

  it("keeps a d line right after an Item on the order, and closes a Bundle at the first line without >", () => {
    const reading = read("TOT|1150\nb|Pair\n>i|Tea|300\n>i|Scone|400\ni|Pie|500\nd|Happy hour|-50");
    expect([reading?.items[2], reading?.bundles, reading?.adjustments]).toEqual([
      { name: "Pie", price: 500, quantity: null, details: [], discounts: [] },
      [{ name: "Pair", items: [0, 1], discounts: [] }],
      [{ kind: "discount", name: "Happy hour", amount: -50 }],
    ]);
  });

  it("skips and counts a line that does not parse, and a - line with no Item above it", () => {
    const reading = read("SUB|-\nTOT|500\n-|Orphan|-100\ni|Bagel|five dollars\nx|What|100\nhello\ni|Bagel|500");
    expect([reading?.subtotal, reading?.items.length, reading?.skipped]).toEqual([null, 1, 4]);
  });

  it("returns null for a reply with no total or no Item", () => {
    expect([read("i|Bagel|500"), read("TOT|500\nt|Tax|500"), read("")]).toEqual([null, null, null]);
  });

  it("reads |pre on the subtotal", () => {
    expect(read("SUB|1000|pre\nTOT|900\ni|Bagel|1000\nd|Coupon|-100")?.subtotal).toEqual({ amount: 1000, beforeDiscounts: true });
  });
});

describe("applyEdits", () => {
  const lines = ["SUB|1500", "TOT|1600", "i|Burger|900", "+|Medium", "-|Promo|-100", "i|Fries|500", "f|Bottle deposit|10", "t|Tax|100"];

  it("fixes, drops, and adds lines by number, and replaces the subtotal", () => {
    expect(applyEdits(lines, "fix|6|i|Fries|600\ndrop|8\nadd|t|Sales tax|90\nSUB|1400\nok")).toEqual({
      lines: ["SUB|1400", "TOT|1600", "i|Burger|900", "+|Medium", "-|Promo|-100", "i|Fries|600", "f|Bottle deposit|10", "t|Sales tax|90"],
      applied: 4,
      refused: 0,
    });
  });

  it("inserts after line n and the + and - lines under it", () => {
    expect(applyEdits(lines, "after|3|i|Shake|400").lines).toEqual([
      "SUB|1500",
      "TOT|1600",
      "i|Burger|900",
      "+|Medium",
      "-|Promo|-100",
      "i|Shake|400",
      "i|Fries|500",
      "f|Bottle deposit|10",
      "t|Tax|100",
    ]);
  });

  it("refuses to drop a fee or deposit line", () => {
    expect(applyEdits(lines, "drop|7")).toEqual({ lines, applied: 0, refused: 1 });
  });

  it("ignores an edit whose line number is out of range", () => {
    expect(applyEdits(lines, "fix|9|i|Cake|100\ndrop|0")).toEqual({ lines, applied: 0, refused: 0 });
  });

  it("builds a reading from add lines when pass 1 had none", () => {
    expect(applyEdits([], "TOT|500\nadd|i|Bagel|500").lines).toEqual(["TOT|500", "i|Bagel|500"]);
  });
});
