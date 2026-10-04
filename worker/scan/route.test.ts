import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { T0 } from "../testing";
import { SCAN_DAILY_CAP_NAME, scanReceipt } from "./route";

const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = "https://app.example";
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ";

const PASSING = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";
const SHORT = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|500\nt|Tax|100";

type Call = { readonly model: string; readonly hosts: readonly string[]; readonly ignore: readonly string[]; readonly allowFallbacks: boolean };
type Answer = (call: Call, signal: AbortSignal) => Response | Promise<Response>;

const completion = (content: string, provider = "Parasail") =>
  Response.json({ choices: [{ message: { content } }], provider, usage: { prompt_tokens: 1200, completion_tokens: 90, cost: 0.0004 } });

const hang: Answer = (_, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

/** Answers OpenRouter in turn and records what each call asked for. */
function stubOpenRouter(...answers: Answer[]): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "https://openrouter.ai/api/v1/chat/completions") throw new Error(`unexpected fetch of ${String(input)}`);
    const body = JSON.parse(String(init?.body));
    const call: Call = { model: body.model, hosts: body.provider.order, ignore: body.provider.ignore, allowFallbacks: body.provider.allow_fallbacks };
    calls.push(call);
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error(`no answer for call ${calls.length}`);
    return answer(call, init!.signal!);
  });
  return calls;
}

let nextAddress = 1;

function scanRequest({ ip = `198.51.100.${nextAddress++}`, origin = ORIGIN, body = { photo: PHOTO, ocrLines: ["BURGER  9.00"] } as unknown } = {}) {
  return new Request(`${ORIGIN}/api/scan`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip, origin },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const scan = (request = scanRequest(), vars: Partial<Cloudflare.Env> = {}) =>
  scanReceipt(request, { ...env, OPENROUTER_API_KEY: "test-key", SCAN_PASS1_TIMEOUT_MS: "200", ...vars });

const seedScansToday = (count: number) =>
  runInDurableObject(env.CreateLimiter.getByName(SCAN_DAILY_CAP_NAME), (_, state) => state.storage.put("tally", { day: Math.floor(Date.now() / DAY), count }));

beforeEach(() => {
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/scan refusals", () => {
  it("refuses another origin with 403 through the Worker", async () => {
    const calls = stubOpenRouter();
    const response = await exports.default.fetch("http://localhost/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.200", origin: "https://evil.example" },
      body: JSON.stringify({ photo: PHOTO, ocrLines: [] }),
    });
    expect([response.status, await response.json(), response.headers.get("x-content-type-options"), calls.length]).toEqual([403, { refused: "origin" }, "nosniff", 0]);
  });

  it("refuses a request with no origin with 403", async () => {
    const request = new Request(`${ORIGIN}/api/scan`, { method: "POST", headers: { "cf-connecting-ip": "198.51.100.201" }, body: "{}" });
    expect((await scan(request)).status).toBe(403);
  });

  it("refuses a body over 1 MiB with 413", async () => {
    const response = await scan(scanRequest({ body: { photo: PHOTO + "A".repeat(1024 * 1024), ocrLines: [] } }));
    expect([response.status, await response.json()]).toEqual([413, { refused: "bodyTooLarge" }]);
  });

  it("refuses a photo that is not a JPEG data URL with 400", async () => {
    const statuses = await Promise.all(
      [{ photo: "data:image/png;base64,iVBORw0KGgo", ocrLines: [] }, { photo: "https://example.com/r.jpg", ocrLines: [] }, { photo: PHOTO }, "not json"].map(async (body) =>
        (await scan(scanRequest({ body }))).status,
      ),
    );
    expect(statuses).toEqual([400, 400, 400, 400]);
  });

  it("answers 503 and calls no model when the key is not set", async () => {
    const calls = stubOpenRouter();
    const response = await scan(scanRequest(), { OPENROUTER_API_KEY: "" });
    expect([response.status, calls.length]).toEqual([503, 0]);
  });
});

describe("scan limits", () => {
  it("refuses the seventh scan from one address in a minute with 429 and retry-after", async () => {
    vi.setSystemTime(T0 + DAY);
    stubOpenRouter(...Array.from({ length: 6 }, () => () => completion(PASSING)));
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) statuses.push((await scan(scanRequest({ ip: "203.0.113.7" }))).status);
    const refused = await scan(scanRequest({ ip: "203.0.113.7" }));
    expect([...statuses, refused.status, refused.headers.get("retry-after"), await refused.json()]).toEqual([200, 200, 200, 200, 200, 200, 429, "60", { refused: "rateLimited" }]);
  });

  it("refuses an address past its daily scans until the next UTC midnight", async () => {
    vi.setSystemTime(T0 + 2 * DAY);
    stubOpenRouter(...Array.from({ length: 3 }, () => () => completion(PASSING)));
    for (let minute = 0; minute < 3; minute += 1) {
      vi.setSystemTime(T0 + 2 * DAY + minute * 60_000);
      expect((await scan(scanRequest({ ip: "203.0.113.8" }), { SCAN_PER_DAY: "3" })).status).toBe(200);
    }
    vi.setSystemTime(T0 + 2 * DAY + 5 * 60_000);
    const refused = await scan(scanRequest({ ip: "203.0.113.8" }), { SCAN_PER_DAY: "3" });
    expect([refused.status, refused.headers.get("retry-after"), await refused.json()]).toEqual([429, String(12 * 60 * 60 - 5 * 60), { refused: "dailyLimit" }]);
  });

  it("refuses every address once the day's scan cap is used, apart from the create cap", async () => {
    vi.setSystemTime(T0 + 3 * DAY);
    await seedScansToday(1999);
    stubOpenRouter(() => completion(PASSING));
    expect((await scan()).status).toBe(200);
    const refused = await scan();
    expect([refused.status, await refused.json()]).toEqual([429, { refused: "dailyLimit" }]);
  });
});

