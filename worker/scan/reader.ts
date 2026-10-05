import type { NonEmpty } from "../../src/core/split";
import { arithmeticBreakdown } from "./breakdown";
import { ACCEPTED_GAP, checkReading, pennyProblems, type Check } from "./check";
import { applyEdits, readLines, replyLines, toReply, type Reading, type ScanReply } from "./format";
import { PASS1_PROMPT, ocrText, pass2Prompt } from "./prompt";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** One kind of model call: the model, how it is asked, and the hosts OpenRouter may send it to, in order. */
export type Target = {
  readonly model: string;
  /** `off` turns reasoning off. Any other value is sent as `reasoning.effort`. */
  readonly effort: string;
  /** Gemini's `media_resolution` for the photo, or null for the model's default. */
  readonly resolution: string | null;
  readonly maxTokens: number;
  readonly hosts: NonEmpty<string>;
  /** The most one call to this target can cost, in dollars, if it is billed in full: its tokens at the text cap, the image, and `maxTokens`. ADR 0010 derives it. */
  readonly boundUsd: number;
};

/** OpenRouter's `image_url.detail`. */
export type ImageDetail = "low" | "high" | "auto";

/** A review sends the photo in its own message, so it can ask for its own image detail. null sends none. */
export type ReviewTarget = Target & { readonly imageDetail: ImageDetail | null };

export type ReaderConfig = {
  readonly key: string;
  /** Pass 1's first call. It is abandoned when no complete reply has come by `deadlineMs`. */
  readonly flex: Target & { readonly deadlineMs: number };
  /** Pass 1 when the flex call misses: one call per host, in order, until one answers. Each gets what remains of `pass1ByMs`. */
  readonly standard: Target;
  /** Pass 1 must have its reading this long after the scan starts, or the scan has none. It also caps the flex deadline. */
  readonly pass1ByMs: number;
  /** The review of a reading whose total fails the check. */
  readonly pass2: ReviewTarget;
  /** The review of a reading that passes only inside the tolerance. */
  readonly penny: ReviewTarget;
  /** A review must answer this long after the scan starts, or pass 1's reading stands. */
  readonly reviewByMs: number;
  /** A review is skipped when less than this remains before `reviewByMs`, because it would not finish. */
  readonly reviewMinMs: number;
};

export type JpegDataUrl = string & { readonly jpegDataUrl: true };

export type ScanInput = { readonly photo: JpegDataUrl; readonly ocrLines: readonly string[] };

/** A pass-1 call given less than this could not finish, and a timer may also fire a few ms early, so none is made. */
const MIN_CALL_MS = 100;

type Step = "flex" | "standard" | "pass2" | "penny";

type Outcome = "ok" | "empty" | "timeout" | "error" | `http ${number}`;

/** What a log line may say about one model call: never the image, the OCR lines, or the reply's text. */
export type CallLog = {
  readonly step: Step;
  readonly host: string | null;
  readonly ms: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  /** Dollars as OpenRouter reported them, or null when the call may have been billed and no cost came back. */
  readonly cost: number | null;
  /** What the call costs at most, from its target. The route charges it when `cost` is null. */
  readonly boundUsd: number;
  readonly outcome: Outcome;
};

type Review = { readonly kind: "pass2" | "penny"; readonly problems: NonEmpty<string> };

/** Which calls gave the reading. `refusedTotals` counts the review's edits refused for writing a line named as a total. */
export type ScanPath = {
  readonly pass1: "flex" | "standard" | "failed";
  readonly review: { readonly kind: Review["kind"]; readonly outcome: "kept" | "rejected" | "no time" | "call failed"; readonly refusedTotals: number } | null;
};

export type ReadResult = { readonly reply: ScanReply | null; readonly calls: readonly CallLog[]; readonly path: ScanPath; readonly skipped: number };

type Content = readonly ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: ImageDetail } })[];

/** The messages as JSON text. It holds the photo, so pass 1 serializes it once and every pass-1 call reuses it. */
const messagesJson = (content: Content) => JSON.stringify([{ role: "user", content }]);

type OpenRouterBody = {
  choices?: { message?: { content?: unknown } }[];
  provider?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
};

