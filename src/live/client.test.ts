import { afterEach, expect, it, vi } from "vitest";
import type { CreateSplitRequest } from "../core/operations";
import { createSplitLink } from "./client";

const zone = process.env.TZ;

afterEach(() => {
  process.env.TZ = zone;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const request: CreateSplitRequest = JSON.parse(
  JSON.stringify({
    split: {
      receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
      participants: [{ id: "ann", name: "Ann" }],
      paymentHandles: [{ service: "venmo", handle: "ann-host" }],
    },
  }),
);

it.each([
  ["America/Los_Angeles", "2100-01-01T20:30:00Z", "Too many new splits today. Try again after 4:00 PM."],
  ["America/Los_Angeles", "2100-01-02T07:59:00Z", "Too many new splits today. Try again tomorrow after 4:00 PM."],
  ["Asia/Tokyo", "2100-01-01T02:00:00Z", "Too many new splits today. Try again tomorrow after 9:00 AM."],
  ["Asia/Tokyo", "2100-01-01T20:30:00Z", "Too many new splits today. Try again after 9:00 AM."],
])("a create refused by the daily cap in %s at %s says when, in the viewer's own clock, new splits open again", async (timeZone, now, reason) => {
  process.env.TZ = timeZone;
  vi.useFakeTimers({ now: Date.parse(now) });
  vi.stubGlobal("fetch", async () => Response.json({ refused: "dailyLimit" }, { status: 429 }));

  expect(await createSplitLink(request)).toEqual({ ok: false, reason });
});
