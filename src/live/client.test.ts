import { afterEach, expect, it, vi } from "vitest";
import type { CreateSplitRequest } from "../core/operations";
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
  vi.stubGlobal("fetch", async () => Response.json({ refused: "dailyLimit" }, { status: 429 }));

  const request: CreateSplitRequest = JSON.parse(
    JSON.stringify({
      split: {
        receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
        participants: [{ id: "ann", name: "Ann" }],
        paymentHandles: [{ service: "venmo", handle: "ann-host" }],
      },
    }),
  );

  const created = await createSplitLink(request);

  expect(created).toEqual({ ok: false, reason: "Too many new splits today. Try again after 4:00 PM." });
});
