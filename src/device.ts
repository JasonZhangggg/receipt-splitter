import { deviceId, isId, randomId, type DeviceId, type ParticipantId, type SplitId } from "./core/split";

export type SplitOnDevice = { readonly creatorSecret?: string; readonly me?: ParticipantId };

const keyOf = (id: SplitId) => `receipt-splitter:split:${id}`;
const deviceKey = "receipt-splitter:device";

export function splitOnDevice(id: SplitId): SplitOnDevice {
  try {
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(keyOf(id)) ?? "null");
    if (typeof saved !== "object" || saved === null) return {};
    const { creatorSecret, me } = saved as Record<string, unknown>;
    return {
      ...(typeof creatorSecret === "string" ? { creatorSecret } : {}),
      ...(isId<"ParticipantId">(me) ? { me } : {}),
    };
  } catch {
    return {};
  }
}

export function rememberSplit(id: SplitId, change: { creatorSecret?: string; me?: ParticipantId | null }) {
  const { me, ...rest } = { ...splitOnDevice(id), ...change };
  try {
    globalThis.localStorage?.setItem(keyOf(id), JSON.stringify(me === null ? rest : { ...rest, me }));
  } catch {
    return;
  }
}

let device: DeviceId | null = null;

export function thisDevice(): DeviceId {
  if (device) return device;
  try {
    const saved = globalThis.localStorage?.getItem(deviceKey);
    device = isId<"DeviceId">(saved) ? saved : deviceId(randomId(16));
    globalThis.localStorage?.setItem(deviceKey, device);
  } catch {
    device ??= deviceId(randomId(16));
  }
  return device;
}
