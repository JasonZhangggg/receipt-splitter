import { expect, test } from "@playwright/test";
import type { TextBox } from "../src/ocr";

test("home paints before the model download starts, then prefetches the models", async ({ page }) => {
  const firstModelRequest = page.context().waitForEvent("request", (request) => new URL(request.url()).pathname.startsWith("/models/"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();

  const request = await firstModelRequest;
  await request.response();
  const firstPaint = await page.evaluate(() => {
    const [paint] = performance.getEntriesByName("first-contentful-paint");
    return performance.timeOrigin + paint.startTime;
  });
  expect(request.timing().startTime).toBeGreaterThan(firstPaint);
});

test("recognizes SRD receipt 1040 on the device", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/debug/ocr");
  await page.getByLabel("Receipt photo").setInputFiles("bench/data/srd-1040.jpg");

  await expect(page.getByTestId("ocr-status")).toHaveText(/^Read \d+ boxes in \d+ ms\.$/, { timeout: 90_000 });
  const { boxes }: { boxes: TextBox[] } = JSON.parse((await page.getByTestId("ocr-json").textContent()) ?? "");
  const label = boxes.find((box) => box.text === "Subtotal");
  const amount = boxes.find((box) => box.text === "$22.98");
  expect(label && amount, "boxes Subtotal and $22.98").toBeTruthy();

  const [labelTop, labelRight, , labelBottom] = label!.corners;
  const [amountTop, , , amountBottom] = amount!.corners;
  const middle = (top: { y: number }, bottom: { y: number }) => (top.y + bottom.y) / 2;
  expect(Math.abs(middle(labelTop, labelBottom) - middle(amountTop, amountBottom))).toBeLessThan((labelBottom.y - labelTop.y) / 2);
  expect(amountTop.x).toBeGreaterThan(labelRight.x);
});
