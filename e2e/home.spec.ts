import { expect, test, type Locator, type Page } from "@playwright/test";

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

const focusRing = (target: Locator) =>
  target.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth]);

test("the scan action sits in the bottom bar and takes keyboard focus at 390 px", async ({ page }) => {
  await page.goto("/");
  const scan = page.getByRole("button", { name: "Scan or upload a receipt" });
  await expect(scan).toBeInViewport();
  const box = await scan.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(phone.height - 120);
  await tabTo(page, "Scan or upload a receipt");
  await expect(scan).toBeFocused();
  expect(await focusRing(scan)).toEqual(["solid", "2px"]);
});

test("the bottom bar lifts the scan action by the bottom safe-area inset", async ({ page }) => {
  const gapBelowScan = async () => {
    const box = (await page.getByRole("button", { name: "Scan or upload a receipt" }).boundingBox())!;
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

async function settle(page: Page) {
  await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

const headline = ["Split the bill", "at the table."];

for (const width of [320, phone.width, 1280]) {
  test(`the headline mask hides no glyph ink at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: phone.height });
    await page.goto("/");
    await settle(page);
    for (const line of headline) {
      const mask = page.getByText(line, { exact: true }).locator("..");
      const box = (await mask.boundingBox())!;
      const clip = { x: 0, y: box.y - 32, width, height: box.height + 64 };
      const clipped = await page.screenshot({ clip });
      await mask.evaluate((el) => (el.style.overflow = "visible"));
      const unclipped = await page.screenshot({ clip });
      expect(Buffer.compare(clipped, unclipped), `"${line}" looks different without its mask`).toBe(0);
    }
  });
}

test("the headline rises from fully hidden behind its mask", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(headline[0], { exact: true })).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    }),
  );
  for (const line of headline) {
    const text = page.getByText(line, { exact: true });
    const box = (await text.locator("..").boundingBox())!;
    const atStart = await page.screenshot({ clip: box });
    await text.evaluate((el) => (el.style.visibility = "hidden"));
    expect(Buffer.compare(atStart, await page.screenshot({ clip: box })), `"${line}" peeks out at the start`).toBe(0);
  }
});

test("each headline line fits on one line at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await settle(page);
  const lineCounts = await page.evaluate(
    (lines) =>
      lines.map((line) => {
        const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent === line)!;
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      }),
    headline,
  );
  expect(lineCounts).toEqual([1, 1]);
});

for (const width of [320, phone.width, 1280]) {
  test(`the fallback fonts keep the layout of the web fonts at ${width} px`, async ({ browser }) => {
    const layout = async (blockFonts: boolean) => {
      const context = await browser.newContext({ viewport: { width, height: phone.height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      if (blockFonts) await page.route(/\.ttf$/, (route) => route.abort());
      await page.goto("/");
      await settle(page);
      const box = async (text: string) => {
        const { y, height } = (await page.getByText(text).first().boundingBox())!;
        return [Math.round(y), Math.round(height)];
      };
      const result = {
        webFaces: await page.evaluate(() =>
          [...document.fonts].filter((f) => /^"?Archivo(Condensed)?"?$/.test(f.family)).map((f) => f.status),
        ),
        boxes: [await box(headline[1]), await box("Take a photo of the receipt"), await box("Example scan")],
      };
      await context.close();
      return result;
    };
    const loaded = await layout(false);
    const blocked = await layout(true);
    expect([loaded.webFaces, blocked.webFaces]).toEqual([
      ["loaded", "loaded"],
      ["error", "error"],
    ]);
    expect(blocked.boxes).toEqual(loaded.boxes);
  });
}

test("the two columns start level at 1280 px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await settle(page);
  const top = async (text: string) => (await page.getByText(text, { exact: true }).boundingBox())!.y;
  expect(await top("Example scan")).toBe(await top("Receipt Splitter"));
});

test("side safe-area insets keep the content clear of a landscape notch", async ({ page }) => {
  const landscape = { width: 844, height: 390 };
  await page.setViewportSize(landscape);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
  await page.goto("/");
  await settle(page);
  const edges = async (text: string) => {
    const box = (await page.getByText(text, { exact: true }).boundingBox())!;
    return [box.x, box.x + box.width];
  };
  expect(await edges("Split the bill")).toEqual([47 + 24, landscape.width - 47 - 24]);
  expect(await edges("Example scan")).toEqual([47 + 24, landscape.width - 47 - 24]);
  const field = (await page.getByText("Split the bill", { exact: true }).locator("../../..").boundingBox())!;
  expect([field.x, field.width]).toEqual([0, landscape.width]);
});

test("item hairlines span the same width as the heavy rules", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const edges = await page.evaluate(() => {
    const names = ["Margherita pizza", "Caesar salad", "Spicy rigatoni", "Lemonade pitcher", "Tiramisu"];
    const rows = names.map(
      (name) =>
        [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent === name)!.parentElement!
          .parentElement!,
    );
    const span = (el: Element) => {
      const r = el.getBoundingClientRect();
      return [r.left, r.right];
    };
    return { rule: span(rows[0].previousElementSibling!), rows: rows.map(span) };
  });
  expect(edges.rule).toEqual([24, phone.width - 24]);
  expect(edges.rows).toEqual(Array(5).fill([24, phone.width - 24]));
});

async function pressAndHold(page: Page, name: string) {
  const box = (await page.getByRole("button", { name }).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
}

const pressLook = (page: Page) =>
  page.getByRole("button", { name: "Scan or upload a receipt" }).evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transform: style.transform,
      opacity: style.opacity,
      transitions: el.getAnimations().map((a) => (a as CSSTransition).transitionProperty),
    };
  });

test("a press shows on touch-down without waiting on a timer", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await settle(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await pressAndHold(page, "Scan or upload a receipt");
  await expect
    .poll(() => pressLook(page))
    .toEqual({ transform: "matrix(0.96, 0, 0, 0.96, 0, 0)", opacity: "1", transitions: [] });
});

test("under reduced motion a press dims the action at once and never scales it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settle(page);
  expect(await pressLook(page)).toEqual({ transform: "none", opacity: "1", transitions: [] });
  await pressAndHold(page, "Scan or upload a receipt");
  const seen = [];
  for (let frame = 0; frame < 20; frame++) {
    seen.push(await pressLook(page));
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  expect(seen.at(-1)).toEqual({ transform: "none", opacity: "0.7", transitions: [] });
  expect(seen.filter((look) => look.transform !== "none" || look.transitions.length > 0)).toEqual([]);
});

test("the inline scan action takes keyboard focus with a visible ring at 1280 px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const scan = await tabTo(page, "Scan or upload a receipt");
  await expect(scan).toBeFocused();
  expect(await focusRing(scan)).toEqual(["solid", "2px"]);
  const action = (await scan.boundingBox())!;
  const note = (await page.getByText("The photo stays on your phone.").boundingBox())!;
  expect(action.y + action.height, "the action sits inline under the pitch").toBeLessThan(note.y);
  await context.close();
});

const matrix = [320, phone.width, 1280].flatMap((width) =>
  (["light", "dark"] as const).flatMap((colorScheme) =>
    (["no-preference", "reduce"] as const).map((reducedMotion) => ({ width, colorScheme, reducedMotion })),
  ),
);

for (const { width, colorScheme, reducedMotion } of matrix) {
  test(`home matrix ${width} px ${colorScheme} motion ${reducedMotion} has no clipped text or errors`, async ({ browser }) => {
    const isPhone = width < 768;
    const context = await browser.newContext({
      viewport: { width, height: isPhone ? phone.height : 800 },
      isMobile: isPhone,
      hasTouch: isPhone,
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
      [...document.fonts]
        .filter((f) => f.status === "loaded" && /^"?Archivo(Condensed)?"?$/.test(f.family))
        .map((f) => `${f.family.replaceAll('"', "")} ${f.weight}`),
    );
    expect(loaded.sort()).toEqual(["Archivo 500", "ArchivoCondensed 800"]);
    expect(errors).toEqual([]);
    if (process.env.SHOTS) {
      await page.screenshot({ path: `${process.env.SHOTS}/home-${width}-${colorScheme}-${reducedMotion}.png` });
    }
    await context.close();
  });
}
