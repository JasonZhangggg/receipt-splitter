import { afterEach, describe, expect, it, vi } from "vitest";
import { checkReading } from "./check";
import { readLines } from "./format";
import { readReceipt, reviewOf, type JpegDataUrl, type ReaderConfig } from "./reader";
import { SMALL_JPEG } from "./jpeg-fixtures";

const PASSING = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";
const SHORT = "SUB|1400\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|500\nt|Tax|100";
const PENNY = "SUB|1402\nTOT|1502\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";
const PENNY_SUB_OFF_1 = "SUB|1401\nTOT|1502\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";
const PENNY_TOTAL_OFF_1 = "SUB|1402\nTOT|1501\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";
const SUBTOTAL_ONLY = "SUB|1300\nTOT|1500\ni|Burger|900\n-|Promo|-100\ni|Fries|600\nt|Tax|100";

const FLASH_LITE = { model: "google/gemini-3.1-flash-lite", effort: "minimal", maxTokens: 3000 };
const BOUND = { flex: 0.0049, standard: 0.0098 };

const CONFIG: ReaderConfig = {
  key: "test-key",
  flex: { ...FLASH_LITE, resolution: "MEDIA_RESOLUTION_MEDIUM", hosts: ["google-ai-studio/flex"], boundUsd: BOUND.flex, deadlineMs: 80 },
  standard: { ...FLASH_LITE, resolution: null, hosts: ["google-vertex/global", "google-ai-studio"], boundUsd: BOUND.standard },
  pass1ByMs: 500,
  pass2: { model: "google/gemini-3.8-flash", effort: "minimal", resolution: null, imageDetail: "low", maxTokens: 1500, hosts: ["google-ai-studio/flex"], boundUsd: 0.0051 },
  penny: { ...FLASH_LITE, resolution: "MEDIA_RESOLUTION_MEDIUM", imageDetail: null, maxTokens: 1500, hosts: ["google-ai-studio/flex"], boundUsd: 0.002 },
  reviewByMs: 400,
  reviewMinMs: 20,
};

const INPUT = { photo: SMALL_JPEG as JpegDataUrl, ocrLines: ["BURGER  9.00"] };

type Sent = { readonly body: Record<string, unknown> & { messages: { content: { type: string; text?: string }[] }[] }; readonly signal: AbortSignal };
type Answer = (sent: Sent) => Response | Promise<Response>;

const completion = (content: string, provider = "Google AI Studio", cost = 0.0004) =>
  Response.json({ choices: [{ message: { content } }], provider, usage: { prompt_tokens: 1900, completion_tokens: 240, cost } });

const hang: Answer = ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

const after =
  (ms: number, answer: Answer): Answer =>
  async (sent) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return answer(sent);
  };

/** Answers OpenRouter in turn and keeps each request body and its abort signal. */
function stubOpenRouter(...answers: Answer[]): Sent[] {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const call = { body: JSON.parse(String(init?.body)), signal: init!.signal! };
    sent.push(call);
    const answer = answers[sent.length - 1];
    if (answer === undefined) throw new Error(`no answer for call ${sent.length}`);
    return answer(call);
  });
  return sent;
}

const shapeOf = ({ body }: Sent) => {
  const { messages: _messages, ...rest } = body;
  return rest;
};
const promptOf = ({ body }: Sent) => body.messages[0].content[0].text ?? "";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reviewOf", () => {
  const review = (reply: string) => {
    const reading = readLines(reply.split("\n"));
    return reviewOf(reading && checkReading(reading));
  };

  it("sends a failing total to pass 2 with its problems, and an unparsed reply too", () => {
    expect([review(SHORT), review("I cannot read this receipt.")]).toEqual([
      {
        kind: "pass2",
        problems: ["non-tax lines sum to $13.00 but the printed subtotal is $14.00 (short by $1.00)", "all lines sum to $14.00 but the printed total is $15.00 (short by $1.00)"],
      },
      { kind: "pass2", problems: ["the first reading could not be parsed"] },
    ]);
  });

  it("returns a reading whose total reconciles as is, whether its subtotal misses or it is exact", () => {
    expect([review(SUBTOTAL_ONLY), review(PASSING)]).toEqual([null, null]);
  });

  it("sends a total inside the tolerance but off by 2 cents to the penny review", () => {
    expect(review(PENNY)).toEqual({
      kind: "penny",
      problems: ["all lines miss the printed total by $0.02 (short); a receipt adds up to the cent, so one amount is likely misread by a digit", "the lines miss the printed subtotal by $0.02"],
    });
  });
});

