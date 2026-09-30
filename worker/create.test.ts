import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSplit } from "./create";
import { connect, newSplit, PASSING_TOKEN, postSplit, stubSiteverify, type Siteverify } from "./testing";

let siteverify: Siteverify[];

beforeEach(() => {
  vi.setSystemTime(Date.parse("2026-10-01T12:00:00Z"));
  siteverify = stubSiteverify();
});

describe("POST /api/splits", () => {
  it("creates a Split under a server-minted id and returns the creator secret once", async () => {
    const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: "203.0.113.5" });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { id, creatorSecret } = await response.json<{ id: string; creatorSecret: string }>();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(creatorSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(siteverify).toEqual([
      { secret: "1x0000000000000000000000000000000AA", response: PASSING_TOKEN, remoteip: "203.0.113.5" },
    ]);

    const client = await connect(id);
    const hello = await client.nextRaw();
    expect(JSON.parse(hello)).toMatchObject({ type: "state", ref: null, split: { id, revision: 0, participants: [{ id: "ann" }] } });
    expect(hello).not.toContain(creatorSecret);
  });

  it("answers a failed Turnstile token with 403 and creates nothing", async () => {
    const response = await postSplit({ turnstileToken: "failed-token", split: newSplit });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ refused: "turnstileFailed" });
    expect(siteverify.map(({ response: token }) => token)).toEqual(["failed-token"]);
  });

  it("answers the eleventh create from one IP within a minute with 429", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: "192.0.2.44" });
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get("retry-after")).toBe("60");
        expect(await response.json()).toEqual({ refused: "rateLimited" });
      }
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]);
    expect(siteverify).toHaveLength(10);

    const elsewhere = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: "192.0.2.45" });
    expect(elsewhere.status).toBe(201);
    vi.setSystemTime(Date.parse("2026-10-01T12:01:00Z"));
    const nextMinute = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: "192.0.2.44" });
    expect(nextMinute.status).toBe(201);
  });

  it("counts every IPv6 address in one /64 as one client", async () => {
    const statuses: number[] = [];
    for (let host = 1; host <= 11; host += 1) {
      const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: `2001:db8:5:6::${host}` });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("counts an IPv4-mapped IPv6 address as its IPv4 address", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: "192.0.2.77" });
    }
    const mapped = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit }, { ip: "::ffff:192.0.2.77" });
    expect(mapped.status).toBe(429);
  });

  it("refuses to create when the Turnstile secret is not configured", async () => {
    const request = new Request("http://localhost/api/splits", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.200" },
      body: JSON.stringify({ turnstileToken: PASSING_TOKEN, split: newSplit }),
    });
    const response = await createSplit(request, { ...env, TURNSTILE_SECRET_KEY: undefined });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ refused: "turnstileUnavailable" });
    expect(siteverify).toEqual([]);
  });

  it("refuses an id in the body, because the server mints it", async () => {
    const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: { ...newSplit, id: "chosen-by-client-0001" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "split.id" } });
    expect(siteverify).toEqual([]);
  });

  it("refuses a Receipt that fails the Total check", async () => {
    const response = await postSplit({
      turnstileToken: PASSING_TOKEN,
      split: { ...newSplit, receipt: { ...newSplit.receipt, total: 9999 } },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ refused: "rejected", rejection: { reason: "totalCheckFailed" } });
  });

  it("refuses a body over the byte cap before parsing it", async () => {
    const parse = vi.spyOn(JSON, "parse");
    const body = `{"turnstileToken":"${PASSING_TOKEN}","split":${"[".repeat(37 * 1024)}`;
    const response = await postSplit(body);
    const parsedBody = parse.mock.calls.some(([text]) => text === body);
    parse.mockRestore();

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ refused: "bodyTooLarge" });
    expect(parsedBody).toBe(false);
    expect(siteverify).toEqual([]);
  });

  it("answers 503 when siteverify cannot be reached", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError("network down"));
    const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ refused: "turnstileUnavailable" });
  });

  it("answers anything but POST with 405", async () => {
    const response = await exports.default.fetch("http://localhost/api/splits");
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
