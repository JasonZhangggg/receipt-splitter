import { expect, test, type Locator, type Page } from "@playwright/test";

import { fallbackSamples } from "../src/ui/home-copy";

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

const headlineWidths = [320, phone.width, 900, 960, 1010, 1024, 1280];

for (const width of headlineWidths) {
  test(`the headline mask hides no glyph ink at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: phone.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
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

for (const width of headlineWidths) {
  test(`the headline rises from fully hidden behind its mask at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: phone.height });
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
}

for (const width of headlineWidths) {
  test(`each headline line fits on one line at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
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
}

for (const width of [320, phone.width]) {
  test(`without container query units the headline keeps one line per row above body size at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await settle(page);
    const layout = await page.evaluate((lines) => {
      for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
        for (const property of [...el.style]) {
          if (property === "container-type" || el.style.getPropertyValue(property).includes("cqi")) el.style.removeProperty(property);
        }
      }
      const leaf = (text: string) =>
        [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent?.startsWith(text))!;
      const rows = lines.map((line) => {
        const range = document.createRange();
        range.selectNodeContents(leaf(line));
        const tops = [...range.getClientRects()].map((r) => Math.round(r.top));
        return { lines: new Set(tops).size, top: leaf(line).getBoundingClientRect().top };
      });
      return {
        headline: getComputedStyle(leaf(lines[0])).fontSize,
        body: getComputedStyle(leaf("Take a photo of the receipt")).fontSize,
        lines: rows.map((row) => row.lines),
        pitch: Math.round((rows[1].top - rows[0].top) * 10) / 10,
      };
    }, headline);
    expect(layout).toEqual({ headline: "56px", body: "18px", lines: [1, 1], pitch: 54.3 });
  });
}

for (const [width, finalSize] of [
  [phone.width, 64],
  [960, 83.5],
]) {
  test(`the headline paints its first frame at ${finalSize} px at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript((line) => {
      const sizes: string[] = [];
      Object.assign(window, { headlineSizes: sizes });
      const sample = () => {
        const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent === line);
        if (el) sizes.push(getComputedStyle(el).fontSize);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, headline[0]);
    await page.goto("/");
    await settle(page);
    const sizes = await page.evaluate(() => (window as unknown as { headlineSizes: string[] }).headlineSizes);
    expect([...new Set(sizes.map((size) => Number(parseFloat(size).toFixed(1))))]).toEqual([finalSize]);
  });
}

for (const width of [320, phone.width, 960, 1280]) {
  test(`the fallback fonts keep the headline lines of the web fonts at ${width} px`, async ({ browser }) => {
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
        boxes: [await box(headline[0]), await box(headline[1])],
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

for (const width of [phone.width, 1280]) {
  test(`the fallback metrics sample every line the home screen renders at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await settle(page);
    const rendered = await page.evaluate(() => {
      const byWeight: Record<string, string[]> = {};
      for (const el of document.querySelectorAll("#root *")) {
        if (el.childElementCount > 0 || !el.textContent?.trim()) continue;
        const style = getComputedStyle(el);
        const text = style.textTransform === "uppercase" ? el.textContent.toUpperCase() : el.textContent;
        (byWeight[style.fontWeight] ??= []).push(text);
      }
      return byWeight;
    });
    const unique = (byWeight: Record<string, string[]>) =>
      Object.fromEntries(Object.entries(byWeight).map(([weight, lines]) => [weight, [...new Set(lines)].sort()]));
    expect(unique(rendered)).toEqual(unique(fallbackSamples));
  });
}

