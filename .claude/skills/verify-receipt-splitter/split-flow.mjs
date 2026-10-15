#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const port = process.env.PORT ?? "8811";
const out = process.env.OUT ?? `/tmp/verify-receipt-splitter/${port}/split-flow`;
const base = `http://localhost:${port}`;
const phone = {
  ...devices["Pixel 7"],
  viewport: { width: 390, height: 844 },
  colorScheme: process.env.SCHEME === "dark" ? "dark" : "light",
  reducedMotion: process.env.REDUCE ? "reduce" : "no-preference",
  ...(process.env.VIDEO ? { recordVideo: { dir: `${out}/video`, size: { width: 390, height: 844 } } } : {}),
};
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const report = { checks: {} };
const check = (name, ok, detail) => {
  report.checks[name] = { ok, ...(detail === undefined ? {} : { detail }) };
};

async function open(link, setup) {
  const page = await (await browser.newContext(phone)).newPage();
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(String(error)));
  await setup?.(page);
  if (link) await page.goto(link);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const owe = (page) => page.getByTestId("owe").innerText();
const pickName = async (page, name) => {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await page.getByTestId("owe").waitFor();
};

const receipt = {
  items: [
    { id: "i1", name: "Chicken Fried Rice And Egg", price: 799 },
    { id: "i2", name: "California Tropic And Miso", price: 799 },
    { id: "i3", name: "Add Two Tostones", price: 100 },
    { id: "i4", name: "Sprite", price: 250 },
    { id: "i5", name: "Perrier Sparkling Water", price: 350 },
  ],
  adjustments: [
    { id: "a1", kind: "tax", name: "Tax", amount: 161 },
    { id: "a2", kind: "serviceCharge", name: "Service fees on tables", amount: 345 },
  ],
  subtotal: 2298,
  total: 2804,
};
const created = await fetch(`${base}/api/splits`, {
  method: "POST",
  headers: { "content-type": "application/json", "cf-connecting-ip": `198.51.${Math.floor(Math.random() * 56) + 200}.${Math.floor(Math.random() * 254) + 1}` },
  body: JSON.stringify({
    split: {
      receipt,
      participants: ["Jason", "Sam", "Priya", "Lee"].map((name) => ({ id: name.toLowerCase(), name })),
      paymentHandles: [{ service: "venmo", handle: "jason-z" }],
    },
  }),
});
if (created.status !== 201) throw new Error(`POST /api/splits returned ${created.status}`);
const link = `${base}/s/${(await created.json()).id}`;
report.link = link;
const host = await open(link);
await host.getByRole("heading", { name: "Which one are you?" }).waitFor({ timeout: 30_000 });
await host.waitForTimeout(600);
await shot(host, "B-creator");
await host.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click();
await host.waitForTimeout(170);
await shot(host, "E-mid");
report.animatedDuringCollapse = await host.evaluate(() =>
  document.getAnimations().flatMap((animation) =>
    "transitionProperty" in animation
      ? [animation.transitionProperty]
      : animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key))),
  ),
);
await host.getByTestId("owe").waitFor();
await host.waitForTimeout(700);
await shot(host, "E-settled");

let blocked = false;
let priyaSocket = null;
const connects = [];
const sam = await open(link);
const priya = await open(link, (page) =>
  page.routeWebSocket(/\/parties\/split-server\//, (socket) => {
    connects.push({ at: Date.now(), blocked });
    if (blocked) return socket.close({ code: 4000, reason: "network down" });
    socket.connectToServer();
    priyaSocket = socket;
  }),
);
await sam.getByRole("heading", { name: "Which one are you?" }).waitFor();
await sam.waitForTimeout(600);
await shot(sam, "C-participant");
await pickName(sam, "Sam");
await pickName(priya, "Priya");

const tapAt = Date.now();
await sam.getByRole("button", { name: "California Tropic And Miso, check for Sam" }).click();
await priya.getByRole("button", { name: /^Open California Tropic And Miso, .*had by Sam$/ }).waitFor();
report.claimSeenByOtherMs = Date.now() - tapAt;
await sam.getByRole("button", { name: "Add Two Tostones, check for Sam" }).click();
await host.getByRole("button", { name: "Chicken Fried Rice And Egg, check for Jason" }).click();
await host.getByRole("button", { name: "Add Two Tostones, check for Jason" }).click();
await priya.getByRole("button", { name: "Sprite, check for Priya" }).click();
await sam.getByRole("button", { name: /^Open Sprite, .*had by Priya$/ }).waitFor();
await sam.waitForTimeout(400);
await shot(sam, "F-claiming");

