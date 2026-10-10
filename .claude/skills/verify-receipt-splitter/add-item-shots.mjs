// Screenshot matrix for Add item on the Split page, against a port verify.mjs launched: node add-item-shots.mjs <port> <out-dir>
import { mkdirSync } from "node:fs";

import { chromium, devices } from "@playwright/test";

const [port = "9300", out = `/tmp/verify-receipt-splitter/${port}`] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = `http://localhost:${port}`;

const browser = await chromium.launch();
const results = [];
let creates = 0;

async function createSplit(context) {
  creates += 1;
  const items = [
    { id: "gameplay", name: "Gameplay", price: 8775 },
    { id: "ultra", name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
    { id: "guinness", name: "Guinness Draught 14.9oz Can", price: 2187, quantity: 3 },
    { id: "pineapple", name: "High Noon Pineapple 12oz Can", price: 849 },
  ];
  const response = await context.request.post(`${base}/api/splits`, {
    headers: { "cf-connecting-ip": `198.55.0.${creates}` },
    data: {
      split: {
        receipt: {
          items,
          adjustments: [{ id: "bucket", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -366, bundle: { name: "Beer Bucket", items: ["ultra", "guinness", "pineapple"] } }],
          subtotal: 13090,
          total: 12724,
        },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
          { id: "priya", name: "Priya" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  if (response.status() !== 201) throw new Error(`create answered ${response.status()}`);
  return `${base}/s/${(await response.json()).id}`;
}

for (const width of [390, 1440]) {
  for (const scheme of ["light", "dark"]) {
    const profile = width === 390 ? { ...devices["iPhone 15"], viewport: { width: 390, height: 844 } } : { viewport: { width: 1440, height: 900 } };
    const context = await browser.newContext({ ...profile, colorScheme: scheme });
    await context.route("**/models/**", (route) => route.abort());
    await context.route("**/ort/**", (route) => route.abort());
    const page = await context.newPage();
    await page.goto(await createSplit(context));
    await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
    await page.getByRole("button", { name: "Sam, you", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const shot = async (state) => {
      const file = `${out}/add-item-${width}-${scheme}-${state}.png`;
      await page.screenshot({ path: file });
      results.push(file);
    };
    const addRow = page.getByTestId("receipt").getByRole("button", { name: "Add", exact: true });
    await addRow.scrollIntoViewIfNeeded();
    await shot("receipt");
    await addRow.click();
    await page.getByRole("dialog", { name: "Add to the receipt" }).getByRole("button", { name: "Item", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "New item" });
    await sheet.waitFor();
    await page.waitForTimeout(600);
    await shot("sheet");
    await sheet.getByRole("button", { name: "Add item", exact: true }).click();
    await sheet.getByText("Add a name.").waitFor();
    await page.waitForTimeout(300);
    await shot("problem");
    await sheet.getByRole("textbox", { name: "Item name", exact: true }).fill("Fries");
    await sheet.getByRole("textbox", { name: "Price", exact: true }).fill("6.50");
    await sheet.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam", exact: true }).click();
    await shot("filled");
    await sheet.getByRole("button", { name: "Add item", exact: true }).click();
    await sheet.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Open Fries, $6.50, had by Sam" }).waitFor();
    await page.waitForTimeout(600);
    await shot("added");
    await context.close();
  }
}
await browser.close();
console.log(JSON.stringify({ ok: true, shots: results }));
