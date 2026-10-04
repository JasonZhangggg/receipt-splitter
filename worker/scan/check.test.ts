import { describe, expect, it } from "vitest";
import { checkReading } from "./check";
import { readLines } from "./format";

const check = (reply: string) => {
  const reading = readLines(reply.split("\n"));
  if (reading === null) throw new Error("the test reply did not parse");
  return checkReading(reading);
};

describe("checkReading", () => {
  it("passes a reading whose lines sum to the subtotal and the total, counting the Bundle and folded discounts", () => {
    expect(check("SUB|1950\nTOT|2100\ni|Burger|900\n-|Promo|-100\nb|Pair\n>i|Tea|300\n>i|Scone|400\n>d|Pair deal|-50\ni|Pie|500\nf|Bag fee|0\nt|Tax|150")).toEqual({
      passed: true,
      gaps: { subtotal: 0, total: 0 },
    });
  });

  it("accepts a 3-cent gap and returns it", () => {
    expect(check("SUB|1003\nTOT|1083\ni|Burger|1000\nt|Tax|80")).toEqual({ passed: true, gaps: { subtotal: 3, total: 3 } });
  });

  it("fails a 4-cent gap and names it", () => {
    expect(check("SUB|1000\nTOT|1084\ni|Burger|1000\nt|Tax|80")).toEqual({
      passed: false,
      gaps: { subtotal: 0, total: 4 },
      problems: ["all lines sum to $10.80 but the printed total is $10.84 (short by $0.04)"],
    });
  });

  it("compares a subtotal printed before discounts with the lines before every -, d, and >d line", () => {
    const reply = "SUB|2400|pre\nTOT|2150\ni|Burger|900\n-|Promo|-100\nb|Pair\n>i|Tea|500\n>d|Pair deal|-50\ni|Pie|1000\nd|Coupon|-100";
    expect(check(reply)).toEqual({ passed: true, gaps: { subtotal: 0, total: 0 } });
    expect(check(reply.replace("|pre", ""))).toEqual({
      passed: false,
      gaps: { subtotal: 250, total: 0 },
      problems: ["non-tax lines sum to $21.50 but the printed subtotal is $24.00 (short by $2.50)"],
    });
  });

  it("passes a receipt with no tax line and no subtotal", () => {
    expect(check("SUB|-\nTOT|1300\ni|Burger|900\ni|Fries|400")).toEqual({ passed: true, gaps: { subtotal: null, total: 0 } });
  });

  it("fails a Bundle with no Items", () => {
    expect(check("TOT|900\ni|Burger|900\nb|Empty\nt|Tax|0")).toMatchObject({ passed: false, problems: ['bundle "Empty" has no items'] });
  });
});
