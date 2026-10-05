import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type OcrWorker = typeof import("../../public/ocr-worker.mjs");

const publicPath = (url: string) => new URL(url).pathname.replace(/.*\/public/, "");

const DICT = new URL("../../public/models/en_PP-OCRv5_rec_mobile.dict.txt", import.meta.url).href;
const ASSETS = [
  "/ort/ort.wasm.min.mjs",
  "/ort/ort-wasm-simd-threaded.mjs",
  "/ort/ort-wasm-simd-threaded.wasm",
  "/models/ch_PP-OCRv5_det_mobile.onnx",
  "/models/en_PP-OCRv5_rec_mobile.onnx",
  "/models/en_PP-OCRv5_rec_mobile.dict.txt",
];

const cacheName = `ocr-${createHash("sha256")
  .update(Buffer.concat(ASSETS.map((asset) => readFileSync(new URL(`../../public${asset}`, import.meta.url)))))
  .digest("hex")
  .slice(0, 12)}`;

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (url: string) => store.get(url)?.clone(),
        put: async (url: string, response: Response) => {
          const body = await response.arrayBuffer();
          store.set(url, new Response(body, { headers: response.headers }));
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    stored: async (name: string) =>
      Promise.all([...(stores.get(name) ?? [])].map(async ([url, response]) => [publicPath(url), await response.clone().text()])),
  };
}

type Serve = (path: string) => Response;
const assetBytes: Serve = (path) => new Response(`bytes of ${path.split("/").at(-1)}`, { headers: { "content-type": "application/octet-stream" } });
const spaFallback: Serve = () => new Response("<!DOCTYPE html><html><body></body></html>", { headers: { "content-type": "text/html; charset=utf-8" } });

let serve: Serve;
let caches: ReturnType<typeof fakeCaches>;
let worker: OcrWorker;

beforeEach(async () => {
  serve = assetBytes;
  caches = fakeCaches();
  vi.stubGlobal("caches", caches);
  vi.stubGlobal("fetch", async (url: string) => serve(publicPath(url)));
  vi.resetModules();
  worker = await import("../../public/ocr-worker.mjs");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectionSize", () => {
  test("shrinks a large photo to 960 px on its longest side, in multiples of 32", () => {
    expect(worker.detectionSize(2000, 1000)).toEqual({ width: 960, height: 480 });
    expect(worker.detectionSize(1000, 2000)).toEqual({ width: 480, height: 960 });
  });

  test("keeps a small photo at its own size, rounded to multiples of 32", () => {
    expect(worker.detectionSize(100, 20)).toEqual({ width: 96, height: 32 });
  });

  test("a close look keeps a long receipt at full size, and shrinks a phone photo to 1280 px on its short side", () => {
    expect(worker.detectionSize(969, 5047, true)).toEqual({ width: 960, height: 5056 });
    expect(worker.detectionSize(3024, 4032, true)).toEqual({ width: 1280, height: 1696 });
  });

  test("a close look stays under 8 million pixels", () => {
    expect(worker.detectionSize(2000, 12000, true)).toEqual({ width: 1152, height: 6944 });
  });
});

describe("looksCloser", () => {
  test("looks again at small text or a long photo when the closer look is at least 1.5 times as wide", () => {
    expect(worker.looksCloser(3024, 4032, 18)).toBe(true);
    expect(worker.looksCloser(969, 5047, 30)).toBe(true);
  });

  test("keeps the first look at large text, or when a closer look would barely be larger", () => {
    expect(worker.looksCloser(3024, 4032, 25)).toBe(false);
    expect(worker.looksCloser(960, 1280, 16)).toBe(false);
    expect(worker.looksCloser(525, 1280, 22)).toBe(false);
  });
});

describe("strips", () => {
  test("detects a short image in one piece", () => {
    expect(worker.strips(960)).toEqual([{ top: 0, bottom: 960, keepFrom: -Infinity, keepTo: Infinity }]);
  });

  test("cuts a long image into overlapping 1280-row strips, each keeping the boxes centered up to the middle of its overlaps", () => {
    expect(worker.strips(5056)).toEqual([
      { top: 0, bottom: 1280, keepFrom: -Infinity, keepTo: 1120 },
      { top: 960, bottom: 2240, keepFrom: 1120, keepTo: 2064 },
      { top: 1888, bottom: 3168, keepFrom: 2064, keepTo: 3008 },
      { top: 2848, bottom: 4128, keepFrom: 3008, keepTo: 3952 },
      { top: 3776, bottom: 5056, keepFrom: 3952, keepTo: Infinity },
    ]);
  });
});

test("threadCount uses four threads only when the page is cross-origin isolated", () => {
  expect([worker.threadCount(true), worker.threadCount(false)]).toEqual([4, 1]);
});

describe("dbBoxes", () => {
  function probabilityMap(width: number, height: number, regions: { x: number; y: number; w: number; h: number; p: number }[]) {
    const map = new Float32Array(width * height);
    for (const { x, y, w, h, p } of regions) {
      for (let row = y; row < y + h; row++) map.fill(p, row * width + x, row * width + x + w);
    }
    return map;
  }

  test("boxes a confident text region, grown by the unclip ratio, and drops faint and tiny regions", () => {
    const map = probabilityMap(40, 20, [
      { x: 10, y: 8, w: 20, h: 4, p: 0.9 },
      { x: 10, y: 14, w: 20, h: 4, p: 0.5 },
      { x: 1, y: 1, w: 3, h: 3, p: 0.9 },
    ]);

    expect(worker.dbBoxes(map, 40, 20)).toEqual([{ cx: 19.5, cy: 9.5, w: 25, h: 9, angle: 0 }]);
  });
});

