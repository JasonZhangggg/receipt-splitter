import { getServerByName } from "partyserver";
import type { CreateSplitRefusal, CreateSplitResponse, Rejection } from "../src/core/operations";
import { parseNewSplit } from "../src/core/parse";
import { SPLIT_BYTE_BUDGET, isMintedSplitId, type MintedSplitId } from "../src/core/split";
import { limiterKey } from "./rate-limit";

const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_CREATE_BODY_BYTES = SPLIT_BYTE_BUDGET + 4 * 1024;
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const ID_LENGTH = 22;

export async function createSplit(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const text = await readCapped(request, MAX_CREATE_BODY_BYTES);
  if (text === null) return refuse(413, { refused: "bodyTooLarge" });
  const body = readBody(text);
  if (!body.ok) return refuse(400, { refused: "rejected", rejection: body.rejection });
  const id = mintSplitId();
  const parsed = parseNewSplit(body.split, id);
  if (!parsed.ok) return refuse(400, { refused: "rejected", rejection: prefixed(parsed.rejection, "split") });

  const ip = request.headers.get("cf-connecting-ip");
  const admission = await env.CreateLimiter.getByName(limiterKey(ip ?? "unknown")).admit();
  if (!admission.ok) {
    return refuse(429, { refused: "rateLimited" }, { "retry-after": String(Math.ceil(admission.retryAfterMs / 1000)) });
  }
  const verdict = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  if (verdict === "failed") return refuse(403, { refused: "turnstileFailed" });
  if (verdict === "unavailable") return refuse(503, { refused: "turnstileUnavailable" });

  const server = await getServerByName(env.SplitServer, id);
  const created = await server.create(parsed.split);
  if (!created.created) throw new Error(`minted Split id ${id} already exists`);
  const response: CreateSplitResponse = { id, creatorSecret: created.creatorSecret };
  return Response.json(response, { status: 201 });
}

type Body =
  | { readonly ok: true; readonly turnstileToken: string; readonly split: unknown }
  | { readonly ok: false; readonly rejection: Rejection };

function readBody(text: string): Body {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, rejection: { reason: "malformed", path: "" } };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, rejection: { reason: "malformed", path: "" } };
  }
  const fields = new Map<string, unknown>(Object.entries(value));
  const extra = [...fields.keys()].find((key) => key !== "turnstileToken" && key !== "split");
  if (extra !== undefined) return { ok: false, rejection: { reason: "malformed", path: extra } };
  const turnstileToken = fields.get("turnstileToken");
  if (typeof turnstileToken !== "string" || turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return { ok: false, rejection: { reason: "malformed", path: "turnstileToken" } };
  }
  return { ok: true, turnstileToken, split: fields.get("split") };
}

function prefixed(rejection: Rejection, prefix: string): Rejection {
  if (rejection.reason !== "malformed") return rejection;
  return { reason: "malformed", path: rejection.path === "" ? prefix : `${prefix}.${rejection.path}` };
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
  const id = Array.from(crypto.getRandomValues(new Uint8Array(ID_LENGTH)), (byte) => ID_ALPHABET[byte & 63]).join("");
  if (!isMintedSplitId(id)) throw new Error(`minted ${id}, which is not a Split id`);
  return id;
}

async function verifyTurnstile(token: string, ip: string | null, secret: string): Promise<"passed" | "failed" | "unavailable"> {
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