await sam.getByRole("button", { name: /^Open Add Two Tostones/ }).click();
await sam.waitForTimeout(600);
await shot(sam, "I1-item");
await sam.getByRole("button", { name: "By shares" }).click();
await sam.getByRole("button", { name: "More shares for Jason" }).click();
await sam.getByText("3 shares").waitFor();
await shot(sam, "I2-shares");
await sam.getByRole("button", { name: "By amount" }).click();
await sam.waitForTimeout(300);
await shot(sam, "I2-amounts");
await sam.getByRole("button", { name: "By shares" }).click();
await sam.getByRole("button", { name: "More shares for Jason" }).click();
await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
await host.getByText("2:1").waitFor();
check("tostones 2:1 reaches the Host", true);

await sam.waitForTimeout(500);
await sam.getByRole("button", { name: /^Open Perrier/ }).click();
await sam.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam" }).click();
await sam.waitForTimeout(900);
await sam.getByRole("dialog", { name: "Item" }).evaluate((sheet) => sheet.querySelector("[data-sheet-grab]")?.scrollIntoView());
await shot(sam, "I4-item-claim");
await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
await priya.getByRole("button", { name: /^Open Perrier.*had by Sam$/ }).waitFor();
check("a line claimed from its Item sheet reaches another browser", true);

blocked = true;
priyaSocket?.close({ code: 4000, reason: "network down" });
const droppedAt = Date.now();
await sam.getByRole("button", { name: /^Open Sprite/ }).click();
await sam.getByRole("textbox", { name: "Price" }).fill("2.75");
await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
await host.getByTestId("total").filter({ hasText: "$28.29" }).waitFor();
await shot(host, "I3a-price-total");
await host.waitForTimeout(Math.max(0, 10_000 - (Date.now() - droppedAt)));
const staleWhileDown = await priya.getByTestId("total").filter({ hasText: "$28.29" }).count();
blocked = false;
const restoredAt = Date.now();
await priya.getByTestId("total").filter({ hasText: "$28.29" }).waitFor({ timeout: 30_000 });
report.reconnect = { downMs: restoredAt - droppedAt, attemptsWhileDown: connects.filter((c) => c.blocked).length, caughtUpMs: Date.now() - restoredAt, staleWhileDown };

await priya.getByTestId("owe").click();
await priya.getByRole("button", { name: "I already paid" }).click();
await priya.getByTestId("footer").getByRole("button", { name: "Paid" }).waitFor();
await shot(priya, "G2-paid");
await sam.getByRole("button", { name: "Payments", exact: true }).click();
await sam.getByRole("list", { name: "Payments" }).locator('[data-state="settled"]', { hasText: "Priya" }).waitFor();
check("Payments shows Priya as paid", true);
await sam.waitForTimeout(400);
await shot(sam, "H-someone");
await sam.keyboard.press("Escape");
await sam.getByRole("dialog", { name: "Payments" }).waitFor({ state: "detached" });
await sam.getByRole("button", { name: "People", exact: true }).click();
await sam.getByRole("dialog", { name: "People" }).getByRole("button", { name: "Priya", exact: true }).click();
await sam.getByRole("button", { name: /, Show Priya's breakdown$/ }).click();
await sam.waitForTimeout(500);
await shot(sam, "G-yours");

await host.getByRole("button", { name: "History", exact: true }).click();
await host.waitForTimeout(600);
await shot(host, "I3-history");
await host.getByRole("button", { name: "Revert Sprite" }).click();
await host.getByRole("alertdialog", { name: "Revert Sam's change?" }).waitFor();
await shot(host, "I3b-confirm");
await host.getByRole("alertdialog").getByRole("button", { name: "Revert" }).click();
await host.getByText("Reverted").first().waitFor();
await host.getByRole("button", { name: "Restore" }).click();
await host.getByRole("alertdialog", { name: "Put the receipt back as it was created?" }).waitFor();
await host.waitForTimeout(300);
await shot(host, "I3c-restore");
await host.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
await host.getByRole("dialog", { name: "History" }).getByRole("button", { name: "Close" }).click();
await sam.getByTestId("total").filter({ hasText: "$28.04" }).waitFor();

await sam.reload();
await sam.getByTestId("owe").waitFor();
report.afterReload = { samOwes: await owe(sam) };

const lee = await open(link);
await lee.getByRole("button", { name: "Close, just look" }).click();
await lee.getByText("Pick your name to check off what you had.").waitFor();
await lee.waitForTimeout(700);
await shot(lee, "K-browse");
await lee.getByRole("button", { name: "Which one are you?" }).click();
await lee.getByRole("button", { name: "Sam, picked on another phone" }).click();
await shot(lee, "C2-takeover");
await lee.getByRole("button", { name: "That's me" }).click();
await sam.getByText("Pick your name to check off what you had.").waitFor();
check("That's me drops the first phone to browsing", true);

const shares = await Promise.all([host, priya, lee].map((page) => page.getByTestId("unclaimed").innerText()));
check("every browser shows the same Unclaimed figure", new Set(shares).size === 1, shares);
const total = await host.getByTestId("total").innerText();
report.total = total;
report.errors = errors;
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