describe("model downloads", () => {
  test("prefetch stores every asset in the versioned cache and drops older OCR caches", async () => {
    await caches.open("ocr-ort-1.29.0");

    await worker.prefetch();

    expect(await caches.keys()).toEqual([cacheName]);
    expect(await caches.stored(cacheName)).toEqual([
      ["/ort/ort.wasm.min.mjs", "bytes of ort.wasm.min.mjs"],
      ["/ort/ort-wasm-simd-threaded.mjs", "bytes of ort-wasm-simd-threaded.mjs"],
      ["/ort/ort-wasm-simd-threaded.wasm", "bytes of ort-wasm-simd-threaded.wasm"],
      ["/models/ch_PP-OCRv5_det_mobile.onnx", "bytes of ch_PP-OCRv5_det_mobile.onnx"],
      ["/models/en_PP-OCRv5_rec_mobile.onnx", "bytes of en_PP-OCRv5_rec_mobile.onnx"],
      ["/models/en_PP-OCRv5_rec_mobile.dict.txt", "bytes of en_PP-OCRv5_rec_mobile.dict.txt"],
    ]);
  });

  test("a download that failed is fetched again on the next prefetch", async () => {
    serve = (path) => (path.endsWith(".dict.txt") ? new Response("", { status: 503 }) : assetBytes(path));
    await expect(worker.prefetch()).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned 503$/);

    serve = assetBytes;
    await worker.prefetch();

    expect((await caches.stored(cacheName)).map(([path]) => path).sort()).toEqual([...ASSETS].sort());
  });

  test("prefetch downloads at low priority and a scan's own download at high priority", async () => {
    const priorities: Record<string, unknown[]> = { prefetch: [], scan: [] };
    let phase = "prefetch";
    vi.stubGlobal("fetch", async (url: string, init?: { priority?: string }) => {
      priorities[phase].push(init?.priority);
      return serve(publicPath(url));
    });

    await worker.prefetch();
    phase = "scan";
    await caches.delete(cacheName);
    vi.resetModules();
    worker = await import("../../public/ocr-worker.mjs");
    await worker.read(DICT);

    expect(priorities).toEqual({ prefetch: ["low", "low", "low", "low", "low", "low"], scan: ["high"] });
  });

  test("a scan does not wait on a prefetch download that has no response yet, and fetches that asset once at high priority", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: { priority: string; signal?: AbortSignal }) => {
      requests.push(`${init.priority} ${publicPath(url)}`);
      if (init.priority === "high" || !url.endsWith(".dict.txt")) return Promise.resolve(serve(publicPath(url)));
      return new Promise((_, reject) => {
        if (init.signal?.aborted) reject(init.signal.reason);
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });

    const prefetched = worker.prefetch();
    const scanned = await (await worker.read(DICT)).text();
    await prefetched;

    expect(scanned).toBe("bytes of en_PP-OCRv5_rec_mobile.dict.txt");
    expect(requests.filter((request) => request.endsWith(".dict.txt"))).toEqual([
      "low /models/en_PP-OCRv5_rec_mobile.dict.txt",
      "high /models/en_PP-OCRv5_rec_mobile.dict.txt",
    ]);
  });

  test("a scan waits on a prefetch download that is already receiving its response instead of fetching it again", async () => {
    const requests: string[] = [];
    let finish = () => {};
    vi.stubGlobal("fetch", async (url: string, init: { priority: string }) => {
      requests.push(`${init.priority} ${publicPath(url)}`);
      const response = serve(publicPath(url));
      if (!url.endsWith(".dict.txt")) return response;
      const body = new ReadableStream({ start: (controller) => void (finish = () => (controller.enqueue(new TextEncoder().encode("streamed dict")), controller.close())) });
      return new Response(body, { headers: response.headers });
    });

    const prefetched = worker.prefetch();
    await vi.waitFor(() => expect(requests).toContain("low /models/en_PP-OCRv5_rec_mobile.dict.txt"));
    await new Promise((settled) => setTimeout(settled));
    const scan = worker.read(DICT);
    finish();

    expect(await (await scan).text()).toBe("streamed dict");
    await prefetched;
    expect(requests.filter((request) => request.endsWith(".dict.txt"))).toEqual(["low /models/en_PP-OCRv5_rec_mobile.dict.txt"]);
  });

  test("read refuses a model that the server answers with the app's HTML page, and does not cache it", async () => {
    serve = (path) => (path.endsWith(".dict.txt") ? spaFallback(path) : assetBytes(path));

    await expect(worker.read(DICT)).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned an HTML page$/);
    expect(await caches.stored(cacheName)).toEqual([]);
  });

  test("read refuses the HTML page without Cache Storage too", async () => {
    vi.stubGlobal("caches", undefined);
    serve = spaFallback;

    await expect(worker.read(DICT)).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned an HTML page$/);
  });

  test("read returns the cached asset", async () => {
    expect(await (await worker.read(DICT)).text()).toBe("bytes of en_PP-OCRv5_rec_mobile.dict.txt");
    expect(await caches.stored(cacheName)).toEqual([["/models/en_PP-OCRv5_rec_mobile.dict.txt", "bytes of en_PP-OCRv5_rec_mobile.dict.txt"]]);
  });
});