describe("readReceipt pass 1", () => {
  it("asks the flex host at MEDIUM resolution with minimal reasoning, and stops at a passing reading", async () => {
    const sent = stubOpenRouter(() => completion(PASSING));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.reply?.check, result.path, sent.map(shapeOf), result.calls.map(({ ms: _ms, ...call }) => call)]).toEqual([
      { passed: true, gaps: { subtotal: 0, total: 0 } },
      { pass1: "flex", review: null },
      [
        {
          model: "google/gemini-3.1-flash-lite",
          temperature: 0,
          reasoning: { effort: "minimal" },
          max_tokens: 3000,
          usage: { include: true },
          provider: { order: ["google-ai-studio/flex"], allow_fallbacks: false },
          media_resolution: "MEDIA_RESOLUTION_MEDIUM",
        },
      ],
      [{ step: "flex", host: "Google AI Studio", inputTokens: 1900, outputTokens: 240, reasoningTokens: null, cost: 0.0004, boundUsd: 0.0049, outcome: "ok" }],
    ]);
  });

  it("sends the prompt without /nothink, then the OCR lines, then the photo", async () => {
    const sent = stubOpenRouter(() => completion(PASSING));
    await readReceipt(INPUT, CONFIG);
    const [prompt, ocr, photo] = sent[0].body.messages[0].content;
    expect([prompt.text?.split("\n")[0], ocr, photo]).toEqual([
      "Read this receipt photo. The OCR text of the same receipt is below as a hint; it is usually right about characters but can misread faint digits, so trust the photo when they disagree.",
      { type: "text", text: "OCR text:\nBURGER  9.00" },
      { type: "image_url", image_url: { url: SMALL_JPEG } },
    ]);
  });

  it("with no OCR lines sends the prompt that says none is available, then the photo, with no empty OCR message", async () => {
    const sent = stubOpenRouter(() => completion(PASSING));
    await readReceipt({ ...INPUT, ocrLines: [] }, CONFIG);
    const [prompt, photo, ...rest] = sent[0].body.messages[0].content;
    expect([prompt.text?.split("\n")[0], photo, rest]).toEqual([
      "Read this receipt photo. No OCR text is available, so read every character from the photo.",
      { type: "image_url", image_url: { url: SMALL_JPEG } },
      [],
    ]);
  });

  it("abandons a flex call with no complete reply at its deadline and asks Vertex at the default resolution", async () => {
    const sent = stubOpenRouter(hang, () => completion(PASSING, "Google"));
    const started = Date.now();
    const result = await readReceipt(INPUT, CONFIG);
    const elapsed = Date.now() - started;
    expect([sent[0].signal.aborted, sent.map(({ body }) => [body.provider, body.media_resolution ?? null]), result.path, result.calls.map((call) => [call.step, call.outcome, call.cost])]).toEqual([
      true,
      [
        [{ order: ["google-ai-studio/flex"], allow_fallbacks: false }, "MEDIA_RESOLUTION_MEDIUM"],
        [{ order: ["google-vertex/global"], allow_fallbacks: false }, null],
      ],
      { pass1: "standard", review: null },
      [
        ["flex", "timeout", null],
        ["standard", "ok", 0.0004],
      ],
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(400);
  });

  it("abandons a flex reply that starts but does not finish by the deadline", async () => {
    const stalls: Answer = ({ signal }) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"choices":[{"message":'));
          signal.addEventListener("abort", () => controller.error(signal.reason));
        },
      });
      return new Response(body, { headers: { "content-type": "application/json" } });
    };
    const sent = stubOpenRouter(stalls, () => completion(PASSING, "Google"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([sent[0].signal.aborted, result.path, result.reply?.items.map((item) => item.price)]).toEqual([true, { pass1: "standard", review: null }, [800, 600]]);
  });

  it("moves from Vertex to AI Studio when Vertex refuses, and counts the refused call as free", async () => {
    const sent = stubOpenRouter(
      () => new Response("rate limited", { status: 429 }),
      () => new Response("busy", { status: 503 }),
      () => completion(PASSING),
    );
    const result = await readReceipt(INPUT, CONFIG);
    expect([sent.map(({ body }) => (body.provider as { order: string[] }).order), result.path, result.calls.map((call) => [call.step, call.outcome, call.cost])]).toEqual([
      [["google-ai-studio/flex"], ["google-vertex/global"], ["google-ai-studio"]],
      { pass1: "standard", review: null },
      [
        ["flex", "http 429", 0],
        ["standard", "http 503", 0],
        ["standard", "ok", 0.0004],
      ],
    ]);
  });
});

