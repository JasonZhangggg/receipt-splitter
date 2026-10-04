import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { T0 } from "../testing";
import { JPEG_2560_WIDE, JPEG_2561_TALL, JPEG_TWO_FRAME_HEADERS, SMALL_JPEG } from "./jpeg-fixtures";
import { SCAN_DAILY_CAP_NAME, scanReceipt } from "./route";

const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = "https://app.example";
const PHOTO = SMALL_JPEG;

const PASSING = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";
const SHORT = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|500\nt|Tax|100";

type Call = {
  readonly model: string;
  readonly hosts: readonly string[];
  readonly ignore: readonly string[];
  readonly allowFallbacks: boolean;
  readonly maxTokens: number;
  readonly prompt: string;
};
type Answer = (call: Call, signal: AbortSignal) => Response | Promise<Response>;

const completion = (content: string, provider = "Parasail", usage: object = { prompt_tokens: 1200, completion_tokens: 90, cost: 0.0004 }) =>
  Response.json({ choices: [{ message: { content } }], provider, usage });

const hang: Answer = (_, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

/** Answers OpenRouter in turn and records what each call asked for. */
function stubOpenRouter(...answers: Answer[]): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "https://openrouter.ai/api/v1/chat/completions") throw new Error(`unexpected fetch of ${String(input)}`);
    const body = JSON.parse(String(init?.body));
    const call: Call = {
      model: body.model,
      hosts: body.provider.order,
      ignore: body.provider.ignore,
      allowFallbacks: body.provider.allow_fallbacks,
      maxTokens: body.max_tokens,
      prompt: body.messages[0].content[0].text,
    };
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
  scanReceipt(request, { ...env, OPENROUTER_API_KEY: "test-key", SCAN_PASS1_TIMEOUT_MS: "200", SCAN_DEBUG_HEADERS: "true", ...vars });

