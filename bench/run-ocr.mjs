import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";

const USAGE = `usage: node bench/run-ocr.mjs --url http://localhost:<port> [--threads 4|1] [--only srd-1040,srd-1008] [--out bench/ocr] [--shots <dir>]

Launch the exported site first with .claude/skills/verify-receipt-splitter/verify.mjs launch --port <port>.`;

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    threads: { type: "string", default: "4" },
    only: { type: "string" },
    out: { type: "string", default: "bench/ocr" },
    shots: { type: "string" },
  },
});
if (!args.url || !["1", "4"].includes(args.threads)) {
  console.error(USAGE);
  process.exit(1);
}

const SESSION_SCANS = 6;
const DATA = "bench/data";
const TRANSCRIPTS = "bench/ocr/transcripts";
const route = new URL("/debug/ocr", args.url).href;
const only = args.only?.split(",").map((name) => name.replace(/\.jpg$/, ""));
const images = readdirSync(DATA)
  .filter((file) => file.endsWith(".jpg") && (!only || only.includes(basename(file, ".jpg"))))
  .sort();
if (images.length === 0) {
  console.error(`no images in ${DATA} match --only ${args.only}`);
  process.exit(1);
}

function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function readingOrder(boxes) {
  const lines = boxes
    .map((box) => {
      const ys = box.corners.map((p) => p.y);
      return { text: box.text, x: Math.min(...box.corners.map((p) => p.x)), y: (Math.min(...ys) + Math.max(...ys)) / 2, h: Math.max(...ys) - Math.min(...ys) };
    })
    .sort((a, b) => a.y - b.y);
  const rows = [];
  for (const line of lines) {
    const row = rows.at(-1);
    if (row && Math.abs(line.y - row.y) < 0.5 * Math.min(line.h, row.h)) {
      row.lines.push(line);
      row.y += (line.y - row.y) / row.lines.length;
    } else {
      rows.push({ y: line.y, h: line.h, lines: [line] });
    }
  }
  return rows.map((row) => row.lines.sort((a, b) => a.x - b.x).map((line) => line.text).join(" ")).join("\n");
}

function characterErrorRate(image, boxes) {
  const transcript = join(TRANSCRIPTS, image.replace(/\.jpg$/, ".txt"));
  if (!existsSync(transcript)) return undefined;
  const squash = (text) => text.replace(/\s+/g, "");
  const truth = squash(readFileSync(transcript, "utf8"));
  return levenshtein(squash(readingOrder(boxes)), truth) / truth.length;
}

function boxesFile(image, ms, boxes) {
  const rows = boxes.map((box) => `  ${JSON.stringify(box)}`).join(",\n");
  return `{ "image": ${JSON.stringify(image)}, "ms": ${ms}, "boxes": [\n${rows}\n] }\n`;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const compress = promisify(brotliCompress);
const brotli = async (bytes) => (await compress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY } })).length;
const mb = (bytes) => (bytes / 1e6).toFixed(2);

const profile = mkdtempSync(join(tmpdir(), "run-ocr-"));
let peakRendererKb = 0;
let peakSessionKb;
const memoryPoll = setInterval(() => {
  execFile("ps", ["-axww", "-o", "pid=,ppid=,rss=,command="], (error, stdout) => {
    if (error) return;
    const processes = stdout.split("\n").map((line) => {
      const [pid, ppid, rss] = line.trim().split(/\s+/, 3).map(Number);
      return { pid, ppid, rss, command: line };
    });
    const browser = processes.find((p) => p.command.includes(`--user-data-dir=${profile}`) && !p.command.includes("--type="));
    for (const p of processes) {
      if (browser && p.ppid === browser.pid && p.command.includes("--type=renderer")) peakRendererKb = Math.max(peakRendererKb, p.rss);
    }
  });
}, 100);

const context = await chromium.launchPersistentContext(profile, { headless: true });
const page = context.pages()[0] ?? (await context.newPage());
page.on("pageerror", (error) => console.error(`page error: ${error.message}`));

const requested = new Set();
context.on("request", (request) => requested.add(request.url()));

if (args.threads === "1") {
  await page.route(route, async (request) => {
    const response = await request.fetch();
    const headers = { ...response.headers() };
    delete headers["cross-origin-opener-policy"];
    delete headers["cross-origin-embedder-policy"];
    await request.fulfill({ response, headers });
  });
}

await page.goto(route);
const isolated = await page.evaluate(() => self.crossOriginIsolated);
if (isolated !== (args.threads === "4")) {
  console.error(`expected crossOriginIsolated ${args.threads === "4"} for ${args.threads} threads, got ${isolated}`);
  process.exit(1);
}

const input = page.getByLabel("Receipt photo");
async function read(image) {
  const photo = page.locator("img[alt=Receipt]");
  const previous = (await photo.count()) ? await photo.getAttribute("src") : null;
  await input.setInputFiles(join(DATA, image));
  await page.waitForFunction(
    (previous) => {
      const src = document.querySelector("img[alt=Receipt]")?.getAttribute("src");
      const status = document.querySelector("[data-testid=ocr-status]")?.textContent ?? "";
      return src && src !== previous && /^(Read |Could not)/.test(status);
    },
    previous,
    { polling: 100, timeout: 120_000 },
  );
  const status = await page.getByTestId("ocr-status").textContent();
  if (status.startsWith("Could not")) throw new Error(`${image}: ${status}`);
  return JSON.parse(await page.getByTestId("ocr-json").textContent());
}

const firstScan = await read(images[0]);
const firstScanUrls = [...requested].filter((url) => url.startsWith(args.url));

mkdirSync(args.out, { recursive: true });
if (args.shots) mkdirSync(args.shots, { recursive: true });
const results = [];
for (const image of images) {
  const { ms, boxes } = await read(image);
  const cer = characterErrorRate(image, boxes);
  results.push({ image, ms, cer });
  if (results.length + 1 === SESSION_SCANS) peakSessionKb = peakRendererKb;
  writeFileSync(join(args.out, image.replace(/\.jpg$/, ".json")), boxesFile(image, ms, boxes));
  if (args.shots) await page.getByTestId("ocr-photo").screenshot({ path: join(args.shots, image.replace(/\.jpg$/, ".png")) });
  console.log(`${image.padEnd(22)} cer ${cer === undefined ? "  -  " : cer.toFixed(3)}  ${String(ms).padStart(5)} ms  ${boxes.length} boxes`);
}

clearInterval(memoryPoll);
await context.close();
rmSync(profile, { recursive: true, force: true });

const firstScanBodies = await Promise.all(firstScanUrls.map(async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer())));
const downloadRaw = firstScanBodies.reduce((sum, body) => sum + body.length, 0);
const downloadBrotli = (await Promise.all(firstScanBodies.map(brotli))).reduce((sum, size) => sum + size, 0);
const scored = results.filter((r) => r.cer !== undefined).map((r) => r.cer);
console.log(
  [
    `median cer ${scored.length ? median(scored).toFixed(3) : "-"} over ${scored.length} transcribed receipts`,
    `median ${Math.round(median(results.map((r) => r.ms)))} ms warm over ${results.length} receipts`,
    `first scan ${firstScan.ms} ms`,
    `threads ${args.threads} (crossOriginIsolated ${isolated})`,
    `first-scan download ${mb(downloadBrotli)} MB brotli, ${mb(downloadRaw)} MB raw`,
    `peak renderer ${Math.round((peakSessionKb ?? peakRendererKb) / 1024)} MB over the first ${SESSION_SCANS} scans, ${Math.round(peakRendererKb / 1024)} MB over all ${results.length + 1}`,
  ].join(" | "),
);
