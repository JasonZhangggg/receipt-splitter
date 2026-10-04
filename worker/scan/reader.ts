import type { NonEmpty } from "../../src/core/split";
import { checkReading, type Check } from "./check";
import { applyEdits, readLines, replyLines, toReply, type Reading, type ScanReply } from "./format";
import { PASS1_PROMPT, ocrText, pass2Prompt } from "./prompt";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** OpenAI's discount tier, which the eval found too slow. No pass may route to it. */
export const BANNED_HOSTS = ["openai/flex"] as const;

export type PassConfig = {
  readonly model: string;
  /** Pass 1 pins one host per call and moves to the next on a retry. Pass 2 hands OpenRouter the whole list in order. */
  readonly hosts: NonEmpty<string>;
  readonly effort: string;
  readonly timeoutMs: number;
};

export type ReaderConfig = { readonly key: string; readonly pass1: PassConfig; readonly pass2: PassConfig };

export type JpegDataUrl = string & { readonly jpegDataUrl: true };

export type ScanInput = { readonly photo: JpegDataUrl; readonly ocrLines: readonly string[] };

type Outcome = "ok" | "empty" | "timeout" | "error" | `http ${number}`;

/** What a log line may say about one model call: never the image, the OCR lines, or the reply's text. */
export type CallLog = {
  readonly pass: 1 | 2;
  readonly host: string | null;
  readonly ms: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cost: number;
  readonly outcome: Outcome;
};

export type ReadResult = { readonly reply: ScanReply | null; readonly calls: readonly CallLog[]; readonly skipped: number };

type Content = readonly ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

type OpenRouterBody = {
  choices?: { message?: { content?: unknown } }[];
  provider?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
};

const numberOr = <Fallback>(value: unknown, fallback: Fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

async function callModel(pass: 1 | 2, config: PassConfig, hosts: NonEmpty<string>, key: string, content: Content): Promise<{ text: string; log: CallLog }> {
  const started = Date.now();
  const failed = (outcome: Outcome) => ({
    text: "",
    log: { pass, host: hosts.length === 1 ? hosts[0] : null, ms: Date.now() - started, inputTokens: null, outputTokens: null, reasoningTokens: null, cost: 0, outcome },
  });
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        model: config.model,
        ...(config.model.startsWith("openai/") ? {} : { temperature: 0 }),
        reasoning: { effort: config.effort },
        max_tokens: 8000,
        usage: { include: true },
        provider: { order: hosts, allow_fallbacks: false, ignore: BANNED_HOSTS },
        messages: [{ role: "user", content }],
      }),
    });
  } catch (error) {
    return failed(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "error");
  }
  if (!response.ok) {
    await response.body?.cancel();
    return failed(`http ${response.status}`);
  }
  let body: OpenRouterBody;
  try {
    body = await response.json<OpenRouterBody>();
  } catch (error) {
    return failed(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "error");
  }
  const message = body.choices?.[0]?.message?.content;
  const text = typeof message === "string" ? message : "";
  const usage = body.usage;
  return {
    text,
    log: {
      pass,
      host: typeof body.provider === "string" ? body.provider : null,
      ms: Date.now() - started,
      inputTokens: numberOr(usage?.prompt_tokens, null),
      outputTokens: numberOr(usage?.completion_tokens, null),
      reasoningTokens: numberOr(usage?.completion_tokens_details?.reasoning_tokens, null),
      cost: numberOr(usage?.cost, 0),
      outcome: text.trim() === "" ? "empty" : "ok",
    },
  };
}

type Pass = { readonly lines: string[]; readonly reading: Reading | null; readonly check: Check | null };

const passOf = (lines: string[]): Pass => {
  const reading = readLines(lines);
  return { lines, reading, check: reading && checkReading(reading) };
};

const problemCount = (pass: Pass) => (pass.check === null ? Infinity : pass.check.passed ? 0 : pass.check.problems.length);

/**
 * Pass 1 reads the photo and OCR lines on one pinned host, and retries once on the next host when the call fails,
 * runs out of time, or comes back empty. Pass 2 runs only when pass 1's reading is malformed or fails the check,
 * and its edits stand only when they leave no more problems than pass 1 had.
 */
export async function readReceipt(input: ScanInput, config: ReaderConfig): Promise<ReadResult> {
  const image = { type: "image_url" as const, image_url: { url: input.photo } };
  const calls: CallLog[] = [];
  const pass1Content: Content = [{ type: "text", text: PASS1_PROMPT }, { type: "text", text: ocrText(input.ocrLines) }, image];

  let text = "";
  for (const host of config.pass1.hosts.slice(0, 2)) {
    const call = await callModel(1, config.pass1, [host], config.key, pass1Content);
    calls.push(call.log);
    text = call.text;
    if (call.log.outcome === "ok") break;
  }

  const first = passOf(replyLines(text));
  let best = first;
  if (first.check?.passed !== true) {
    const problems = first.check === null ? ["the first reading could not be parsed"] : first.check.passed ? [] : first.check.problems;
    const numbered = first.reading === null ? [] : first.lines;
    const call = await callModel(2, config.pass2, config.pass2.hosts, config.key, [{ type: "text", text: pass2Prompt(problems, numbered) }, image]);
    calls.push(call.log);
    if (call.log.outcome === "ok") {
      const second = passOf(applyEdits(numbered, call.text).lines);
      if (second.reading !== null && problemCount(second) <= problemCount(first)) best = second;
    }
  }

  const reply = best.reading && best.check && toReply(best.reading, best.check);
  return { reply, calls, skipped: best.reading?.skipped ?? 0 };
}
