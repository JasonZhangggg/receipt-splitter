import { expect, test, type Page } from "@playwright/test";

const phone = { width: 390, height: 844 };

test.use({ viewport: phone });

async function tabTo(page: Page, name: string) {
  const target = page.getByRole("button", { name });
  for (let i = 0; i < 12; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  return target;
}

test("the scan action sits in the bottom bar and takes keyboard focus at 390 px", async ({ page }) => {
  await page.goto("/");
  const scan = page.getByRole("button", { name: "Scan a receipt" });
  await expect(scan).toBeInViewport();
  const box = await scan.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(phone.height - 120);
  await expect(await tabTo(page, "Scan a receipt")).toBeFocused();
});

test("the bottom bar lifts the scan action by the bottom safe-area inset", async ({ page }) => {
  const gapBelowScan = async () => {
    const box = (await page.getByRole("button", { name: "Scan a receipt" }).boundingBox())!;
    return phone.height - (box.y + box.height);
  };
  await page.goto("/");
  const flush = await gapBelowScan();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
  await page.reload();
  await expect.poll(gapBelowScan).toBe(flush + 34);
});

test("the bottom bar does not cover the end of the page", async ({ page }) => {
  await page.goto("/");
  const last = page.getByText("short of the subtotal", { exact: false });
  await last.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 4000);
  await expect(last).toBeInViewport();
  const box = (await last.boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.textContent ?? "",
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toContain("short of the subtotal");
});

test("reduced motion skips the entrance animation", async ({ page }) => {
  const animations = () => page.evaluate(() => document.getAnimations().length);
  const load = async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
  };
  await load();
  expect(await animations()).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await load();
  expect(await animations()).toBe(0);
});

const matrix = [390, 1280].flatMap((width) =>
  (["light", "dark"] as const).flatMap((colorScheme) =>
    (["no-preference", "reduce"] as const).map((reducedMotion) => ({ width, colorScheme, reducedMotion })),
  ),
);

for (const { width, colorScheme, reducedMotion } of matrix) {
  test(`home matrix ${width} px ${colorScheme} motion ${reducedMotion} has no clipped text or errors`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 800 },
      isMobile: width === 390,
      hasTouch: width === 390,
      colorScheme,
      reducedMotion,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.childElementCount === 0 && el.textContent?.trim())
        .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1)
        .map((el) => el.textContent),
    );
    expect(clipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replaceAll('"', "")} ${f.weight}`),
    );
    expect(loaded.sort()).toEqual(["Archivo 500", "ArchivoCondensed 800"]);
    expect(errors).toEqual([]);
    if (process.env.SHOTS) {
      await page.screenshot({ path: `${process.env.SHOTS}/home-${width}-${colorScheme}-${reducedMotion}.png` });
    }
    await context.close();
  });
}
