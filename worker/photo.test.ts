import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connect, createSplit, leftovers, T0 } from "./testing";

const DAY = 24 * 60 * 60 * 1000;
const KB = 1024;

beforeEach(() => {
  vi.setSystemTime(T0);
});

const SOI = [0xff, 0xd8];
const APP0_JFIF = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
const APP1_EXIF = [0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08];
const DQT = [0xff, 0xdb, 0x00, 0x04, 0x00, 0x01];
const SOS = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
const EOI = [0xff, 0xd9];

function jpeg({ size = 2 * KB, head = [...APP0_JFIF, ...DQT], fill = 0x11 } = {}): Uint8Array {
  const start = [...SOI, ...head, ...SOS];
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set(start);
  bytes.set(EOI, size - EOI.length);
  return bytes;
}

function put(id: string, body: BodyInit, { secret, type = "image/jpeg" }: { secret?: string; type?: string | null } = {}): Promise<Response> {
  const headers = new Headers();
  if (type !== null) headers.set("content-type", type);
  if (secret !== undefined) headers.set("authorization", `Bearer ${secret}`);
  return exports.default.fetch(`http://localhost/api/splits/${id}/photo`, { method: "PUT", headers, body });
}

function get(id: string): Promise<Response> {
  return exports.default.fetch(`http://localhost/api/splits/${id}/photo`);
}

async function status(response: Promise<Response>): Promise<number> {
  const answered = await response;
  await answered.body?.cancel();
  return answered.status;
}

