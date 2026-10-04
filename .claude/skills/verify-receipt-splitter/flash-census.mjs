#!/usr/bin/env node
// Flash census: drives each reported flash in WebKit and Chromium against `launch --port`, with and without added socket and API latency,
// and with the simulated iOS keyboard from e2e/motion.ts (visualViewport shrinks and pans to the field on focus, and goes back on blur).
// Per phase it records every probe per frame, socket traffic, visualViewport resizes, and DOM removals and re-additions of the same element,
// then counts each flash under the signals that fired with it.
// Usage: flash-census.mjs --port 8873 [--engines webkit,chromium] [--latency 0,250] [--runs 2] [--only item-mode,...] [--out /tmp/flash]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, devices, webkit } from "@playwright/test";

import { drag, iosKeyboard, still, tap } from "../../../e2e/motion.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8873" },
    engines: { type: "string", default: "webkit,chromium" },
    latency: { type: "string", default: "0,250" },
    runs: { type: "string", default: "2" },
    only: { type: "string" },
    keyboard: { type: "string", default: "336" },
    out: { type: "string", default: "/tmp/flash" },
  },
});
const base = `http://localhost:${values.port}`;
const out = resolve(values.out);
mkdirSync(join(out, "traces"), { recursive: true });
mkdirSync(join(out, "frames"), { recursive: true });
const keyboardPx = Number(values.keyboard);
const lanes = { webkit: { engine: webkit, device: devices["iPhone 15"] }, chromium: { engine: chromium, device: devices["Pixel 7"] } };

