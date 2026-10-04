import { expect, test, type Page } from "@playwright/test";

import { blur, simulateKeyboard } from "./motion";

test.use({ viewport: { width: 402, height: 714 }, serviceWorkers: "block" });

const keyboard = 336;
// iOS 27 reveals a focused panel field by scrolling the window into the room below the panel, 166 px for the Venmo handle at this size (measured in the simulator).
const iosPan = 166;

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test("once the keyboard closes after a photo is read, home slides back to the top instead of staying where iOS panned it", async ({ page }) => {
  await simulateKeyboard(page, keyboard);
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Add|Drop a) receipt/ }).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(page.getByTestId("receipt")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("textbox", { name: "Venmo handle" }).click();
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(714 - keyboard);
  expect(await page.evaluate((y) => (window.scrollTo(0, y), window.scrollY), iosPan)).toBe(iosPan);

  await page.getByRole("button", { name: "Your name" }).click();
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
  await page.waitForTimeout(300);
  expect(await scrollY(page)).toBe(iosPan);

  await blur(page);
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(714);
  await expect.poll(() => scrollY(page)).toBe(0);
});
