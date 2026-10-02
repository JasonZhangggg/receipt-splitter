import { DurableObject } from "cloudflare:workers";
import { HISTORY_BURST_BYTES } from "../src/core/operations";

export type Bucket = { readonly tokens: number; readonly at: number };

export type BucketLimit = { readonly burst: number; readonly perSecond: number };

export type Admission<State> =
  | { readonly ok: true; readonly state: State }
  | { readonly ok: false; readonly state: State; readonly retryAfterMs: number };

export const OPERATION_LIMIT: BucketLimit = { burst: 60, perSecond: 20 };

export const HISTORY_LIMIT: BucketLimit = { burst: HISTORY_BURST_BYTES, perSecond: 1024 };

export function takeToken(bucket: Bucket | null, now: number, limit: BucketLimit, cost = 1): Admission<Bucket> {
  const refilled = bucket
    ? Math.min(limit.burst, bucket.tokens + (Math.max(0, now - bucket.at) * limit.perSecond) / 1000)
    : limit.burst;
  if (refilled >= cost) return { ok: true, state: { tokens: refilled - cost, at: now } };
  return { ok: false, state: { tokens: refilled, at: now }, retryAfterMs: Math.ceil(((cost - refilled) * 1000) / limit.perSecond) };
}

export function limiterKey(ip: string): string {
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)?.[1];
  if (mappedIpv4 !== undefined) return mappedIpv4;
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === "" ? [] : tail.split(":");
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":")}::/64`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

type UtcDay = number;

const utcDay = (time: number): UtcDay => Math.floor(time / DAY_MS);

const nextMidnight = (day: UtcDay): number => (day + 1) * DAY_MS;

const CREATE_LIMIT = { perMinute: 10, perDay: 50 } as const;

const MINUTE_MS = 60_000;

type CreateTimes = readonly number[];

const stillCounted = (times: CreateTimes, now: number): CreateTimes =>
  times.filter((time) => utcDay(time) === utcDay(now) || now - time < MINUTE_MS);

type IpAdmission =
  | { readonly ok: true; readonly state: CreateTimes }
  | { readonly ok: false; readonly refused: "rateLimited" | "dailyLimit"; readonly retryAfterMs: number };

function admitFromIp(times: CreateTimes, now: number): IpAdmission {
  const counted = stillCounted(times, now);
  const day = utcDay(now);
  if (counted.filter((time) => utcDay(time) === day).length >= CREATE_LIMIT.perDay) {
    return { ok: false, refused: "dailyLimit", retryAfterMs: nextMidnight(day) - now };
  }
  const lastMinute = counted.filter((time) => now - time < MINUTE_MS);
  if (lastMinute.length >= CREATE_LIMIT.perMinute) {
    return { ok: false, refused: "rateLimited", retryAfterMs: lastMinute[0] + MINUTE_MS - now };
  }
  return { ok: true, state: [...counted, now] };
}

type DayTally = { readonly day: UtcDay; readonly count: number };

export const DAILY_CREATE_CAP = 1000;

function admitToDay(tally: DayTally | undefined, now: number, cap: number): Admission<DayTally> {
  const day = utcDay(now);
  const count = tally?.day === day ? tally.count : 0;
  if (count < cap) return { ok: true, state: { day, count: count + 1 } };
  return { ok: false, state: { day, count }, retryAfterMs: nextMidnight(day) - now };
}

export const DAILY_CAP_NAME = "daily-cap";

const TIMES_KEY = "times";
const TALLY_KEY = "tally";

type Verdict = { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number };

type IpVerdict = { readonly ok: true } | Extract<IpAdmission, { readonly ok: false }>;

export class CreateLimiter extends DurableObject<Cloudflare.Env> {
  async peekToday(): Promise<Verdict> {
    const admission = admitToDay(await this.ctx.storage.get<DayTally>(TALLY_KEY), Date.now(), DAILY_CREATE_CAP);
    return admission.ok ? { ok: true } : { ok: false, retryAfterMs: admission.retryAfterMs };
  }

  async admitToday(): Promise<Verdict> {
    const storage = this.ctx.storage;
    const admission = admitToDay(await storage.get<DayTally>(TALLY_KEY), Date.now(), DAILY_CREATE_CAP);
    if (!admission.ok) return { ok: false, retryAfterMs: admission.retryAfterMs };
    await storage.put(TALLY_KEY, admission.state);
    if ((await storage.getAlarm()) === null) await storage.setAlarm(nextMidnight(admission.state.day));
    return { ok: true };
  }

  async admit(): Promise<IpVerdict> {
    const storage = this.ctx.storage;
    const now = Date.now();
    const admission = admitFromIp((await storage.get<number[]>(TIMES_KEY)) ?? [], now);
    if (!admission.ok) return admission;
    await storage.put(TIMES_KEY, admission.state);
    if ((await storage.getAlarm()) === null) await storage.setAlarm(nextMidnight(utcDay(now)));
    return { ok: true };
  }

  async alarm(): Promise<void> {
    const storage = this.ctx.storage;
    const now = Date.now();
    const today = utcDay(now);
    const tally = await storage.get<DayTally>(TALLY_KEY);
    if (tally?.day === today) return storage.setAlarm(nextMidnight(today));
    const counted = stillCounted((await storage.get<number[]>(TIMES_KEY)) ?? [], now);
    if (counted.length === 0) return storage.deleteAll();
    await storage.put(TIMES_KEY, counted);
    const last = counted[counted.length - 1];
    await storage.setAlarm(utcDay(last) === today ? nextMidnight(today) : last + MINUTE_MS);
  }
}