test("no sample line is wider in the shipped fallback face than in Archivo", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const widest = await page.evaluate(async (samples) => {
    const families = { 500: "Archivo", 800: "ArchivoCondensed" };
    const result: Record<string, { ratio: number; line: string; faces: string[] }> = {};
    for (const [weight, family] of Object.entries(families)) {
      const fallback = `${family} Fallback`;
      const faces = await Promise.all(
        [family, fallback].map(async (face) => (await document.fonts.load(`${weight} 100px "${face}"`))[0]?.status ?? "missing"),
      );
      const width = (face: string, line: string) => {
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${weight} 1000px "${face}"`;
        return ctx.measureText(line).width;
      };
      const ratios = samples[weight as "500" | "800"].map((line) => ({ ratio: width(fallback, line) / width(family, line), line }));
      const top = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      result[weight] = { ...top, faces };
    }
    return result;
  }, fallbackSamples);
  for (const weight of ["500", "800"]) {
    expect(widest[weight].faces, `${weight} Archivo and fallback faces`).toEqual(["loaded", "loaded"]);
    expect(widest[weight].ratio, `"${widest[weight].line}" in the ${weight} fallback against Archivo`).toBeLessThanOrEqual(1);
  }
});

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

const pressTimes = (page: Page, startEvent: "touchstart" | "mousedown") =>
  page.evaluate(
    ([name, type]) =>
      new Promise<{ shows: number; full: number }>((resolve) => {
        const button = [...document.querySelectorAll('[role="button"]')].find((el) => el.textContent === name)!;
        addEventListener(
          type,
          (event) => {
            let shows = NaN;
            const poll = () => {
              const since = performance.now() - event.timeStamp;
              const { transform } = getComputedStyle(button);
              const moving = button.getAnimations().some((a) => (a as CSSTransition).transitionProperty === "transform");
              if (Number.isNaN(shows) && (transform !== "none" || moving)) shows = since;
              if (transform !== "none" && new DOMMatrix(transform).a <= 0.9601) resolve({ shows, full: since });
              else requestAnimationFrame(poll);
            };
            poll();
          },
          { capture: true, once: true },
        );
      }),
    ["Scan or upload a receipt", startEvent] as const,
  );

test("the bar action shows its press within 50 ms of touch-down and reaches 0.96 within 120 ms", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const times = pressTimes(page, "touchstart");
  await pressAndHold(page, "Scan or upload a receipt");
  const { shows, full } = await times;
  expect(shows, "first pressed frame").toBeLessThan(50);
  expect(full, "scale 0.96, the end of the 100 ms press-in").toBeLessThan(120);
});

test("a mouse press on the inline action at 1280 px shows within 50 ms of mouse-down", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const box = (await page.getByRole("button", { name: "Scan or upload a receipt" }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const times = pressTimes(page, "mousedown");
  await page.mouse.down();
  expect((await times).shows, "first pressed frame").toBeLessThan(50);
  await context.close();
});

type PressLog = { touchStart: number; scrollTop: number; scrolled: number; frames: { at: number; pressed: boolean }[] };

async function touchInlineAction(page: Page, moves: number[], gap: number) {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto("/");
  await settle(page);
  const box = (await page.getByRole("button", { name: "Scan or upload a receipt" }).boundingBox())!;
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[role="button"]')].find((el) => el.textContent === "Scan or upload a receipt")!;
    let scroller = button.parentElement!;
    while (scroller.scrollHeight <= scroller.clientHeight || !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement!;
    }
    const log: PressLog = { touchStart: 0, scrollTop: scroller.scrollTop, scrolled: 0, frames: [] };
    addEventListener("touchstart", (event) => (log.touchStart = event.timeStamp), { capture: true, once: true });
    const sample = () => {
      const style = getComputedStyle(button);
      const pressed = style.transform !== "none" || style.opacity !== "1" || button.getAnimations().length > 0;
      log.frames.push({ at: performance.now(), pressed });
      log.scrolled = scroller.scrollTop - log.scrollTop;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    Object.assign(window, { pressLog: log });
  });
  const at = (dy: number) => [{ x: box.x + box.width / 2, y: box.y + box.height / 2 + dy }];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (const dy of moves) {
    await page.waitForTimeout(gap);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(dy) });
  }
  await page.waitForTimeout(400);
  if (moves.length > 0) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);
  const log = await page.evaluate(() => (window as unknown as { pressLog: PressLog }).pressLog);
  const pressedAt = log.frames.filter((frame) => frame.pressed).map((frame) => Math.round(frame.at - log.touchStart));
  return { scrolled: log.scrolled, pressedAt };
}

const scrollsFromInlineAction = [
  { start: "a small first move", moves: [-8, -20, -35, -55, -80, -110, -140], gap: 8 },
  { start: "a slow drag", moves: [-10, -30, -50, -80, -120], gap: 40 },
  { start: "a large first move", moves: [-40, -80, -120], gap: 8 },
];

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  for (const { start, moves, gap } of scrollsFromInlineAction) {
    test(`a scroll from the inline action that starts with ${start} never shows the press, motion ${reducedMotion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      const { scrolled, pressedAt } = await touchInlineAction(page, moves, gap);
      expect(scrolled, "the page scrolled under the touch").toBeGreaterThan(50);
      expect(pressedAt).toEqual([]);
    });
  }

  test(`a key press on the inline action after a touch scroll still shows the press, motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await touchInlineAction(page, [-40, -80, -120], 8);
    await page.getByRole("button", { name: "Scan or upload a receipt" }).focus();
    await page.keyboard.down(" ");
    await expect
      .poll(() => pressLook(page))
      .toEqual(
        reducedMotion === "reduce"
          ? { transform: "none", opacity: "0.7", transitions: [] }
          : { transform: "matrix(0.96, 0, 0, 0.96, 0, 0)", opacity: "1", transitions: [] },
      );
  });

  test(`the inline action presses on a held touch after the scroll-view delay, motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const { scrolled, pressedAt } = await touchInlineAction(page, [], 0);
    expect(scrolled).toBe(0);
    expect(pressedAt[0], "first pressed frame after touch-down").toBeGreaterThanOrEqual(150);
    expect(pressedAt.at(-1), "still pressed 600 ms after touch-down").toBeGreaterThan(550);
  });
}

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

const matrix = [320, phone.width, 900, 960, 1010, 1024, 1280].flatMap((width) =>
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

async function mountToast(page: Page) {
  const harness = `
    import { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { SafeAreaProvider } from "react-native-safe-area-context";
    import { Toast } from "./src/ui/components/toast";
    function Harness() {
      const [message, setMessage] = useState("Copied the link");
      return <Toast message={message} onHide={() => { window.hiddenAt.push(Date.now()); setMessage(null); }} />;
    }
    window.hiddenAt = [];
    createRoot(document.getElementById("root")).render(<SafeAreaProvider><Harness /></SafeAreaProvider>);
  `;
  const { build } = await import("esbuild");
  const bundle = await build({
    stdin: { contents: harness, loader: "tsx", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    jsx: "automatic",
    alias: { "react-native": "react-native-web" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js"],
    loader: { ".ttf": "dataurl", ".js": "jsx" },
    define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByText("Copied the link")).toBeVisible();
}

test("the toast hides 4 s after it shows even when reduced motion changes on the way", async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  const setReducedMotion = async (reducedMotion: "reduce" | "no-preference") => {
    const changed = page.evaluate(
      () => new Promise((done) => matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", done, { once: true })),
    );
    await page.emulateMedia({ reducedMotion });
    await changed;
  };
  await mountToast(page);
  await page.clock.runFor(2000);
  await setReducedMotion("reduce");
  await page.clock.runFor(1000);
  await setReducedMotion("no-preference");
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => (window as unknown as { hiddenAt: number[] }).hiddenAt)).toEqual([5000]);
});