describe("PUT /api/splits/<id>/photo", () => {
  it("stores a JPEG from the Creator, and GET serves the same bytes as a private, unsniffable, same-origin image", async () => {
    const { id, creatorSecret } = await createSplit();
    const photo = jpeg({ size: 140 * KB });

    expect(await status(put(id, photo, { secret: creatorSecret }))).toBe(204);
    const response = await get(id);

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=3600",
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo);
  });

  it("replaces the photo on a second PUT", async () => {
    const { id, creatorSecret } = await createSplit();
    expect(await status(put(id, jpeg({ fill: 0x11 }), { secret: creatorSecret }))).toBe(204);
    expect(await status(put(id, jpeg({ fill: 0x22, size: 3 * KB }), { secret: creatorSecret }))).toBe(204);

    expect(new Uint8Array(await (await get(id)).arrayBuffer())).toEqual(jpeg({ fill: 0x22, size: 3 * KB }));
  });

  it("refuses a third PUT with 429 and keeps the second photo, so one Host cannot spend the day's row writes", async () => {
    const { id, creatorSecret } = await createSplit();
    expect(await status(put(id, jpeg({ fill: 0x11 }), { secret: creatorSecret }))).toBe(204);
    expect(await status(put(id, jpeg({ fill: 0x22 }), { secret: creatorSecret }))).toBe(204);

    expect(await status(put(id, jpeg({ fill: 0x33 }), { secret: creatorSecret }))).toBe(429);
    await evictDurableObject(env.SplitServer.getByName(id));
    expect(await status(put(id, jpeg({ fill: 0x33 }), { secret: creatorSecret }))).toBe(429);
    expect(new Uint8Array(await (await get(id)).arrayBuffer())).toEqual(jpeg({ fill: 0x22 }));
  });

  it("refuses a PUT without the secret, with another Split's secret, or with a malformed secret, and stores nothing", async () => {
    const { id } = await createSplit();
    const other = await createSplit();

    expect(await status(put(id, jpeg()))).toBe(403);
    expect(await status(put(id, jpeg(), { secret: other.creatorSecret }))).toBe(403);
    expect(await status(put(id, jpeg(), { secret: "not-a-secret" }))).toBe(403);
    expect(await status(get(id))).toBe(404);
  });

  it("refuses a body over 150 KB with 413 whether or not it declares its length, and takes exactly 150 KB", async () => {
    const { id, creatorSecret } = await createSplit();
    const streamed = new ReadableStream({
      pull(controller) {
        controller.enqueue(jpeg({ size: 100 * KB }));
      },
    });

    expect(await status(put(id, jpeg({ size: 200 * KB }), { secret: creatorSecret }))).toBe(413);
    expect(await status(put(id, jpeg({ size: 150 * KB + 1 }), { secret: creatorSecret }))).toBe(413);
    expect(await status(put(id, streamed, { secret: creatorSecret }))).toBe(413);
    expect(await status(get(id))).toBe(404);
    expect(await status(put(id, jpeg({ size: 150 * KB }), { secret: creatorSecret }))).toBe(204);
  });

  it("refuses bytes that are not a JPEG, a JPEG with an EXIF or XMP segment, and a JPEG cut off before its scan", async () => {
    const { id, creatorSecret } = await createSplit();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    const exifAfterJfif = jpeg({ head: [...APP0_JFIF, ...APP1_EXIF, ...DQT] });
    const xmp = jpeg({ head: [0xff, 0xe1, 0x00, 0x06, 0x68, 0x74, 0x74, 0x70] });
    const lengthPastEnd = new Uint8Array([...SOI, 0xff, 0xe0, 0x7f, 0xff, 0x00]);
    const noScan = new Uint8Array([...SOI, ...APP0_JFIF, ...EOI]);
    const zeroLength = new Uint8Array([...SOI, 0xff, 0xe0, 0x00, 0x00, ...SOS, ...EOI]);
    const notAMarker = new Uint8Array([...SOI, 0x00, 0xe0, 0x00, 0x04, 0x00, 0x00, ...SOS, ...EOI]);
    const noStartOfImage = new Uint8Array([0xff, 0xe0, ...SOS, ...EOI]);
    const cutAtScan = new Uint8Array([...SOI, ...APP0_JFIF, 0xff, 0xda]);

    for (const body of [png, html, exifAfterJfif, xmp, lengthPastEnd, noScan, zeroLength, notAMarker, noStartOfImage, cutAtScan, new Uint8Array(0)]) {
      expect(await status(put(id, body, { secret: creatorSecret }))).toBe(400);
    }
    expect(await status(get(id))).toBe(404);
  });

  it("refuses a body sent as anything but image/jpeg with 415", async () => {
    const { id, creatorSecret } = await createSplit();

    expect(await status(put(id, jpeg(), { secret: creatorSecret, type: "text/html" }))).toBe(415);
    expect(await status(put(id, jpeg(), { secret: creatorSecret, type: null }))).toBe(415);
    expect(await status(get(id))).toBe(404);
  });

  it("answers 404 for a Split that does not exist and leaves no storage behind", async () => {
    const id = "nosuchsplit0000000000B";

    expect(await status(put(id, jpeg(), { secret: "A".repeat(43) }))).toBe(404);
    expect(await status(get(id))).toBe(404);
    expect(await leftovers(id)).toEqual({ tables: [], keys: [], alarm: null });
    expect(await status(get("not a split id"))).toBe(404);
  });

  it("answers other methods with 405", async () => {
    const { id } = await createSplit();
    const response = await exports.default.fetch(`http://localhost/api/splits/${id}/photo`, { method: "DELETE" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, PUT");
  });

  it("refuses a PUT replayed after the 14-day delete with 410, so the photo never comes back", async () => {
    const { id, creatorSecret } = await createSplit();
    expect(await status(put(id, jpeg(), { secret: creatorSecret }))).toBe(204);
    vi.setSystemTime(T0 + 14 * DAY);
    expect(await runDurableObjectAlarm(env.SplitServer.getByName(id))).toBe(true);

    expect(await status(put(id, jpeg(), { secret: creatorSecret }))).toBe(410);
    expect(await status(get(id))).toBe(404);
  });

  it("refuses a first PUT that arrives 14 days after the Split was created with 410", async () => {
    const { id, creatorSecret } = await createSplit();
    vi.setSystemTime(T0 + 14 * DAY);

    expect(await status(put(id, jpeg(), { secret: creatorSecret }))).toBe(410);
    expect(await status(get(id))).toBe(404);
  });
});

it("refuses a photo for a Split stored before photos, which has no creation time, and keeps the Split open", async () => {
  const { id, creatorSecret } = await createSplit();
  const stub = env.SplitServer.getByName(id);
  await runInDurableObject(stub, (_, state) => state.storage.sql.exec("ALTER TABLE split DROP COLUMN created_at"));
  await evictDurableObject(stub);

  expect(await status(put(id, jpeg(), { secret: creatorSecret }))).toBe(410);
  expect(await status(get(id))).toBe(404);
  expect(await (await connect(id)).next()).toMatchObject({ type: "state", ref: null, photo: false, split: { id } });
});

describe("the photo flag", () => {
  it("is false in the snapshot, and every connected client sees it turn on when the photo lands", async () => {
    const { id, creatorSecret } = await createSplit();
    const a = await connect(id);
    const b = await connect(id);
    expect(await a.next()).toMatchObject({ type: "state", ref: null, photo: false });
    expect(await b.next()).toMatchObject({ type: "state", ref: null, photo: false });

    expect(await status(put(id, jpeg(), { secret: creatorSecret }))).toBe(204);

    expect(await a.next()).toMatchObject({ type: "state", ref: null, photo: true, split: { id, revision: 0 } });
    expect(await b.next()).toMatchObject({ type: "state", ref: null, photo: true, split: { id, revision: 0 } });
    expect(await (await connect(id)).next()).toMatchObject({ type: "state", photo: true });
  });
});
