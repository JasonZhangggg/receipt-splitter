import { expect, test, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

type Probe = { loaderPeak: number; shownAt: number | null; leaveAt: number | null; goneAt: number | null; geistAtReveal: boolean | null };

/** Records, frame by frame, how opaque the loader got and when the page was revealed. */
function watchBoot() {
  const probe: Probe = { loaderPeak: 0, shownAt: null, leaveAt: null, goneAt: null, geistAtReveal: null };
  Object.assign(window, { probe });
  const geist = () => document.fonts.check('400 16px "Geist"') && document.fonts.check('500 16px "Geist"');
  new MutationObserver(() => {
    const phase = document.documentElement.getAttribute("data-boot");
    if (phase !== "wait" && probe.geistAtReveal === null) probe.geistAtReveal = geist();
    if (phase === "leave" && probe.leaveAt === null) probe.leaveAt = performance.now();
    if (phase === null && probe.goneAt === null) probe.goneAt = performance.now();
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-boot"] });
  const frame = () => {
    const loader = document.getElementById("rs-boot");
    const opacity = loader ? Number(getComputedStyle(loader).opacity) : 0;
    if (opacity > 0 && probe.shownAt === null) probe.shownAt = performance.now();
    probe.loaderPeak = Math.max(probe.loaderPeak, opacity);
    if (probe.goneAt === null) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { probe: Probe }).probe);
const loader = (page: Page) => page.getByRole("status", { name: "Loading" });
const rootOpacity = (page: Page) => page.locator("#root").evaluate((el) => getComputedStyle(el).opacity);

/** The load event waits for the preloaded fonts, so a test of the wait for them goes on as soon as the page starts. */
const open = (page: Page, path: string) => page.goto(path, { waitUntil: "commit" });

async function delayFonts(page: Page, ms: number) {
  await page.route("**/fonts/geist-*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(watchBoot);
});

test("while Geist is slow the receipt loader shows, then lifts once the font is in and the page fades up", async ({ page }) => {
  await delayFonts(page, 1500);
  await open(page, "/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  await expect(page.locator("#root")).toHaveAttribute("aria-busy", "true");
  expect(await rootOpacity(page)).toBe("0");
  expect(await page.evaluate(() => document.fonts.check('400 16px "Geist"'))).toBe(false);
  await expect(loader(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Create link" })).toBeVisible();
  await expect.poll(() => rootOpacity(page)).toBe("1");
  await expect(page.locator("#root")).not.toHaveAttribute("aria-busy");
  const seen = await probe(page);
  expect(seen.loaderPeak).toBe(1);
  expect(seen.geistAtReveal).toBe(true);
  expect(seen.leaveAt! - seen.shownAt!).toBeGreaterThanOrEqual(400);
  expect(seen.goneAt! - seen.leaveAt!).toBeGreaterThanOrEqual(190);
});

test("the Split page gets the same loader while Geist is slow", async ({ page }) => {
  await delayFonts(page, 1500);
  await open(page, "/s/abc");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  await expect(loader(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "This split has expired" })).toBeVisible();
  expect((await probe(page)).geistAtReveal).toBe(true);
});

test("a load that is ready within 150 ms never shows the loader", async ({ page }) => {
  // How fast the real bundle mounts depends on the machine, so this stands in for it: the app is held back and its mounted signal comes as soon as the HTML is parsed.
  await page.route("**/_expo/static/js/**", (route) => route.abort());
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") document.dispatchEvent(new Event("splitwith:mounted"));
    });
  });
  await page.goto("/");
  await expect(loader(page)).toHaveCount(0, { timeout: 1_000 });
  await expect.poll(() => rootOpacity(page)).toBe("1");
  const seen = await probe(page);
  expect([seen.loaderPeak, seen.shownAt, seen.leaveAt, seen.geistAtReveal]).toEqual([0, null, null, true]);
});

test("when the font request fails the page shows in the fallback face without waiting", async ({ page }) => {
  await page.route("**/fonts/geist-*", (route) => route.abort());
  await page.goto("/");
  await expect(loader(page)).toHaveCount(0, { timeout: 2_500 });
  await expect.poll(() => rootOpacity(page)).toBe("1");
  expect((await probe(page)).geistAtReveal).toBe(false);
});

test("when the font request hangs the page shows in the fallback face at about 3 s", async ({ page }) => {
  await page.route("**/fonts/geist-*", () => {});
  await open(page, "/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  await expect(loader(page)).toHaveCount(0, { timeout: 6_000 });
  await expect.poll(() => rootOpacity(page)).toBe("1");
  const seen = await probe(page);
  expect(seen.geistAtReveal).toBe(false);
  expect(seen.leaveAt).toBeGreaterThanOrEqual(2_900);
  expect(seen.leaveAt).toBeLessThan(4_000);
});

test("when the app never starts the page still shows at 8 s", async ({ page }) => {
  test.slow();
  await page.route("**/_expo/static/js/**", (route) => route.abort());
  await page.goto("/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  expect(await rootOpacity(page)).toBe("0");
  await expect.poll(() => rootOpacity(page), { timeout: 12_000 }).toBe("1");
  await expect(loader(page)).toHaveCSS("opacity", "0");
});

test("with reduced motion the loader's lines stand drawn and the receipt stays still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await delayFonts(page, 1500);
  await open(page, "/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  const drawn = await loader(page).evaluate((el) => ({
    lines: [...el.querySelectorAll("i svg")].map((line) => [getComputedStyle(line).animationName, getComputedStyle(line).transform]),
    paper: [getComputedStyle(el.querySelector(".paper")!).animationName, getComputedStyle(el.querySelector(".paper")!).transform],
  }));
  expect(drawn).toEqual({
    lines: [
      ["none", "none"],
      ["none", "none"],
      ["none", "none"],
      ["none", "none"],
    ],
    paper: ["none", "none"],
  });
});

test("on a dark device the loader draws light ink on the dark page", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await delayFonts(page, 1500);
  await open(page, "/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  await expect(loader(page)).toHaveCSS("color", "rgb(237, 237, 237)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(17, 17, 17)");
});
