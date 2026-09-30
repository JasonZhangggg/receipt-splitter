import { describe, expect, test } from "vitest";
import { cents, isCents, isPrice, price } from "./money";

describe("money", () => {
  test("cents accepts whole numbers, negative ones included, and refuses fractions and unsafe integers", () => {
    expect(cents(-250)).toBe(-250);
    expect(() => cents(1.5)).toThrow("1.5 is not a whole number of cents");
    expect(() => cents(2 ** 53)).toThrow("9007199254740992 is not a whole number of cents");
    expect([isCents("250"), isCents(Number.NaN), isCents(250)]).toEqual([false, false, true]);
  });

  test("price accepts zero and refuses a negative amount", () => {
    expect(price(0)).toBe(0);
    expect(() => price(-1)).toThrow("-1 is not a price of zero or more cents");
    expect([isPrice(-1), isPrice(0), isPrice(1450)]).toEqual([false, true, true]);
  });
});
