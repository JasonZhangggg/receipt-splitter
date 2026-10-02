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

export const dropZone = (page: Page) => page.getByRole("button", { name: /^(Add|Drop a) receipt/ });

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

export async function openExample(page: Page) {
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 768, height: size.height });
  await expect(async () => {
    await page.getByRole("button", { name: "Example" }).click({ timeout: 1_000 });
    await expect(page.getByTestId("receipt")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.setViewportSize(size);
}
