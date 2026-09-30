import { describe, expect, test } from "vitest";
import { itemId, participantId, serializedBytes } from "./split";

describe("ids", () => {
  test("accept 1 to 24 letters, digits, underscores, and hyphens, and nothing else", () => {
    expect(participantId("a".repeat(24))).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(itemId("fries_2-large")).toBe("fries_2-large");
    expect(() => participantId("a".repeat(25))).toThrow('"aaaaaaaaaaaaaaaaaaaaaaaaa" is not 1 to 24 letters, digits, "_", or "-"');
    expect(() => itemId("")).toThrow('"" is not 1 to 24 letters, digits, "_", or "-"');
    expect(() => itemId("fries?x=1")).toThrow('"fries?x=1" is not 1 to 24 letters, digits, "_", or "-"');
  });
});

describe("serializedBytes", () => {
  test("counts UTF-8 bytes of the JSON, so an accented name costs more than its length", () => {
    expect(serializedBytes({ name: "Cafe" })).toBe(15);
    expect(serializedBytes({ name: "Café" })).toBe(16);
  });
});