/* In-page recorder. Times are Date.now() so they merge with the Node-side socket log. */
const recorder = () => {
  const census = { events: [], frames: [], probes: {}, recording: false };
  window.__census = census;
  const log = (event) => census.events.push({ t: Date.now(), ...event });
  const vv = window.visualViewport;
  vv.addEventListener("resize", () => log({ src: "vv-resize", h: vv.height, pan: vv.offsetTop }));
  window.addEventListener("resize", () => log({ src: "win-resize", h: innerHeight }));
  document.addEventListener("focusin", (e) => log({ src: "focus", label: e.target.getAttribute?.("aria-label") }));
  document.addEventListener("focusout", (e) => log({ src: "blur", label: e.target.getAttribute?.("aria-label") }));
  // A logical element is its test id, or its role and accessible name. Copies under aria-hidden (the sheet's outgoing picture) do not count.
  const keyOf = (el) => {
    const id = el.getAttribute("data-testid");
    if (id) return `testid:${id}`;
    const label = el.getAttribute("aria-label");
    const role = el.getAttribute("role");
    return label && (role || el.tagName === "INPUT") ? `${role ?? "input"}:${label}` : null;
  };
  const keys = (root, into) => {
    if (!(root instanceof Element) || root.getAttribute("aria-hidden") === "true") return into;
    const own = keyOf(root);
    if (own) into.push(own);
    root.querySelectorAll("[data-testid], [role][aria-label], input[aria-label]").forEach((el) => {
      if (!el.closest('[aria-hidden="true"]') || !root.contains(el.closest('[aria-hidden="true"]'))) {
        const k = keyOf(el);
        if (k) into.push(k);
      }
    });
    return into;
  };
  new MutationObserver((records) => {
    if (!census.recording) return;
    for (const record of records) {
      for (const node of record.removedNodes) for (const key of keys(node, [])) log({ src: "rm", key });
      for (const node of record.addedNodes) if (!(node instanceof Element) || !node.closest('[aria-hidden="true"]')) for (const key of keys(node, [])) log({ src: "add", key });
    }
  }).observe(document, { childList: true, subtree: true });
  const tick = () => {
    if (census.recording) {
      const v = {};
      for (const [key, find] of Object.entries(census.probes)) {
        try {
          v[key] = find();
        } catch {
          v[key] = null;
        }
      }
      census.frames.push({ t: Date.now(), v });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // A rAF sampler runs before later rAF callbacks in the same frame, so it misses a state that one of them sets and a later task undoes.
  // ResizeObserver delivers after every rAF callback and layout, just before paint, so it sees the painted size.
  census.watch = (key, find) =>
    new ResizeObserver((entries) => {
      if (census.recording) for (const entry of entries) census.frames.push({ t: Date.now(), v: { [key]: Math.round(entry.contentRect.height * 10) / 10 } });
    }).observe(find());
};

/* Probes return a number, a string, or null each frame. */
const probeSource = {
  mode: `() => document.querySelector('[data-testid="item-sheet"] [role="group"][aria-label="Split"] [aria-pressed="true"]')?.getAttribute("aria-label") ?? null`,
  itemTop: `() => { const el = document.querySelector('[data-testid="item-sheet"]'); return el ? el.getBoundingClientRect().top - visualViewport.offsetTop : null; }`,
  sheetTop: `() => { const el = document.querySelector('[data-testid="split-sheet"]'); return el ? el.getBoundingClientRect().top - visualViewport.offsetTop : null; }`,
  sheetHeight: `() => document.querySelector('[data-testid="split-sheet"]')?.getBoundingClientRect().height ?? null`,
  expanded: `() => document.querySelector('[data-testid^="bundle-"] [aria-controls]')?.getAttribute("aria-expanded") ?? null`,
  region: `() => document.querySelector('[data-testid^="bundle-"]')?.lastElementChild?.getBoundingClientRect().height ?? null`,
  regionShown: `() => (document.querySelector('[data-testid^="bundle-"]')?.lastElementChild?.childElementCount ?? 0) > 0 ? "rows" : "empty"`,
  vvHeight: `() => visualViewport.height`,
  priceCovered: `() => { const el = document.querySelector('input[aria-label="Price"]'); return el ? (el.getBoundingClientRect().bottom > visualViewport.offsetTop + visualViewport.height ? "covered" : "visible") : null; }`,
  nameCovered: `() => { const el = document.querySelector('[data-testid="split-sheet"] input[aria-label="Name"]'); return el ? (el.getBoundingClientRect().bottom > visualViewport.offsetTop + visualViewport.height ? "covered" : "visible") : null; }`,
};

/* Setup: a Split with a Bundle, picked as Jason. */
const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "tostones", name: "Tostones", price: 100 },
    { id: "pitchers", name: "Pitchers", price: 2400, quantity: 2 },
    { id: "sprite", name: "Sprite", price: 250 },
  ],
  adjustments: [{ id: "bucket", kind: "bundleDiscount", name: "Bucket deal", amount: -200, bundle: { name: "Beer Bucket", items: ["pitchers", "sprite"] } }],
  subtotal: 3550,
  total: 3350,
};
let creates = 0;
async function picked(page) {
  creates += 1;
  const response = await page.request.post(`${base}/api/splits`, {
    headers: { "cf-connecting-ip": `198.18.${(process.pid >> 4) % 250}.${creates % 250}` },
    data: { split: { receipt: dinner, participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }, { id: "priya", name: "Priya" }], paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  if (response.status() !== 201) throw new Error(`create answered ${response.status()}`);
  await page.goto(`/s/${(await response.json()).id}`);
  await page.getByRole("heading", { name: "Which one are you?" }).waitFor({ timeout: 20_000 });
  await still(page.getByTestId("split-sheet"));
  await tap(page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }));
  await page.getByTestId("owe").waitFor({ timeout: 20_000 });
  await still(page.getByTestId("split-sheet"));
  await page.waitForTimeout(400);
}
async function itemOpen(page) {
  await picked(page);
  await tap(page.getByRole("button", { name: /^Open Rice/ }));
  await still(page.getByTestId("item-sheet"));
  // Two claimers, so each split type shows rows, as on a real receipt.
  const had = page.getByTestId("item-sheet").getByRole("group", { name: "Who had it" });
  for (const name of ["Jason", "Sam"]) {
    await tap(had.getByRole("button", { name, exact: true }));
    await had.locator(`[aria-label="${name}"][aria-pressed="true"]`).waitFor();
  }
  await still(page.getByTestId("item-sheet"));
}
const segment = (page, name) => page.getByTestId("item-sheet").getByRole("button", { name, exact: true });
const bundleHeader = (page) => page.locator('[data-testid^="bundle-"]').locator("[aria-controls]");
const grab = async (page) => {
  const box = await page.getByTestId("split-sheet").boundingBox();
  return { x: box.x + box.width / 2, y: box.y + 14 };
};
const blur = (page) => page.evaluate(() => document.activeElement?.blur());

