import { readFileSync } from "node:fs";

import { faces } from "../src/ui/fonts.generated";
import { expect, test, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

type Probe = {
  loaderPeak: number;
  shownAt: number | null;
  leaveAt: number | null;
  goneAt: number | null;
  mountedAt: number | null;
  geistAt: number | null;
  geistAtReveal: boolean | null;
};

/** Records, frame by frame, how opaque the loader got, when the app and Geist were ready, and when the page was revealed. */
function watchBoot() {
  const probe: Probe = { loaderPeak: 0, shownAt: null, leaveAt: null, goneAt: null, mountedAt: null, geistAt: null, geistAtReveal: null };
  Object.assign(window, { probe });
  // In CI, WebKit's fonts.check() said Geist was in before it had loaded, so this reads the faces themselves.
  const geist = () => {
    const faces = [...document.fonts].filter((face) => face.family.replace(/"/g, "") === "Geist");
    return faces.length === 2 && faces.every((face) => face.status === "loaded");
  };
  document.addEventListener("splitwith:mounted", () => (probe.mountedAt ??= performance.now()));
  let waiting = false;
  new MutationObserver(() => {
    const phase = document.documentElement.getAttribute("data-boot");
    if (phase === "wait" && !waiting) {
      waiting = true;
      // The same wait the loader makes once Geist is declared. Polling face status each frame read late on CI WebKit, where frames stall.
      Promise.all([document.fonts.load('400 16px "Geist"'), document.fonts.load('500 16px "Geist"')]).then(() => (probe.geistAt = performance.now()));
    }
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

test("while Geist is slow the receipt loader shows, then lifts once the font is in and the page fades up", async ({ page, browserName }) => {
  await delayFonts(page, 1500);
  await open(page, "/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  await expect(page.locator("#root")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  expect(await rootOpacity(page)).toBe("0.001");
  expect(await page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/"/g, "") === "Geist" && face.status === "loaded"))).toBe(false);
  await expect(loader(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Create link" })).toBeVisible();
  await expect.poll(() => rootOpacity(page)).toBe("1");
  await expect(page.locator("#root")).not.toHaveAttribute("aria-busy");
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  const seen = await probe(page);
  expect(seen.loaderPeak).toBe(1);
  expect(seen.geistAtReveal).toBe(true);
  expect(seen.leaveAt! - seen.shownAt!).toBeGreaterThanOrEqual(300);
  // The 200 ms fade timer starts when "leave" is set, but the observer stamps leaveAt only after the rest of that task, which ran 12 to 19 ms on CI WebKit.
  // 150 still tells a fade from a loader that goes at once.
  expect(seen.goneAt! - seen.leaveAt!).toBeGreaterThanOrEqual(150);
  // The loader has been up far longer than its 300 ms hold, so it lifts as soon as the last of the app and Geist is ready.
  const ready = Math.max(seen.mountedAt!, seen.geistAt!);
  const fonts = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/fonts/geist-"))
      .map((entry) => [entry.name.split("/").pop(), Math.round(entry.startTime), Math.round((entry as PerformanceResourceTiming).responseEnd)]),
  );
  const timeline = JSON.stringify({ ...seen, fonts });
  expect(seen.geistAt, timeline).not.toBeNull();
  expect(seen.leaveAt! - ready, timeline).toBeGreaterThan(-20);
  // Linux WebKit in CI drops frames for 150 to 330 ms (rule 45), so only Chromium holds the tight bound that caught the stalled hold clock.
  expect(seen.leaveAt! - ready, timeline).toBeLessThan(browserName === "webkit" ? 400 : 80);
});

test("the Split page gets the same loader while Geist is slow", async ({ page }) => {
  await delayFonts(page, 1500);
  await open(page, "/s/abc");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  await expect(loader(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "We can't find this split" })).toBeVisible();
  expect((await probe(page)).geistAtReveal).toBe(true);
});

test("an unknown route shows the not-found page and lifts the loader within 3 s", async ({ page }) => {
  await open(page, "/nope/nothing");
  await expect(loader(page)).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
  await expect(page.getByText("Check the link, or start a new split.")).toBeVisible();
  await expect(page.getByText("Sitemap")).toHaveCount(0);
  await expect(page.getByText("Page could not be found.")).toHaveCount(0);
  await page.getByRole("button", { name: "Split a receipt", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the sitemap route is not in the export", async ({ page }) => {
  await page.goto("/_sitemap");
  await expect(page.getByText("This page doesn't exist")).toBeVisible();
  await expect(page.getByText("Sitemap")).toHaveCount(0);
});

test("a load that is ready within 300 ms never shows the loader", async ({ page }) => {
  // How fast the real bundle mounts depends on the machine, so this stands in for it: the app is held back, its mounted signal comes as soon as the HTML is parsed, and the fonts come from memory.
  await page.route("**/_expo/static/js/**", (route) => route.abort());
  for (const url of Object.values(faces)) {
    const body = readFileSync(`public${url}`);
    await page.route(`**${url}`, (route) => route.fulfill({ body, contentType: "font/woff2" }));
  }
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") document.dispatchEvent(new Event("splitwith:mounted"));
    });
  });
  await page.goto("/");
  await expect(loader(page)).toHaveCount(0, { timeout: 1_000 });
  await expect.poll(() => rootOpacity(page)).toBe("1");
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  const seen = await probe(page);
  expect([seen.loaderPeak, seen.shownAt, seen.leaveAt, seen.geistAtReveal]).toEqual([0, null, null, true]);
});

test("without JavaScript nothing is hidden and the loader never shows", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  const state = await page.evaluate(() => ({
    loader: getComputedStyle(document.getElementById("rs-boot")!).display,
    root: getComputedStyle(document.getElementById("root")!).opacity,
    attributes: ["inert", "aria-busy"].filter((name) => document.getElementById("root")!.hasAttribute(name)),
  }));
  await context.close();
  expect(state).toEqual({ loader: "none", root: "1", attributes: [] });
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

test("when the app never starts the page shows and takes input at 8 s, and a mount after that changes nothing on screen", async ({ page }) => {
  test.slow();
  await page.route("**/_expo/static/js/**", (route) => route.abort());
  await page.goto("/");
  await expect(loader(page)).toHaveCSS("opacity", "1");
  expect(await rootOpacity(page)).toBe("0.001");
  await expect.poll(() => rootOpacity(page), { timeout: 12_000 }).toBe("1");
  await expect(loader(page)).toHaveCSS("opacity", "0");
  await expect(page.locator("#root")).not.toHaveAttribute("inert", { timeout: 1_000 });
  const late = await page.evaluate(async () => {
    const seen = { rootLow: 1, loaderHigh: 0 };
    document.dispatchEvent(new Event("splitwith:mounted"));
    const end = performance.now() + 600;
    while (performance.now() < end) {
      await new Promise(requestAnimationFrame);
      const loader = document.getElementById("rs-boot");
      seen.rootLow = Math.min(seen.rootLow, Number(getComputedStyle(document.getElementById("root")!).opacity));
      seen.loaderHigh = Math.max(seen.loaderHigh, loader ? Number(getComputedStyle(loader).opacity) : 0);
    }
    return seen;
  });
  expect(late).toEqual({ rootLow: 1, loaderHigh: 0 });
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
