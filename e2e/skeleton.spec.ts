import { expect, test } from "@playwright/test";

test("home screen loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
});

test("a split link shows its id after the SPA fallback", async ({ page }) => {
  const response = await page.goto("/s/abc");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("split-id")).toHaveText("abc");
});
