import type { NonEmpty } from "../../src/core/split";
import { readCapped } from "../create";
import { limiterKey, type DayLimit, type IpLimit } from "../rate-limit";
import { jpegLongestSide } from "./jpeg";
import { BANNED_HOSTS, readReceipt, type JpegDataUrl, type PassConfig, type ReaderConfig, type ScanInput } from "./reader";

/** The client downsizes the photo to fit this. The Worker never decodes its pixels, because Workers Free allows 10 ms of CPU a request. */
export const MAX_SCAN_BODY_BYTES = 1024 * 1024;

const MAX_OCR_LINES = 400;
const MAX_OCR_LINE_LENGTH = 300;
/**
 * The most OCR text one scan may carry. A real receipt is about 1,000 characters. Past this the route refuses with 400
 * rather than truncating, because dropped lines would give a reading that adds up wrongly, and the client falls back to the device reader on a refusal.
 */
const MAX_OCR_CHARS = 8000;
const JPEG_DATA_URL = "data:image/jpeg;base64,";

export const SCAN_DAILY_CAP_NAME = "scan-daily-cap";

export const scanLimiterName = (ip: string) => `scan:${limiterKey(ip)}`;

export type ScanRefusal = { readonly refused: "origin" | "bodyTooLarge" | "rejected" | "unavailable" | "rateLimited" | "dailyLimit" | "unreadable" };

type ScanConfig = {
  readonly perIp: IpLimit;
  readonly today: DayLimit & { readonly budget: NonNullable<DayLimit["budget"]> };
  readonly maxImagePx: number;
  readonly reader: ReaderConfig;
};

type ScanEnv = Pick<
  Cloudflare.Env,
  | "CreateLimiter"
  | "OPENROUTER_API_KEY"
  | "SCAN_PER_MINUTE"
  | "SCAN_PER_DAY"
  | "SCAN_DAILY_CAP"
  | "SCAN_DAILY_BUDGET_USD"
  | "SCAN_WORST_CASE_USD"
  | "SCAN_MAX_IMAGE_PX"
  | "SCAN_PASS1_MODEL"
  | "SCAN_PASS1_HOSTS"
  | "SCAN_PASS1_EFFORT"
  | "SCAN_PASS1_TIMEOUT_MS"
  | "SCAN_PASS1_MAX_TOKENS"
  | "SCAN_PASS2_MODEL"
  | "SCAN_PASS2_HOSTS"
  | "SCAN_PASS2_EFFORT"
  | "SCAN_PASS2_TIMEOUT_MS"
  | "SCAN_PASS2_MAX_TOKENS"
  | "SCAN_DEBUG_HEADERS"
>;

