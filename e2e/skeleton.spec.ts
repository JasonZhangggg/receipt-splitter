import { expect, test } from "@playwright/test";

test("home screen loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Splitwith" })).toBeVisible();
});

test("a split link opened first loads the Split page through the SPA fallback", async ({ page }) => {
  const response = await page.goto("/s/abc");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "This split has expired" })).toBeVisible();
});
