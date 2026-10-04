// Screenshot matrix for Recent splits on home, against a port verify.mjs launched: node history-shots.mjs <port> <out-dir>
import { mkdirSync } from "node:fs";

import { chromium, devices } from "@playwright/test";

const [port = "9310", out = `/tmp/verify-receipt-splitter/${port}`] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = `http://localhost:${port}`;
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const splits = [
  { id: "AnaBenCy00000000000001", names: ["Ana", "Ben", "Cy", "Dee"], total: 990, added: now - 3 * DAY },
  { id: "JasonSam00000000000002", names: ["Jason", "Sam"], total: 4210, added: now - 2 * 60 * 60 * 1000 },
  { id: "PriyaJo000000000000003", names: ["Priya", "Jo"], total: 12875, added: now - DAY - 60_000 },
  { id: "KimLee00000000000000004", names: ["Kim", "Lee"], total: 3100, added: now - 5 * DAY },
  { id: "OmarNia0000000000000005", names: ["Omar"], total: 560, added: now - 6 * DAY },
];

const { iosKeyboard } = await import(new URL("../../../e2e/motion.ts", import.meta.url).href);

const browser = await chromium.launch();
const results = [];
for (const width of [390, 1440]) {
  for (const scheme of ["light", "dark"]) {
    for (const state of ["empty", "history", "open", ...(width === 390 ? ["keyboard"] : [])]) {
      const profile = width === 390 ? { ...devices["iPhone 15"], viewport: { width: 390, height: 844 } } : { viewport: { width: 1440, height: 900 } };
      const context = await browser.newContext({ ...profile, colorScheme: scheme });
      await context.route("**/models/**", (route) => route.abort());
      await context.route("**/ort/**", (route) => route.abort());
      const page = await context.newPage();
      if (state === "keyboard") await page.addInitScript(iosKeyboard, 336);
      await page.goto(base);
      if (state !== "empty") {
        await page.evaluate((splits) => splits.forEach(({ id, ...recent }) => localStorage.setItem(`receipt-splitter:split:${id}`, JSON.stringify({ recent: { ...recent, seen: recent.added } }))), splits);
        await page.reload();
      }
      await page.getByRole("button", { name: "Create split link" }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const icon = page.getByRole("button", { name: "Recent splits" });
      if (state === "open") {
        await icon.click();
        await page.getByRole("dialog", { name: "Recent splits" }).waitFor();
        await page.waitForTimeout(700);
      }
      if (state === "keyboard") {
        await page.getByRole("textbox", { name: "Venmo handle" }).tap();
        await page.waitForFunction(() => window.visualViewport.height < innerHeight + 1 && window.visualViewport.height < document.documentElement.clientHeight);
        await page.waitForTimeout(400);
        // Paint the modelled keyboard where it covers the layout, so the shot shows what stays above it.
        await page.evaluate(() => {
          const band = document.createElement("div");
          const { offsetTop, height } = window.visualViewport;
          Object.assign(band.style, { position: "fixed", left: "0", right: "0", top: `${offsetTop + height}px`, height: "336px", background: "rgba(120,120,128,0.55)", zIndex: "9999" });
          document.body.appendChild(band);
        });
      }
      const file = `${out}/home-${width}-${scheme}-${state}.png`;
      await page.screenshot({ path: file });
      const rows = await page.getByRole("dialog", { name: "Recent splits" }).getByRole("link").count();
      results.push({ file, icon: await icon.count(), rows });
      await context.close();
    }
  }
}
await browser.close();
console.log(JSON.stringify(results));
