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

  it("answers a siteverify reply with no success field with 403 and creates nothing", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => Response.json({ "error-codes": [] }));
    const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ refused: "turnstileFailed" });
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

  it("refuses an Item of 10,000,000 units with 400 within 250 ms, before the rate limit and Turnstile", async () => {
    const [fries, pitcher] = newSplit.receipt.items;
    const started = performance.now();
    const response = await postSplit({ turnstileToken: PASSING_TOKEN, split: { ...newSplit, receipt: { ...newSplit.receipt, items: [{ ...fries, quantity: 10_000_000 }, pitcher] } } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "split.receipt.items[0].quantity" } });
    expect(performance.now() - started).toBeLessThan(250);
    expect(siteverify).toEqual([]);
  });

  it("refuses a streamed body over the byte cap that declares no length", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ turnstileToken: PASSING_TOKEN, split: { ...newSplit, pad: "x".repeat(40 * 1024) } }),
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 4096) controller.enqueue(bytes.slice(offset, offset + 4096));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/splits", { method: "POST", headers: { "cf-connecting-ip": "198.51.100.250" }, body });
    expect(request.headers.get("content-length")).toBe(null);
    const response = await exports.default.fetch(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ refused: "bodyTooLarge" });
  });

  it("refuses an unknown top-level key and a Turnstile token over 2048 characters", async () => {
    const extra = await postSplit({ turnstileToken: PASSING_TOKEN, split: newSplit, note: "hi" });
    expect(extra.status).toBe(400);
    expect(await extra.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "note" } });
    const longToken = await postSplit({ turnstileToken: "t".repeat(2049), split: newSplit });
    expect(longToken.status).toBe(400);
    expect(await longToken.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "turnstileToken" } });
    const longest = await postSplit({ turnstileToken: "t".repeat(2048), split: newSplit });
    expect(longest.status).toBe(403);
    expect(siteverify.map(({ response }) => response?.length)).toEqual([2048]);
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

describe("the Turnstile deployment checks", () => {
  const STAND_IN_SECRET = "stand-in-for-a-production-secret";
  let nextHost = 1;

  function post(vars: Partial<Cloudflare.Env>, { ip = `203.0.113.${100 + nextHost++}` }: { ip?: string | null } = {}): Promise<Response> {
    const request = new Request("https://split.example/api/splits", {
      method: "POST",
      headers: ip === null ? {} : { "cf-connecting-ip": ip },
      body: JSON.stringify({ turnstileToken: PASSING_TOKEN, split: newSplit }),
    });
    return createSplit(request, { ...env, ...vars });
  }

  function answerHostname(hostname: string | undefined): void {
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => Response.json({ success: true, "error-codes": [], hostname }));
  }

  it("creates only when siteverify names a hostname in ALLOWED_HOSTNAMES", async () => {
    const deployed = { TURNSTILE_SECRET_KEY: STAND_IN_SECRET, ALLOWED_HOSTNAMES: "split.example, www.split.example" };
    const outcomes: [string | undefined, number, unknown][] = [];
    for (const hostname of ["www.split.example", "evil.example", undefined, "localhost"]) {
      answerHostname(hostname);
      const response = await post(deployed);
      outcomes.push([hostname, response.status, response.status === 201 ? "created" : await response.json()]);
    }
    expect(outcomes).toEqual([
      ["www.split.example", 201, "created"],
      ["evil.example", 403, { refused: "turnstileFailed" }],
      [undefined, 403, { refused: "turnstileFailed" }],
      ["localhost", 403, { refused: "turnstileFailed" }],
    ]);
  });

  it("allows only localhost and 127.0.0.1 when ALLOWED_HOSTNAMES is empty or unset", async () => {
    const statuses: number[] = [];
    for (const [allowed, hostname] of [[undefined, "localhost"], ["", "127.0.0.1"], [undefined, "split.example"], [" , ", "split.example"]]) {
      answerHostname(hostname);
      statuses.push((await post({ TURNSTILE_SECRET_KEY: STAND_IN_SECRET, ALLOWED_HOSTNAMES: allowed })).status);
    }
    expect(statuses).toEqual([201, 201, 403, 403]);
  });

  it("refuses a Cloudflare test secret with 503 when ALLOWED_HOSTNAMES names a public host, without calling siteverify", async () => {
    const refusals: [number, unknown][] = [];
    for (const secret of ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]) {
      const response = await post({ TURNSTILE_SECRET_KEY: secret, ALLOWED_HOSTNAMES: "localhost,split.example" });
      refusals.push([response.status, await response.json()]);
    }
    expect(refusals).toEqual([
      [503, { refused: "turnstileUnavailable" }],
      [503, { refused: "turnstileUnavailable" }],
      [503, { refused: "turnstileUnavailable" }],
    ]);
    expect(siteverify).toEqual([]);
  });

  it("accepts the test secret's example.com answer when only localhost is allowed", async () => {
    const response = await post({ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA", ALLOWED_HOSTNAMES: "localhost,127.0.0.1" });
    expect(response.status).toBe(201);
  });

  it("refuses a create with no client IP outside localhost, and buckets it on localhost", async () => {
    const deployed = await post({ TURNSTILE_SECRET_KEY: STAND_IN_SECRET, ALLOWED_HOSTNAMES: "split.example" }, { ip: null });
    expect([deployed.status, await deployed.json()]).toEqual([503, { refused: "turnstileUnavailable" }]);
    expect(siteverify).toEqual([]);

    const local = await post({}, { ip: null });
    expect(local.status).toBe(201);
    expect(siteverify.map(({ remoteip }) => remoteip)).toEqual([null]);
  });
});
