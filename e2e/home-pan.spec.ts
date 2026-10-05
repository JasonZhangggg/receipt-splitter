import { expect, test } from "@playwright/test";

import { blur, simulateKeyboard } from "./motion";

test.use({ viewport: { width: 402, height: 714 }, serviceWorkers: "block" });

const keyboard = 336;
// iOS 27 scrolled the window 166 px for the Venmo handle into the room the panel's fill left below the page, and left it there.
const iosPan = 166;

test("after a photo is read, home leaves iOS no room to scroll for the keyboard, so it can never stay scrolled down", async ({ page }) => {
  await simulateKeyboard(page, keyboard);
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Add|Drop a) receipt/ }).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(page.getByTestId("receipt")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("textbox", { name: "Venmo handle" }).click();
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(714 - keyboard);
  expect(await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight])).toEqual([714, 714]);
  expect(await page.evaluate((y) => (window.scrollTo(0, y), window.scrollY), iosPan)).toBe(0);

  await blur(page);
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(714);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
