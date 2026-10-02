import { describe, expect, test } from "vitest";
import { cents, price } from "./money";
import { adjustmentId, itemId, type Adjustment, type ReceiptLevelKind, type Item, type NonEmpty, type Receipt } from "./split";
import { runTotalCheck } from "./total-check";

function item(id: string, amount: number): Item {
  return { id: itemId(id), name: id, price: price(amount) };
}

function adjustment(id: string, kind: ReceiptLevelKind, amount: number): Adjustment {
  return { id: adjustmentId(id), kind, name: kind, amount: cents(amount) };
}

function receipt(items: NonEmpty<Item>, adjustments: Adjustment[], subtotal: number, total: number): Receipt {
  return { items, adjustments, subtotal: cents(subtotal), total: cents(total) };
}

describe("runTotalCheck", () => {
  test("passes when the Items add up to the subtotal and the Adjustments add up to the total", () => {
    const printed = receipt([item("burger", 1450), item("fries", 600), item("soda", 299)], [adjustment("tax", "tax", 208)], 2349, 2557);

    expect(runTotalCheck(printed)).toEqual({ ok: true });
  });

  test("names the Item whose $14.50 was read as $1.45", () => {
    const misread = receipt([item("burger", 145), item("fries", 600), item("soda", 299)], [adjustment("tax", "tax", 208)], 2349, 2557);

    expect(runTotalCheck(misread)).toEqual({
      ok: false,
      subtotalGap: 1305,
      totalGap: 0,
      itemIds: ["burger"],
      adjustmentIds: [],
      suspects: [],
    });
  });

  test("names the Item whose $14.80 was read as $14.30, since OCR confuses 3 and 8", () => {
    const misread = receipt([item("burger", 1430), item("fries", 600), item("soda", 299)], [adjustment("tax", "tax", 208)], 2379, 2587);

    expect(runTotalCheck(misread)).toEqual({
      ok: false,
      subtotalGap: 50,
      totalGap: 0,
      itemIds: ["burger"],
      adjustmentIds: [],
      suspects: [],
    });
  });

  test("names the discount whose minus sign was lost", () => {
    const misread = receipt([item("burger", 2000)], [adjustment("coupon", "discount", 500), adjustment("tax", "tax", 160)], 2000, 1660);

    expect(runTotalCheck(misread)).toEqual({
      ok: false,
      subtotalGap: 0,
      totalGap: -1000,
      itemIds: [],
      adjustmentIds: ["coupon"],
      suspects: [],
    });
  });

  test("blames the printed subtotal, not a row, when the rows agree with the total", () => {
    const misread = receipt([item("burger", 1450), item("fries", 600), item("soda", 299)], [adjustment("tax", "tax", 208)], 1749, 2557);

    expect(runTotalCheck(misread)).toEqual({
      ok: false,
      subtotalGap: -600,
      totalGap: 600,
      itemIds: [],
      adjustmentIds: [],
      suspects: ["subtotal"],
    });
  });

  test("names no Item when shifting its decimal point would drop a digit", () => {
    const misread = receipt([item("burger", 1455), item("fries", 600)], [], 745, 745);

    expect(runTotalCheck(misread)).toEqual({
      ok: false,
      subtotalGap: -1310,
      totalGap: 0,
      itemIds: [],
      adjustmentIds: [],
      suspects: [],
    });
  });

  test("suspects the printed total when it is the true total with a shifted decimal point", () => {
    const misread = receipt([item("burger", 1450), item("fries", 600), item("soda", 299)], [adjustment("tax", "tax", 208)], 2349, 25570);

    expect(runTotalCheck(misread)).toEqual({
      ok: false,
      subtotalGap: 0,
      totalGap: 23013,
      itemIds: [],
      adjustmentIds: [],
      suspects: ["total"],
    });
  });

  test("reports prices too large to add exactly as a failed check instead of throwing", () => {
    const absurd = receipt([item("burger", 5_000_000_000_000_000), item("fries", 5_000_000_000_000_000)], [], 2050, 2050);

    expect(runTotalCheck(absurd)).toEqual({
      ok: false,
      subtotalGap: -9_999_999_999_997_950,
      totalGap: 0,
      itemIds: [],
      adjustmentIds: [],
      suspects: [],
    });
  });
});
