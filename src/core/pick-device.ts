import { base64Url, hmacSha256 } from "./hmac";
import { deviceId, type DeviceId, type SplitId } from "./split";

/** The length of the id src/device.ts keeps once per browser. Picks never store it. */
export const BROWSER_DEVICE_LENGTH = 16;
const PICK_DEVICE_LENGTH = 22;

const utf8 = (text: string) => new TextEncoder().encode(text);

/**
 * The id a browser holds names under in one Split: an HMAC of the Split id keyed by the browser's own id, so link holders cannot tell the same phone across Splits.
 * An id of any other length is already per Split and passes through, which is how a pick stored before this, or sent by a page loaded before it, comes to match.
 */
export function pickDevice(device: DeviceId, splitId: SplitId): DeviceId {
  if (device.length !== BROWSER_DEVICE_LENGTH) return device;
  return deviceId(base64Url(hmacSha256(utf8(device), utf8(splitId))).slice(0, PICK_DEVICE_LENGTH));
}
