import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const VERIFY = join(import.meta.dirname, "verify.mjs");
const PORT = 41871;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function worktree(): { dir: string; runDir: string } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "verify-skill-")));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, runDir: join(dir, ".verify", String(PORT)) };
}

function run(dir: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [VERIFY, ...args, "--port", String(PORT)], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
  const reply = result.stdout.trim().split("\n").at(-1) ?? "";
  return { status: result.status, reply: JSON.parse(reply) as Record<string, unknown> };
}

async function fakeLaunch(dir: string, runDir: string, onTerm: string): Promise<ChildProcess> {
  const server = join(dir, "node_modules", "fake", "server.mjs");
  mkdirSync(join(dir, "node_modules", "fake"), { recursive: true });
  writeFileSync(server, `import { writeFileSync } from "node:fs";\nprocess.on("SIGTERM", () => { ${onTerm}; process.exit(0); });\nconsole.log("ready");\nsetInterval(() => {}, 1000);\n`);
  const child = spawn(process.execPath, [server], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  cleanups.push(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {}
  });
  await new Promise((ready) => child.stdout!.once("data", ready));
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "pgid"), String(child.pid));
  return child;
}

describe("verify.mjs cleanup", () => {
  test("stops the recorded process group and removes the run folder", async () => {
    const { dir, runDir } = worktree();
    const child = await fakeLaunch(dir, runDir, "");

    const { status, reply } = run(dir, ["cleanup"]);

    expect({ status, ok: reply.ok, stoppedGroup: reply.stoppedGroup }).toEqual({ status: 0, ok: true, stoppedGroup: child.pid });
    expect(existsSync(runDir)).toBe(false);
  });

  test("leaves the run folder and exits 1 when the pgid record changes while the group stops", async () => {
    const { dir, runDir } = worktree();
    await fakeLaunch(dir, runDir, `writeFileSync(${JSON.stringify(join(runDir, "pgid"))}, "99999999")`);

    const { status, reply } = run(dir, ["cleanup"]);

    expect({ status, ok: reply.ok }).toEqual({ status: 1, ok: false });
    expect(String(reply.error)).toContain("changed");
    expect(readFileSync(join(runDir, "pgid"), "utf8")).toBe("99999999");
  });
});

describe("verify.mjs doctor", () => {
  test("sees a live launch in another locale and time zone", async () => {
    const { dir, runDir } = worktree();
    const child = await fakeLaunch(dir, runDir, "");
    const started = execFileSync("ps", ["-o", "lstart=", "-p", String(child.pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: "UTC" } }).trim();
    writeFileSync(join(runDir, "launcher"), `${child.pid}\n${started}`);

    const { reply } = run(dir, ["doctor"], { LANG: "de_DE.UTF-8", LC_ALL: "de_DE.UTF-8", TZ: "Asia/Tokyo" });

    expect(reply.launching).toBe(child.pid);
  });
});

describe("verify.mjs launch", () => {
  test("fails before creating anything when the OS reports no start time for the launch", () => {
    const { dir, runDir } = worktree();
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "ps"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, "ps"), 0o755);

    const { status, reply } = run(dir, ["launch", "--no-build"], { PATH: `${bin}:${process.env.PATH}` });

    expect({ status, ok: reply.ok }).toEqual({ status: 1, ok: false });
    expect(String(reply.error)).toContain("start time");
    expect(existsSync(runDir)).toBe(false);
  });
});
