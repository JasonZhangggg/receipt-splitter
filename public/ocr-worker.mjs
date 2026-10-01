const asset = (path) => new URL(path, import.meta.url).href;

const ORT_DIR = asset("./ort/");
const ORT_GLUE = asset("./ort/ort.wasm.min.mjs");
const ORT_THREAD_GLUE = asset("./ort/ort-wasm-simd-threaded.mjs");
const ORT_WASM = asset("./ort/ort-wasm-simd-threaded.wasm");
const DET_MODEL = asset("./models/ch_PP-OCRv5_det_mobile.onnx");
const REC_MODEL = asset("./models/en_PP-OCRv5_rec_mobile.onnx");
const REC_DICT = asset("./models/en_PP-OCRv5_rec_mobile.dict.txt");
const DOWNLOADS = [ORT_GLUE, ORT_THREAD_GLUE, ORT_WASM, DET_MODEL, REC_MODEL, REC_DICT];
const CACHE = "ocr-3ef68217dfef";

const DET_MAX_SIDE = 960;
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const PIXEL_THRESHOLD = 0.3;
const BOX_THRESHOLD = 0.6;
const UNCLIP_RATIO = 1.5;
const MIN_PIXELS = 10;
const REC_HEIGHT = 48;
const REC_MAX_WIDTH = REC_HEIGHT * 40;
const REC_BATCH = 8;
const DOWNLOADED = 0.5;
const ENGINE_READY = 0.6;
const DETECTED = 0.7;

export function ctcDecode(scores, steps, classes, chars, offset = 0) {
  let text = "";
  let previous = 0;
  for (let step = 0; step < steps; step++) {
    const row = offset + step * classes;
    let best = 0;
    for (let c = 1; c < classes; c++) if (scores[row + c] > scores[row + best]) best = c;
    if (best !== 0 && best !== previous) text += chars[best] ?? "";
    previous = best;
  }
  return text;
}

export function dbBoxes(prob, width, height) {
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const boxes = [];
  let top = 0;
  for (let start = 0; start < n; start++) {
    if (seen[start] || prob[start] <= PIXEL_THRESHOLD) continue;
    let count = 0, sum = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    const pixels = [];
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const p = stack[--top];
      const px = p % width;
      const py = (p / width) | 0;
      count++;
      sum += prob[p];
      sx += px;
      sy += py;
      sxx += px * px;
      syy += py * py;
      sxy += px * py;
      pixels.push(p);
      if (px > 0) visit(p - 1);
      if (px < width - 1) visit(p + 1);
      if (py > 0) visit(p - width);
      if (py < height - 1) visit(p + width);
    }
    if (count < MIN_PIXELS || sum / count < BOX_THRESHOLD) continue;

    const mx = sx / count;
    const my = sy / count;
    const cxx = sxx / count - mx * mx;
    const cyy = syy / count - my * my;
    const cxy = sxy / count - mx * my;
    const principal = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    let fit = fitRect(pixels, width, mx, my, Math.abs(principal) > Math.PI / 6 ? 0 : principal);
    if (fit.w / fit.h < 2) fit = fitRect(pixels, width, mx, my, 0);
    if (Math.min(fit.w, fit.h) < 3) continue;

    const grow = (fit.w * fit.h * UNCLIP_RATIO) / (2 * (fit.w + fit.h));
    const uc = (fit.u0 + fit.u1) / 2;
    const vc = (fit.v0 + fit.v1) / 2;
    boxes.push({
      cx: mx + uc * fit.cos - vc * fit.sin,
      cy: my + uc * fit.sin + vc * fit.cos,
      w: fit.w + 2 * grow,
      h: fit.h + 2 * grow,
      angle: fit.angle,
    });
  }
  return boxes;

  function visit(q) {
    if (!seen[q] && prob[q] > PIXEL_THRESHOLD) {
      seen[q] = 1;
      stack[top++] = q;
    }
  }
}

