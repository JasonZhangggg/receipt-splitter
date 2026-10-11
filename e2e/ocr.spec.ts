import { expect, test, type Page } from "@playwright/test";
import type { TextBox } from "../src/ocr";

async function readBoxes(page: Page): Promise<TextBox[]> {
  return JSON.parse((await page.getByTestId("ocr-json").textContent()) ?? "").boxes;
}

test("home paints before the model download starts, then prefetches the models", async ({ page }) => {
  const firstModelRequest = page.context().waitForEvent("request", (request) => new URL(request.url()).pathname.startsWith("/models/"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  const request = await firstModelRequest;
  await request.response();
  const firstPaint = await page.evaluate(() => {
    const [paint] = performance.getEntriesByName("first-contentful-paint");
    return performance.timeOrigin + paint.startTime;
  });
  expect(request.timing().startTime).toBeGreaterThan(firstPaint);
});

for (const path of ["/debug/ocr", "/debug/ocr/"]) {
  test(`${path} is cross-origin isolated, so OCR gets threads`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Read a receipt" })).toBeVisible();
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  });
}

test("recognizes SRD receipt 1040 on the device", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/debug/ocr");
  await page.getByLabel("Receipt photo").setInputFiles("bench/data/srd-1040.jpg");

  await expect(page.getByTestId("ocr-status")).toHaveText(/^Read \d+ boxes in \d+ ms\.$/, { timeout: 90_000 });
  const boxes = await readBoxes(page);
  const label = boxes.find((box) => box.text === "Subtotal");
  const amount = boxes.find((box) => box.text === "$22.98");
  if (!label || !amount) throw new Error("boxes Subtotal and $22.98 not found");

  const [labelTop, labelRight, , labelBottom] = label.corners;
  const [amountTop, , , amountBottom] = amount.corners;
  const middle = (top: { y: number }, bottom: { y: number }) => (top.y + bottom.y) / 2;
  expect(Math.abs(middle(labelTop, labelBottom) - middle(amountTop, amountBottom))).toBeLessThan((labelBottom.y - labelTop.y) / 2);
  expect(amountTop.x).toBeGreaterThan(labelRight.x);
});

test("a model answered with the app's HTML page fails the scan, and the next scan reads once the model is back", async ({ page }) => {
  test.setTimeout(120_000);
  const dict = "**/models/en_PP-OCRv5_rec_mobile.dict.txt";
  await page.context().route(dict, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!DOCTYPE html><html><body></body></html>" }),
  );
  await page.goto("/debug/ocr");
  const status = page.getByTestId("ocr-status");

  await page.getByLabel("Receipt photo").setInputFiles("bench/data/srd-1040.jpg");
  await expect(status).toHaveText(/^Could not read it\. Error: OCR download \S+\/en_PP-OCRv5_rec_mobile\.dict\.txt returned an HTML page$/, {
    timeout: 90_000,
  });

  await page.context().unroute(dict);
  await page.getByLabel("Receipt photo").setInputFiles("bench/data/srd-1040.jpg");
  await expect(status).toHaveText(/^Read \d+ boxes in \d+ ms\.$/, { timeout: 90_000 });
  const boxes = await readBoxes(page);
  expect(boxes.map((box) => box.text)).toContain("$22.98");
});
