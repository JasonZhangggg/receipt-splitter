import { expect, test } from "@playwright/test";

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
