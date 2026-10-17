import { addNames } from "./files";
import { punctuationFreeToWrap, punctuationStartingALine } from "./line-starts";
import { expect, test, type Page } from "./without-ocr";

const widths = [320, 340, 375, 390, 412, 430];
const handle = "jason-zhang-162";

async function settle(page: Page) {
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

const venmo = (page: Page) => page.getByRole("textbox", { name: "Venmo handle" });

const states: { name: string; fill: (page: Page) => Promise<void> }[] = [
  { name: "a long handle and no name", fill: (page) => venmo(page).fill(handle) },
  {
    name: "a long handle, a name and friends",
    fill: async (page) => {
      await venmo(page).fill(handle);
      await addNames(page, "Jason", "Bin", "lei");
    },
  },
  {
    name: "a 30-letter handle and a long name",
    fill: async (page) => {
      await venmo(page).fill("a".repeat(30));
      await addNames(page, "Maximiliana Alexandropoulou");
    },
  },
  {
    name: "a friend named before the Host, and two ways to pay",
    fill: async (page) => {
      await venmo(page).fill(handle);
      await page.getByRole("button", { name: "Add friends" }).click();
      await page.keyboard.type("Bin");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Add another way to get paid" }).click();
      await page.getByRole("textbox", { name: "Cash App handle" }).fill("$jason-zhang-162");
    },
  },
  { name: "nothing filled in", fill: async () => {} },
];

// One test per width, so each stays well inside the 30 s budget on a slow runner, and each starts from an empty home.
for (const { name, fill } of states) {
  for (const width of widths) {
    test(`no line of the home sentence starts with punctuation at ${width} px, with ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await settle(page);
      await fill(page);
      await page.keyboard.press("Escape");
      await page.getByRole("heading", { name: "SplitWith" }).click();
      expect(await punctuationStartingALine(page)).toEqual([]);
      expect(await punctuationFreeToWrap(page)).toEqual([]);
    });
  }
}
