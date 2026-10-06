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
// Text under 19 px at that size, or a photo over twice as tall as wide, is detected again closer, in strips that keep memory near a normal scan.
// A closer look under 1.5 times as wide found no more amounts on the eval set, and its shifted boxes changed what the model read.
const SMALL_TEXT = 19;
const CLOSER = 1.5;
const TALL = 2;
const WIDE = 3;
const CLOSE_SHORT_SIDE = 1280;
const CLOSE_MAX_PIXELS = 8_000_000;
const STRIP_ROWS = 1280;
const STRIP_OVERLAP = 160;
// Four boxes, each cut to 160 px of crop, read upright and flipped in one batch of eight, picked the right way up on all 164 eval photos.
const FLIP_SAMPLE = 4;
const FLIP_CROP_WIDTH = 160;
// The closer look and the turned and flipped re-reads start only while OCR is inside this budget, so a slow phone keeps the first look's boxes.
const OCR_BUDGET_MS = 5000;
const READ_PER_FIND = 3;
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
  let sure = 0;
  let marks = 0;
  for (let step = 0; step < steps; step++) {
    const row = offset + step * classes;
    let best = 0;
    for (let c = 1; c < classes; c++) if (scores[row + c] > scores[row + best]) best = c;
    if (best !== 0) {
      sure += scores[row + best];
      marks++;
    }
    if (best !== 0 && best !== previous) text += chars[best] ?? "";
    previous = best;
  }
  return { text, confidence: marks ? sure / marks : 0 };
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

export function detectionSize(width, height, close = false) {
  const scale = close
    ? Math.min(1, CLOSE_SHORT_SIDE / Math.min(width, height), Math.sqrt(CLOSE_MAX_PIXELS / (width * height)))
    : Math.min(1, DET_MAX_SIDE / Math.max(width, height));
  const size = (round) => ({ width: Math.max(32, round((width * scale) / 32) * 32), height: Math.max(32, round((height * scale) / 32) * 32) });
  const rounded = size(Math.round);
  return close && rounded.width * rounded.height > CLOSE_MAX_PIXELS ? size(Math.floor) : rounded;
}

export const threadCount = (isolated) => (isolated ? 4 : 1);

function scaleBox(box, sx, sy) {
  return { cx: box.cx * sx, cy: box.cy * sy, w: box.w * sx, h: box.h * sy, angle: box.angle };
}

export function sideways(boxes) {
  let tall = 0;
  let wide = 0;
  for (const { w, h } of boxes) {
    if (h > w) tall += w * h;
    else wide += w * h;
  }
  return tall > 2 * wide;
}

/** Maps a box found on the photo turned `quarter` quarter turns clockwise back onto the photo, `width` by `height` px. */
export function unturn(box, quarter, width, height) {
  const { cx, cy } = box;
  const [x, y] = [[cx, cy], [cy, height - cx], [width - cx, height - cy], [width - cy, cx]][quarter];
  return { ...box, cx: x, cy: y, angle: box.angle - (quarter * Math.PI) / 2 };
}

export function flip(box) {
  return { ...box, angle: box.angle + Math.PI };
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

function detectionCanvas(image, { quarter, close }) {
  const { width, height } = quarter % 2 ? detectionSize(image.height, image.width, close) : detectionSize(image.width, image.height, close);
  const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  context.translate([0, width, width, 0][quarter], [0, 0, height, height][quarter]);
  context.rotate((quarter * Math.PI) / 2);
  if (quarter % 2) context.drawImage(image, 0, 0, height, width);
  else context.drawImage(image, 0, 0, width, height);
  return { context, width, height };
}

function detectionTensor({ ort }, rgba, width, height) {
  const n = width * height;
  const bgr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    bgr[i] = (rgba[i * 4 + 2] / 255 - DET_MEAN[0]) / DET_STD[0];
    bgr[n + i] = (rgba[i * 4 + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
    bgr[2 * n + i] = (rgba[i * 4] / 255 - DET_MEAN[2]) / DET_STD[2];
  }
  return new ort.Tensor("float32", bgr, [1, 3, height, width]);
}

/** Overlapping bands of rows, in multiples of 32. A box belongs to the band whose share of the overlap holds its center, so no line is read twice. */
export function strips(height) {
  if (height <= STRIP_ROWS) return [{ top: 0, bottom: height, keepFrom: -Infinity, keepTo: Infinity }];
  const count = Math.ceil((height - STRIP_OVERLAP) / (STRIP_ROWS - STRIP_OVERLAP));
  const tops = Array.from({ length: count }, (_, k) => Math.round((k * (height - STRIP_ROWS)) / (count - 1) / 32) * 32);
  const cuts = tops.slice(1).map((top, k) => (tops[k] + STRIP_ROWS + top) / 2);
  return tops.map((top, k) => ({ top, bottom: top + STRIP_ROWS, keepFrom: cuts[k - 1] ?? -Infinity, keepTo: cuts[k] ?? Infinity }));
}

const cropWidth = (box) => Math.min(REC_MAX_WIDTH, Math.max(16, Math.round((REC_HEIGHT * box.w) / box.h)));

function crop(image, box) {
  const width = cropWidth(box);
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
    report?.(DETECTED + ((1 - DETECTED) * Math.min(k + REC_BATCH, order.length)) / order.length);
  }
  return texts;
}

async function detectBand(loaded, context, width, { top, bottom, keepFrom, keepTo }) {
  const rgba = context.getImageData(0, top, width, bottom - top).data;
  const detected = await loaded.det.run({ [loaded.det.inputNames[0]]: detectionTensor(loaded, rgba, width, bottom - top) });
  return dbBoxes(detected[loaded.det.outputNames[0]].data, width, bottom - top)
    .map((box) => ({ ...box, cy: box.cy + top }))
    .filter(({ cy }) => cy >= keepFrom && cy < keepTo);
}

function toPhoto(image, quarter, width, height) {
  const [frameWidth, frameHeight] = quarter % 2 ? [image.height, image.width] : [image.width, image.height];
  return (box) => unturn(scaleBox(box, frameWidth / width, frameHeight / height), quarter, image.width, image.height);
}

/** Where a box's center lies along the length of the photo as detected, from 0 at the top to 1 at the bottom. */
const alongOf = (image, quarter) => [(box) => box.cy / image.height, (box) => box.cx / image.width, (box) => 1 - box.cy / image.height, (box) => 1 - box.cx / image.width][quarter];

async function firstLook(loaded, image, quarter) {
  const { context, width, height } = detectionCanvas(image, { quarter, close: false });
  const found = await detectBand(loaded, context, width, strips(height)[0]);
  return { quarter, boxes: found.map(toPhoto(image, quarter, width, height)), textHeight: median(found.map((box) => box.h)) };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1] : 0;
}

