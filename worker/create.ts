import type { CreateSplitRefusal, CreateSplitResponse } from "../src/core/operations";
import { parseCreateSplitRequest } from "../src/core/parse";
import { SPLIT_BYTE_BUDGET, SPLIT_ID_LENGTH, isRoutableSplitId, randomId, type MintedSplitId } from "../src/core/split";
import { DAILY_CAP_NAME, limiterKey } from "./rate-limit";

const MAX_CREATE_BODY_BYTES = SPLIT_BYTE_BUDGET + 4 * 1024;

export async function createSplit(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const body = await readCapped(request, MAX_CREATE_BODY_BYTES);
  if (body === null) return refuse(413, { refused: "bodyTooLarge" });
  const id = mintSplitId();
  const parsed = parseCreateSplitRequest(parseJson(new TextDecoder().decode(body)), id);
  if (!parsed.ok) return refuse(400, { refused: "rejected", rejection: parsed.rejection });

  const ip = request.headers.get("cf-connecting-ip");
  if (ip === null) {
    console.error("a create arrived with no cf-connecting-ip, so it cannot be rate limited");
    return refuse(503, { refused: "unavailable" });
  }
  const cap = env.CreateLimiter.getByName(DAILY_CAP_NAME);
  const room = await cap.peekToday();
  if (!room.ok) return tooMany("dailyLimit", room.retryAfterMs);
  const admission = await env.CreateLimiter.getByName(limiterKey(ip)).admit();
  if (!admission.ok) return tooMany(admission.refused, admission.retryAfterMs);
  const today = await cap.admitToday();
  if (!today.ok) return tooMany("dailyLimit", today.retryAfterMs);

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

export async function readCapped(request: Request, cap: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > cap) return null;
  if (!request.body) return new Uint8Array(0);
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
  return bytes;
}

function mintSplitId(): MintedSplitId {
  const id = randomId(SPLIT_ID_LENGTH);
  if (!isRoutableSplitId(id)) throw new Error(`minted ${id}, which is not a Split id`);
  return id;
}

function refuse(status: number, refusal: CreateSplitRefusal): Response {
  return Response.json(refusal, { status });
}

function tooMany(refused: "rateLimited" | "dailyLimit", retryAfterMs: number): Response {
  return Response.json({ refused } satisfies CreateSplitRefusal, { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } });
}
