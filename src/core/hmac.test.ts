import { describe, expect, test } from "vitest";
import { hmacSha256 } from "./hmac";

const bytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
const hex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const text = (value: string) => new TextEncoder().encode(value);

describe("hmacSha256 matches RFC 4231", () => {
  test("case 1: a 20-byte key", () => {
    expect(hex(hmacSha256(bytes("0b".repeat(20)), text("Hi There")))).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  test("case 2: a key shorter than the block", () => {
    expect(hex(hmacSha256(text("Jefe"), text("what do ya want for nothing?")))).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  test("case 6: a 131-byte key, longer than the block", () => {
    expect(hex(hmacSha256(bytes("aa".repeat(131)), text("Test Using Larger Than Block-Size Key - Hash Key First")))).toBe(
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    );
  });

  test("case 7: a long message over several blocks", () => {
    const message = "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.";
    expect(hex(hmacSha256(bytes("aa".repeat(131)), text(message)))).toBe("9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2");
  });
});
