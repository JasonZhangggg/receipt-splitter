#!/usr/bin/env node
// Frame-samples every animation in e2e/motion.ts on three browser lanes at normal speed and at 4x CPU slowdown.
// Usage: motion.mjs --port 8811 [--lanes webkit-iphone,chromium-mobile,chromium-desktop] [--speeds 1,4] [--only pick-handoff,...] [--out dir]
//        motion.mjs --rejudge <dir with *.trace.json> --out <dir>   judges saved traces again under the current limits
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, devices, webkit } from "@playwright/test";

import { addLatency, judge, limits, record, scenarios } from "../../../e2e/motion.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: process.env.PORT ?? "8811" },
    lanes: { type: "string", default: "webkit-iphone,chromium-mobile,chromium-desktop" },
    speeds: { type: "string", default: "1,4" },
    only: { type: "string" },
    out: { type: "string" },
    repeat: { type: "string", default: "1" },
    rejudge: { type: "string" },
  },
});
const base = `http://localhost:${values.port}`;
const out = resolve(values.out ?? `/tmp/verify-receipt-splitter/${values.port}/motion`);
mkdirSync(out, { recursive: true });

const lanes = {
  "webkit-iphone": { engine: webkit, device: devices["iPhone 15"] },
  "chromium-mobile": { engine: chromium, device: devices["Pixel 7"] },
  "chromium-desktop": { engine: chromium, device: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
};

// WebKit has no CPU throttle, so its slow lane runs a busy loop that takes 3 of every 4 ms on the main thread.
const slowWebKit = (rate) => {
  const busy = (rate - 1) / rate;
  const spin = () => {
    const until = performance.now() + 4 * busy;
    while (performance.now() < until);
    setTimeout(spin, 4 * (1 - busy));
  };
  spin();
};

const picked = values.only ? scenarios.filter((s) => values.only.split(",").includes(s.id)) : scenarios;
const rows = [];
for (const laneName of values.lanes.split(",")) {
  const lane = lanes[laneName];
  if (!lane) throw new Error(`unknown lane ${laneName}`);
  if (values.rejudge) {
    for (const speed of values.speeds.split(",").map(Number)) {
      for (const scenario of picked) {
        const file = join(values.rejudge, `${laneName}-x${speed}-${scenario.id}.trace.json`);
        const verdict = existsSync(file) ? judge(JSON.parse(readFileSync(file, "utf8")), scenario.probes, { speed, instant: scenario.instant }) : { failures: ["no trace: the run did not finish"] };
        rows.push({ lane: laneName, speed, id: scenario.id, name: scenario.name, ...verdict, pass: verdict.failures.length === 0 });
      }
    }
    continue;
  }
  const browser = await lane.engine.launch();
  for (const speed of values.speeds.split(",").map(Number)) {
    for (const scenario of picked) {
      for (let run = 0; run < Number(values.repeat); run += 1) {
        const context = await browser.newContext({ ...lane.device, baseURL: base });
        await context.route("**/models/**", (route) => route.abort());
        await context.route("**/ort/**", (route) => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        let row;
        try {
          if (scenario.latencyMs) await addLatency(page, scenario.latencyMs);
          await scenario.setup(page);
          if (speed !== 1) {
            if (laneName.startsWith("chromium")) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: speed });
            else await page.evaluate(slowWebKit, speed);
          }
          const trace = await record(page, scenario.probes, () => scenario.act(page), { quietMs: scenario.quietMs, maxMs: speed === 1 ? 4000 : 8000 });
          const verdict = judge(trace, scenario.probes, { speed, instant: scenario.instant });
          if (errors.length) verdict.failures.push(`page error: ${errors[0]}`);
          writeFileSync(join(out, `${laneName}-x${speed}-${scenario.id}${run ? `-${run}` : ""}.trace.json`), JSON.stringify(trace));
          row = { lane: laneName, speed, id: scenario.id, name: scenario.name, ...verdict, pass: verdict.failures.length === 0 };
        } catch (error) {
          row = { lane: laneName, speed, id: scenario.id, name: scenario.name, pass: false, failures: [`could not run: ${String(error).split("\n")[0]}`] };
        }
        rows.push(row);
        process.stderr.write(`${row.pass ? "pass" : "FAIL"} ${laneName} x${speed} ${scenario.id} ${row.maxGap ?? "-"}ms ${row.failures.join("; ")}\n`);
        await context.close();
      }
    }
  }
  await browser.close();
}

const cell = (value) => (value === null || value === undefined ? "n/a" : String(value));
const table = [
  "| Animation | Lane | CPU | Max gap ms | p95 gap ms | Dropped | Long tasks | Jump px/frame | Opacity step | Detour px | Painted px | Result |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.name} | ${r.lane} | ${r.speed === 1 ? "1x" : r.lane.startsWith("webkit") ? `${r.speed}x busy loop` : `${r.speed}x`} | ${cell(r.maxGap)} | ${cell(r.p95Gap)} | ${cell(r.dropped)} | ${cell(r.longTasks)} | ${cell(r.jumpPx)} | ${cell(r.opacityStep)} | ${cell(r.detourPx)} | ${cell(r.paintedPx)} | ${r.pass ? "pass" : `fail: ${r.failures.join("; ")}`} |`),
].join("\n");
writeFileSync(join(out, "results.json"), JSON.stringify({ limits, rows }, null, 1));
writeFileSync(join(out, "table.md"), `${table}\n`);
const failed = rows.filter((r) => !r.pass);
process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, out, runs: rows.length, failed: failed.map((r) => `${r.lane} x${r.speed} ${r.id}: ${r.failures.join("; ")}`) })}\n`);
process.exit(failed.length === 0 ? 0 : 1);
