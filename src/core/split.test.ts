import { afterEach, describe, expect, test, vi } from "vitest";
import { isMintedSplitId, itemId, participantId, randomId, serializedBytes } from "./split";

describe("ids", () => {
  test("accept 1 to 24 letters, digits, underscores, and hyphens, and nothing else", () => {
    expect(participantId("a".repeat(24))).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(itemId("fries_2-large")).toBe("fries_2-large");
    expect(() => participantId("a".repeat(25))).toThrow('"aaaaaaaaaaaaaaaaaaaaaaaaa" is not 1 to 24 letters, digits, "_", or "-"');
    expect(() => itemId("")).toThrow('"" is not 1 to 24 letters, digits, "_", or "-"');
    expect(() => itemId("fries?x=1")).toThrow('"fries?x=1" is not 1 to 24 letters, digits, "_", or "-"');
  });
});

describe("randomId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("maps each random byte to one of 64 symbols by its low 6 bits", () => {
    const bytes = [0, 1, 25, 26, 51, 52, 61, 62, 63, 64, 127, 255];
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => {
      array.set(bytes);
      return array;
    }) as typeof crypto.getRandomValues);
    expect(randomId(12)).toBe("ABZaz09_-A--");
  });

  test("returns 22 characters of the id alphabet and reaches all 64 symbols", () => {
    const ids = Array.from({ length: 2000 }, () => randomId(22));
    expect(ids.every((id) => /^[A-Za-z0-9_-]{22}$/.test(id))).toBe(true);
    expect(new Set(ids.join("")).size).toBe(64);
  });
});

describe("isMintedSplitId", () => {
  test("accepts 16 to 24 characters of the id alphabet, so a short or hand-picked id is not a minted one", () => {
    expect(isMintedSplitId("q7Xv0Lr9_aZ-3mKp")).toBe(true);
    expect(isMintedSplitId("q7Xv0Lr9_aZ-3mKpW2cN8dYt")).toBe(true);
    expect(isMintedSplitId("q7Xv0Lr9_aZ-3mK")).toBe(false);
    expect(isMintedSplitId("q7Xv0Lr9_aZ-3mKpW2cN8dYt5")).toBe(false);
    expect(isMintedSplitId("q7Xv0Lr9/aZ+3mKp")).toBe(false);
    expect(isMintedSplitId("a")).toBe(false);
  });
});

describe("serializedBytes", () => {
  test("counts UTF-8 bytes of the JSON, so an accented name costs more than its length", () => {
    expect(serializedBytes({ name: "Cafe" })).toBe(15);
    expect(serializedBytes({ name: "Café" })).toBe(16);
  });
});
