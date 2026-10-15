import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { expect, type Page } from "@playwright/test";

export type FilePayload = { name: string; mimeType: string; buffer: Buffer };

export const photo = (path: string, mimeType = "image/jpeg"): FilePayload => ({ name: basename(path), mimeType, buffer: readFileSync(path) });

const transfer = (page: Page, { name, mimeType, buffer }: FilePayload) =>
  page.evaluateHandle(
    ({ name, mimeType, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type: mimeType }));
      return data;
    },
    { name, mimeType, base64: buffer.toString("base64") },
  );

export const dropZone = (page: Page) => page.getByRole("button", { name: "Add the receipt" });

export async function dropFile(page: Page, file: FilePayload, target = "body") {
  const dataTransfer = await transfer(page, file);
  await page.dispatchEvent(target, "dragenter", { dataTransfer });
  await page.dispatchEvent(target, "dragover", { dataTransfer });
  await page.dispatchEvent(target, "drop", { dataTransfer });
}

export async function pasteFile(page: Page, file: FilePayload) {
  const clipboardData = await transfer(page, file);
  await page.evaluate((data) => document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true })), clipboardData);
}

const names = ["Chicken Fried Rice And Egg", "California Tropic And Miso", "Add Two Tostones", "Sprite", "Perrier Sparkling Water"];
const prices = [799, 799, 100, 250, 350];

/** What the server's reading sends for SRD receipt 1040: five Items, Tax $1.61, Service fees $3.45, Total $28.04. */
export const exampleReply = {
  items: names.map((name, index) => ({ name, price: prices[index], quantity: null, details: [], discounts: [] })),
  bundles: [],
  adjustments: [
    { name: "Tax", amount: 161, kind: "tax" },
    { name: "Service fees on tables", amount: 345, kind: "serviceCharge" },
  ],
  subtotal: { amount: 2643, beforeDiscounts: false },
  total: 2804,
};

/** An OCR worker that finds no text boxes at once, so a photo goes straight to the (mocked) server reading. */
const instantOcr = "self.onmessage = ({ data }) => { if (data.type === 'recognize') self.postMessage({ id: data.id, boxes: [] }); };";

/**
 * Loads SRD receipt 1040 into the home draft through the page's own photo input: the topgolf fixture is chosen, the OCR worker answers at once,
 * and `/api/scan` returns the receipt above. The page reloads first because the real OCR worker starts with the page.
 */
export async function openExample(page: Page) {
  const context = page.context();
  await context.route("**/ocr-worker.mjs", (route) =>
    route.fulfill({ contentType: "text/javascript", headers: { "cross-origin-embedder-policy": "require-corp", "cross-origin-resource-policy": "same-origin" }, body: instantOcr }),
  );
  await context.route("**/api/scan", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(exampleReply) }));
  await page.reload();
  const chooser = page.waitForEvent("filechooser");
  await dropZone(page).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(page.getByTestId("receipt")).toBeVisible();
}

/** Types each name into the sentence's name blank, opening it first when it is closed. Enter keeps the field open for the next. */
export async function addNames(page: Page, ...names: string[]) {
  const field = page.getByRole("textbox", { name: /^(Your name|Name)$/ });
  if (!(await field.isVisible())) await page.getByRole("button", { name: "Add friends" }).click();
  for (const name of names) {
    await field.fill(name);
    await field.press("Enter");
  }
}
