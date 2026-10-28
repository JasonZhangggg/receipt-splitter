import { addNames, openExample } from "./files";
import { linkReady, youAre } from "./header";
import { expect, test, type Page } from "./without-ocr";

test.use({ serviceWorkers: "block" });
test.setTimeout(90_000);

let tests = 0;

test.beforeEach(async ({ context }, testInfo) => {
  tests += 1;
  const ip = `198.57.${testInfo.workerIndex}.${tests}`;
  await context.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }));
});

const shots = process.env.LINK_READY_SHOTS;

async function create(page: Page) {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addNames(page, "Jason", "Sam", "Priya");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(linkReady(page)).toBeVisible({ timeout: 30_000 });
}

const rows = (page: Page) => linkReady(page).getByRole("listitem");

for (const width of [390, 1280]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: width < 1024 ? 844 : 800 } });

    test("Create link opens Link ready with the link and whose device this is; Switch lists the names, a pick keeps the sheet open, and a reload does not bring it back", async ({ page }) => {
      await create(page);
      const sheet = linkReady(page);
      const device = width < 1024 ? "phone" : "computer";
      await expect(sheet.getByTestId("split-link")).toContainText("/s/");
      await expect(sheet.getByRole("button", { name: "Copy" })).toBeVisible();
      await expect(sheet.getByText(`This ${device} is Jason.`)).toBeVisible();
      await expect(rows(page)).toHaveCount(0);

      await sheet.getByRole("button", { name: "Switch account" }).click();
      await expect(rows(page)).toHaveCount(3);
      await expect(sheet.getByRole("button", { name: "Jason, you" })).toHaveAttribute("aria-pressed", "true");
      await sheet.getByRole("button", { name: "Sam", exact: true }).click();
      await expect(sheet.getByText(`This ${device} is Sam.`)).toBeVisible();
      await expect(rows(page)).toHaveCount(0);

      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await youAre(page, "Sam");

      await page.reload();
      await expect(page.getByTestId(width < 1024 ? "owe" : "share-head")).toBeVisible({ timeout: 30_000 });
      await expect(linkReady(page)).toHaveCount(0);
    });
  });
}

test.describe("with a share sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Share on the link line opens the phone's share sheet with the Split's link", async ({ page }) => {
    await page.addInitScript(() => {
      Object.assign(navigator, { share: (data: ShareData) => ((window as unknown as { shared: ShareData[] }).shared ??= []).push(data) && Promise.resolve() });
    });
    await create(page);
    const sheet = linkReady(page);
    await sheet.getByRole("button", { name: "Share", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared)).toEqual([{ url: page.url() }]);
  });
});

if (shots)
  for (const [width, scheme] of [
    [390, "light"],
    [390, "dark"],
    [1280, "light"],
    [1280, "dark"],
  ] as const)
    test(`screenshot ${width} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 1024 ? 844 : 800 });
      await page.emulateMedia({ colorScheme: scheme });
      if (width < 1024) await page.addInitScript(() => Object.assign(navigator, { share: () => Promise.resolve() }));
      await create(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${shots}/${width < 1024 ? "phone" : "desktop"}-${scheme}.png` });
      await linkReady(page).getByRole("button", { name: "Switch account" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${shots}/${width < 1024 ? "phone" : "desktop"}-${scheme}-switch.png` });
    });
