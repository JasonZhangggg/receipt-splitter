// Screenshots of each reading stage on home, against a port verify.mjs launched: node reading-shots.mjs <port> <out-dir>
// Holds the OCR dictionary download and /api/scan so each stage stays on screen, then answers /api/scan with 502 so the phone reads on its own.
// Prints one JSON line per layout: the stage text on every frame (collapsed), frames that showed two lines, and, on the phone,
// whether the line moved or was covered while the keyboard was up.
import { mkdirSync } from "node:fs";

import { chromium, devices } from "@playwright/test";

const [port = "9300", out = `/tmp/verify-receipt-splitter/${port}`] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = `http://localhost:${port}`;
const photo = "e2e/fixtures/topgolf-synthetic.png";
const stages = ["Finding the text", "Matching items to prices", "Taking a few more seconds"];

// The iOS 27 keyboard model from e2e/motion.ts (iosKeyboard), inlined so this script runs under plain node.
function iosKeyboard(px) {
  const viewport = window.visualViewport;
  const layout = () => document.documentElement.clientHeight;
  const real = (proto, key) => Object.getOwnPropertyDescriptor(proto, key).get;
  const height = real(VisualViewport.prototype, "height");
  const offsetTop = real(VisualViewport.prototype, "offsetTop");
  let covered = 0;
  let pan = 0;
  Object.defineProperty(viewport, "height", { configurable: true, get: () => height.call(viewport) - covered });
  Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => offsetTop.call(viewport) + pan });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => layout() - pan });
  const set = (keyboard, reveal) => {
    covered = keyboard;
    pan = reveal;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  };
  const typing = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  let quiet = false;
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options) {
    quiet = options?.preventScroll === true;
    try {
      focus.call(this, options);
    } finally {
      quiet = false;
    }
  };
  document.addEventListener("focusin", ({ target }) => {
    if (!typing(target)) return;
    const reveal = quiet ? pan : Math.min(px, Math.max(pan, Math.ceil(target.getBoundingClientRect().bottom + 8 - (layout() - px))));
    setTimeout(() => set(px, reveal), 60);
  });
  document.addEventListener("focusout", () => setTimeout(() => !typing(document.activeElement) && set(0, 0), 60));
}

const runs = (values) => values.filter((value, i) => i === 0 || value !== values[i - 1]);

const lineBox = (page) =>
  page.getByTestId("reading-stage").evaluate((line) => {
    const box = line.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { top: Math.round(box.top), bottom: Math.round(box.bottom), visible: line === top || line.contains(top) };
  });

async function shoot(browser, name, context, { keyboard = false } = {}) {
  const ctx = await browser.newContext(context);
  const page = await ctx.newPage();
  if (keyboard) await page.addInitScript(iosKeyboard, 336);
  let releaseOcr = () => {};
  const ocrHeld = new Promise((resolve) => (releaseOcr = resolve));
  await page.route("**/models/en_PP-OCRv5_rec_mobile.dict.txt", async (route) => {
    await ocrHeld;
    await route.continue();
  });
  let answer = () => {};
  const answered = new Promise((resolve) => (answer = resolve));
  await page.route("**/api/scan", async (route) => {
    await answered;
    await route.fulfill({ status: 502, json: { refused: "unreadable" } });
  });
  await page.goto(`${base}/`);
  await page.evaluate(() => {
    const seen = [];
    Object.assign(window, { stageFrames: seen });
    const tick = () => {
      seen.push([...document.querySelectorAll('[data-testid="reading-stage"]')].map((line) => line.textContent));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Add|Drop a) receipt/ }).click();
  await (await chooser).setFiles(photo);
  const line = page.getByTestId("reading-stage");
  const result = { name, media: context.reducedMotion ?? "no-preference" };

  await line.filter({ hasText: stages[0] }).waitFor();
  await page.screenshot({ path: `${out}/${name}-1-text.png` });
  releaseOcr();
  await line.filter({ hasText: stages[1] }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-2-server.png` });
  await line.filter({ hasText: stages[2] }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-3-slow.png` });

  if (keyboard) {
    const before = await lineBox(page);
    await page.getByRole("textbox", { name: "Venmo handle" }).tap();
    await page.waitForTimeout(800);
    const during = await lineBox(page);
    await page.screenshot({ path: `${out}/${name}-4-keyboard.png` });
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(400);
    result.keyboard = { before, during, after: await lineBox(page) };
  }

  answer();
  await page.getByTestId("receipt").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-5-read.png` });
  const frames = await page.evaluate(() => window.stageFrames);
  result.sequence = runs(frames.map((lines) => lines[0] ?? ""));
  result.doubledFrames = frames.filter((lines) => lines.length > 1).length;
  result.stageLinesAfter = await line.count();
  await ctx.close();
  return result;
}

const browser = await chromium.launch();
const phone = { ...devices["iPhone 15 Pro"] };
delete phone.defaultBrowserType;
const results = [
  await shoot(browser, "phone", phone, { keyboard: true }),
  await shoot(browser, "phone-reduced", { ...phone, reducedMotion: "reduce" }),
  await shoot(browser, "desktop", { viewport: { width: 1280, height: 800 } }),
  await shoot(browser, "desktop-dark", { viewport: { width: 1280, height: 800 }, colorScheme: "dark" }),
];
await browser.close();
for (const result of results) console.log(JSON.stringify(result));
