import type * as Ocr from "./index";
import type { TextBox } from "./types";

export { OcrUnavailable } from "./types";

type Reply = { id: number; boxes: TextBox[] } | { id: number; error: string };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (reply: Reply) => void>();

function ocrWorker(): Worker {
  if (!worker) {
    worker = new Worker("/ocr-worker.mjs", { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    };
    worker.onerror = (event) => {
      worker?.terminate();
      worker = undefined;
      const error = event.message || "OCR worker failed to start";
      for (const [id, settle] of pending) settle({ id, error });
      pending.clear();
    };
  }
  return worker;
}

export const recognize: typeof Ocr.recognize = (image) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (reply) => ("boxes" in reply ? resolve(reply.boxes) : reject(new Error(reply.error))));
    ocrWorker().postMessage({ type: "recognize", id, image });
  });

export const prefetchModel: typeof Ocr.prefetchModel = () => {
  const start = () => ocrWorker().postMessage({ type: "prefetch" });
  const afterLoad = () => (document.readyState === "complete" ? start() : addEventListener("load", start, { once: true }));
  new PerformanceObserver((paints, observer) => {
    if (paints.getEntriesByName("first-contentful-paint").length === 0) return;
    observer.disconnect();
    afterLoad();
  }).observe({ type: "paint", buffered: true });
};
