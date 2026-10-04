/** Start-of-frame markers, which carry the image size. 0xc4, 0xc8 and 0xcc share the range but are other segments. */
const FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Markers with no length field after them: TEM, the restart markers, and SOI. */
const BARE_MARKERS = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8]);

/** A phone photo has fewer than 20 segments before its frame header. The cap keeps a crafted file inside the CPU budget. */
const MAX_SEGMENTS = 100;

/** Decodes `count` bytes at `offset` of base64 text, and none of the rest. */
function bytesAt(base64: string, offset: number, count: number): number[] | null {
  const start = Math.floor(offset / 3) * 4;
  const end = Math.ceil((offset + count) / 3) * 4;
  if (end > base64.length) return null;
  let text: string;
  try {
    text = atob(base64.slice(start, end));
  } catch {
    return null;
  }
  const skip = offset - (start / 4) * 3;
  if (text.length < skip + count) return null;
  return Array.from(text.slice(skip, skip + count), (char) => char.charCodeAt(0));
}

/**
 * The longer side in pixels of a base64 JPEG, read from its frame header without decoding any pixels,
 * or null when the bytes are not a JPEG with exactly one frame header before its scan data.
 */
export function jpegLongestSide(base64: string): number | null {
  const start = bytesAt(base64, 0, 2);
  if (start === null || start[0] !== 0xff || start[1] !== 0xd8) return null;
  let offset = 2;
  let size: number | null = null;
  for (let segment = 0; segment < MAX_SEGMENTS; segment += 1) {
    const head = bytesAt(base64, offset, 4);
    if (head === null || head[0] !== 0xff) return null;
    const marker = head[1];
    if (marker === 0xff) {
      offset += 1;
    } else if (BARE_MARKERS.has(marker)) {
      offset += 2;
    } else if (FRAME_MARKERS.has(marker)) {
      if (size !== null) return null;
      const dimensions = bytesAt(base64, offset + 5, 4);
      if (dimensions === null) return null;
      const [height, width] = [(dimensions[0] << 8) | dimensions[1], (dimensions[2] << 8) | dimensions[3]];
      if (height === 0 || width === 0) return null;
      size = Math.max(height, width);
      offset += 2 + ((head[2] << 8) | head[3]);
    } else {
      const length = (head[2] << 8) | head[3];
      if (marker === 0xd9 || length < 2) return null;
      if (marker === 0xda) return size;
      offset += 2 + length;
    }
  }
  return null;
}
