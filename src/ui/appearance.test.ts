import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { flipped, pick, readAppearance, resolveScheme, storeAppearance } from "./appearance";
import { colors } from "./colors";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveScheme", () => {
  test.each([
    [null, "light", "light"],
    [null, "dark", "dark"],
    ["dark", "light", "dark"],
    ["light", "dark", "light"],
  ] as const)("picked %s on a %s device shows %s", (picked, system, shown) => {
    expect(resolveScheme(picked, system)).toBe(shown);
  });
});

describe("a tap on the toggle", () => {
  test("on a light device showing light picks dark", () => {
    expect(pick(flipped("light"), "light")).toBe("dark");
  });

  test("on a light device showing dark goes back to following the device", () => {
    expect(pick(flipped("dark"), "light")).toBe(null);
  });

  test("on a dark device showing dark picks light", () => {
    expect(pick(flipped("dark"), "dark")).toBe("light");
  });

  test("on a dark device showing light goes back to following the device", () => {
    expect(pick(flipped("light"), "dark")).toBe(null);
  });
});

describe("the stored appearance", () => {
  test("picking dark and then the device's own light leaves nothing stored", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    storeAppearance(pick("dark", "light"));
    expect(Object.fromEntries(storage.values)).toEqual({ "receipt-splitter:appearance": "dark" });
    expect(readAppearance()).toBe("dark");
    storeAppearance(pick("light", "light"));
    expect(Object.fromEntries(storage.values)).toEqual({});
    expect(readAppearance()).toBe(null);
  });

  test("an unknown stored value follows the device", () => {
    vi.stubGlobal("localStorage", memoryStorage({ "receipt-splitter:appearance": "sepia" }));
    expect(readAppearance()).toBe(null);
  });

  test("storage that throws reads as following the device and does not stop a pick", () => {
    const fails = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fails, setItem: fails, removeItem: fails });
    expect(readAppearance()).toBe(null);
    expect(() => storeAppearance("dark")).not.toThrow();
  });
});

test("the page ground painted before the bundle matches each scheme's field color", () => {
  const html = readFileSync("public/index.html", "utf8");
  const themeColor = (scheme: string) => new RegExp(`<meta name="theme-color" content="([^"]+)" media="\\(prefers-color-scheme: ${scheme}\\)"`).exec(html)?.[1];
  const ground = (scheme: string) => new RegExp(`:root\\[data-theme="${scheme}"\\], :root\\[data-theme="${scheme}"\\] body \\{ background-color: ([^;]+);`).exec(html)?.[1];
  expect([themeColor("light"), ground("light")]).toEqual([colors.light.field, colors.light.field]);
  expect([themeColor("dark"), ground("dark")]).toEqual([colors.dark.field, colors.dark.field]);
});
