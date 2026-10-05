import { describe, expect, it } from "vitest";
import { arithmeticBreakdown } from "./breakdown";
import { readLines } from "./format";

const breakdown = (reply: string) => {
  const reading = readLines(reply.split("\n"));
  if (reading === null) throw new Error("the test reply did not parse");
  return arithmeticBreakdown(reading);
};

const SAVINGS_TWICE = "When the receipt lists the same savings twice, once under each item and again in a summary block, keep the per-item lines and skip the summary block.";

describe("arithmeticBreakdown", () => {
  it("states the sums and gaps of a reading a dollar short, and every line or group the gap equals", () => {
    expect(breakdown("SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|500\nt|Tax|100").split("\n")).toEqual([
      "Sums of the first reading: items before discounts $14.00 (2 lines), item discounts -$1.00 (1 line), order discounts $0.00 (0 lines), fees and deposits $0.00, service $0.00, tax $1.00 (1 line), tip $0.00.",
      "printed SUB $14.00 (after discounts) against lines $13.00, gap $1.00; printed TOT $15.00 against all lines $14.00, gap $1.00.",
      'Note: the gap $1.00 equals the line "Tax": it may be missing, doubled, or a summary line.',
      "Note: the gap $1.00 is whole dollars: a misread dollar digit is likely.",
      "Note: the gap $1.00 equals the item discounts: those discounts are likely counted twice or belong to a summary block.",
      "Note: the gap $1.00 equals the tax: tax may be missing or counted twice.",
      SAVINGS_TWICE,
    ]);
  });

  it("flags order discounts that repeat the item discounts, and notes each distinct gap once", () => {
    expect(breakdown("SUB|2000\nTOT|1700\ni|A|1000\n-|Save|-150\ni|B|1000\n-|Save|-150\nd|Savings|-300\nt|Tax|0\np|Tip|0\ns|Service|0").split("\n")).toEqual([
      "Sums of the first reading: items before discounts $20.00 (2 lines), item discounts -$3.00 (2 lines), order discounts -$3.00 (1 line), fees and deposits $0.00, service $0.00, tax $0.00 (1 line), tip $0.00.",
      "printed SUB $20.00 (after discounts) against lines $14.00, gap $6.00; printed TOT $17.00 against all lines $14.00, gap $3.00.",
      "Note: order discounts equal item discounts exactly: likely a summary block counted twice.",
      "Note: the gap $6.00 is whole dollars: a misread dollar digit is likely.",
      'Note: the gap $3.00 equals the line "Savings": it may be missing, doubled, or a summary line.',
      "Note: the gap $3.00 is whole dollars: a misread dollar digit is likely.",
      "Note: the gap $3.00 equals the item discounts: those discounts are likely counted twice or belong to a summary block.",
      "Note: the gap $3.00 equals the order discounts: those discounts are likely counted twice or belong to a summary block.",
      SAVINGS_TWICE,
    ]);
  });

  it("compares a subtotal printed before discounts with the lines before them, lists Bundle discounts, and says when no subtotal is printed", () => {
    const [sums, printed] = breakdown("SUB|2400|pre\nTOT|2150\ni|Burger|900\n-|Promo|-100\nb|Pair\n>i|Tea|500\n>d|Pair deal|-50\ni|Pie|1000\nd|Coupon|-100").split("\n");
    const [, noSubtotal] = breakdown("SUB|-\nTOT|1300\ni|Burger|900\ni|Fries|400").split("\n");
    expect([sums, printed, noSubtotal]).toEqual([
      "Sums of the first reading: items before discounts $24.00 (3 lines), item discounts -$1.00 (1 line), bundle discounts -$0.50 (1 line), order discounts -$1.00 (1 line), fees and deposits $0.00, service $0.00, tax $0.00 (0 lines), tip $0.00.",
      "printed SUB $24.00 (before discounts) against lines $24.00, gap $0.00; printed TOT $21.50 against all lines $21.50, gap $0.00.",
      "no printed subtotal; printed TOT $13.00 against all lines $13.00, gap $0.00.",
    ]);
  });
});