export function looksCloser(width, height, textHeight) {
  const small = textHeight < SMALL_TEXT || height > TALL * width;
  return small && detectionSize(width, height, true).width >= CLOSER * detectionSize(width, height).width;
}

/** How far along the photo, from 0 to 1, the closely read bands reach: the end of the last band read, or past the end when all were read. */
export function seam(bands, read, height) {
  if (read === 0) return 0;
  return read === bands.length ? Infinity : bands[read - 1].keepTo / height;
}

/** The closely read boxes, then the first look's boxes whose centers lie past the seam, so each line is read once. */
export function stitch(close, first, at, along) {
  return [...close, ...first.filter((box) => along(box) >= at)];
}

/**
 * Whether to read the photo turned a quarter. A photo over twice as tall as wide is a long receipt held upright, whose tiny text the first look
 * finds as tall blobs; one over three times as wide is a long receipt lying on its side. Between those, the boxes decide.
 */
export function turns(boxes, width, height) {
  if (height > TALL * width) return false;
  return width > WIDE * height || sideways(boxes);
}

/**
 * Whether the closer look fits the time left when its remaining bands are found and then all its bands are read in one pass, as on a fast
 * machine. `bandMs` is the time the second band took to find; the first runs slower while the engine sizes itself. Reading a band's boxes
 * took about three times as long as finding them on the eval set (w01: 2.2 s against 0.73 s), whatever the machine.
 */
export function fitsWhole(bandMs, toFind, toRead, msLeft) {
  return bandMs * (toFind + toRead * READ_PER_FIND) <= msLeft;
}

/** A box cut to the start of its text, so its crop is at most `FLIP_CROP_WIDTH` px wide. */
function head(box) {
  const w = Math.min(box.w, (box.h * FLIP_CROP_WIDTH) / REC_HEIGHT);
  const shift = (box.w - w) / 2;
  return { ...box, cx: box.cx - shift * Math.cos(box.angle), cy: box.cy - shift * Math.sin(box.angle), w };
}

/** Up to `FLIP_SAMPLE` boxes holding more than a character or two, spread evenly along the photo, each cut to the start of its text. */
export function flipSample(boxes, along) {
  const fit = boxes.filter((box) => (REC_HEIGHT * box.w) / box.h >= 2 * REC_HEIGHT).sort((a, b) => along(a) - along(b));
  const picked = fit.length <= FLIP_SAMPLE ? fit : Array.from({ length: FLIP_SAMPLE }, (_, k) => fit[Math.round((k * (fit.length - 1)) / (FLIP_SAMPLE - 1))]);
  return picked.map(head);
}

const meanConfidence = (reads) => reads.reduce((sum, read) => sum + read.confidence, 0) / reads.length;

export function upsideDown(upright, flipped) {
  return flipped.length > 0 && meanConfidence(flipped) > meanConfidence(upright);
}

/**
 * Whether text is upside down, from a sample of the first look's boxes read upright and flipped in one pass, and the pace of that read in ms
 * per column of crop, which prices reading other boxes on this machine.
 */