const seedScansToday = (count: number, spentUsd?: number) =>
  runInDurableObject(env.CreateLimiter.getByName(SCAN_DAILY_CAP_NAME), (_, state) => state.storage.put("tally", { day: Math.floor(Date.now() / DAY), count, spentUsd }));

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

  it("refuses OCR text over 8,000 characters in all with 400 and calls no model, and accepts exactly 8,000", async () => {
    const calls = stubOpenRouter(() => completion(PASSING));
    const lines = (count: number, length: number) => Array.from({ length: count }, () => "A".repeat(length));
    const over = await scan(scanRequest({ body: { photo: PHOTO, ocrLines: [...lines(26, 300), "A".repeat(201)] } }));
    expect([over.status, await over.json(), calls.length]).toEqual([400, { refused: "rejected" }, 0]);
    const exact = await scan(scanRequest({ body: { photo: PHOTO, ocrLines: [...lines(26, 300), "A".repeat(200)] } }));
    expect([exact.status, calls.length]).toEqual([200, 1]);
  });

  it("reads the JPEG frame header and refuses a photo whose longest side is over 2,560 px with 400, calling no model", async () => {
    const calls = stubOpenRouter(() => completion(PASSING));
    const atLimit = await scan(scanRequest({ body: { photo: JPEG_2560_WIDE, ocrLines: [] } }));
    const over = await scan(scanRequest({ body: { photo: JPEG_2561_TALL, ocrLines: [] } }));
    const notJpeg = await scan(scanRequest({ body: { photo: "data:image/jpeg;base64,iVBORw0KGgoAAAA", ocrLines: [] } }));
    expect([atLimit.status, over.status, await over.json(), notJpeg.status, calls.length]).toEqual([200, 400, { refused: "rejected" }, 400, 1]);
  });

  it("refuses a JPEG with a second frame header with 400, so the size the Worker reads is the size a decoder sees", async () => {
    const calls = stubOpenRouter(() => completion(PASSING));
    const response = await scan(scanRequest({ body: { photo: JPEG_TWO_FRAME_HEADERS, ocrLines: [] } }));
    expect([response.status, await response.json(), calls.length]).toEqual([400, { refused: "rejected" }, 0]);
  });

  it("takes the image size limit from SCAN_MAX_IMAGE_PX", async () => {
    stubOpenRouter(() => completion(PASSING));
    const refused = await scan(scanRequest({ body: { photo: JPEG_2560_WIDE, ocrLines: [] } }), { SCAN_MAX_IMAGE_PX: "2559" });
    const read = await scan(scanRequest({ body: { photo: JPEG_2561_TALL, ocrLines: [] } }), { SCAN_MAX_IMAGE_PX: "2561" });
    expect([refused.status, read.status]).toEqual([400, 200]);
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

describe("daily dollar budget", () => {
  const budget = { SCAN_DAILY_BUDGET_USD: "0.0013", SCAN_WORST_CASE_USD: "0.0008" };

  it("refuses every address with 429 dailyLimit and calls no model once today's spend plus one worst-case scan would pass the budget", async () => {
    vi.setSystemTime(T0 + 10 * DAY + 6 * 60 * 60 * 1000);
    await seedScansToday(5, 2.99);
    const calls = stubOpenRouter();
    const refused = await scan(scanRequest(), { SCAN_DAILY_BUDGET_USD: "3", SCAN_WORST_CASE_USD: "0.015" });
    expect([refused.status, refused.headers.get("retry-after"), await refused.json(), calls.length]).toEqual([429, String(6 * 60 * 60), { refused: "dailyLimit" }, 0]);
  });

  it("counts each scan's reported cost, so the third scan of a day is refused", async () => {
    vi.setSystemTime(T0 + 11 * DAY);
    stubOpenRouter(() => completion(PASSING), () => completion(PASSING), () => completion(PASSING));
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) statuses.push((await scan(scanRequest(), budget)).status);
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("counts a reply with no usage.cost as a worst-case scan, and starts the budget over the next UTC day", async () => {
    vi.setSystemTime(T0 + 12 * DAY);
    stubOpenRouter(() => completion(PASSING, "Parasail", { prompt_tokens: 1200, completion_tokens: 90 }), () => completion(PASSING));
    const first = await scan(scanRequest(), budget);
    const second = await scan(scanRequest(), budget);
    vi.setSystemTime(T0 + 13 * DAY);
    const nextDay = await scan(scanRequest(), budget);
    expect([first.status, first.headers.get("x-scan-cost"), second.status, nextDay.status]).toEqual([200, "0.000800", 429, 200]);
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
    expect(calls.map(({ prompt: _prompt, ...call }) => call)).toEqual([
      { model: "z-ai/glm-5.3-flash", hosts: ["parasail"], ignore: ["openai/flex"], allowFallbacks: false, maxTokens: 3000 },
    ]);
  });

  it("sends neither cost header unless SCAN_DEBUG_HEADERS is true", async () => {
    stubOpenRouter(() => completion(PASSING), () => completion(PASSING));
    const off = await scan(scanRequest(), { SCAN_DEBUG_HEADERS: "false" });
    const on = await scan(scanRequest(), { SCAN_DEBUG_HEADERS: "true" });
    expect([off.status, off.headers.get("x-scan-cost"), off.headers.get("x-scan-passes"), on.headers.get("x-scan-cost"), on.headers.get("x-scan-passes")]).toEqual([200, null, null, "0.000400", "1"]);
  });

  it("sends no cost headers with the shipped wrangler.jsonc vars", async () => {
    stubOpenRouter(() => completion(PASSING));
    const response = await scanReceipt(scanRequest(), { ...env, OPENROUTER_API_KEY: "test-key" });
    expect([response.status, response.headers.get("x-scan-cost"), response.headers.get("x-scan-passes")]).toEqual([200, null, null]);
  });

  it("serializes the photo once and sends the same messages on the retry host", async () => {
    const bodies: string[] = [];
    const stringify = JSON.stringify;
    const request = scanRequest({ body: { photo: PHOTO + "QUJD", ocrLines: ["BURGER  9.00"] } });
    const spy = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const text = stringify(...args);
      if (text.includes("QUJD")) bodies.push(text);
      return text;
    });
    stubOpenRouter(() => completion(""), () => completion(PASSING));
    const response = await scan(request, { SCAN_PASS1_HOSTS: "parasail,baseten" });
    spy.mockRestore();
    expect([response.status, bodies.length]).toEqual([200, 1]);
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

  it("caps pass 2's reply at 1,500 tokens", async () => {
    const calls = stubOpenRouter(() => completion(SHORT), () => completion("ok"));
    await scan();
    expect(calls.map((call) => call.maxTokens)).toEqual([3000, 1500]);
  });

  it("gives pass 2 the Bundle rules when pass 1 returned no usable lines, and keeps the Bundle it rebuilds", async () => {
    const rebuilt = "add|SUB|1400\nadd|TOT|1400\nadd|b|Beer Bucket\nadd|>i|Lager|900\nadd|>i|Stout|900\nadd|>d|Bucket deal|-400";
    const calls = stubOpenRouter(() => completion("I cannot read this receipt."), () => completion(rebuilt));
    const reply = await (await scan()).json<{ items: { name: string; price: number }[]; bundles: { name: string }[] }>();
    expect(calls[1].prompt).toContain("Bundle: when items are printed under a header with no price or $0.00");
    expect([reply.items.map((item) => [item.name, item.price]), reply.bundles.map((bundle) => bundle.name)]).toEqual([[["Lager", 900], ["Stout", 900]], ["Beer Bucket"]]);
  });

  it("refuses a pass-2 fix that turns a fee line into another kind, as it refuses a drop", async () => {
    const withFee = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100\nf|Bag fee|10";
    stubOpenRouter(() => completion(withFee), () => completion("fix|7|i|Bag fee|10"));
    const reply = await (await scan()).json<{ items: { name: string }[]; adjustments: { kind: string; name: string }[] }>();
    expect([reply.items.map((item) => item.name), reply.adjustments]).toEqual([["Burger", "Fries"], [{ kind: "tax", name: "Tax", amount: 100 }, { kind: "fee", name: "Bag fee", amount: 10 }]]);
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
