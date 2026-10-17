import { afterEach, expect, it, vi } from "vitest";
import type { CreateSplitRequest } from "../core/operations";
import { isRoutableSplitId } from "../core/split";
import { receiptJpeg } from "../ui/receipt-input/jpeg";
import { createSplitLink, sendPhoto } from "./client";

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

it("a create whose request never reaches the server says it is the connection", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("Failed to fetch");
  });

  expect(await createSplitLink(request)).toEqual({ ok: false, reason: "Offline. Couldn't create the link." });
});

const photo = receiptJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]))!;
const id = "abcdefghjkmnpqrstuvwxy";

it.each([
  ["stores on the first PUT", [204], "stored", 1],
  ["retries once after a server error", [503, 204], "stored", 2],
  ["retries once after a network error, and no more", ["network", "network"], "failed", 2],
  ["gives up at once on a refusal", [403], "refused", 1],
  ["gives up after a refused retry", [500, 429], "refused", 2],
] as const)("the receipt photo upload %s", async (_, answers, outcome, puts) => {
  const sent: { url: string; method?: string; type: string | null; authorization: string | null; bytes: number }[] = [];
  const queue: (number | "network")[] = [...answers];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    sent.push({ url, method: init.method, type: headers.get("content-type"), authorization: headers.get("authorization"), bytes: (init.body as Blob).size });
    const answer = queue.shift();
    if (answer === "network") throw new TypeError("Failed to fetch");
    return new Response(null, { status: answer });
  });
  if (!isRoutableSplitId(id)) throw new Error("test id is not routable");

  expect(await sendPhoto(id, "creator-secret", photo)).toBe(outcome);
  expect(sent).toEqual(
    Array.from({ length: puts }, () => ({ url: `/api/splits/${id}/photo`, method: "PUT", type: "image/jpeg", authorization: "Bearer creator-secret", bytes: 9 })),
  );
});