async function upsideDownText(loaded, image, boxes, along, deadline) {
  const sample = flipSample(boxes, along);
  if (performance.now() >= deadline || sample.length === 0) return { flipped: false, pace: 0 };
  const crops = [...sample.map((box) => crop(image, box)), ...sample.map((box) => crop(image, flip(box)))];
  const started = performance.now();
  const reads = await readCrops(loaded, crops);
  const pace = (performance.now() - started) / crops.reduce((sum, { width }) => sum + width, 0);
  return { flipped: upsideDown(reads.slice(0, sample.length), reads.slice(sample.length)), pace };
}

/**
 * The boxes, found on the photo turned so its text reads upright, and their reads. The first look decides the turn: a quarter when the photo
 * lies sideways, and a half more when a sample of its boxes reads more surely flipped. Text is then found again in that frame, once. The closer
 * look finds its first two bands, and when the whole look fits the time left it finds the rest and reads all the boxes in one pass. Otherwise it
 * reads band by band, starts a band only while the last band's time still fits, and the first look's boxes cover the rest of the photo.
 */
async function findText(loaded, image, deadline, report) {
  let first = await firstLook(loaded, image, 0);
  if (turns(first.boxes, image.width, image.height) && performance.now() < deadline) first = await firstLook(loaded, image, 1);
  const { flipped, pace } = await upsideDownText(loaded, image, first.boxes, alongOf(image, first.quarter), deadline);
  const quarter = first.quarter + (flipped ? 2 : 0);
  report(DETECTED);
  const readAll = async (boxes) => ({ boxes, reads: await readCrops(loaded, boxes.map((box) => crop(image, box)), report) });
  const [width, height] = quarter % 2 ? [image.height, image.width] : [image.width, image.height];
  if (!looksCloser(width, height, first.textHeight)) return readAll(flipped ? (await firstLook(loaded, image, quarter)).boxes : first.boxes);

  const { context, width: closeWidth, height: closeHeight } = detectionCanvas(image, { quarter, close: true });
  const place = toPhoto(image, quarter, closeWidth, closeHeight);
  const bands = strips(closeHeight);
  const find = async (band) => (await detectBand(loaded, context, closeWidth, band)).map(place);
  const fallback = flipped ? first.boxes.map(flip) : first.boxes;
  const along = alongOf(image, quarter);
  // Reads are priced by the flip sample's pace, a band not yet found by the first look's boxes in its rows times how many more the closer look
  // has found so far, and finding a band by the last band's time.
  const readMs = (boxes) => pace * boxes.reduce((sum, box) => sum + cropWidth(box), 0);
  const past = (read) => fallback.filter((box) => along(box) >= seam(bands, read, closeHeight));
  const inBand = ({ keepFrom, keepTo }) => fallback.filter((box) => along(box) * closeHeight >= keepFrom && along(box) * closeHeight < keepTo);
  let bandMs = 0;
  let more = 1;
  const close = [];
  const found = async (k) => {
    const started = performance.now();
    close.push(await find(bands[k]));
    bandMs = performance.now() - started;
    const before = readMs(inBand(bands[k]));
    if (before > 0) more = Math.max(1, readMs(close[k]) / before);
  };
  const affords = (k, unread) => performance.now() + bandMs + readMs(unread) + more * readMs(inBand(bands[k])) + readMs(past(k + 1)) <= deadline;
  // The first band starts when the reads it implies fit; the second when the first band's pace says the closer look can go on.
  if (affords(0, [])) await found(0);
  if (close.length === 1 && bands.length > 1 && performance.now() + bandMs * (1 + READ_PER_FIND) <= deadline) await found(1);
  if (close.length === 0) return readAll(fallback);
  const whole =
    close.length === bands.length
      ? performance.now() + readMs(close.flat()) <= deadline
      : close.length === 2 && fitsWhole(bandMs, bands.length - 2, bands.length, deadline - performance.now());
  if (whole) {
    for (const band of bands.slice(close.length)) close.push(await find(band));
    return readAll(close.flat());
  }
  // Too slow for the whole look: read band by band while a band and the first look's boxes past it can still be read in time.
  const reads = [];
  let read = 0;
  for (; read < bands.length; read++) {
    if (!close[read] && !affords(read, [])) break;
    if (!close[read]) await found(read);
    if (performance.now() + readMs(close[read]) + readMs(past(read + 1)) > deadline) break;
    reads.push(...(await readCrops(loaded, close[read].map((box) => crop(image, box)))));
    report(DETECTED + ((1 - DETECTED) * (read + 1)) / bands.length);
  }
  const boxes = stitch(close.slice(0, read).flat(), fallback, seam(bands, read, closeHeight), along);
  const rest = boxes.slice(reads.length);
  return { boxes, reads: [...reads, ...(await readCrops(loaded, rest.map((box) => crop(image, box))))] };
}

async function recognize(blob, report) {
  const loaded = await loadEngine(report);
  report(ENGINE_READY);
  const image = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const { boxes, reads } = await findText(loaded, image, performance.now() + OCR_BUDGET_MS, report);
    return boxes
      .map((box, i) => ({ text: reads[i].text.trim(), corners: corners(box) }))
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
