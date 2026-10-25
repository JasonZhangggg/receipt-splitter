import { describe, expect, test } from "vitest";
import { localCurrency, money, parseAmount, plainAmount } from "./currency";

describe("currency", () => {
  test("writes amounts in the currency's minor unit, whole yen included", () => {
    expect([money(123456, "USD"), money(-1250, "EUR"), money(1200, "JPY"), money(1250, "GBP")]).toEqual(["$1,234.56", "-€12.50", "¥1,200", "£12.50"]);
    expect([plainAmount(123456, "EUR"), plainAmount(-5, "USD"), plainAmount(1200, "JPY")]).toEqual(["1234.56", "-0.05", "1200"]);
  });

  test("reads a dot or a comma as the decimal mark", () => {
    expect(["12.50", "12,50", "12,5", ",5", "1,234", "abc"].map((text) => parseAmount(text, "EUR"))).toEqual([1250, 1250, 1250, 50, null, null]);
  });

  test("guesses the currency from the browser's region", () => {
    expect(["de-DE", "fr", "en-GB", "ja-JP", "en-US", "es-AR", undefined, "not a locale"].map((locale) => localCurrency(locale))).toEqual(["EUR", "EUR", "GBP", "JPY", "USD", "USD", "USD", "USD"]);
  });
});