/* Each scenario is one reported symptom. Each phase is one user action that should make one change. */
const scenarios = [
  {
    id: "item-mode",
    symptom: "1. Item sheet: split type shows old then new",
    setup: itemOpen,
    probes: ["mode", "itemTop", "sheetTop"],
    phases: [
      { name: "to By shares", act: (p) => tap(segment(p, "By shares")), wait: 1800, shots: [300, 700, 900] },
      { name: "to By amount", act: (p) => tap(segment(p, "By amount")), wait: 1800 },
      { name: "to Evenly", act: (p) => tap(segment(p, "Evenly")), wait: 1800 },
    ],
  },
  {
    id: "bundle",
    symptom: "2. Bundle caret flashes open state",
    setup: picked,
    probes: ["expanded", "region", "regionShown"],
    watch: { paintedRegion: `() => document.querySelector('[data-testid^="bundle-"]').lastElementChild` },
    phases: [
      { name: "open", act: (p) => tap(bundleHeader(p)), wait: 1000 },
      { name: "close", act: (p) => tap(bundleHeader(p)), wait: 1000 },
    ],
  },
  {
    id: "sheet-collapse",
    symptom: "3a. Pull-up bar flashes on collapse",
    setup: picked,
    probes: ["sheetTop", "sheetHeight"],
    watch: { paintedSheetBody: `() => document.querySelector('[data-testid="split-sheet"] [data-sheet-body]')` },
    phases: [
      { name: "open by tap", act: (p) => tap(p.getByTestId("owe")), wait: 900 },
      { name: "collapse by chip", act: (p) => tap(p.getByRole("button", { name: "Jason, you", exact: true })), wait: 900 },
      { name: "open by tap again", act: (p) => tap(p.getByTestId("owe")), wait: 900 },
      { name: "collapse by drag", fromRelease: true, act: async (p) => drag(p, await grab(p), 260, 400), wait: 1100 },
      { name: "open by swipe", fromRelease: true, act: async (p) => drag(p, await grab(p), -200, 150), wait: 900 },
      { name: "collapse by flick", fromRelease: true, act: async (p) => drag(p, await grab(p), 220, 100), wait: 1100 },
    ],
  },
  {
    id: "keyboard-split",
    symptom: "3b. Pull-up bar flashes when the keyboard goes down",
    setup: picked,
    probes: ["sheetTop", "sheetHeight", "vvHeight", "nameCovered"],
    phases: [
      { name: "add-person field focus (keyboard up)", act: (p) => tap(p.getByTestId("split-sheet").getByRole("button", { name: "Add a person" })), wait: 900, shots: [450] },
      { name: "blur (keyboard down)", act: blur, wait: 900, shots: [90, 200] },
    ],
  },
  {
    id: "keyboard-item",
    symptom: "3b/5. Item sheet price field and keyboard",
    setup: itemOpen,
    probes: ["itemTop", "sheetTop", "vvHeight", "priceCovered"],
    phases: [
      { name: "price focus (keyboard up)", act: (p) => tap(p.getByTestId("item-sheet").locator('input[aria-label="Price"]')), wait: 900, shots: [450] },
      { name: "blur (keyboard down)", act: blur, wait: 900, shots: [90, 200] },
    ],
  },
];

