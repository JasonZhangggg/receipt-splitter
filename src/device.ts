import { isCents, type Cents } from "./core/money";
import { BROWSER_DEVICE_LENGTH } from "./core/pick-device";
import { deviceId, isId, PAYMENT_SERVICES, randomId, type DeviceId, type ParticipantId, type PaymentService, type Split, type SplitId } from "./core/split";

/** `payWith` is the way to pay this device last picked in its breakdown. */
export type SplitOnDevice = { readonly creatorSecret?: string; readonly me?: ParticipantId; readonly payWith?: PaymentService };

/** The stored `recent` entry's format. An entry of any other version, such as the unversioned ones written before the place was kept, is dropped the next time the list is read or noted. */
const RECENT_VERSION = 2;

/** What home lists for a Split this device opened, read from the Split the page already holds. */
type Recent = { readonly v: typeof RECENT_VERSION; readonly names: readonly string[]; readonly you?: number; readonly place?: string; readonly total: Cents; readonly added: number; readonly seen: number };

/** `names` is everyone in the Split; `you` is this device's place in it, when the device knows it. */
export type RecentSplit = { readonly id: SplitId; readonly names: readonly string[]; readonly you?: number; readonly place?: string; readonly total: Cents; readonly added: number };

type SplitRecord = SplitOnDevice & { readonly recent?: Recent };

const prefix = "receipt-splitter:split:";
const keyOf = (id: SplitId) => `${prefix}${id}`;
const deviceKey = "receipt-splitter:device";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A Split expires 60 days after its last change, which this device sees only when it opens the Split. */
const LISTED_FOR_MS = 60 * DAY_MS;
const KEPT = 50;

const storage = () => globalThis.localStorage as Storage | undefined;

function parseRecent(value: unknown): Recent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { v, names, you, place, total, added, seen } = value as Record<string, unknown>;
  if (v !== RECENT_VERSION || !Array.isArray(names) || !names.every((name) => typeof name === "string") || !isCents(total)) return undefined;
  if (typeof added !== "number" || typeof seen !== "number") return undefined;
  return { v, names, ...(typeof you === "number" && Number.isInteger(you) && you >= 0 && you < names.length ? { you } : null), ...(typeof place === "string" && place !== "" ? { place } : null), total, added, seen };
}

/** Whether the record holds a `recent` entry this version cannot read. */
function hasStaleRecent(key: string): boolean {
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(key) ?? "null");
    return typeof saved === "object" && saved !== null && "recent" in saved && parseRecent(saved.recent) === undefined;
  } catch {
    return false;
  }
}

function readRecord(key: string): SplitRecord {
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(key) ?? "null");
    if (typeof saved !== "object" || saved === null) return {};
    const { creatorSecret, me, payWith, recent } = saved as Record<string, unknown>;
    const listed = parseRecent(recent);
    return {
      ...(typeof creatorSecret === "string" ? { creatorSecret } : {}),
      ...(isId<"ParticipantId">(me) ? { me } : {}),
      ...(PAYMENT_SERVICES.some((service) => service === payWith) ? { payWith: payWith as PaymentService } : {}),
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
  try {
    const store = storage();
    if (!store) return [];
    return Array.from({ length: store.length }, (_, index) => store.key(index))
      .filter((key): key is string => key?.startsWith(prefix) ?? false)
      .map((key) => key.slice(prefix.length))
      .filter((id): id is SplitId => isId<"SplitId">(id));
  } catch {
    return [];
  }
}

function unlist(id: SplitId) {
  const { recent: _, ...memory } = readRecord(keyOf(id));
  if (Object.keys(memory).length === 0) forgetSplit(id);
  else writeRecord(id, memory);
}

/** Drops every Recent entry an older version wrote, keeping what an open Split needs: its creator secret, the name picked and the way to pay. */
function dropStaleRecents() {
  storedIds().filter((id) => hasStaleRecent(keyOf(id))).forEach(unlist);
}

export function splitOnDevice(id: SplitId): SplitOnDevice {
  const { recent: _, ...memory } = readRecord(keyOf(id));
  return memory;
}

export type SplitChange = { creatorSecret?: string; me?: ParticipantId | null; payWith?: PaymentService };

export function applyChange<R extends SplitOnDevice>(record: R, change: SplitChange): R {
  const { me, ...rest } = { ...record, ...change };
  return me === null ? (rest as R) : ({ ...rest, me } as R);
}

export function rememberSplit(id: SplitId, change: SplitChange) {
  writeRecord(id, applyChange(readRecord(keyOf(id)), change));
}

export function noteSplit(split: Split, now = Date.now()) {
  dropStaleRecents();
  const record = readRecord(keyOf(split.id));
  // The Host made the Split on the device that holds its secret, so that device is the first name until it picks another.
  const you = split.participants.findIndex(({ id }) => id === record.me);
  const place = you >= 0 ? you : record.creatorSecret !== undefined ? 0 : -1;
  const recent: Recent = { v: RECENT_VERSION, names: split.participants.map(({ name }) => name), ...(place >= 0 ? { you: place } : null), ...(split.place === undefined ? null : { place: split.place }), total: split.receipt.total, added: record.recent?.added ?? now, seen: now };
  writeRecord(split.id, { ...record, recent });
  const listed = storedIds()
    .flatMap((id) => {
      const { recent: kept } = readRecord(keyOf(id));
      return kept ? [{ id, added: kept.added }] : [];
    })
    .sort((a, b) => b.added - a.added);
  listed.slice(KEPT).forEach(({ id }) => unlist(id));
}

export function recentSplits(now = Date.now()): readonly RecentSplit[] {
  dropStaleRecents();
  return storedIds()
    .flatMap((id) => {
      const { recent } = readRecord(keyOf(id));
      return recent && now - recent.seen <= LISTED_FOR_MS ? [{ id, names: recent.names, ...(recent.you === undefined ? null : { you: recent.you }), ...(recent.place === undefined ? null : { place: recent.place }), total: recent.total, added: recent.added }] : [];
    })
    .sort((a, b) => b.added - a.added);
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
    device = isId<"DeviceId">(saved) && saved.length === BROWSER_DEVICE_LENGTH ? saved : deviceId(randomId(BROWSER_DEVICE_LENGTH));
    storage()?.setItem(deviceKey, device);
  } catch {
    device ??= deviceId(randomId(BROWSER_DEVICE_LENGTH));
  }
  return device;
}
