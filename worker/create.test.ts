import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_CAP_NAME } from "./rate-limit";
import { connect, newSplit, postSplit, T0 } from "./testing";

beforeEach(() => {
  vi.setSystemTime(T0);
});

describe("POST /api/splits", () => {
  it("creates a Split under a server-minted id and returns the creator secret once", async () => {
    const response = await postSplit({ split: newSplit }, { ip: "203.0.113.5" });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { id, creatorSecret } = await response.json<{ id: string; creatorSecret: string }>();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(creatorSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const client = await connect(id);
    const hello = await client.nextRaw();
    expect(JSON.parse(hello)).toMatchObject({ type: "state", ref: null, split: { id, revision: 0, participants: [{ id: "ann" }] } });
    expect(hello).not.toContain(creatorSecret);
  });

  it("answers the eleventh create from one IP within a minute with 429", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await postSplit({ split: newSplit }, { ip: "192.0.2.44" });
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get("retry-after")).toBe("60");
        expect(await response.json()).toEqual({ refused: "rateLimited" });
      }
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]);

    const elsewhere = await postSplit({ split: newSplit }, { ip: "192.0.2.45" });
    expect(elsewhere.status).toBe(201);
    vi.setSystemTime(T0 + 60_000);
    const nextMinute = await postSplit({ split: newSplit }, { ip: "192.0.2.44" });
    expect(nextMinute.status).toBe(201);
  });

  it("keeps counting creates from one IP after its limiter is evicted", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await postSplit({ split: newSplit }, { ip: "192.0.2.90" })).status).toBe(201);
    }
    await evictDurableObject(env.CreateLimiter.getByName("192.0.2.90"));
    const eleventh = await postSplit({ split: newSplit }, { ip: "192.0.2.90" });
    expect([eleventh.status, eleventh.headers.get("retry-after")]).toEqual([429, "60"]);
  });

  it("forgets an IP's creates once a minute has passed since the last one", async () => {
    const limiter = env.CreateLimiter.getByName("192.0.2.91");
    const stored = () => runInDurableObject(limiter, async (_, state) => ({ keys: [...(await state.storage.list()).keys()], alarm: await state.storage.getAlarm() }));
    await postSplit({ split: newSplit }, { ip: "192.0.2.91" });
    vi.setSystemTime(T0 + 30_000);
    await postSplit({ split: newSplit }, { ip: "192.0.2.91" });

    vi.setSystemTime(T0 + 60_000);
    expect(await runDurableObjectAlarm(limiter)).toBe(true);
    expect((await stored()).alarm).toBe(T0 + 90_000);

    vi.setSystemTime(T0 + 90_000);
    expect(await runDurableObjectAlarm(limiter)).toBe(true);
    expect(await stored()).toEqual({ keys: [], alarm: null });
  });

  it("counts every IPv6 address in one /64 as one client", async () => {
    const statuses: number[] = [];
    for (let host = 1; host <= 11; host += 1) {
      const response = await postSplit({ split: newSplit }, { ip: `2001:db8:5:6::${host}` });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("counts an IPv4-mapped IPv6 address as its IPv4 address", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await postSplit({ split: newSplit }, { ip: "192.0.2.77" });
    }
    const mapped = await postSplit({ split: newSplit }, { ip: "::ffff:192.0.2.77" });
    expect(mapped.status).toBe(429);
  });

  it("refuses with 503 a create that carries no client IP, on any host, because it cannot be rate limited", async () => {
    const refusals: [number, unknown][] = [];
    for (const origin of ["https://split.example", "http://localhost:8787"]) {
      const response = await exports.default.fetch(`${origin}/api/splits`, { method: "POST", body: JSON.stringify({ split: newSplit }) });
      refusals.push([response.status, await response.json()]);
    }
    expect(refusals).toEqual([
      [503, { refused: "unavailable" }],
      [503, { refused: "unavailable" }],
    ]);
  });

  it("refuses an id in the body, because the server mints it", async () => {
    const response = await postSplit({ split: { ...newSplit, id: "chosen-by-client-0001" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "split.id" } });
  });

  it("creates a Split whose Receipt fails the Total check, and serves it with the total as typed", async () => {
    const response = await postSplit({
      split: { ...newSplit, receipt: { ...newSplit.receipt, total: 9999 } },
    });
    expect(response.status).toBe(201);
    const { id } = await response.json<{ id: string }>();
    const client = await connect(id);
    expect(await client.next()).toMatchObject({ type: "state", split: { id, receipt: { total: 9999 } } });
  });

  it("refuses an Item of 10,000,000 units with 400 within 250 ms, before the rate limit", async () => {
    const [fries, pitcher] = newSplit.receipt.items;
    const started = performance.now();
    const response = await postSplit({ split: { ...newSplit, receipt: { ...newSplit.receipt, items: [{ ...fries, quantity: 10_000_000 }, pitcher] } } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "split.receipt.items[0].quantity" } });
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("refuses a streamed body over the byte cap that declares no length", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ split: { ...newSplit, pad: "x".repeat(40 * 1024) } }),
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

  it("refuses an unknown top-level key", async () => {
    const response = await postSplit({ split: newSplit, note: "hi" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ refused: "rejected", rejection: { reason: "malformed", path: "note" } });
  });

  it("refuses a body over the byte cap before parsing it", async () => {
    const parse = vi.spyOn(JSON, "parse");
    const body = `{"split":${"[".repeat(37 * 1024)}`;
    const response = await postSplit(body);
    const parsedBody = parse.mock.calls.some(([text]) => text === body);
    parse.mockRestore();

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ refused: "bodyTooLarge" });
    expect(parsedBody).toBe(false);
  });

  it("answers anything but POST with 405", async () => {
    const response = await exports.default.fetch("http://localhost/api/splits");
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});