/* Judging. */
const isNum = (v) => typeof v === "number";
function analyse(frames, events, start, end) {
  const inside = frames.filter((f) => f.t >= start && f.t <= end);
  const result = { reverts: [], returns: [], remounts: [], resizes: events.filter((e) => e.t >= start && e.t <= end && e.src === "vv-resize").length };
  const keys = [...new Set(inside.flatMap((f) => Object.keys(f.v)))];
  for (const key of keys) {
    const series = inside.filter((f) => key in f.v).map((f) => ({ t: f.t, v: f.v[key] }));
    if (series.every((s) => s.v === null || typeof s.v === "string")) {
      // A discrete value that returns to one it already left: A -> B -> A.
      const runs = series.filter((s, i) => s.v !== null && (i === 0 || s.v !== series[i - 1].v));
      const seen = [];
      for (const run of runs) {
        if (seen.length >= 2 && seen.slice(0, -1).includes(run.v) && seen.at(-1) !== run.v) result.reverts.push({ key, t: run.t, path: runs.map((r) => r.v).join(">") });
        seen.push(run.v);
      }
    } else {
      // A position or height that travels further than start-to-end: it went back over ground it covered.
      const nums = series.filter((s) => isNum(s.v));
      if (nums.length < 2) continue;
      let travel = 0;
      let worst = { at: null, back: 0 };
      const dir = Math.sign(nums.at(-1).v - nums[0].v);
      for (let i = 1; i < nums.length; i += 1) {
        const step = nums[i].v - nums[i - 1].v;
        travel += Math.abs(step);
        if ((dir === 0 && Math.abs(step) > 8) || step * dir < -8) worst = Math.abs(step) > worst.back ? { at: nums[i].t, back: Math.abs(step) } : worst;
      }
      const extra = travel - Math.abs(nums.at(-1).v - nums[0].v);
      if (extra > 16) result.returns.push({ key, t: worst.at, extraPx: Math.round(extra), stepPx: Math.round(worst.back), from: Math.round(nums[0].v), to: Math.round(nums.at(-1).v), peak: [Math.round(Math.min(...nums.map((n) => n.v))), Math.round(Math.max(...nums.map((n) => n.v)))] });
    }
  }
  const removed = new Set(events.filter((e) => e.t >= start && e.t <= end && e.src === "rm").map((e) => e.key));
  result.remounts = [...new Set(events.filter((e) => e.t >= start && e.t <= end && e.src === "add" && removed.has(e.key)).map((e) => e.key))];
  return result;
}
const near = (events, t, src, ms) => t !== null && events.some((e) => src.includes(e.src) && e.t <= t + 20 && e.t >= t - ms);