function fitRect(pixels, width, mx, my, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pixels) {
    const dx = (p % width) - mx;
    const dy = ((p / width) | 0) - my;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  return { angle, cos, sin, u0, u1, v0, v1, w: u1 - u0 + 1, h: v1 - v0 + 1 };
}

export function detectionSize(width, height) {
  const scale = Math.min(1, DET_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(32, Math.round((width * scale) / 32) * 32),
    height: Math.max(32, Math.round((height * scale) / 32) * 32),
  };
}

export const threadCount = (isolated) => (isolated ? 4 : 1);

function scaleBox(box, sx, sy) {
  return { cx: box.cx * sx, cy: box.cy * sy, w: box.w * sx, h: box.h * sy, angle: box.angle };
}

function corners(box) {
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: Math.round(box.cx + ((a * box.w) / 2) * cos - ((b * box.h) / 2) * sin),
    y: Math.round(box.cy + ((a * box.w) / 2) * sin + ((b * box.h) / 2) * cos),
  }));
}

const downloads = new Map();

function download(url, priority) {
  if (!globalThis.caches) return Promise.resolve();
  const current = downloads.get(url);
  const overtakes = current && priority === "high" && current.priority === "low" && !current.responded;
  if (current && !overtakes) return current.pending;
  current?.controller.abort();
  const entry = { priority, controller: new AbortController(), responded: false };
  entry.pending = store(url, entry).catch((error) => {
    if (downloads.get(url) === entry) downloads.delete(url);
    throw error;
  });
  downloads.set(url, entry);
  return entry.pending;
}

async function fetchAsset(url, priority, signal) {
  const response = await fetch(url, { priority, signal });
  if (!response.ok) throw new Error(`OCR download ${url} returned ${response.status}`);
  if (response.headers.get("content-type")?.startsWith("text/html")) throw new Error(`OCR download ${url} returned an HTML page`);
  return response;
}

async function store(url, entry) {
  const cache = await caches.open(CACHE);
  if (await cache.match(url)) return;
  const response = await fetchAsset(url, entry.priority, entry.controller.signal);
  entry.responded = true;
  await cache.put(url, response);
}

export async function read(url) {
  await download(url, "high").catch(() => {});
  const cached = await globalThis.caches?.open(CACHE).then((cache) => cache.match(url)).catch(() => undefined);
  return cached ?? (await fetchAsset(url, "high"));
}

export async function prefetch() {
  const overtaken = (url) => (error) => {
    const next = downloads.get(url);
    if (next) return next.pending;
    throw error;
  };
  await Promise.all(DOWNLOADS.map((url) => download(url, "low").catch(overtaken(url))));
  for (const key of await caches.keys()) {
    if (key.startsWith("ocr-") && key !== CACHE) await caches.delete(key);
  }
}

let engine;

function loadEngine(report) {
  engine ??= createEngine(report).catch((error) => {
    engine = undefined;
    throw error;
  });
  return engine;
}

async function createEngine(report) {
  let ready = 0;
  const counted = (loading) => loading.then((value) => (report((++ready / 5) * DOWNLOADED), value));
  const [ort, wasm, det, rec, dict] = await Promise.all([
    counted(import(ORT_GLUE)),
    counted(read(ORT_WASM).then((r) => r.arrayBuffer())),
    counted(read(DET_MODEL).then((r) => r.arrayBuffer())),
    counted(read(REC_MODEL).then((r) => r.arrayBuffer())),
    counted(read(REC_DICT).then((r) => r.text())),
  ]);
  ort.env.wasm.wasmPaths = ORT_DIR;
  ort.env.wasm.wasmBinary = wasm;
  ort.env.wasm.numThreads = threadCount(self.crossOriginIsolated);
  const options = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
  const lines = dict.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return {
    ort,
    det: await ort.InferenceSession.create(new Uint8Array(det), options),
    rec: await ort.InferenceSession.create(new Uint8Array(rec), options),
    chars: ["", ...lines, " "],
  };
}

