import type * as Ocr from "./index";
import type { TextBox } from "./types";

export { OcrUnavailable } from "./types";

type Reply = { id: number; boxes: TextBox[] } | { id: number; error: string } | { id: number; progress: number };

type Scan = { settle: (reply: Exclude<Reply, { progress: number }>) => void; onProgress?: (fraction: number) => void };

const idleRelease = 10_000;

let worker: Worker | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;
const pending = new Map<number, Scan>();

function release() {
  clearTimeout(idle);
  worker?.terminate();
  worker = undefined;
}

function ocrWorker(): Worker {
  if (!worker) {
    worker = new Worker("/ocr-worker.mjs", { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const scan = pending.get(data.id);
      if ("progress" in data) return scan?.onProgress?.(data.progress);
      pending.delete(data.id);
      scan?.settle(data);
      if (pending.size === 0) idle = setTimeout(release, idleRelease);
    };
    worker.onerror = (event) => {
      release();
      const error = event.message || "OCR worker failed to start";
      for (const [id, scan] of pending) scan.settle({ id, error });
      pending.clear();
    };
  }
  return worker;
}

export const recognize: typeof Ocr.recognize = (image, onProgress) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    clearTimeout(idle);
    pending.set(id, { settle: (reply) => ("boxes" in reply ? resolve(reply.boxes) : reject(new Error(reply.error))), onProgress });
    ocrWorker().postMessage({ type: "recognize", id, image });
  });

const offlinePaths = (loaded: string[]) => [
  ...new Set(["/", "/ocr-worker.mjs", ...loaded.filter((path) => !path.startsWith("/models/") && !path.endsWith(".wasm"))]),
];

function keepForOffline() {
  if (!globalThis.navigator?.serviceWorker) return;
  const loaded = performance
    .getEntriesByType("resource")
    .map(({ name }) => new URL(name))
    .filter((url) => url.origin === location.origin)
    .map((url) => url.pathname);
  const urls = offlinePaths(loaded).map((path) => new URL(path, location.origin).href);
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => registration.active?.postMessage({ type: "keep", urls }))
    .catch(() => {});
}

export const prefetchModel: typeof Ocr.prefetchModel = () => {
  const start = () => {
    ocrWorker().postMessage({ type: "prefetch" });
    keepForOffline();
  };
  const afterLoad = () => {
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });
  };
  if (typeof PerformanceObserver === "undefined") return;
  if (document.visibilityState === "hidden") {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      afterLoad();
    };
    document.addEventListener("visibilitychange", onVisible);
    return;
  }
  new PerformanceObserver((paints, observer) => {
    if (paints.getEntriesByName("first-contentful-paint").length === 0) return;
    observer.disconnect();
    afterLoad();
  }).observe({ type: "paint", buffered: true });
};
