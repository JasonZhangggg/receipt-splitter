import { describe, expect, test } from "vitest";
import { cents } from "./money";
import { payLink } from "./pay-links";

describe("payLink", () => {
  test("links each service to a $14.20 payment", () => {
    expect(payLink({ service: "venmo", handle: "jason-z" }, cents(1420), "Tacos")).toBe(
      "https://venmo.com/jason-z?txn=pay&amount=14.20&note=Tacos",
    );
    expect(payLink({ service: "venmo", handle: "jason-z" }, cents(1420), "Tacos", "app")).toBe(
      "venmo://paycharge?txn=pay&recipients=jason-z&amount=14.20&note=Tacos",
    );
    expect(payLink({ service: "cashApp", handle: "jasonz" }, cents(1420), "Tacos")).toBe("https://cash.app/$jasonz/14.20");
    expect(payLink({ service: "cashApp", handle: "jasonz" }, cents(1420), "Tacos", "app")).toBe("https://cash.app/$jasonz/14.20");
    expect(payLink({ service: "paypal", handle: "jasonz" }, cents(1420), "Tacos")).toBe("https://paypal.me/jasonz/14.20USD");
    expect(payLink({ service: "paypal", handle: "jasonz" }, cents(1420), "Tacos", "app")).toBe("https://paypal.me/jasonz/14.20USD");
    expect(payLink({ service: "zelle", handle: "jason@example.com" }, cents(1420), "Tacos")).toBe(null);
  });

  test("encodes a note with spaces and an ampersand", () => {
    expect(payLink({ service: "venmo", handle: "jason-z" }, cents(1420), "Tacos & beer")).toBe(
      "https://venmo.com/jason-z?txn=pay&amount=14.20&note=Tacos%20%26%20beer",
    );
    expect(payLink({ service: "venmo", handle: "jason-z" }, cents(1420), "Tacos & beer", "app")).toBe(
      "venmo://paycharge?txn=pay&recipients=jason-z&amount=14.20&note=Tacos%20%26%20beer",
    );
  });

  test.each([
    ["a/b", "a%2Fb"],
    ["a?x=1", "a%3Fx%3D1"],
    ["a#b", "a%23b"],
    ["é", "%C3%A9"],
    ["a b", "a%20b"],
  ])("keeps the handle %s inside its path or query value", (handle, encoded) => {
    expect(payLink({ service: "venmo", handle }, cents(1420), "Tacos")).toBe(`https://venmo.com/${encoded}?txn=pay&amount=14.20&note=Tacos`);
    expect(payLink({ service: "venmo", handle }, cents(1420), "Tacos", "app")).toBe(`venmo://paycharge?txn=pay&recipients=${encoded}&amount=14.20&note=Tacos`);
    expect(payLink({ service: "cashApp", handle }, cents(1420), "Tacos")).toBe(`https://cash.app/$${encoded}/14.20`);
    expect(payLink({ service: "paypal", handle }, cents(1420), "Tacos")).toBe(`https://paypal.me/${encoded}/14.20USD`);
  });

  test("keeps the dollars of an amount with 50 cents or more", () => {
    expect(payLink({ service: "paypal", handle: "jasonz" }, cents(1450), "")).toBe("https://paypal.me/jasonz/14.50USD");
    expect(payLink({ service: "cashApp", handle: "jasonz" }, cents(99), "")).toBe("https://cash.app/$jasonz/0.99");
  });

  test("writes whole dollars and cents under a dime with two decimals", () => {
    expect(payLink({ service: "paypal", handle: "jasonz" }, cents(1400), "")).toBe("https://paypal.me/jasonz/14.00USD");
    expect(payLink({ service: "paypal", handle: "jasonz" }, cents(1405), "")).toBe("https://paypal.me/jasonz/14.05USD");
    expect(payLink({ service: "cashApp", handle: "jasonz" }, cents(7), "")).toBe("https://cash.app/$jasonz/0.07");
  });
});
