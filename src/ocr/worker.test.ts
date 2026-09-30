import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Worker = typeof import("../../public/ocr-worker.mjs");

const DICT = new URL("../../public/models/en_PP-OCRv5_rec_mobile.dict.txt", import.meta.url).href;
const ASSETS = [
  "/ort/ort-wasm-simd-threaded.wasm",
  "/models/ch_PP-OCRv5_det_mobile.onnx",
  "/models/en_PP-OCRv5_rec_mobile.onnx",
  "/models/en_PP-OCRv5_rec_mobile.dict.txt",
];

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (url: string) => store.get(url)?.clone(),
        put: async (url: string, response: Response) => void store.set(url, response),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    stored: async (name: string) =>
      Promise.all([...(stores.get(name) ?? [])].map(async ([url, response]) => [new URL(url).pathname.replace(/.*\/public/, ""), await response.clone().text()])),
  };
}

type Serve = (path: string) => Response;
const asset: Serve = (path) => new Response(`bytes of ${path.split("/").at(-1)}`, { headers: { "content-type": "application/octet-stream" } });
const spaFallback: Serve = () => new Response("<!DOCTYPE html><html><body></body></html>", { headers: { "content-type": "text/html; charset=utf-8" } });

let serve: Serve;
let caches: ReturnType<typeof fakeCaches>;
let worker: Worker;

beforeEach(async () => {
  serve = asset;
  caches = fakeCaches();
  vi.stubGlobal("caches", caches);
  vi.stubGlobal("fetch", async (url: string) => serve(new URL(url).pathname.replace(/.*\/public/, "")));
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

    expect(await caches.keys()).toEqual(["ocr-ort-1.30.0"]);
    expect(await caches.stored("ocr-ort-1.30.0")).toEqual([
      ["/ort/ort-wasm-simd-threaded.wasm", "bytes of ort-wasm-simd-threaded.wasm"],
      ["/models/ch_PP-OCRv5_det_mobile.onnx", "bytes of ch_PP-OCRv5_det_mobile.onnx"],
      ["/models/en_PP-OCRv5_rec_mobile.onnx", "bytes of en_PP-OCRv5_rec_mobile.onnx"],
      ["/models/en_PP-OCRv5_rec_mobile.dict.txt", "bytes of en_PP-OCRv5_rec_mobile.dict.txt"],
    ]);
  });

  test("a download that failed is fetched again on the next prefetch", async () => {
    serve = (path) => (path.endsWith(".dict.txt") ? new Response("", { status: 503 }) : asset(path));
    await expect(worker.prefetch()).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned 503$/);

    serve = asset;
    await worker.prefetch();

    expect((await caches.stored("ocr-ort-1.30.0")).map(([path]) => path).sort()).toEqual([...ASSETS].sort());
  });

  test("read refuses a model that the server answers with the app's HTML page, and does not cache it", async () => {
    serve = (path) => (path.endsWith(".dict.txt") ? spaFallback(path) : asset(path));

    await expect(worker.read(DICT)).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned an HTML page$/);
    expect(await caches.stored("ocr-ort-1.30.0")).toEqual([]);
  });

  test("read refuses the HTML page without Cache Storage too", async () => {
    vi.stubGlobal("caches", undefined);
    serve = spaFallback;

    await expect(worker.read(DICT)).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned an HTML page$/);
  });

  test("read returns the cached asset", async () => {
    expect(await (await worker.read(DICT)).text()).toBe("bytes of en_PP-OCRv5_rec_mobile.dict.txt");
    expect(await caches.stored("ocr-ort-1.30.0")).toEqual([["/models/en_PP-OCRv5_rec_mobile.dict.txt", "bytes of en_PP-OCRv5_rec_mobile.dict.txt"]]);
  });
});