describe("the daily create cap", { timeout: 15_000 }, () => {
  const DAY = 24 * 60 * 60 * 1000;
  const cap = () => env.CreateLimiter.getByName(DAILY_CAP_NAME);
  let nextHost = 0;

  async function createFromNewAddresses(count: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let made = 0; made < count; made += 1) {
      nextHost += 1;
      statuses.push((await postSplit({ split: newSplit }, { ip: `10.${nextHost >> 16}.${(nextHost >> 8) & 255}.${nextHost & 255}` })).status);
    }
    return statuses;
  }

  /** Writes the count the cap stores after `count` creates today, so a test need not make them one by one. */
  const seedTodaysCount = (count: number) =>
    runInDurableObject(cap(), (_, state) => state.storage.put("tally", { day: Math.floor(Date.now() / DAY), count }));

  const tally = () =>
    runInDurableObject(cap(), async (_, state) => ({ tally: await state.storage.get<{ day: number; count: number }>("tally"), alarm: await state.storage.getAlarm() }));

  const todaysCount = async () => {
    const { tally: stored } = await tally();
    return stored?.day === Math.floor(Date.now() / DAY) ? stored.count : 0;
  };

  const ipState = (ip: string) =>
    runInDurableObject(env.CreateLimiter.getByName(ip), async (_, state) => ({ times: await state.storage.get<number[]>("times"), alarm: await state.storage.getAlarm() }));

  it("refuses the next create once 1,000 Splits were made in one UTC day, until the next UTC midnight, and leaves existing Splits working", async () => {
    vi.setSystemTime(T0 + 2 * DAY);
    const { id } = await postSplit({ split: newSplit }).then((response) => response.json<{ id: string }>());
    await seedTodaysCount(999);

    expect((await createFromNewAddresses(1))).toEqual([201]);
    const refused = await postSplit({ split: newSplit }, { ip: "192.0.2.150" });
    expect([refused.status, refused.headers.get("retry-after"), await refused.json()]).toEqual([429, String(12 * 60 * 60), { refused: "dailyLimit" }]);
    const unwritten = await runInDurableObject(env.CreateLimiter.getByName("192.0.2.150"), async (_, state) => ({ keys: [...(await state.storage.list()).keys()], alarm: await state.storage.getAlarm() }));
    expect(unwritten).toEqual({ keys: [], alarm: null });
    const client = await connect(id);
    expect(await client.next()).toMatchObject({ type: "state", split: { id, participants: [{ id: "ann" }] } });
  });

  it("keeps the day's count after the cap's Durable Object is evicted", async () => {
    vi.setSystemTime(T0 + 3 * DAY);
    await seedTodaysCount(999);
    await evictDurableObject(cap());
    expect(await createFromNewAddresses(1)).toEqual([201]);
    await evictDurableObject(cap());
    expect((await postSplit({ split: newSplit })).status).toBe(429);
  });

  it("starts a new count at the next UTC midnight and clears the old day's count", async () => {
    vi.setSystemTime(T0 + 4 * DAY);
    await seedTodaysCount(999);
    expect(await createFromNewAddresses(1)).toEqual([201]);
    expect((await postSplit({ split: newSplit })).status).toBe(429);

    vi.setSystemTime(T0 + 4 * DAY + 12 * 60 * 60 * 1000);
    expect(await runDurableObjectAlarm(cap())).toBe(true);
    expect(await runInDurableObject(cap(), async (_, state) => [...(await state.storage.list()).keys()])).toEqual([]);
    expect((await postSplit({ split: newSplit })).status).toBe(201);
  });

  it("keeps the new day's count when the old day's alarm runs after the new day's first create", async () => {
    vi.setSystemTime(T0 + 5 * DAY);
    await createFromNewAddresses(1);
    vi.setSystemTime(T0 + 5 * DAY + 13 * 60 * 60 * 1000);
    await createFromNewAddresses(1);

    expect(await runDurableObjectAlarm(cap())).toBe(true);
    expect(await tally()).toEqual({ tally: { day: (T0 + 6 * DAY - 12 * 60 * 60 * 1000) / DAY, count: 1 }, alarm: T0 + 6 * DAY + 12 * 60 * 60 * 1000 });
  });

  it("does not count a create that is invalid, oversized, missing its IP, or refused by the per-IP limit", async () => {
    vi.setSystemTime(T0 + 10 * DAY);
    const before = await todaysCount();
    const ip = "192.0.2.222";
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect((await postSplit({ split: { ...newSplit, receipt: { ...newSplit.receipt, total: -1 } } }, { ip })).status).toBe(400);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await postSplit("not json", { ip })).status).toBe(400);
      expect((await postSplit({ split: { ...newSplit, pad: "x".repeat(40 * 1024) } }, { ip })).status).toBe(413);
      expect((await exports.default.fetch("https://x.example/api/splits", { method: "POST", body: JSON.stringify({ split: newSplit }) })).status).toBe(503);
    }
    expect(await todaysCount()).toBe(before);
    expect(await ipState(ip)).toEqual({ times: undefined, alarm: null });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 50; attempt += 1) statuses.push((await postSplit({ split: newSplit }, { ip })).status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(40);
    expect(await todaysCount()).toBe(before + 10);

    const sameSixtyFour: number[] = [];
    for (let host = 1; host <= 30; host += 1) sameSixtyFour.push((await postSplit({ split: newSplit }, { ip: `2001:db8:aa:bb::${host}` })).status);
    expect(sameSixtyFour.filter((status) => status === 201)).toHaveLength(10);
    expect(await todaysCount()).toBe(before + 20);
  });

  it("answers dailyLimit before rateLimited, and a refusal at the cap changes no count and no IP's state", async () => {
    vi.setSystemTime(T0 + 20 * DAY);
    await seedTodaysCount(990);
    const ip = "192.0.2.233";
    const other = "192.0.2.234";
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await postSplit({ split: newSplit }, { ip })).status).toBe(201);

    const refusals = async () => {
      const statuses: [number, unknown][] = [];
      for (const address of [ip, other]) {
        const response = await postSplit({ split: newSplit }, { ip: address });
        statuses.push([response.status, await response.json()]);
      }
      return statuses;
    };
    const dailyLimit: [number, unknown] = [429, { refused: "dailyLimit" }];
    const atCap = await tally();
    const ipAtCap = await ipState(ip);
    expect(atCap.tally?.count).toBe(1000);
    expect(await refusals()).toEqual([dailyLimit, dailyLimit]);

    vi.setSystemTime(T0 + 20 * DAY + 60_000);
    expect(await refusals()).toEqual([dailyLimit, dailyLimit]);
    expect(await tally()).toEqual(atCap);
    expect(await ipState(ip)).toEqual(ipAtCap);
    expect(await ipState(other)).toEqual({ times: undefined, alarm: null });
  });

  it("switches to the new count exactly at UTC midnight, and a late alarm keeps it", async () => {
    const midnight = Math.ceil((T0 + 30 * DAY) / DAY) * DAY;
    vi.setSystemTime(midnight - 1);
    await runDurableObjectAlarm(cap());
    expect((await postSplit({ split: newSplit })).status).toBe(201);
    expect((await tally()).tally).toEqual({ day: midnight / DAY - 1, count: 1 });

    vi.setSystemTime(midnight);
    expect((await postSplit({ split: newSplit })).status).toBe(201);
    expect((await tally()).tally).toEqual({ day: midnight / DAY, count: 1 });
    expect((await tally()).alarm).toBe(midnight);

    vi.setSystemTime(midnight + 5000);
    expect(await runDurableObjectAlarm(cap())).toBe(true);
    expect(await tally()).toEqual({ tally: { day: midnight / DAY, count: 1 }, alarm: midnight + DAY });
  });
});