const picked_ = values.only ? scenarios.filter((s) => values.only.split(",").includes(s.id)) : scenarios;
const rows = [];
for (const engineName of values.engines.split(",")) {
  const lane = lanes[engineName];
  const browser = await lane.engine.launch();
  for (const latency of values.latency.split(",").map(Number)) {
    for (const scenario of picked_) {
      for (let run = 0; run < Number(values.runs); run += 1) {
        const tag = `${engineName}-L${latency}-${scenario.id}-r${run}`;
        const context = await browser.newContext({ ...lane.device, baseURL: base });
        await context.route("**/models/**", (r) => r.abort());
        await context.route("**/ort/**", (r) => r.abort());
        await context.route("**/api/**", async (r) => {
          if (latency) await new Promise((ok) => setTimeout(ok, latency / 2));
          await r.fallback();
        });
        const socket = [];
        await context.routeWebSocket(/\/parties\//, (ws) => {
          const server = ws.connectToServer();
          // Half the added round trip each way. A constant delay keeps message order.
          ws.onMessage((m) => {
            const t = Date.now();
            socket.push({ t, src: "ws>", op: JSON.parse(m).op?.type });
            setTimeout(() => server.send(m), latency / 2);
          });
          server.onMessage((m) => {
            const parsed = JSON.parse(m);
            setTimeout(() => {
              socket.push({ t: Date.now(), src: "ws<", type: parsed.type, ref: parsed.ref ?? null, revision: parsed.split?.revision ?? parsed.revision ?? null });
              ws.send(m);
            }, latency / 2);
          });
        });
        await context.addInitScript(iosKeyboard, keyboardPx);
        await context.addInitScript(recorder);
        if (engineName === "webkit") await context.addInitScript(() => Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} }));
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        try {
          await scenario.setup(page);
          await page.evaluate(
            ({ src, watch }) => {
              const fn = (f) => new Function(`return (${f})`)();
              window.__census.probes = Object.fromEntries(Object.entries(src).map(([k, f]) => [k, fn(f)]));
              for (const [k, f] of Object.entries(watch)) window.__census.watch(k, fn(f));
              window.__census.recording = true;
            },
            { src: Object.fromEntries(scenario.probes.map((k) => [k, probeSource[k]])), watch: scenario.watch ?? {} },
          );
          await page.waitForTimeout(200);
          const phases = [];
          for (const phase of scenario.phases) {
            const start = Date.now();
            const act = phase.act(page);
            const shots = (phase.shots ?? []).map((ms) =>
              new Promise((ok) => setTimeout(ok, ms)).then(() => page.screenshot({ path: join(out, "frames", `${tag}-${phase.name.replace(/\W+/g, "_")}-${ms}ms.png`) }).catch(() => null)),
            );
            await act;
            const released = Date.now();
            await Promise.all(shots);
            const elapsed = Date.now() - start;
            if (elapsed < phase.wait) await page.waitForTimeout(phase.wait - elapsed);
            // A drag is judged from the release: before it, the finger moves the sheet.
            phases.push({ name: phase.name, start, released, from: phase.fromRelease ? released : start, end: Date.now() });
          }
          const { frames, events } = await page.evaluate(() => ({ frames: window.__census.frames, events: window.__census.events }));
          const all = [...events, ...socket].sort((a, b) => a.t - b.t);
          writeFileSync(join(out, "traces", `${tag}.json`), JSON.stringify({ tag, phases, frames, events: all, errors }));
          for (const phase of phases) {
            const a = analyse(frames, all, phase.from, phase.end);
            const flashes = [...a.reverts, ...a.returns];
            const row = {
              engine: engineName,
              latency,
              scenario: scenario.id,
              symptom: scenario.symptom,
              phase: phase.name,
              run,
              flashes: flashes.length,
              revert: flashes.filter((f) => near(all, f.t, ["ws<", "ws>"], 120)).length,
              remeasure: flashes.filter((f) => near(all, f.t, ["vv-resize"], 150)).length,
              remount: a.remounts.length,
              other: flashes.filter((f) => !near(all, f.t, ["ws<", "ws>"], 120) && !near(all, f.t, ["vv-resize"], 150)).length,
              detail: { reverts: a.reverts, returns: a.returns, remounts: a.remounts, resizes: a.resizes },
            };
            rows.push(row);
            process.stderr.write(`${tag} ${phase.name}: flashes=${row.flashes} revert=${row.revert} remeasure=${row.remeasure} remount=${row.remount} other=${row.other} ${JSON.stringify(row.detail)}\n`);
          }
        } catch (error) {
          rows.push({ engine: engineName, latency, scenario: scenario.id, symptom: scenario.symptom, phase: "setup", run, error: String(error).split("\n")[0] });
          process.stderr.write(`${tag} ERROR ${String(error).split("\n")[0]}\n`);
        }
        await context.close();
      }
    }
  }
  await browser.close();
}

/* Census: per symptom phase x latency x engine, how many runs showed a flash, and under which signal. */
const groups = new Map();
for (const r of rows.filter((r) => !r.error)) {
  const k = `${r.symptom} | ${r.phase} | ${r.engine} | ${r.latency} ms`;
  const g = groups.get(k) ?? { runs: 0, flashes: 0, revert: 0, remeasure: 0, remount: 0, other: 0 };
  g.runs += 1;
  for (const f of ["revert", "remeasure", "other"]) g[f] += r[f] > 0 ? 1 : 0;
  g.flashes += r.flashes > 0 ? 1 : 0;
  g.remount += r.remount > 0 ? 1 : 0;
  groups.set(k, g);
}
const table = [
  "| Symptom | Phase | Engine | Added RTT | Runs with flash | State revert (socket) | Re-measure (viewport) | Remount | Other |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...[...groups].map(([k, g]) => `| ${k} | ${g.flashes}/${g.runs} | ${g.revert} | ${g.remeasure} | ${g.remount} | ${g.other} |`),
].join("\n");
writeFileSync(join(out, "census.json"), JSON.stringify(rows, null, 1));
writeFileSync(join(out, "census.md"), `${table}\n`);
const errors = rows.filter((r) => r.error);
process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, out, runs: rows.length, errors: errors.map((e) => `${e.engine} L${e.latency} ${e.scenario}: ${e.error}`) })}\n`);
