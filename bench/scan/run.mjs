import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { meetsFloor, scoreReading, tableRows } from "./score.mjs";

const USAGE = `Usage: node bench/scan/run.mjs --url http://localhost:PORT [options]

Posts each fixture to <url>/api/scan and scores every reading.

  --url <base>          the running site (required)
  --runs <n>            readings per fixture (default 3)
  --dir <dir>           fixtures: <id>.jpg with <id>.tsv or ocr/<id>.json (default bench/scan/fixtures)
  --truth <file>        one truth file keyed by id (default <dir>/<id>.truth.json)
  --only <id,id>        score only these fixtures
  --floor <file>        { "fullyCorrect": fraction } (default <dir>/floor.json when present)
  --concurrency <n>     requests in flight (default 2)
  --out <file.json>     write every run's result

Prints fixture ids only, never item names or amounts. Exits 1 below the floor or on a network error.`;

/** One row per printed line, the label and amount joined by two spaces. */
const tsvLines = (/** @type {string} */ text) =>
  text
    .trim()
    .split("\n")
    .map((row) => row.split("\t").map((cell) => cell.trim()).filter(Boolean).join("  "));

/** OCR boxes grouped into rows by y within half the median box height, each row read left to right. */
function boxLines(/** @type {{ boxes: { text: string, corners: { x: number, y: number }[] }[] }} */ ocr) {
  const boxes = ocr.boxes
    .map((box) => {
      const xs = box.corners.map((point) => point.x);
      const ys = box.corners.map((point) => point.y);
      return { text: box.text, x: Math.min(...xs), y: (Math.min(...ys) + Math.max(...ys)) / 2, h: Math.max(...ys) - Math.min(...ys) };
    })
    .sort((a, b) => a.y - b.y);
  const heights = boxes.map((box) => box.h).sort((a, b) => a - b);
  const tolerance = (heights[Math.floor(heights.length / 2)] ?? 20) * 0.5;
  /** @type {{ y: number, boxes: typeof boxes }[]} */
  const rows = [];
  for (const box of boxes) {
    const row = rows.find((candidate) => Math.abs(candidate.y - box.y) <= tolerance);
    if (row) {
      row.boxes.push(box);
      row.y = row.boxes.reduce((total, member) => total + member.y, 0) / row.boxes.length;
    } else rows.push({ y: box.y, boxes: [box] });
  }
  return rows.sort((a, b) => a.y - b.y).map((row) => row.boxes.sort((a, b) => a.x - b.x).map((box) => box.text).join("  "));
}

function ocrLines(/** @type {string} */ dir, /** @type {string} */ id) {
  const tsv = join(dir, `${id}.tsv`);
  if (existsSync(tsv)) return tsvLines(readFileSync(tsv, "utf8"));
  const ocr = join(dir, "ocr", `${id}.json`);
  if (existsSync(ocr)) return boxLines(JSON.parse(readFileSync(ocr, "utf8")));
  throw new Error(`${id}: no ${id}.tsv or ocr/${id}.json in ${dir}`);
}

/** A 200 body is used only when it has the reply's shape; anything else is a failed reading. */
function asReply(/** @type {any} */ body) {
  const ok =
    body &&
    Array.isArray(body.items) &&
    body.items.every((/** @type {any} */ item) => Number.isInteger(item?.price) && Array.isArray(item.discounts)) &&
    Array.isArray(body.bundles) &&
    Array.isArray(body.adjustments) &&
    Number.isInteger(body.total) &&
    typeof body.check?.passed === "boolean";
  return ok ? body : null;
}

async function scan(/** @type {string} */ endpoint, /** @type {string} */ origin, /** @type {string} */ photo, /** @type {string[]} */ lines) {
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ photo, ocrLines: lines }),
  });
  const text = await response.text();
  const ms = performance.now() - started;
  let body = null;
  if (response.status === 200) {
    try {
      body = JSON.parse(text);
    } catch {}
  }
  const cost = response.headers.get("x-scan-cost");
  const passes = response.headers.get("x-scan-passes");
  const retryAfter = response.headers.get("retry-after");
  return {
    status: response.status,
    ms,
    cost: cost === null || Number.isNaN(Number(cost)) ? null : Number(cost),
    passes: passes === null ? null : Number(passes),
    reply: response.status === 200 ? asReply(body) : null,
    retryAfter: retryAfter === null || Number.isNaN(Number(retryAfter)) ? null : Number(retryAfter),
  };
}

