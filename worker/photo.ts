import { isRoutableSplitId } from "../src/core/split";
import { readCapped } from "./create";

const PHOTO_BYTE_CAP = 150 * 1024;

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP0 = 0xe0;
const DQT = 0xdb;
const DHT = 0xc4;
const DRI = 0xdd;
const COM = 0xfe;
const SOFN = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
const SEGMENTS_WITHOUT_METADATA = new Set([APP0, DQT, DHT, DRI, COM, SOS, ...SOFN]);

export async function servePhoto(request: Request, env: Cloudflare.Env, id: string): Promise<Response> {
  if (!isRoutableSplitId(id)) return status(404);
  const split = env.SplitServer.getByName(id);
  if (request.method === "GET") {
    const response = await split.fetch("http://split/photo");
    if (response.status !== 200) return status(response.status);
    return new Response(await response.arrayBuffer(), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, max-age=3600",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  }
  if (request.method !== "PUT") return new Response(null, { status: 405, headers: { allow: "GET, PUT" } });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "image/jpeg") return status(415);
  const jpeg = await readCapped(request, PHOTO_BYTE_CAP);
  if (jpeg === null) return status(413);
  if (!isJpegWithoutMetadata(jpeg)) return status(400);
  const authorization = request.headers.get("authorization") ?? "";
  const response = await split.fetch("http://split/photo", { method: "PUT", headers: { authorization }, body: jpeg });
  return status(response.status);
}

function isJpegWithoutMetadata(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) return false;
  let at = 2;
  let scanned = false;
  while (at + 1 < bytes.length && bytes[at] === 0xff) {
    while (bytes[at + 1] === 0xff) at += 1;
    const marker = bytes[at + 1];
    if (marker === EOI) return scanned && at + 2 === bytes.length;
    if (!SEGMENTS_WITHOUT_METADATA.has(marker) || at + 4 > bytes.length) return false;
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (marker === SOS) {
      scanned = true;
      at = nextMarker(bytes, at);
    }
  }
  return false;
}

function nextMarker(bytes: Uint8Array, from: number): number {
  for (let at = from; at + 1 < bytes.length; at += 1) {
    const next = bytes[at + 1];
    if (bytes[at] === 0xff && next !== 0x00 && next !== 0xff && (next < 0xd0 || next > 0xd7)) return at;
  }
  return bytes.length;
}

function status(code: number): Response {
  return new Response(null, { status: code });
}
