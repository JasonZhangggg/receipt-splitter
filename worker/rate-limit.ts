import { DurableObject } from "cloudflare:workers";

export type Bucket = { readonly tokens: number; readonly at: number };

export type BucketLimit = { readonly burst: number; readonly perSecond: number };

export type Admission<State> =
  | { readonly ok: true; readonly state: State }
  | { readonly ok: false; readonly state: State; readonly retryAfterMs: number };

export const OPERATION_LIMIT: BucketLimit = { burst: 60, perSecond: 20 };

export function takeToken(bucket: Bucket | null, now: number, limit: BucketLimit): Admission<Bucket> {
  const refilled = bucket
    ? Math.min(limit.burst, bucket.tokens + (Math.max(0, now - bucket.at) * limit.perSecond) / 1000)
    : limit.burst;
  if (refilled >= 1) return { ok: true, state: { tokens: refilled - 1, at: now } };
  return { ok: false, state: { tokens: refilled, at: now }, retryAfterMs: Math.ceil(((1 - refilled) * 1000) / limit.perSecond) };
}

export type WindowLimit = { readonly count: number; readonly windowMs: number };

export const CREATE_LIMIT: WindowLimit = { count: 10, windowMs: 60_000 };

export function admitToWindow(times: readonly number[], now: number, limit: WindowLimit): Admission<readonly number[]> {
  const recent = times.filter((time) => now - time < limit.windowMs);
  if (recent.length < limit.count) return { ok: true, state: [...recent, now] };
  return { ok: false, state: recent, retryAfterMs: recent[0] + limit.windowMs - now };
}

export function limiterKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === "" ? [] : tail.split(":");
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":")}::/64`;
}

export class CreateLimiter extends DurableObject<Cloudflare.Env> {
  #times: readonly number[] = [];

  admit(): { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number } {
    const admission = admitToWindow(this.#times, Date.now(), CREATE_LIMIT);
    this.#times = admission.state;
    return admission.ok ? { ok: true } : { ok: false, retryAfterMs: admission.retryAfterMs };
  }
}
