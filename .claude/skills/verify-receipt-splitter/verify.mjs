#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string" },
    "no-build": { type: "boolean", default: false },
    path: { type: "string", default: "/" },
    "expect-text": { type: "string", multiple: true, default: [] },
    "expect-heading": { type: "string" },
    shot: { type: "string" },
    aria: { type: "string" },
    out: { type: "string" },
  },
});

const [command] = positionals;
const port = Number(values.port);
if (!command || !Number.isInteger(port) || port <= 0) {
  fail("usage: verify.mjs <launch|doctor|drive|evidence|cleanup> --port <port> [options]");
}

const runDir = join(root, ".verify", String(port));
const pgidFile = join(runDir, "pgid");
const logFile = join(runDir, "wrangler.log");
const baseUrl = `http://localhost:${port}`;

const commands = { launch, doctor, drive, evidence, cleanup };
if (!commands[command]) fail(`unknown command ${command}`);
await commands[command]();

async function launch() {
  if (listenerPids().length) fail(`port ${port} is already in use; pick another port or run cleanup`);
  if (!values["no-build"]) execFileSync("npm", ["run", "build"], { cwd: root, stdio: ["ignore", 2, 2] });
  mkdirSync(runDir, { recursive: true });
  const log = openSync(logFile, "a");
  const child = spawn(
    join(root, "node_modules/.bin/wrangler"),
    [
      "dev",
      "--port", String(port),
      "--inspector-port", String(port + 10000),
      "--persist-to", join(runDir, "state"),
      "--show-interactive-dev-session=false",
    ],
    { cwd: root, detached: true, stdio: ["ignore", log, log] },
  );
  child.unref();
  writeFileSync(pgidFile, String(child.pid));
  if (await waitFor(async () => (await status("/")) === 200, 90_000)) {
    print({ ok: true, port, pgid: child.pid, url: `${baseUrl}/`, log: logFile });
    return;
  }
  fail(`wrangler did not answer on ${baseUrl}/ within 90s; see ${logFile}`);
}

async function doctor() {
  const report = await checks();
  print(report);
  if (!report.ok) process.exit(1);
}

async function checks() {
  const pgid = recordedGroup();
  const running = pgid !== null && groupMembers(pgid).length > 0;
  const portOwned = running && listenerPids().some((p) => processGroup(p) === pgid);
  const builtHtml = join(root, "dist/index.html");
  const servesBuild = existsSync(builtHtml) && (await text("/")) === readFileSync(builtHtml, "utf8");
  const spaFallback = (await status("/s/doctor", { "Sec-Fetch-Mode": "navigate" })) === 200;
  const result = { running, portOwned, servesBuild, spaFallback };
  return { ok: Object.values(result).every(Boolean), port, pgid, ...result };
}

async function drive() {
  const { chromium, devices } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  const failures = [];
  try {
    const response = await page.goto(`${baseUrl}${values.path}`, { waitUntil: "networkidle" });
    if (response?.status() !== 200) failures.push(`status ${response?.status()}`);
    if (values["expect-heading"]) {
      const heading = page.getByRole("heading", { name: values["expect-heading"] });
      if (!(await becomesVisible(heading))) failures.push(`heading "${values["expect-heading"]}" not visible`);
    }
    for (const expected of values["expect-text"]) {
      if (!(await becomesVisible(page.getByText(expected, { exact: true }).first()))) {
        failures.push(`text "${expected}" not visible`);
      }
    }
    if (values.shot) {
      mkdirSync(dirname(resolve(values.shot)), { recursive: true });
      await page.screenshot({ path: values.shot, fullPage: true });
    }
    if (values.aria) {
      mkdirSync(dirname(resolve(values.aria)), { recursive: true });
      writeFileSync(values.aria, await page.locator("body").ariaSnapshot());
    }
  } finally {
    await browser.close();
  }
  failures.push(...consoleErrors.map((e) => `console error: ${e}`));
  print({ ok: failures.length === 0, url: `${baseUrl}${values.path}`, shot: values.shot, aria: values.aria, failures });
  if (failures.length) process.exit(1);
}

async function becomesVisible(locator) {
  return locator.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
}

async function evidence() {
  const out = resolve(values.out ?? `/tmp/verify-receipt-splitter/${port}`);
  mkdirSync(out, { recursive: true });
  if (existsSync(logFile)) copyFileSync(logFile, join(out, "wrangler.log"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "";
  const doctorReport = await checks();
  const files = readdirSync(out)
    .filter((f) => f !== "manifest.json")
    .map((f) => ({ file: f, bytes: statSync(join(out, f)).size }));
  const manifest = { head, dirty, port, capturedAt: new Date().toISOString(), doctor: doctorReport, files };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  print({ ok: doctorReport.ok, manifest: join(out, "manifest.json"), files: files.length });
  if (!doctorReport.ok) process.exit(1);
}

async function cleanup() {
  const pgid = recordedGroup();
  if (pgid !== null && groupMembers(pgid).length) {
    process.kill(-pgid, "SIGTERM");
    if (!(await waitFor(() => groupMembers(pgid).length === 0, 5000))) process.kill(-pgid, "SIGKILL");
    if (!(await waitFor(() => groupMembers(pgid).length === 0, 5000))) {
      fail(`process group ${pgid} still has pids ${groupMembers(pgid).join(", ")}`);
    }
  }
  if (!(await waitFor(() => listenerPids().length === 0, 5000))) {
    fail(`port ${port} is still held by pid ${listenerPids().join(", ")}, which this run did not start`);
  }
  rmSync(runDir, { recursive: true, force: true });
  print({ ok: true, port, stoppedGroup: pgid, portFree: true });
}

function recordedGroup() {
  return existsSync(pgidFile) ? Number(readFileSync(pgidFile, "utf8")) : null;
}

function listenerPids() {
  return pids("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
}

function groupMembers(pgid) {
  return pids("pgrep", ["-g", String(pgid)]);
}

function pids(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function processGroup(pid) {
  try {
    return Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim());
  } catch {
    return null;
  }
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return predicate();
}

async function status(path, headers = {}) {
  try {
    return (await fetch(`${baseUrl}${path}`, { headers })).status;
  } catch {
    return 0;
  }
}

async function text(path) {
  try {
    return await (await fetch(`${baseUrl}${path}`)).text();
  } catch {
    return "";
  }
}

function print(value) {
  console.log(JSON.stringify(value));
}

function fail(error) {
  print({ ok: false, error });
  process.exit(1);
}