/** A 429 asking for at most this many seconds is waited out; a longer one means the per-day limit. */
const LONGEST_WAIT = 65;

async function pool(/** @type {(() => Promise<void>)[]} */ jobs, /** @type {number} */ size) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
}

function printTable(/** @type {string[][]} */ rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) console.log(row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join("  "));
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      runs: { type: "string", default: "3" },
      dir: { type: "string", default: "bench/scan/fixtures" },
      truth: { type: "string" },
      only: { type: "string" },
      floor: { type: "string" },
      concurrency: { type: "string", default: "2" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const runs = Number(values.runs);
  const concurrency = Number(values.concurrency);
  if (!values.url || !Number.isInteger(runs) || runs < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
    console.error(USAGE);
    return 2;
  }
  const base = new URL(values.url);
  const endpoint = new URL("/api/scan", base).href;
  const dir = values.dir;
  const only = values.only ? new Set(values.only.split(",").map((id) => id.trim())) : null;
  const ids = readdirSync(dir)
    .filter((file) => file.endsWith(".jpg"))
    .map((file) => file.slice(0, -4))
    .filter((id) => !only || only.has(id))
    .sort();
  if (ids.length === 0) {
    console.error(`No fixtures to scan in ${dir}.`);
    return 2;
  }
  const truths = values.truth ? JSON.parse(readFileSync(values.truth, "utf8")) : null;
  const floorFile = values.floor ?? (existsSync(join(dir, "floor.json")) ? join(dir, "floor.json") : null);
  const floor = floorFile ? JSON.parse(readFileSync(floorFile, "utf8")) : null;

  const fixtures = ids.map((id) => {
    const truth = truths ? truths[id] : JSON.parse(readFileSync(join(dir, `${id}.truth.json`), "utf8"));
    if (!truth) throw new Error(`${id}: no truth`);
    return { id, truth, lines: ocrLines(dir, id), photo: `data:image/jpeg;base64,${readFileSync(join(dir, `${id}.jpg`)).toString("base64")}` };
  });

  /** @type {import("./score.mjs").RunResult[]} */
  const results = [];
  let networkErrors = 0;
  let rateLimited = false;
  const jobs = fixtures.flatMap((fixture) =>
    Array.from({ length: runs }, (_, run) => async () => {
      let started = performance.now();
      try {
        let attempt = await scan(endpoint, base.origin, fixture.photo, fixture.lines);
        while (attempt.status === 429 && attempt.retryAfter !== null && attempt.retryAfter <= LONGEST_WAIT) {
          await new Promise((resolve) => setTimeout(resolve, attempt.retryAfter * 1000));
          started = performance.now();
          attempt = await scan(endpoint, base.origin, fixture.photo, fixture.lines);
        }
        if (attempt.status === 429) rateLimited = true;
        const { status, ms, cost, passes, reply } = attempt;
        results.push({ id: fixture.id, status, ms, cost, passes, score: scoreReading(fixture.truth, reply) });
      } catch (error) {
        networkErrors += 1;
        const cause = /** @type {{ code?: string, message?: string } | undefined} */ (error instanceof Error ? error.cause : undefined);
        console.error(`${fixture.id} run ${run + 1}: ${cause?.code || cause?.message || (error instanceof Error ? error.message : "request failed")}`);
        results.push({ id: fixture.id, status: null, ms: performance.now() - started, cost: null, passes: null, score: scoreReading(fixture.truth, null) });
      }
    }),
  );
  await pool(jobs, concurrency);
  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  printTable(tableRows(results));
  const spend = results.reduce((total, { cost }) => total + (cost ?? 0), 0);
  console.log(`\nTotal spend $${spend.toFixed(5)} over ${results.length} readings.`);
  const { met, fullyCorrect } = meetsFloor(results, floor);
  console.log(
    floor
      ? `Fully correct ${(fullyCorrect * 100).toFixed(1)}% against a floor of ${(floor.fullyCorrect * 100).toFixed(1)}%: ${met ? "met" : "NOT met"}.`
      : `Fully correct ${(fullyCorrect * 100).toFixed(1)}%, no floor.`,
  );
  if (values.out) writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);
  if (rateLimited) console.error("The route refused scans past its per-day limit. Raise SCAN_PER_MINUTE and SCAN_PER_DAY in .dev.vars for harness runs.");
  if (networkErrors > 0) console.error(`${networkErrors} request(s) failed at the network level.`);
  return met && networkErrors === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