describe("reading", () => {
  it("returns the reading with a passing check after one pass on the first pinned host, never routing to openai/flex", async () => {
    const calls = stubOpenRouter(() => completion(PASSING));
    const response = await scan();
    expect([response.status, response.headers.get("x-scan-passes"), response.headers.get("x-scan-cost"), await response.json()]).toEqual([
      200,
      "1",
      "0.000400",
      {
        items: [
          { name: "Burger", price: 800, quantity: null, details: [], discounts: [{ name: "Promo", amount: -100 }] },
          { name: "Fries", price: 600, quantity: null, details: [], discounts: [] },
        ],
        bundles: [],
        adjustments: [{ kind: "tax", name: "Tax", amount: 100 }],
        subtotal: { amount: 1400, beforeDiscounts: false },
        total: 1500,
        check: { passed: true, gaps: { subtotal: 0, total: 0 } },
      },
    ]);
    expect(calls).toEqual([{ model: "z-ai/glm-5.3-flash", hosts: ["parasail"], ignore: ["openai/flex"], allowFallbacks: false }]);
  });

  it("retries pass 1 on the second host when the first runs past its limit", async () => {
    const calls = stubOpenRouter(hang, () => completion(PASSING));
    const response = await scan(scanRequest(), { SCAN_PASS1_HOSTS: "parasail,baseten", SCAN_PASS1_TIMEOUT_MS: "50" });
    expect([response.status, calls.map((call) => call.hosts)]).toEqual([200, [["parasail"], ["baseten"]]]);
  });

  it("retries pass 1 on the second host when the first returns an empty reply", async () => {
    const calls = stubOpenRouter(() => completion(""), () => completion(PASSING));
    const response = await scan(scanRequest(), { SCAN_PASS1_HOSTS: "parasail,baseten" });
    expect([response.status, calls.map((call) => call.hosts)]).toEqual([200, [["parasail"], ["baseten"]]]);
  });

  it("runs pass 2 on its hosts only when pass 1 fails the check, and keeps its edits", async () => {
    const calls = stubOpenRouter(() => completion(SHORT), () => completion("fix|5|i|Fries|600", "Azure"));
    const response = await scan();
    const reply = await response.json<{ items: { price: number }[]; check: unknown }>();
    expect([response.status, response.headers.get("x-scan-passes"), reply.items.map((item) => item.price), reply.check]).toEqual([
      200,
      "2",
      [800, 600],
      { passed: true, gaps: { subtotal: 0, total: 0 } },
    ]);
    expect(calls.map(({ model, hosts }) => [model, hosts])).toEqual([
      ["z-ai/glm-5.3-flash", ["parasail"]],
      ["openai/gpt-6-luna", ["azure", "openai"]],
    ]);
  });

  it("returns a reading that still fails the check as a 200 when pass 2 does not fix it", async () => {
    stubOpenRouter(() => completion(SHORT), () => completion("ok"));
    const response = await scan();
    expect([response.status, (await response.json<{ check: unknown }>()).check]).toEqual([
      200,
      { passed: false, gaps: { subtotal: 100, total: 100 }, problems: ["non-tax lines sum to $13.00 but the printed subtotal is $14.00 (short by $1.00)", "all lines sum to $14.00 but the printed total is $15.00 (short by $1.00)"] },
    ]);
  });

  it("keeps pass 1's reading when pass 2's edits leave more problems", async () => {
    stubOpenRouter(() => completion(SHORT), () => completion("drop|5\nadd|b|Ghost"));
    const reply = await (await scan()).json<{ items: { name: string }[]; check: { problems: string[] } }>();
    expect([reply.items.map((item) => item.name), reply.check.problems.length]).toEqual([["Burger", "Fries"], 2]);
  });

  it("answers 502 when no pass returns a usable reading", async () => {
    const calls = stubOpenRouter(() => completion(""), () => new Response("busy", { status: 503 }), () => completion("I cannot read this receipt."));
    const response = await scan(scanRequest(), { SCAN_PASS1_HOSTS: "parasail,baseten" });
    expect([response.status, await response.json(), calls.length]).toEqual([502, { refused: "unreadable" }, 3]);
  });
});
