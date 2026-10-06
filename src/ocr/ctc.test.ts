import { describe, expect, test } from "vitest";
import { ctcDecode } from "../../public/ocr-worker.mjs";

const chars = ["", "$", "2", "8", ".", "0", "4"];

function scores(path: number[]): Float32Array {
  const out = new Float32Array(path.length * chars.length).fill(-5);
  path.forEach((best, step) => {
    out[step * chars.length + best] = 5;
  });
  return out;
}

describe("ctcDecode", () => {
  test("collapses repeated tokens and keeps a repeat that a blank separates", () => {
    const path = [0, 1, 1, 2, 0, 0, 3, 3, 0, 3, 4, 5, 5, 0, 6, 0];

    expect(ctcDecode(scores(path), path.length, chars.length, chars).text).toBe("$288.04");
  });

  test("reads one sequence out of a batch by its offset", () => {
    const first = [1, 2, 0, 2];
    const second = [0, 6, 6, 5];
    const batch = new Float32Array([...scores(first), ...scores(second)]);

    expect(ctcDecode(batch, 4, chars.length, chars, 4 * chars.length).text).toBe("40");
  });

  test("scores a reading by the mean probability of the characters it picked, leaving out blanks", () => {
    const steps = [
      [0.1, 0.9, 0, 0, 0, 0, 0],
      [0.8, 0.2, 0, 0, 0, 0, 0],
      [0, 0, 0.6, 0, 0, 0, 0.4],
    ];
    const { text, confidence } = ctcDecode(new Float32Array(steps.flat()), steps.length, chars.length, chars);

    expect(text).toBe("$2");
    expect(confidence).toBeCloseTo(0.75, 6);
  });
});
