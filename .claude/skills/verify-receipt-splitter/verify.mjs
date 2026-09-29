#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

process.on("uncaughtException", (error) => fail(error instanceof Error ? error.message : String(error)));

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
if (!command || !Number.isInteger(port) || port <= 0 || port >= 55000) {
  fail("usage: verify.mjs <launch|doctor|drive|evidence|cleanup> --port <port below 55000> [options]");
}

const inspectorPort = port + 10000;
const runDir = join(root, ".verify", String(port));
const pgidFile = join(runDir, "pgid");
const logFile = join(runDir, "wrangler.log");
const baseUrl = `http://localhost:${port}`;
const ownPrograms = new Set(["node", "wrangler", "workerd", "esbuild"]);

const commands = { launch, doctor, drive, evidence, cleanup };
if (!commands[command]) fail(`unknown command ${command}`);
await commands[command]();

async function launch() {
  const record = recordedGroup();
  if (record?.members.length) {
    fail(`process group ${record.pgid} from an earlier launch is still running; run cleanup --port ${port} first`);
  }
  for (const p of [port, inspectorPort]) {
    if (listenerPids(p).length) fail(`port ${p} is already in use; pick another port or run cleanup`);
  }
  if (!values["no-build"]) {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: ["ignore", 2, 2], timeout: 180_000 });
  }
  mkdirSync(runDir, { recursive: true });
  const log = openSync(logFile, "a");
  const child = spawn(
    join(root, "node_modules/.bin/wrangler"),
    [
      "dev",
      "--port", String(port),
      "--inspector-port", String(inspectorPort),
      "--persist-to", join(runDir, "state"),
      "--show-interactive-dev-session=false",
    ],
    { cwd: root, detached: true, stdio: ["ignore", log, log] },
  );
  await once(child, "spawn");
  child.unref();
  const pgid = child.pid;
  writeFileSync(pgidFile, String(pgid));
  const inGroup = (pid) => processGroup(pid) === pgid;
  if (await waitFor(async () => listenerPids(port).some(inGroup) && (await status("/")) === 200, 90_000)) {
    print({ ok: true, port, pgid, url: `${baseUrl}/`, log: logFile });
    return;
  }
  const strangers = listenerPids(port).filter((pid) => !inGroup(pid));
  fail(
    strangers.length
      ? `port ${port} is held by pid ${strangers.join(", ")}, outside wrangler's process group ${pgid}; run cleanup`
      : `wrangler did not answer on ${baseUrl}/ within 90s; see ${logFile}`,
  );
}

async function doctor() {
  const report = await checks();
  print(report);
  if (!report.ok) process.exit(1);
}

async function checks() {
  const record = recordedGroup();
  const pgid = record?.pgid ?? null;
  const running = Boolean(record?.members.length) && record.members.every(ownedByWorktree);
  const portOwned = running && listenerPids(port).some((p) => processGroup(p) === pgid);
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
  const record = recordedGroup();
  if (record) {
    const strangers = record.members.filter((m) => !ownedByWorktree(m));
    if (record.pgid === null || strangers.length) {
      rmSync(pgidFile);
      fail(
        record.pgid === null
          ? `${pgidFile} holds ${JSON.stringify(record.raw)}, not a process group id above 1; removed it and stopped nothing`
          : `process group ${record.pgid} has pids ${strangers.map((m) => m.pid).join(", ")} that are not this worktree's wrangler, workerd, esbuild, or node; removed ${pgidFile} and stopped nothing`,
      );
    }
    if (record.members.length) {
      const gone = () => groupMembers(record.pgid).length === 0;
      signalGroup(record.pgid, "SIGTERM");
      if (!(await waitFor(gone, 5000))) signalGroup(record.pgid, "SIGKILL");
      if (!(await waitFor(gone, 5000))) {
        fail(`process group ${record.pgid} still has pids ${groupMembers(record.pgid).map((m) => m.pid).join(", ")}`);
      }
    }
  }
  const held = () => [port, inspectorPort].flatMap((p) => listenerPids(p));
  if (!(await waitFor(() => held().length === 0, 5000))) {
    fail(`port ${port} or ${inspectorPort} is still held by pid ${held().join(", ")}, which this run did not start`);
  }
  rmSync(runDir, { recursive: true, force: true });
  print({ ok: true, port, stoppedGroup: record?.pgid ?? null, portFree: true });
}

function recordedGroup() {
  if (!existsSync(pgidFile)) return null;
  const raw = readFileSync(pgidFile, "utf8").trim();
  const pgid = Number(raw);
  if (!Number.isInteger(pgid) || pgid <= 1) return { raw, pgid: null, members: [] };
  return { raw, pgid, members: groupMembers(pgid) };
}

function ownedByWorktree({ command }) {
  return ownPrograms.has(basename(command.split(" ", 1)[0])) && command.includes(`${root}/node_modules/`);
}

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (groupMembers(pgid).length) throw error;
  }
}

function listenerPids(p) {
  return lines("lsof", ["-ti", `tcp:${p}`, "-sTCP:LISTEN"]).map(Number);
}

function groupMembers(pgid) {
  const pids = lines("pgrep", ["-g", String(pgid)]);
  if (!pids.length) return [];
  return lines("ps", ["-ww", "-o", "pid=,stat=,command=", "-p", pids.join(",")])
    .map((line) => line.match(/^\s*(\d+)\s+(\S+)\s*(.*)$/))
    .filter(([, , stat]) => !stat.startsWith("Z"))
    .map(([, pid, , command]) => ({ pid: Number(pid), command }));
}

function lines(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).split("\n").filter(Boolean);
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
    return (await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(5000) })).status;
  } catch {
    return 0;
  }
}

async function text(path) {
  try {
    return await (await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) })).text();
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
