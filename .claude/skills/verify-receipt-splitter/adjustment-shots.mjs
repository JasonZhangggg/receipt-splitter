// Screenshot matrix for editing tax, tip, fee and discount rows on the Split page, against a port verify.mjs launched: node adjustment-shots.mjs <port> <out-dir>
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
  const adjustments = [
    { id: "bucket", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -366, bundle: { name: "Beer Bucket", items: ["ultra", "guinness", "pineapple"] } },
    { id: "tax", kind: "tax", name: "Tax", amount: 494 },
    { id: "coupon", kind: "discount", name: "Coupon", amount: -500 },
  ];
  const response = await context.request.post(`${base}/api/splits`, {
    headers: { "cf-connecting-ip": `198.56.0.${creates}` },
    data: {
      split: {
        receipt: { items, adjustments, subtotal: 12440, total: 12440 - 366 + 494 - 500 },
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
    const picker = width === 390 ? page.getByRole("dialog", { name: "Which one are you?" }) : page.getByRole("complementary");
    await picker.getByRole("button", { name: "Sam", exact: true }).click();
    await page.getByRole("button", { name: "Sam, you", exact: true }).waitFor();
    await page.getByRole("button", { name: "Gameplay, check for Sam" }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const shot = async (state) => {
      const file = `${out}/adjustments-${width}-${scheme}-${state}.png`;
      await page.screenshot({ path: file });
      results.push(file);
    };
    const settle = () => page.waitForTimeout(600);
    const close = async (sheet) => {
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
      await sheet.waitFor({ state: "detached" });
      await settle();
    };

    const addRow = page.getByTestId("receipt").getByRole("button", { name: "Add", exact: true });
    await addRow.scrollIntoViewIfNeeded();
    await shot("receipt");

    await page.getByRole("button", { name: "Open Tax, $4.94" }).click();
    const charge = page.getByRole("dialog", { name: "Charge" });
    await charge.waitFor();
    await settle();
    await shot("tax-sheet");
    await charge.getByRole("textbox", { name: "Amount", exact: true }).fill("6.00");
    await close(charge);
    await page.getByRole("button", { name: "Open Tax, $6.00" }).waitFor();
    await shot("tax-fixed");

    await page.getByRole("button", { name: "Open Coupon, -$5.00" }).click();
    const discount = page.getByRole("dialog", { name: "Discount" });
    await discount.waitFor();
    await settle();
    await shot("discount-sheet");
    await close(discount);

    await page.getByRole("button", { name: /^Beer Bucket, / }).click();
    await page.getByRole("button", { name: "Open Discount (10%), -$3.66" }).click();
    await discount.waitFor();
    await settle();
    await shot("bundle-sheet");
    await close(discount);

    await addRow.click();
    await page.getByRole("dialog", { name: "Add to the receipt" }).getByRole("button", { name: "Tip", exact: true }).click();
    const add = page.getByRole("dialog", { name: "Add tax, tip or discount" });
    await add.waitFor();
    await settle();
    await shot("add-sheet");
    await add.getByRole("button", { name: "Add tip", exact: true }).click();
    await add.getByText("Add an amount.").waitFor();
    await page.waitForTimeout(300);
    await shot("add-problem");
    await add.getByRole("textbox", { name: "Amount", exact: true }).fill("20");
    await add.getByRole("button", { name: "Add tip", exact: true }).click();
    await add.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Open Tip, $20.00" }).waitFor();
    await settle();
    await shot("tip-added");

    await page.getByRole("button", { name: "Sam, you", exact: true }).click();
    await settle();
    await shot("breakdown");
    await context.close();
  }
}
await browser.close();
console.log(JSON.stringify({ ok: true, shots: results }));
