import { afterEach, describe, expect, test, vi } from "vitest";

import { animateSpring, project, rubberband, snapTarget } from "./sheet-motion";

describe("snapTarget", () => {
  test("lands where the momentum projects, not where the finger let go", () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect({
      slowPastHalf: snapTarget(70, 0, 120),
      slowShortOfHalf: snapTarget(50, 0, 120),
      flickUpFromLow: snapTarget(90, -400, 120),
      flickDownFromHigh: snapTarget(20, 400, 120),
    }).toEqual({ slowPastHalf: 1, slowShortOfHalf: 0, flickUpFromLow: 0, flickDownFromHigh: 1 });
  });
});

test("rubberband gives less travel the further past the edge the drag goes", () => {
  expect([rubberband(10, 120), rubberband(100, 120), rubberband(-100, 120)].map(Math.round)).toEqual([5, 38, -38]);
});

describe("animateSpring", () => {
  afterEach(() => vi.unstubAllGlobals());

  function frames(times: number[]) {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    return () => {
      for (const time of times) queue.shift()?.(time);
    };
  }

  test("settles on its target and reports done, even when the first frame is stamped before the spring started", () => {
    vi.stubGlobal("performance", { now: () => 1000 });
    const run = frames([990, ...Array.from({ length: 200 }, (_, i) => 1006 + i * 16)]);
    const values: number[] = [];
    let done = false;
    animateSpring(120, 0, -600, (value) => values.push(value), () => (done = true));
    run();
    expect(done).toBe(true);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(values.at(-1)).toBe(0);
    expect(Math.min(...values)).toBeGreaterThan(-12);
  });

  test("paints its first step on the call, so the frame that changes the sheet already shows it moving", () => {
    vi.stubGlobal("performance", { now: () => 1000 });
    frames([]);
    const values: number[] = [];
    animateSpring(0, 300, 0, (value) => values.push(value), () => {});
    expect(values).toHaveLength(1);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(300);
  });
});
