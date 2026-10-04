/** The Worker refuses a Receipt photo over this many bytes. */
export const PHOTO_BYTE_CAP = 150 * 1024;

declare const receiptJpegBrand: unique symbol;
/** The copy of the Host's photo that the Split keeps: a JPEG of at most 150 KB with no EXIF, GPS, ICC profile or comment. */
export type ReceiptJpeg = Blob & { readonly [receiptJpegBrand]: true };

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const DQT = 0xdb;
const DHT = 0xc4;
const DRI = 0xdd;
const SOFN = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
const KEPT = new Set([APP0, DQT, DHT, DRI, SOS, ...SOFN]);

/** The JPEG with every segment but the image's own dropped, or null when the bytes are not a whole JPEG. */
export function withoutMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  let scanned = false;
  while (at + 1 < bytes.length && bytes[at] === 0xff) {
    while (bytes[at + 1] === 0xff) at += 1;
    const marker = bytes[at + 1];
    if (marker === EOI) {
      kept.push(bytes.subarray(at, at + 2));
      return scanned ? concat(kept) : null;
    }
    if (at + 4 > bytes.length) return null;
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end > bytes.length) return null;
    const next = marker === SOS ? scanEnd(bytes, end) : end;
    if (KEPT.has(marker)) kept.push(bytes.subarray(at, next));
    scanned ||= marker === SOS;
    at = next;
  }
  return null;
}

/** Where the entropy-coded data after a scan header ends: the first marker that is not a stuffed 0xFF00 or a restart marker. */
function scanEnd(bytes: Uint8Array, from: number): number {
  for (let at = from; at + 1 < bytes.length; at += 1) {
    const next = bytes[at + 1];
    if (bytes[at] === 0xff && next !== 0x00 && (next < 0xd0 || next > 0xd7)) return at;
  }
  return bytes.length;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const whole = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  parts.reduce((at, part) => (whole.set(part, at), at + part.length), 0);
  return whole;
}

/** The encoded photo as the Split's copy, or null when it is not a JPEG or does not fit the cap once cleaned. */
export function receiptJpeg(encoded: Uint8Array): ReceiptJpeg | null {
  const cleaned = withoutMetadata(encoded);
  if (cleaned === null || cleaned.length > PHOTO_BYTE_CAP) return null;
  return new Blob([cleaned], { type: "image/jpeg" }) as ReceiptJpeg;
}
