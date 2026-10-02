import { afterEach, expect, it, vi } from "vitest";
import { createSplitLink } from "./client";

const zone = process.env.TZ;

afterEach(() => {
  process.env.TZ = zone;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("a create refused by the daily cap says when, in the viewer's own clock, new splits open again", async () => {
  process.env.TZ = "America/Los_Angeles";
  vi.useFakeTimers({ now: Date.parse("2100-01-01T20:30:00Z") });
  vi.stubGlobal("fetch", async () =>
    Response.json({ refused: "dailyLimit" }, { status: 429, headers: { "retry-after": String(3.5 * 60 * 60) } }),
  );

  const created = await createSplitLink({ split: { receipt: { items: [], adjustments: [], subtotal: 0, total: 0 }, participants: [], paymentHandles: [] } } as never);

  expect(created).toEqual({ ok: false, reason: "Too many new splits today. Try again after 4:00 PM." });
});