const numberOr = <Fallback>(value: unknown, fallback: Fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "TimeoutError";

async function callModel(step: Step, target: Target, hosts: NonEmpty<string>, key: string, messages: string, timeoutMs: number): Promise<{ text: string; log: CallLog }> {
  const started = Date.now();
  const failed = (outcome: Outcome, cost: number | null) => ({
    text: "",
    log: { step, host: hosts.length === 1 ? hosts[0] : null, ms: Date.now() - started, inputTokens: null, outputTokens: null, reasoningTokens: null, cost, boundUsd: target.boundUsd, outcome },
  });
  // The signal also covers reading the body, so a reply still streaming in at the deadline is abandoned with it.
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal,
      body: `${JSON.stringify({
        model: target.model,
        temperature: 0,
        reasoning: target.effort === "off" ? { enabled: false } : { effort: target.effort },
        max_tokens: target.maxTokens,
        usage: { include: true },
        provider: { order: hosts, allow_fallbacks: false },
        ...(target.resolution === null ? {} : { media_resolution: target.resolution }),
      }).slice(0, -1)},"messages":${messages}}`,
    });
  } catch (error) {
    return failed(isAbort(error) ? "timeout" : "error", null);
  }
  if (!response.ok) {
    await response.body?.cancel();
    // OpenRouter bills only a completion, so a refused request, such as a 429 at the account's rate limit, costs nothing.
    return failed(`http ${response.status}`, 0);
  }
  let body: OpenRouterBody;
  try {
    body = await response.json<OpenRouterBody>();
  } catch (error) {
    return failed(isAbort(error) ? "timeout" : "error", null);
  }
  const message = body.choices?.[0]?.message?.content;
  const text = typeof message === "string" ? message : "";
  const usage = body.usage;
  return {
    text,
    log: {
      step,
      host: typeof body.provider === "string" ? body.provider : null,
      ms: Date.now() - started,
      inputTokens: numberOr(usage?.prompt_tokens, null),
      outputTokens: numberOr(usage?.completion_tokens, null),
      reasoningTokens: numberOr(usage?.completion_tokens_details?.reasoning_tokens, null),
      cost: numberOr(usage?.cost, null),
      boundUsd: target.boundUsd,
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

const reconciles = (pass: Pass) => pass.check?.passed === true && pass.check.gaps.total === 0 && !pass.check.gaps.subtotal;

/**
 * Which review pass 1's reading gets. A malformed reading or a failing total goes to pass 2. A reading whose total passes
 * but whose subtotal or Bundles fail is returned as is, still failing. A total inside the tolerance but off by a cent or more gets the penny review.
 */
export function reviewOf(check: Check | null): Review | null {
  if (check === null) return { kind: "pass2", problems: ["the first reading could not be parsed"] };
  if (!check.passed) return Math.abs(check.gaps.total) > ACCEPTED_GAP ? { kind: "pass2", problems: check.problems } : null;
  const problems = pennyProblems(check);
  return problems && { kind: "penny", problems };
}

/**
 * Pass 1 reads the photo and the OCR lines on the flex host, and on the standard hosts when flex misses its deadline,
 * fails, or comes back empty. Every pass-1 call ends by `pass1ByMs` after the scan starts, so a scan with no reading by then has none. Then at most one review, chosen by `reviewOf`, edits pass 1's numbered lines within the scan's time.
 * Pass 2's edits stand when they leave no more problems than pass 1 had. The penny review's stand only when the reading then reconciles to the cent.
 */
export async function readReceipt(input: ScanInput, config: ReaderConfig): Promise<ReadResult> {
  const started = Date.now();
  const image = { type: "image_url" as const, image_url: { url: input.photo } };
  const calls: CallLog[] = [];
  const call = async (step: Step, target: Target, hosts: NonEmpty<string>, messages: string, timeoutMs: number) => {
    const made = await callModel(step, target, hosts, config.key, messages, timeoutMs);
    calls.push(made.log);
    return made.log.outcome === "ok" ? made.text : null;
  };

  const pass1Messages = messagesJson([{ type: "text", text: PASS1_PROMPT }, { type: "text", text: ocrText(input.ocrLines) }, image]);
  const pass1LeftMs = () => config.pass1ByMs - (Date.now() - started);
  let text = await call("flex", config.flex, config.flex.hosts, pass1Messages, Math.min(config.flex.deadlineMs, pass1LeftMs()));
  let pass1: ScanPath["pass1"] = text === null ? "failed" : "flex";
  for (const host of config.standard.hosts) {
    if (text !== null || pass1LeftMs() < MIN_CALL_MS) break;
    text = await call("standard", config.standard, [host], pass1Messages, pass1LeftMs());
    if (text !== null) pass1 = "standard";
  }

  const first = passOf(replyLines(text ?? ""));
  const finish = (best: Pass, review: ScanPath["review"]): ReadResult => ({
    reply: best.reading && best.check && toReply(best.reading, best.check),
    calls,
    path: { pass1, review },
    skipped: best.reading?.skipped ?? 0,
  });

  const review = reviewOf(first.check);
  if (review === null) return finish(first, null);
  const remainingMs = config.reviewByMs - (Date.now() - started);
  // A pass 1 that ran out of its budget leaves too little for a review that must also build the whole reading, so the scan has none.
  if (remainingMs < config.reviewMinMs || (text === null && pass1LeftMs() < MIN_CALL_MS)) return finish(first, { kind: review.kind, outcome: "no time", refusedTotals: 0 });

  const numbered = first.reading === null ? [] : first.lines;
  const prompt = [pass2Prompt(review.problems, numbered), first.reading && arithmeticBreakdown(first.reading)].filter(Boolean).join("\n\n");
  const target = config[review.kind];
  const reviewImage = target.imageDetail === null ? image : { type: "image_url" as const, image_url: { url: input.photo, detail: target.imageDetail } };
  const edits = await call(review.kind, target, target.hosts, messagesJson([{ type: "text", text: prompt }, reviewImage]), remainingMs);
  if (edits === null) return finish(first, { kind: review.kind, outcome: "call failed", refusedTotals: 0 });

  const edited = applyEdits(numbered, edits);
  const second = passOf(edited.lines);
  const kept = review.kind === "pass2" ? second.reading !== null && problemCount(second) <= problemCount(first) : reconciles(second);
  return finish(kept ? second : first, { kind: review.kind, outcome: kept ? "kept" : "rejected", refusedTotals: edited.refused.total });
}
