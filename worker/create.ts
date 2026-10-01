import type { CreateSplitRefusal, CreateSplitResponse } from "../src/core/operations";
import { parseCreateSplitRequest } from "../src/core/parse";
import { SPLIT_BYTE_BUDGET, SPLIT_ID_LENGTH, isRoutableSplitId, randomId, type MintedSplitId } from "../src/core/split";
import { limiterKey } from "./rate-limit";

const MAX_CREATE_BODY_BYTES = SPLIT_BYTE_BUDGET + 4 * 1024;
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function createSplit(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const text = await readCapped(request, MAX_CREATE_BODY_BYTES);
  if (text === null) return refuse(413, { refused: "bodyTooLarge" });
  const id = mintSplitId();
  const parsed = parseCreateSplitRequest(parseJson(text), id);
  if (!parsed.ok) return refuse(400, { refused: "rejected", rejection: parsed.rejection });

  const ip = request.headers.get("cf-connecting-ip");
  const admission = await env.CreateLimiter.getByName(limiterKey(ip ?? "unknown")).admit();
  if (!admission.ok) {
    return refuse(429, { refused: "rateLimited" }, { "retry-after": String(Math.ceil(admission.retryAfterMs / 1000)) });
  }
  const verdict = await verifyTurnstile(parsed.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  if (verdict === "failed") return refuse(403, { refused: "turnstileFailed" });
  if (verdict === "unavailable") return refuse(503, { refused: "turnstileUnavailable" });

  const created = await env.SplitServer.getByName(id).create(parsed.split);
  if (!created.created) throw new Error(`minted Split id ${id} already exists`);
  const response: CreateSplitResponse = { id, creatorSecret: created.creatorSecret };
  return Response.json(response, { status: 201, headers: { "cache-control": "no-store" } });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readCapped(request: Request, cap: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > cap) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    total += chunk.value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function mintSplitId(): MintedSplitId {
  const id = randomId(SPLIT_ID_LENGTH);
  if (!isRoutableSplitId(id)) throw new Error(`minted ${id}, which is not a Split id`);
  return id;
}

async function verifyTurnstile(token: string, ip: string | null, secret: string | undefined): Promise<"passed" | "failed" | "unavailable"> {
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set, so no Split can be created");
    return "unavailable";
  }
  if (token === "") return "failed";
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
    if (!response.ok) return "unavailable";
    const result = await response.json<{ success?: unknown }>();
    return result.success === true ? "passed" : "failed";
  } catch (error) {
    console.error("Turnstile siteverify failed", error);
    return "unavailable";
  }
}

function refuse(status: number, refusal: CreateSplitRefusal, headers: Record<string, string> = {}): Response {
  return Response.json(refusal, { status, headers });
}