/** Reads the scan settings from the Worker's vars and secret, or names what is missing or wrong. */
export function scanConfig(env: ScanEnv): ScanConfig | { readonly error: string } {
  const count = (name: keyof ScanEnv) => {
    const value = Number(env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const dollars = (name: keyof ScanEnv) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const pass = (n: 1 | 2): PassConfig | string => {
    const model = env[`SCAN_PASS${n}_MODEL`];
    const [host, ...more] = String(env[`SCAN_PASS${n}_HOSTS`] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const effort = env[`SCAN_PASS${n}_EFFORT`];
    const timeoutMs = count(`SCAN_PASS${n}_TIMEOUT_MS`);
    const maxTokens = count(`SCAN_PASS${n}_MAX_TOKENS`);
    if (!model || !effort || timeoutMs === null || maxTokens === null || host === undefined) return `SCAN_PASS${n}_* is missing or invalid`;
    const hosts: NonEmpty<string> = [host, ...more];
    if (hosts.some((name) => (BANNED_HOSTS as readonly string[]).includes(name))) return `SCAN_PASS${n}_HOSTS lists a banned host`;
    return { model, hosts, effort, timeoutMs, maxTokens };
  };
  const [perMinute, perDay, dailyCap, maxImagePx] = [count("SCAN_PER_MINUTE"), count("SCAN_PER_DAY"), count("SCAN_DAILY_CAP"), count("SCAN_MAX_IMAGE_PX")];
  const [usd, reserveUsd] = [dollars("SCAN_DAILY_BUDGET_USD"), dollars("SCAN_WORST_CASE_USD")];
  const [pass1, pass2] = [pass(1), pass(2)];
  if (!env.OPENROUTER_API_KEY) return { error: "the OPENROUTER_API_KEY secret is not set" };
  if (perMinute === null || perDay === null || dailyCap === null) return { error: "SCAN_PER_MINUTE, SCAN_PER_DAY, or SCAN_DAILY_CAP is missing or invalid" };
  if (usd === null || reserveUsd === null || maxImagePx === null) return { error: "SCAN_DAILY_BUDGET_USD, SCAN_WORST_CASE_USD, or SCAN_MAX_IMAGE_PX is missing or invalid" };
  if (typeof pass1 === "string") return { error: pass1 };
  if (typeof pass2 === "string") return { error: pass2 };
  return { perIp: { perMinute, perDay }, today: { cap: dailyCap, budget: { usd, reserveUsd } }, maxImagePx, reader: { key: env.OPENROUTER_API_KEY, pass1, pass2 } };
}

function parseScanInput(value: unknown): ScanInput | null {
  if (typeof value !== "object" || value === null) return null;
  const { photo, ocrLines } = value as Record<string, unknown>;
  if (typeof photo !== "string" || !photo.startsWith(JPEG_DATA_URL) || photo.length === JPEG_DATA_URL.length) return null;
  if (!Array.isArray(ocrLines) || ocrLines.length > MAX_OCR_LINES) return null;
  if (!ocrLines.every((line): line is string => typeof line === "string" && line.length <= MAX_OCR_LINE_LENGTH)) return null;
  if (ocrLines.reduce((total, line) => total + line.length, 0) > MAX_OCR_CHARS) return null;
  return { photo: photo as JpegDataUrl, ocrLines };
}

/** `POST /api/scan`: reads a receipt photo and its on-device OCR lines with the configured models. */
export async function scanReceipt(request: Request, env: ScanEnv): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (request.headers.get("origin") !== new URL(request.url).origin) return refuse(403, "origin");
  const body = await readCapped(request, MAX_SCAN_BODY_BYTES);
  if (body === null) return refuse(413, "bodyTooLarge");
  const input = parseScanInput(parseJson(new TextDecoder().decode(body)));
  if (input === null) return refuse(400, "rejected");

  const config = scanConfig(env);
  if ("error" in config) {
    console.error(`scan is not configured: ${config.error}`);
    return refuse(503, "unavailable");
  }
  const longestSide = jpegLongestSide(input.photo.slice(JPEG_DATA_URL.length));
  if (longestSide === null || longestSide > config.maxImagePx) return refuse(400, "rejected");
  const ip = request.headers.get("cf-connecting-ip");
  if (ip === null) {
    console.error("a scan arrived with no cf-connecting-ip, so it cannot be rate limited");
    return refuse(503, "unavailable");
  }
  const cap = env.CreateLimiter.getByName(SCAN_DAILY_CAP_NAME);
  const room = await cap.peekToday(config.today);
  if (!room.ok) return tooMany("dailyLimit", room.retryAfterMs);
  const admission = await env.CreateLimiter.getByName(scanLimiterName(ip)).admit(config.perIp);
  if (!admission.ok) return tooMany(admission.refused, admission.retryAfterMs);
  const today = await cap.admitToday(config.today);
  if (!today.ok) return tooMany("dailyLimit", today.retryAfterMs);

  const started = Date.now();
  const { reply, calls, skipped } = await readReceipt(input, config.reader);
  const reserved = config.today.budget.reserveUsd;
  const reported = calls.reduce((total, call) => total + (call.cost ?? 0), 0);
  // A call with no reported cost, such as one that timed out, may still be billed, so the scan counts as its worst case.
  const cost = calls.every((call) => call.cost !== null) ? reported : Math.max(reported, reserved);
  await cap.settleToday(today.day, reserved, cost);
  console.log(
    JSON.stringify({
      event: "scan",
      ms: Date.now() - started,
      cost,
      calls,
      skipped,
      check: reply === null ? null : { passed: reply.check.passed, gaps: reply.check.gaps, problems: reply.check.passed ? 0 : reply.check.problems.length },
    }),
  );
  if (reply === null) return refuse(502, "unreadable");
  const debug: Record<string, string> = env.SCAN_DEBUG_HEADERS === "true" ? { "x-scan-cost": cost.toFixed(6), "x-scan-passes": String(new Set(calls.map((call) => call.pass)).size) } : {};
  return Response.json(reply, { headers: { "cache-control": "no-store", ...debug } });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function refuse(status: number, refused: ScanRefusal["refused"]): Response {
  return Response.json({ refused } satisfies ScanRefusal, { status });
}

function tooMany(refused: "rateLimited" | "dailyLimit", retryAfterMs: number): Response {
  return Response.json({ refused } satisfies ScanRefusal, { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } });
}