function detectionInput({ ort }, image) {
  const { width, height } = detectionSize(image.width, image.height);
  const context = new OffscreenCanvas(width, height).getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const n = width * height;
  const bgr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    bgr[i] = (rgba[i * 4 + 2] / 255 - DET_MEAN[0]) / DET_STD[0];
    bgr[n + i] = (rgba[i * 4 + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
    bgr[2 * n + i] = (rgba[i * 4] / 255 - DET_MEAN[2]) / DET_STD[2];
  }
  return { tensor: new ort.Tensor("float32", bgr, [1, 3, height, width]), width, height };
}

function crop(image, box) {
  const width = Math.min(REC_MAX_WIDTH, Math.max(16, Math.round((REC_HEIGHT * box.w) / box.h)));
  const context = new OffscreenCanvas(width, REC_HEIGHT).getContext("2d");
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  const sx = width / box.w;
  const sy = REC_HEIGHT / box.h;
  const a = sx * cos, c = sx * sin, b = -sy * sin, d = sy * cos;
  context.setTransform(a, b, c, d, width / 2 - (a * box.cx + c * box.cy), REC_HEIGHT / 2 - (b * box.cx + d * box.cy));
  context.drawImage(image, 0, 0);
  return { width, rgba: context.getImageData(0, 0, width, REC_HEIGHT).data };
}

async function readCrops({ ort, rec, chars }, crops, report) {
  const order = crops.map((_, i) => i).sort((i, j) => crops[i].width - crops[j].width);
  const texts = new Array(crops.length);
  for (let k = 0; k < order.length; k += REC_BATCH) {
    const batch = order.slice(k, k + REC_BATCH);
    const width = Math.max(...batch.map((i) => crops[i].width));
    const plane = REC_HEIGHT * width;
    const input = new Float32Array(batch.length * 3 * plane);
    batch.forEach((ci, bi) => {
      const { width: w, rgba } = crops[ci];
      const base = bi * 3 * plane;
      for (let y = 0; y < REC_HEIGHT; y++) {
        for (let x = 0; x < w; x++) {
          const s = (y * w + x) * 4;
          const o = base + y * width + x;
          input[o] = rgba[s + 2] / 127.5 - 1;
          input[o + plane] = rgba[s + 1] / 127.5 - 1;
          input[o + 2 * plane] = rgba[s] / 127.5 - 1;
        }
      }
    });
    const result = await rec.run({ [rec.inputNames[0]]: new ort.Tensor("float32", input, [batch.length, 3, REC_HEIGHT, width]) });
    const output = result[rec.outputNames[0]];
    const [, steps, classes] = output.dims;
    batch.forEach((ci, bi) => {
      texts[ci] = ctcDecode(output.data, steps, classes, chars, bi * steps * classes);
    });
    report(DETECTED + ((1 - DETECTED) * Math.min(k + REC_BATCH, order.length)) / order.length);
  }
  return texts;
}

async function recognize(blob, report) {
  const loaded = await loadEngine(report);
  report(ENGINE_READY);
  const image = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const { tensor, width, height } = detectionInput(loaded, image);
    const detected = await loaded.det.run({ [loaded.det.inputNames[0]]: tensor });
    const boxes = dbBoxes(detected[loaded.det.outputNames[0]].data, width, height).map((box) =>
      scaleBox(box, image.width / width, image.height / height),
    );
    report(DETECTED);
    const texts = await readCrops(loaded, boxes.map((box) => crop(image, box)), report);
    return boxes
      .map((box, i) => ({ text: texts[i].trim(), corners: corners(box) }))
      .filter((box) => box.text !== "");
  } finally {
    image.close();
  }
}

let queue = Promise.resolve();

globalThis.onmessage = ({ data }) => {
  if (data.type === "prefetch") {
    prefetch().catch(() => {});
    return;
  }
  const run = queue.then(() => recognize(data.image, (progress) => postMessage({ id: data.id, progress })));
  queue = run.catch(() => {});
  run.then(
    (boxes) => postMessage({ id: data.id, boxes }),
    (error) => postMessage({ id: data.id, error: String(error?.message ?? error) }),
  );
};