describe("readReceipt pass-1 budget", () => {
  it("gives Vertex what remains of the pass-1 budget, skips AI Studio when none is left, and has no reading", async () => {
    const sent = stubOpenRouter(hang, hang);
    const started = Date.now();
    const result = await readReceipt(INPUT, CONFIG);
    const elapsed = Date.now() - started;
    expect([sent.length, result.reply, result.path, result.calls.map((call) => [call.step, call.outcome])]).toEqual([
      2,
      null,
      { pass1: "failed", review: { kind: "pass2", outcome: "no time", refusedTotals: 0 } },
      [
        ["flex", "timeout"],
        ["standard", "timeout"],
      ],
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(490);
    expect(elapsed).toBeLessThan(700);
  });

  it("ends the flex call at the pass-1 budget when that is sooner than the flex deadline, and tries nothing else", async () => {
    const sent = stubOpenRouter(hang);
    const started = Date.now();
    const result = await readReceipt(INPUT, { ...CONFIG, pass1ByMs: 30 });
    const elapsed = Date.now() - started;
    expect([sent.length, result.path]).toEqual([1, { pass1: "failed", review: { kind: "pass2", outcome: "no time", refusedTotals: 0 } }]);
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(75);
  });

  it("makes no review call when less than the minimum review time remains", async () => {
    const sent = stubOpenRouter(hang, after(250, () => completion(SHORT, "Google")));
    const result = await readReceipt(INPUT, { ...CONFIG, reviewMinMs: 100 });
    expect([sent.length, result.path.review]).toEqual([2, { kind: "pass2", outcome: "no time", refusedTotals: 0 }]);
  });

  it("makes the review call when the time that remains is at least the minimum", async () => {
    const sent = stubOpenRouter(hang, after(250, () => completion(SHORT, "Google")), () => completion("fix|5|i|Fries|600"));
    const result = await readReceipt(INPUT, { ...CONFIG, reviewMinMs: 50 });
    expect([sent.length, result.path.review?.outcome]).toEqual([3, "kept"]);
  });

  it("charges each call its own bound when no cost came back, and nothing for an HTTP error", async () => {
    stubOpenRouter(hang, () => new Response("busy", { status: 503 }), () => completion(PASSING, "Google"));
    const result = await readReceipt(INPUT, CONFIG);
    expect(result.calls.map((call) => [call.step, call.outcome, call.cost, call.boundUsd])).toEqual([
      ["flex", "timeout", null, 0.0049],
      ["standard", "http 503", 0, 0.0098],
      ["standard", "ok", 0.0004, 0.0098],
    ]);
  });
});

describe("readReceipt pass 2", () => {
  it("reviews a failing total with Gemini 3.8 Flash, minimal reasoning, on flex, with a low-detail photo and the breakdown, and keeps its edits", async () => {
    const sent = stubOpenRouter(() => completion(SHORT), () => completion("fix|5|i|Fries|600"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([shapeOf(sent[1]), result.path, result.reply?.check]).toEqual([
      {
        model: "google/gemini-3.8-flash",
        temperature: 0,
        reasoning: { effort: "minimal" },
        max_tokens: 1500,
        usage: { include: true },
        provider: { order: ["google-ai-studio/flex"], allow_fallbacks: false },
      },
      { pass1: "flex", review: { kind: "pass2", outcome: "kept", refusedTotals: 0 } },
      { passed: true, gaps: { subtotal: 0, total: 0 } },
    ]);
    const prompt = promptOf(sent[1]);
    expect([
      prompt.startsWith("A first reading of this receipt photo failed its arithmetic check: non-tax lines sum to $13.00"),
      prompt.slice(prompt.indexOf("If nothing is wrong, reply: ok"), prompt.indexOf("Sums of the first reading")),
      sent[1].body.messages[0].content[1],
    ]).toEqual([true, "If nothing is wrong, reply: ok\n\n", { type: "image_url", image_url: { url: SMALL_JPEG, detail: "low" } }]);
  });

  it("turns reasoning off for a review whose effort is off", async () => {
    const sent = stubOpenRouter(() => completion(SHORT), () => completion("ok"));
    await readReceipt(INPUT, { ...CONFIG, pass2: { ...CONFIG.pass2, effort: "off" } });
    expect(sent.map(({ body }) => body.reasoning)).toEqual([{ effort: "minimal" }, { enabled: false }]);
  });

  it("drops an edit that adds a line named as a total and applies the rest", async () => {
    stubOpenRouter(() => completion(SHORT), () => completion("add|f|Crate Fee Total|100\nfix|5|i|Fries|600"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.path.review, result.reply?.adjustments, result.reply?.check.passed]).toEqual([
      { kind: "pass2", outcome: "kept", refusedTotals: 1 },
      [{ kind: "tax", name: "Tax", amount: 100 }],
      true,
    ]);
  });

  it("keeps pass 1's reading when pass 2's edits leave more problems", async () => {
    stubOpenRouter(() => completion(SHORT), () => completion("drop|5\nadd|b|Ghost"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.path.review, result.reply?.items.map((item) => item.name)]).toEqual([{ kind: "pass2", outcome: "rejected", refusedTotals: 0 }, ["Burger", "Fries"]]);
  });

  it("returns pass 1's reading when pass 2 misses the scan's review deadline", async () => {
    const sent = stubOpenRouter(() => completion(SHORT), hang);
    const started = Date.now();
    const result = await readReceipt(INPUT, CONFIG);
    const elapsed = Date.now() - started;
    expect([sent[1].signal.aborted, result.path.review, result.reply?.check.passed, result.calls.map((call) => [call.step, call.outcome])]).toEqual([
      true,
      { kind: "pass2", outcome: "call failed", refusedTotals: 0 },
      false,
      [
        ["flex", "ok"],
        ["pass2", "timeout"],
      ],
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(390);
    expect(elapsed).toBeLessThan(800);
  });

  it("gives pass 2 only what remains of the review deadline after a slow pass 1", async () => {
    const sent = stubOpenRouter(hang, after(250, () => completion(SHORT, "Google")), hang);
    const started = Date.now();
    const result = await readReceipt(INPUT, CONFIG);
    const elapsed = Date.now() - started;
    expect([sent.length, result.path, result.calls.map((call) => [call.step, call.outcome])]).toEqual([
      3,
      { pass1: "standard", review: { kind: "pass2", outcome: "call failed", refusedTotals: 0 } },
      [
        ["flex", "timeout"],
        ["standard", "ok"],
        ["pass2", "timeout"],
      ],
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(390);
    expect(elapsed).toBeLessThan(800);
  });

  it("makes no review call when pass 1 used up the review deadline", async () => {
    const sent = stubOpenRouter(hang, after(400, () => completion(SHORT, "Google")));
    const result = await readReceipt(INPUT, CONFIG);
    expect([sent.length, result.path.review, result.reply?.check.passed]).toEqual([2, { kind: "pass2", outcome: "no time", refusedTotals: 0 }, false]);
  });

  it("returns a reading whose total reconciles but whose subtotal misses as is, still failing, with no review", async () => {
    const sent = stubOpenRouter(() => completion(SUBTOTAL_ONLY));
    const result = await readReceipt(INPUT, CONFIG);
    expect([sent.length, result.path.review, result.reply?.check]).toEqual([
      1,
      null,
      { passed: false, gaps: { subtotal: -100, total: 0 }, problems: ["non-tax lines sum to $14.00 but the printed subtotal is $13.00 (over by $1.00)"] },
    ]);
  });
});

describe("readReceipt penny review", () => {
  it("asks 3.1 Flash-Lite at MEDIUM on flex with the penny problems, and keeps edits that reconcile to the cent", async () => {
    const sent = stubOpenRouter(() => completion(PENNY), () => completion("fix|5|i|Fries|602"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([shapeOf(sent[1]), promptOf(sent[1]).split("\n")[0], sent[1].body.messages[0].content[1], result.path.review, result.reply?.items.map((item) => item.price), result.reply?.check]).toEqual([
      {
        model: "google/gemini-3.1-flash-lite",
        temperature: 0,
        reasoning: { effort: "minimal" },
        max_tokens: 1500,
        usage: { include: true },
        provider: { order: ["google-ai-studio/flex"], allow_fallbacks: false },
        media_resolution: "MEDIA_RESOLUTION_MEDIUM",
      },
      "A first reading of this receipt photo failed its arithmetic check: all lines miss the printed total by $0.02 (short); a receipt adds up to the cent, so one amount is likely misread by a digit; the lines miss the printed subtotal by $0.02.",
      { type: "image_url", image_url: { url: SMALL_JPEG } },
      { kind: "penny", outcome: "kept", refusedTotals: 0 },
      [800, 602],
      { passed: true, gaps: { subtotal: 0, total: 0 } },
    ]);
  });

  it("keeps pass 1's reading when the edits still pass only inside the tolerance", async () => {
    stubOpenRouter(() => completion(PENNY), () => completion("fix|5|i|Fries|601"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.path.review, result.reply?.items.map((item) => item.price), result.reply?.check]).toEqual([
      { kind: "penny", outcome: "rejected", refusedTotals: 0 },
      [800, 600],
      { passed: true, gaps: { subtotal: 2, total: 2 } },
    ]);
  });

  it("rejects edits that make the total exact while the subtotal stays 1 cent off", async () => {
    stubOpenRouter(() => completion(PENNY_SUB_OFF_1), () => completion("fix|5|i|Fries|602"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.path.review, result.reply?.items.map((item) => item.price), result.reply?.check.gaps]).toEqual([{ kind: "penny", outcome: "rejected", refusedTotals: 0 }, [800, 600], { subtotal: 1, total: 2 }]);
  });

  it("rejects edits that make the subtotal exact while the total stays 1 cent off", async () => {
    stubOpenRouter(() => completion(PENNY_TOTAL_OFF_1), () => completion("fix|5|i|Fries|602"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.path.review, result.reply?.items.map((item) => item.price), result.reply?.check.gaps]).toEqual([{ kind: "penny", outcome: "rejected", refusedTotals: 0 }, [800, 600], { subtotal: 2, total: 1 }]);
  });

  it("refuses a penny edit that adds a line named as a total, so the reading stays as pass 1 read it", async () => {
    stubOpenRouter(() => completion(PENNY), () => completion("add|i|Rounding total|2"));
    const result = await readReceipt(INPUT, CONFIG);
    expect([result.path.review, result.reply?.items.map((item) => item.name)]).toEqual([{ kind: "penny", outcome: "rejected", refusedTotals: 1 }, ["Burger", "Fries"]]);
  });
});
