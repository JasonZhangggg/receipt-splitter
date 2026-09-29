#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const entryDir = join(root, "dist/_expo/static/js/web");

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
const pidFile = join(runDir, "pid");
const logFile = join(runDir, "wrangler.log");
const baseUrl = `http://localhost:${port}`;

const commands = { launch, doctor, drive, evidence, cleanup };
if (!commands[command]) fail(`unknown command ${command}`);
await commands[command]();

async function launch() {
  if (listenerPids().length) fail(`port ${port} is already in use; pick another port or run cleanup`);
  if (!values["no-build"]) execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
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
  writeFileSync(pidFile, String(child.pid));
  for (let i = 0; i < 90; i++) {
    if (await status("/") === 200) {
      print({ ok: true, port, pid: child.pid, url: `${baseUrl}/`, log: logFile });
      return;
    }
    await sleep(1000);
  }
  fail(`wrangler did not answer on ${baseUrl}/ within 90s; see ${logFile}`);
}

async function doctor() {
  const report = await checks();
  print(report);
  if (!report.ok) process.exit(1);
}

async function checks() {
  const pid = ownPid();
  const alive = pid !== null && isAlive(pid);
  const owned = alive && listenerPids().some((p) => processGroup(p) === pid);
  const entry = builtEntry();
  const html = await text("/");
  const servesBuild = entry !== null && html.includes(`/_expo/static/js/web/${entry}`);
  const spaFallback = (await status("/s/doctor", { "Sec-Fetch-Mode": "navigate" })) === 200;
  const result = { process: alive, portOwned: owned, servesBuild, spaFallback };
  return { ok: Object.values(result).every(Boolean), port, pid, entry, ...result };
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
      if (!(await heading.isVisible())) failures.push(`heading "${values["expect-heading"]}" not visible`);
    }
    for (const expected of values["expect-text"]) {
      if (!(await page.getByText(expected, { exact: true }).first().isVisible())) {
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
  const pid = ownPid();
  if (pid !== null && groupMembers(pid).length) {
    process.kill(-pid, "SIGTERM");
    for (let i = 0; i < 20 && groupMembers(pid).length; i++) await sleep(250);
    if (groupMembers(pid).length) process.kill(-pid, "SIGKILL");
    for (let i = 0; i < 20 && groupMembers(pid).length; i++) await sleep(250);
  }
  const strays = pid === null ? [] : groupMembers(pid);
  if (strays.length) fail(`process group ${pid} still has pids ${strays.join(", ")}`);
  for (let i = 0; i < 20 && listenerPids().length; i++) await sleep(250);
  const leftover = listenerPids();
  if (leftover.length) {
    fail(`port ${port} is still held by pid ${leftover.join(", ")}, which this run did not start`);
  }
  rmSync(runDir, { recursive: true, force: true });
  print({ ok: true, port, stoppedGroup: pid, portFree: true });
}

function groupMembers(pgid) {
  try {
    return execFileSync("pgrep", ["-g", String(pgid)], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function ownPid() {
  return existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : null;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listenerPids() {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      .split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function processGroup(pid) {
  return Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim());
}

function builtEntry() {
  if (!existsSync(entryDir)) return null;
  const entries = readdirSync(entryDir).filter((f) => /^entry-.*\.js$/.test(f));
  return entries.length === 1 ? entries[0] : null;
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function print(value) {
  console.log(JSON.stringify(value));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
