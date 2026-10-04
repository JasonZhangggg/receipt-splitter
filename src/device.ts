import { isCents, type Cents } from "./core/money";
import { deviceId, isId, randomId, type DeviceId, type ParticipantId, type Split, type SplitId } from "./core/split";

export type SplitOnDevice = { readonly creatorSecret?: string; readonly me?: ParticipantId };

/** What home lists for a Split this device opened, read from the Split the page already holds. */
type Recent = { readonly names: readonly string[]; readonly total: Cents; readonly added: number; readonly seen: number };

export type RecentSplit = { readonly id: SplitId; readonly names: readonly string[]; readonly total: Cents; readonly added: number };

type SplitRecord = SplitOnDevice & { readonly recent?: Recent };

const prefix = "receipt-splitter:split:";
const keyOf = (id: SplitId) => `${prefix}${id}`;
const deviceKey = "receipt-splitter:device";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A Split expires 60 days after its last change, which this device sees only when it opens the Split. */
const LISTED_FOR_MS = 60 * DAY_MS;
const SHOWN = 5;
const KEPT = 50;

const storage = () => globalThis.localStorage as Storage | undefined;

function parseRecent(value: unknown): Recent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { names, total, added, seen } = value as Record<string, unknown>;
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string") || !isCents(total)) return undefined;
  if (typeof added !== "number" || typeof seen !== "number") return undefined;
  return { names, total, added, seen };
}

function readRecord(key: string): SplitRecord {
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(key) ?? "null");
    if (typeof saved !== "object" || saved === null) return {};
    const { creatorSecret, me, recent } = saved as Record<string, unknown>;
    const listed = parseRecent(recent);
    return {
      ...(typeof creatorSecret === "string" ? { creatorSecret } : {}),
      ...(isId<"ParticipantId">(me) ? { me } : {}),
      ...(listed ? { recent: listed } : {}),
    };
  } catch {
    return {};
  }
}

function writeRecord(id: SplitId, record: SplitRecord) {
  try {
    storage()?.setItem(keyOf(id), JSON.stringify(record));
  } catch {
    return;
  }
}

function storedIds(): SplitId[] {
  const store = storage();
  if (!store) return [];
  return Array.from({ length: store.length }, (_, index) => store.key(index))
    .filter((key): key is string => key?.startsWith(prefix) ?? false)
    .map((key) => key.slice(prefix.length))
    .filter((id): id is SplitId => isId<"SplitId">(id));
}

export function splitOnDevice(id: SplitId): SplitOnDevice {
  const { recent: _, ...memory } = readRecord(keyOf(id));
  return memory;
}

export function rememberSplit(id: SplitId, change: { creatorSecret?: string; me?: ParticipantId | null }) {
  const { me, ...rest } = { ...readRecord(keyOf(id)), ...change };
  writeRecord(id, me === null ? rest : { ...rest, me });
}

export function noteSplit(split: Split, now = Date.now()) {
  const record = readRecord(keyOf(split.id));
  const recent: Recent = { names: split.participants.map(({ name }) => name), total: split.receipt.total, added: record.recent?.added ?? now, seen: now };
  writeRecord(split.id, { ...record, recent });
  const byAge = storedIds()
    .map((id) => ({ id, added: readRecord(keyOf(id)).recent?.added ?? 0 }))
    .sort((a, b) => b.added - a.added);
  byAge.slice(KEPT).forEach(({ id }) => forgetSplit(id));
}

export function recentSplits(now = Date.now()): readonly RecentSplit[] {
  return storedIds()
    .flatMap((id) => {
      const { recent } = readRecord(keyOf(id));
      return recent && now - recent.seen <= LISTED_FOR_MS ? [{ id, names: recent.names, total: recent.total, added: recent.added }] : [];
    })
    .sort((a, b) => b.added - a.added)
    .slice(0, SHOWN);
}

export function forgetSplit(id: SplitId) {
  try {
    storage()?.removeItem(keyOf(id));
  } catch {
    return;
  }
}

let device: DeviceId | null = null;

export function thisDevice(): DeviceId {
  if (device) return device;
  try {
    const saved = storage()?.getItem(deviceKey);
    device = isId<"DeviceId">(saved) ? saved : deviceId(randomId(16));
    storage()?.setItem(deviceKey, device);
  } catch {
    device ??= deviceId(randomId(16));
  }
  return device;
}
