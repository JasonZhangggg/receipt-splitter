import { isRoutableSplitId } from "../src/core/split";
import { readCapped } from "./create";

export const PHOTO_BYTE_CAP = 150 * 1024;

const SOI = 0xd8;
const APP1 = 0xe1;
const SOS = 0xda;

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
  if (!isJpegWithoutApp1(jpeg)) return status(400);
  const authorization = request.headers.get("authorization") ?? "";
  const response = await split.fetch("http://split/photo", { method: "PUT", headers: { authorization }, body: jpeg });
  return status(response.status);
}

/** EXIF and XMP, which can carry the GPS position, both live in APP1 segments, so any APP1 before the scan is refused. */
export function isJpegWithoutApp1(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) return false;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === SOS) return true;
    if (marker === APP1) return false;
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  return false;
}

function status(code: number): Response {
  return new Response(null, { status: code });
}
