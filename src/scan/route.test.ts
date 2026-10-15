import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chooseRoute } from "./route";

const never = new Promise<never>(() => {});

describe("chooseRoute", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chooses ocr when the engine is ready before the wait ends", async () => {
    const route = chooseRoute(Promise.resolve(), never, 5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(await route).toBe("ocr");
  });

  it("chooses photo when 5 s pass with no engine, and not before", async () => {
    let chosen: string | undefined;
    void chooseRoute(never, never, 5000).then((route) => (chosen = route));
    await vi.advanceTimersByTimeAsync(4999);
    expect(chosen).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(chosen).toBe("photo");
  });

  it("chooses photo at once when the OCR run fails before the engine is ready", async () => {
    expect(await chooseRoute(never, Promise.resolve(null), 5000)).toBe("photo");
  });

  it("keeps ocr when the engine was ready first and the run then fails", async () => {
    let fail = () => {};
    const ocr = new Promise<null>((resolve) => (fail = () => resolve(null)));
    const route = chooseRoute(Promise.resolve(), ocr, 5000);
    await vi.advanceTimersByTimeAsync(0);
    fail();
    expect(await route).toBe("ocr");
  });
});
