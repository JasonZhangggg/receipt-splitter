// Screenshot matrix for the desktop Split page, against a port verify.mjs launched: node desktop-shots.mjs <port> <out-dir>
// Prints one JSON line: how many animations run on a popover opened by Enter (0) and by a click (1), and whether focus moved into it.
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

const [port = "9300", out = `/tmp/verify-receipt-splitter/${port}`] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = `http://localhost:${port}`;

const bucket = (run, guinness, watermelon) => [
  { id: `ultra${run}`, name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
  { id: `guinness${run}`, name: "Guinness Draught 14.9oz Can", price: 729 * guinness, quantity: guinness },
  { id: `pineapple${run}`, name: "High Noon Pineapple 12oz Can", price: 849 },
  { id: `watermelon${run}`, name: "High Noon Watermelon 12oz Can", price: 849 * watermelon, ...(watermelon > 1 ? { quantity: watermelon } : {}) },
];
const receipt = {
  items: [{ id: "gameplay", name: "Gameplay", price: 8775 }, ...bucket(1, 3, 1), ...bucket(2, 2, 2)],
  adjustments: [
    { id: "bucket1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["ultra1", "guinness1", "pineapple1", "watermelon1"] } },
    { id: "bucket2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: { name: "Beer Bucket", items: ["ultra2", "guinness2", "pineapple2", "watermelon2"] } },
    { id: "tax", kind: "tax", name: "Tax", amount: 494 },
    { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
  ],
  subtotal: 17923,
  total: 20729,
};

let n = 0;
async function create() {
  n += 1;
  const response = await fetch(`${base}/api/splits`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `198.77.${Date.now() % 200}.${n}` },
    body: JSON.stringify({ split: { receipt, participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }, { id: "priya", name: "Priya" }], paymentHandles: [{ service: "venmo", handle: "jason-z" }] } }),
  });
  return `${base}/s/${(await response.json()).id}`;
}

const browser = await chromium.launch();
const report = {};
for (const scheme of ["light", "dark"]) {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 768 }, colorScheme: scheme });
    await context.route("**/models/**", (r) => r.abort());
    await context.route("**/ort/**", (r) => r.abort());
    const page = await context.newPage();
    const pane = page.getByRole("complementary");
    await page.goto(await create());
    await pane.getByRole("heading", { name: "Which one are you?" }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${width}-${scheme}-1-pick.png` });
    await pane.getByRole("button", { name: "Sam", exact: true }).click();
    await pane.getByRole("button", { name: "Sam, you", exact: true }).waitFor();
    await page.getByRole("button", { name: /^Open Gameplay, / }).click();
    await page.getByRole("dialog", { name: "Item" }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${width}-${scheme}-2-popover.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Item" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: /^Beer Bucket, / }).last().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${width}-${scheme}-3-bucket.png` });
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("dialog", { name: "History" }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${width}-${scheme}-4-history.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "History" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: /^Open Gameplay, / }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Item" });
    await dialog.waitFor();
    report[`${width}-${scheme}-keyboardAnimations`] = await dialog.evaluate((el) => el.getAnimations().length);
    report[`${width}-${scheme}-focusInDialog`] = await dialog.evaluate((el) => el.contains(document.activeElement));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await page.getByRole("dialog", { name: "New item" }).waitFor();
    report[`${width}-${scheme}-pointerAnimations`] = await page.getByRole("dialog", { name: "New item" }).evaluate((el) => el.getAnimations().length);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${width}-${scheme}-5-add.png` });
    await context.close();
  }
}
for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: scheme });
  await context.route("**/models/**", (r) => r.abort());
  await context.route("**/ort/**", (r) => r.abort());
  const page = await context.newPage();
  await page.goto(await create());
  await page.getByRole("dialog", { name: "Which one are you?" }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/390-${scheme}-pick.png` });
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).tap();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^Beer Bucket, / }).first().tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/390-${scheme}-regular.png` });
  await context.close();
}
await browser.close();
console.log(JSON.stringify(report));
