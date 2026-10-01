import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { fallbackSamples } from "../src/ui/home-copy";

const phone = { width: 390, height: 844 };

test.use({ viewport: phone });

const shortPhone = { width: 390, height: 500 };
const shortDesktop = { width: 1280, height: 340 };

type Target = (page: Page) => Locator;

type Motion = "no-preference" | "reduce";

const hero: Target = (page) => page.getByRole("button", { name: /^(Add|Drop a) receipt/ });
const sheetButton: Target = (page) => page.getByRole("button", { name: "Add a name", exact: true });

const pressedScale = (target: Target) => (target === hero ? 0.97 : 0.96);

async function tabTo(target: Locator) {
  for (let i = 0; i < 12; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) break;
    await target.page().keyboard.press("Tab");
  }
  return target;
}

const focusRing = (target: Locator) =>
  target.evaluate((el) => {
    const style = getComputedStyle(el.querySelector("[data-press-face]") ?? el);
    return [style.outlineStyle, style.outlineWidth];
  });

async function settle(page: Page) {
  await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

async function pressAndHold(target: Locator) {
  const box = (await target.boundingBox())!;
  const cdp = await target.page().context().newCDPSession(target.page());
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  return cdp;
}

const sheetOf = (inside: Locator) =>
  inside.evaluate((el) => {
    let sheet = el;
    while (getComputedStyle(sheet).borderTopLeftRadius !== "28px") sheet = sheet.parentElement!;
    const { top, left, width, height } = sheet.getBoundingClientRect();
    return { top, left, width, height };
  });

const action = (page: Page) => page.getByRole("button", { name: "Create split link" });

test("the empty home at 390 px shows the hero over the sheet, and only those words", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  expect((await page.locator("#root").innerText()).split("\n").filter(Boolean)).toEqual([
    "Receipt Splitter",
    "Example",
    "Add receipt",
    "Take or upload a photo",
    "V",
    "Venmo",
    "Me",
    "Add",
    "Create split link",
  ]);
  await expect(page.getByRole("button", { name: "Payment app, Venmo" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveAttribute("placeholder", "@username");
  await expect(page.getByRole("button", { name: "Add another payment app" })).toBeVisible();
  await expect(page.getByRole("group", { name: "People at the table" })).toContainText("Me");
  await expect(action(page)).toHaveAttribute("aria-disabled", "true");
});

test("Add receipt takes keyboard focus with a visible ring at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
});

test("Create split link shows the blocked look with a 180 ms ease color transition, and draws no press", async ({ page }) => {
  const face = action(page).locator(":scope > div");
  const look = () =>
    face.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.transitionProperty, style.transitionDuration, style.transitionTimingFunction];
    });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settle(page);
  expect(await look(), "under reduced motion").toEqual(["rgb(238, 239, 241)", "all", "0s", "ease"]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await settle(page);
  expect(await look()).toEqual(["rgb(238, 239, 241)", "background-color", "0.18s", "ease"]);
  const cdp = await pressAndHold(action(page));
  await page.waitForTimeout(300);
  const afterTouch = await pressLook(page, action);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await action(page).click({ force: true });
  await page.keyboard.down(" ");
  await page.waitForTimeout(300);
  expect({ afterTouch, afterClickAndSpace: await pressLook(page, action) }).toEqual({ afterTouch: restLook, afterClickAndSpace: restLook });
  await page.keyboard.up(" ");
});

test("the sheet stands taller than the 223 px prototype at 390 by 844", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const sheet = await sheetOf(action(page));
  expect(sheet.top + sheet.height).toBe(phone.height);
  expect(sheet.height).toBeGreaterThan(223);
});

test("the camera button and Add receipt sit fully above the sheet at 375 by 667", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await settle(page);
  const sheet = await sheetOf(action(page));
  const bottom = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    return box.y + box.height;
  };
  const camera = page.locator("[data-press-face] > div").last();
  expect(await bottom(camera), "camera button bottom").toBeLessThanOrEqual(sheet.top);
  expect(await bottom(page.getByText("Add receipt", { exact: true })), "Add receipt bottom").toBeLessThanOrEqual(sheet.top);
});

test("the sheet lifts its content by the bottom safe-area inset", async ({ page }) => {
  const gapBelowAction = async () => {
    const box = (await action(page).boundingBox())!;
    return phone.height - (box.y + box.height);
  };
  await page.goto("/");
  const flush = await gapBelowAction();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
  await page.reload();
  await expect.poll(gapBelowAction).toBe(flush + 34);
});

test("side safe-area insets keep the header and the sheet clear of a landscape notch", async ({ page }) => {
  const landscape = { width: 844, height: 390 };
  await page.setViewportSize(landscape);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
  await page.goto("/");
  await settle(page);
  const edges = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    return [box.x, box.x + box.width];
  };
  expect((await edges(page.getByRole("heading", { name: "Receipt Splitter" })))[0]).toBe(47 + 20);
  expect((await edges(page.getByRole("button", { name: "Example" })))[1]).toBe(landscape.width - 47 - 20);
  const sheet = await sheetOf(action(page));
  expect([sheet.left, sheet.width]).toEqual([0, landscape.width]);
  const [left, right] = await edges(action(page));
  expect(left).toBeGreaterThanOrEqual(47 + 20);
  expect(right).toBeLessThanOrEqual(landscape.width - 47 - 20);
});

test("at 1280 px the drop area sits left of the 380 px panel, and dark mode keeps the page and the action on the charcoal ladder", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const zone = (await hero(page).boundingBox())!;
  const panel = await sheetOf(action(page));
  expect(await hero(page).innerText()).toBe("Drop a receipt\nClick to choose a photo, or paste one.");
  expect(panel.width).toBe(380);
  expect(zone.x + zone.width).toBeLessThan(panel.left);
  expect(zone.y).toBe(panel.top);
  const colors = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    action: getComputedStyle(document.querySelector("[data-press-face] > div:last-child")!).backgroundColor,
  }));
  expect(colors).toEqual({ page: "rgb(18, 19, 21)", action: "rgb(242, 242, 243)" });
  await context.close();
});

const fontWidths = [320, phone.width, 1280];

for (const width of fontWidths) {
  test(`the fallback faces keep every text line and its glyph box where Plus Jakarta Sans puts them at ${width} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: phone.height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await settle(page);
    const layout = () =>
      page.evaluate(() => ({
        faces: [...document.fonts].filter((f) => f.family.replaceAll('"', "") === "Plus Jakarta Sans").length,
        lines: [...document.querySelectorAll("#root *")]
          .filter((el) => el.childElementCount === 0 && el.textContent?.trim())
          .map((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const lines = [...range.getClientRects()].map(({ y, height }) => `${Math.round(y)}+${Math.round(height)}`);
            return `${el.textContent} ${lines.join(" ")}`;
          }),
      }));
    const web = await layout();
    await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
          const rule = sheet.cssRules[i];
          if (rule instanceof CSSFontFaceRule && rule.style.getPropertyValue("font-family").replaceAll('"', "") === "Plus Jakarta Sans") sheet.deleteRule(i);
        }
      }
    });
    const fallback = await layout();
    await context.close();
    expect([web.faces, fallback.faces]).toEqual([2, 0]);
    expect(fallback.lines).toEqual(web.lines);
  });
}

test("the fallback metrics sample exactly the lines the home renders at 390 and 1280 px", async ({ page }) => {
  const rendered: Record<string, Set<string>> = {};
  for (const width of [phone.width, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await settle(page);
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll("#root *")]
        .filter((el) => el.childElementCount === 0 && el.textContent?.trim())
        .map((el) => [getComputedStyle(el).fontWeight, el.textContent!]),
    );
    for (const [weight, line] of lines) (rendered[weight] ??= new Set()).add(line);
  }
  const sorted = (byWeight: Record<string, Iterable<string>>) =>
    Object.fromEntries(Object.entries(byWeight).map(([weight, lines]) => [weight, [...lines].sort()]));
  expect(sorted(rendered)).toEqual(sorted(fallbackSamples));
});

test("no sample line is wider in the shipped fallback face than in Plus Jakarta Sans", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const widest = await page.evaluate(async (samples) => {
    const result: Record<string, { ratio: number; line: string; faces: string[] }> = {};
    for (const weight of ["400", "500"] as const) {
      const faces = await Promise.all(
        ["Plus Jakarta Sans", "Plus Jakarta Sans Fallback"].map(
          async (face) => (await document.fonts.load(`${weight} 100px "${face}"`))[0]?.status ?? "missing",
        ),
      );
      const width = (face: string, line: string) => {
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${weight} 1000px "${face}"`;
        return ctx.measureText(line).width;
      };
      const ratios = samples[weight].map((line) => ({ ratio: width("Plus Jakarta Sans Fallback", line) / width("Plus Jakarta Sans", line), line }));
      const top = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      result[weight] = { ...top, faces };
    }
    return result;
  }, fallbackSamples);
  for (const weight of ["400", "500"]) {
    expect(widest[weight].faces, `${weight} web and fallback faces`).toEqual(["loaded", "loaded"]);
    expect(widest[weight].ratio, `"${widest[weight].line}" in the ${weight} fallback against Plus Jakarta Sans`).toBeLessThanOrEqual(1);
  }
});

const pressLook = (page: Page, target: Target = hero) =>
  target(page).evaluate((el) => {
    const face = el.querySelector("[data-press-face]") ?? el;
    const style = getComputedStyle(face);
    return {
      transform: style.transform,
      opacity: style.opacity,
      transitions: face.getAnimations().map((a) => (a as CSSTransition).transitionProperty),
    };
  });

const restLook = { transform: "none", opacity: "1", transitions: [] };
const isRest = (look: Awaited<ReturnType<typeof pressLook>>) => JSON.stringify(look) === JSON.stringify(restLook);
const pressedLook = (reducedMotion: Motion, target: Target = hero) => {
  const scale = pressedScale(target);
  return reducedMotion === "reduce"
    ? { transform: "none", opacity: "0.7", transitions: [] }
    : { transform: `matrix(${scale}, 0, 0, ${scale}, 0, 0)`, opacity: "1", transitions: [] };
};

const expectScrollViewDelay = (pressedAt: number[]) => {
  expect(pressedAt[0], "first pressed frame after touch-down").toBeGreaterThanOrEqual(150);
  expect(pressedAt[0], "first pressed frame after touch-down").toBeLessThan(260);
};

test("a press on a sheet button shows on touch-down without waiting on a timer", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await settle(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await pressAndHold(sheetButton(page));
  await expect.poll(() => pressLook(page, sheetButton)).toEqual(pressedLook("no-preference", sheetButton));
});

type PressTiming = { shows: number; pressIn: number; delay: number };

async function timePress(
  page: Page,
  startEvent: "touchstart" | "mousedown" | "pointerdown",
  press: () => Promise<unknown>,
  target: Target = hero,
) {
  await target(page).evaluate(
    (el, type) => {
      const button = el.querySelector("[data-press-face]") ?? el;
      addEventListener(
        type,
        (event) => {
          const poll = () => {
            const { transform, opacity } = getComputedStyle(button);
            const pressIn = button.getAnimations().find((a) => (a as CSSTransition).transitionProperty === "transform");
            if (transform === "none" && !pressIn && opacity === "1") return requestAnimationFrame(poll);
            const timing: PressTiming = {
              shows: performance.now() - event.timeStamp,
              pressIn: Number(pressIn?.effect?.getComputedTiming().duration ?? 0),
              delay: pressIn?.effect?.getComputedTiming().delay ?? 0,
            };
            Object.assign(window, { pressTiming: timing });
          };
          poll();
        },
        { capture: true, once: true },
      );
    },
    startEvent,
  );
  await press();
  await page.waitForFunction(() => window.pressTiming);
  return page.evaluate(() => window.pressTiming!);
}

test("a sheet button shows its press within 50 ms of touch-down and scales to 0.96 over 100 ms", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const { shows, pressIn, delay } = await timePress(page, "touchstart", () => pressAndHold(sheetButton(page)), sheetButton);
  expect(shows, "first pressed frame").toBeLessThan(50);
  expect({ pressIn, delay }, "press-in transition").toEqual({ pressIn: 100, delay: 0 });
  await expect.poll(() => pressLook(page, sheetButton)).toEqual(pressedLook("no-preference", sheetButton));
});

test("the hero slip shows its press within 50 ms of mouse-down and scales to 0.97 over 120 ms", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  const { shows, pressIn, delay } = await loadAndHoldMouseOnHero(page);
  expect(shows, "first pressed frame").toBeLessThan(50);
  expect({ pressIn, delay }, "press-in transition").toEqual({ pressIn: 120, delay: 0 });
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await context.close();
});

async function loadAndHoldMouseOnHero(page: Page) {
  await page.goto("/");
  await settle(page);
  const box = (await hero(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return timePress(page, "mousedown", () => page.mouse.down());
}

test("a mouse press on the hero at 1280 px shows within 50 ms of mouse-down", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const { shows } = await loadAndHoldMouseOnHero(await context.newPage());
  expect(shows, "first pressed frame").toBeLessThan(50);
  await context.close();
});

test("a held mouse press on the hero lets go when the pointer leaves it and presses again on return", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await loadAndHoldMouseOnHero(page);
  const box = (await hero(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y - 40);
  await expect.poll(() => pressLook(page)).toEqual({ transform: "none", opacity: "1", transitions: [] });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await context.close();
});

for (const pointerType of ["mouse", "pen"] as const) {
  test(`a ${pointerType} press shows and activates the hero only when it starts on it`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 500 }, hasTouch: false, isMobile: false });
    const page = await context.newPage();
    await watchPress(page);
    const box = (await hero(page).boundingBox())!;
    const on = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const off = { x: on.x, y: box.y - 40 };
    const cdp = await context.newCDPSession(page);
    const send = (type: "mouseMoved" | "mousePressed" | "mouseReleased", at: { x: number; y: number }, buttons: number) =>
      cdp.send("Input.dispatchMouseEvent", { type, ...at, button: "left", buttons, clickCount: 1, pointerType });
    const gesture = async (path: { x: number; y: number }[], pressed: boolean) => {
      await page.evaluate(() => Object.assign(window.pressLog, { start: 0, clicks: 0, frames: [] }));
      const buttons = pressed ? 1 : 0;
      await send("mouseMoved", path[0], 0);
      if (pressed) await send("mousePressed", path[0], 1);
      for (const [from, to] of path.slice(0, -1).map((at, i) => [at, path[i + 1]])) {
        for (let step = 1; step <= 6; step++) {
          await send("mouseMoved", { x: from.x + ((to.x - from.x) * step) / 6, y: from.y + ((to.y - from.y) * step) / 6 }, buttons);
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(250);
      }
      if (pressed) await send("mouseReleased", path.at(-1)!, 0);
      await page.waitForTimeout(400);
      const log = await page.evaluate(() => window.pressLog);
      return { shown: log.frames.some((frame) => frame.pressed), activated: log.clicks };
    };
    expect({
      onToOffRelease: await gesture([on, off], true),
      thenHoverBack: await gesture([off, on, off], false),
      offToOnRelease: await gesture([off, on], true),
      onToOffToOnRelease: await gesture([on, off, on], true),
    }).toEqual({
      onToOffRelease: { shown: true, activated: 0 },
      thenHoverBack: { shown: false, activated: 0 },
      offToOnRelease: { shown: false, activated: 0 },
      onToOffToOnRelease: { shown: true, activated: 1 },
    });
    await context.close();
  });
}

test("a right-button press during a held mouse press lets the press go", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await loadAndHoldMouseOnHero(page);
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  const menus = page.evaluate(() => new Promise((resolve) => addEventListener("contextmenu", () => resolve("contextmenu"), { once: true })));
  await page.mouse.down({ button: "right" });
  expect(await menus).toBe("contextmenu");
  await expect.poll(() => pressLook(page)).toEqual(restLook);
  await page.mouse.up({ button: "right" });
  await page.mouse.up();
  await context.close();
});

type At = { x: number; y: number };
type MouseInput = { button?: "left" | "middle" | "right"; buttons: number; modifiers?: number };

const glide = (from: At, to: At) => [1, 2, 3, 4, 5, 6].map((step) => ({ x: from.x + ((to.x - from.x) * step) / 6, y: from.y + ((to.y - from.y) * step) / 6 }));

async function desktopHeroPress(browser: Browser) {
  const context = await browser.newContext({ viewport: shortDesktop, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await watchPress(page);
  const box = (await hero(page).boundingBox())!;
  const on = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await context.newCDPSession(page);
  const mouse = (type: "mouseMoved" | "mousePressed" | "mouseReleased", at: At, { button, buttons, modifiers = 0 }: MouseInput) =>
    cdp.send("Input.dispatchMouseEvent", { type, ...at, button: button ?? "none", buttons, modifiers, clickCount: 1 });
  const move = async (from: At, to: At, input: MouseInput) => {
    for (const at of glide(from, to)) {
      await mouse("mouseMoved", at, input);
      await page.waitForTimeout(16);
    }
  };
  const clearLog = () => page.evaluate(() => Object.assign(window.pressLog, { clicks: 0, frames: [] }));
  const readLog = () => page.evaluate(() => window.pressLog);
  const pressedFrames = async () => (await readLog()).frames.filter((frame) => frame.pressed).length;
  return { context, page, cdp, on, off: { x: on.x, y: box.y - 40 }, mouse, move, clearLog, readLog, pressedFrames };
}

const refusedPresses = [
  { press: "an Alt-held left press", button: "left", buttons: 1, modifiers: 1 },
  { press: "a Control-held left press", button: "left", buttons: 1, modifiers: 2 },
  { press: "a middle-button press", button: "middle", buttons: 4, modifiers: 0 },
] as const;

for (const { press, button, buttons, modifiers } of refusedPresses) {
  test(`${press} dragged off the hero draws no press, then or on a hover back`, async ({ browser }) => {
    const { context, page, on, off, mouse, move, clearLog, pressedFrames } = await desktopHeroPress(browser);
    await mouse("mouseMoved", on, { buttons: 0 });
    await clearLog();
    await mouse("mousePressed", on, { button, buttons, modifiers });
    await page.waitForTimeout(100);
    await move(on, off, { buttons, modifiers });
    await mouse("mouseReleased", off, { button, buttons: 0, modifiers });
    await move(off, on, { buttons: 0 });
    await page.waitForTimeout(300);
    expect(await pressedFrames(), "pressed frames from the press through the hover back").toBe(0);
    await context.close();
  });
}

for (const [press, modifiers] of [
  ["a Shift-held", 8],
  ["a Cmd-held", 4],
] as const) {
  test(`${press} left press shows the press and activates the hero once`, async ({ browser }) => {
    const { context, page, on, mouse, clearLog, readLog } = await desktopHeroPress(browser);
    await mouse("mouseMoved", on, { buttons: 0 });
    await clearLog();
    await mouse("mousePressed", on, { button: "left", buttons: 1, modifiers });
    await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
    await mouse("mouseReleased", on, { button: "left", buttons: 0, modifiers });
    await expect.poll(() => pressLook(page)).toEqual(restLook);
    expect((await readLog()).clicks).toBe(1);
    await context.close();
  });
}

test("a left press while the right button is held shows the press and activates the hero once", async ({ browser }) => {
  const { context, page, on, mouse, clearLog, readLog } = await desktopHeroPress(browser);
  await mouse("mouseMoved", on, { buttons: 0 });
  await mouse("mousePressed", on, { button: "right", buttons: 2 });
  await clearLog();
  await mouse("mousePressed", on, { button: "left", buttons: 3 });
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await mouse("mouseReleased", on, { button: "left", buttons: 2 });
  await expect.poll(() => pressLook(page)).toEqual(restLook);
  await mouse("mouseReleased", on, { button: "right", buttons: 0 });
  expect((await readLog()).clicks).toBe(1);
  await context.close();
});

test("a wheel scroll during a held mouse press lets the press go, and a drag off and back draws nothing", async ({ browser }) => {
  const { context, page, cdp, on, off, mouse, move, clearLog, readLog, pressedFrames } = await desktopHeroPress(browser);
  await mouse("mouseMoved", on, { buttons: 0 });
  await mouse("mousePressed", on, { button: "left", buttons: 1 });
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", ...on, deltaX: 0, deltaY: 20, buttons: 1 });
  await expect.poll(() => pressLook(page)).toEqual(restLook);
  expect((await readLog()).scrolled, "the page scrolled under the held press").toBeGreaterThan(0);
  await clearLog();
  await move(on, off, { buttons: 1 });
  await mouse("mouseReleased", off, { button: "left", buttons: 0 });
  await move(off, on, { buttons: 0 });
  await page.waitForTimeout(300);
  expect(await pressedFrames(), "pressed frames after the scroll").toBe(0);
  await context.close();
});

test("selecting the page text during a held mouse press lets the press go", async ({ browser }) => {
  const { context, page, on, mouse, clearLog, pressedFrames } = await desktopHeroPress(browser);
  await mouse("mouseMoved", on, { buttons: 0 });
  await mouse("mousePressed", on, { button: "left", buttons: 1 });
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await page.keyboard.press("ControlOrMeta+a");
  expect(await page.evaluate(() => getSelection()!.toString().length), "selected text").toBeGreaterThan(0);
  await expect.poll(() => pressLook(page)).toEqual(restLook);
  await clearLog();
  await page.waitForTimeout(200);
  await mouse("mouseReleased", on, { button: "left", buttons: 0 });
  await page.waitForTimeout(300);
  expect(await pressedFrames(), "pressed frames after the selection").toBe(0);
  await context.close();
});

for (const [buttons, who] of [
  [0, "a mouse"],
  [1, "a mouse with its left button down"],
] as const) {
  test(`${who} passing over the hero leaves a held Space press pressed`, async ({ browser }) => {
    const { context, page, on, off, mouse, move, clearLog, readLog } = await desktopHeroPress(browser);
    await mouse("mouseMoved", on, { buttons: 0 });
    await mouse("mousePressed", on, { button: "left", buttons: 1 });
    await mouse("mouseReleased", on, { button: "left", buttons: 0 });
    await move(on, off, { buttons: 0 });
    await hero(page).focus();
    await page.keyboard.down(" ");
    await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
    await clearLog();
    await move(off, on, { buttons });
    await move(on, off, { buttons });
    await page.waitForTimeout(300);
    const frames = (await readLog()).frames.map((frame) => frame.pressed);
    await page.keyboard.up(" ");
    expect(frames.length, "frames sampled while Space was held").toBeGreaterThan(20);
    expect(frames.filter((pressed) => !pressed)).toEqual([]);
    await expect.poll(() => pressLook(page)).toEqual(restLook);
    await context.close();
  });
}

test("a cancelled touch lets a sheet button's press go", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const cdp = await pressAndHold(sheetButton(page));
  await expect.poll(() => pressLook(page, sheetButton)).toEqual(pressedLook("no-preference", sheetButton));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(() => pressLook(page, sheetButton)).toEqual(restLook);
});

test("a second finger or a passing mouse on the hero leaves a held touch pressed", async ({ page }) => {
  await watchShortPhoneHero(page, "no-preference");
  const box = (await hero(page).boundingBox())!;
  const first = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  const second = { x: first.x + 40, y: first.y, id: 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first] });
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await page.evaluate(() => Object.assign(window.pressLog, { frames: [] }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, second] });
  await page.waitForTimeout(100);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [second] });
  await page.waitForTimeout(300);
  await page.mouse.move(first.x - 40, box.y - 60);
  await page.mouse.move(first.x - 40, first.y, { steps: 4 });
  await page.mouse.move(first.x - 40, box.y - 60, { steps: 4 });
  await page.waitForTimeout(300);
  const frames = await page.evaluate(() => window.pressLog.frames.map((frame) => frame.pressed));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [first] });
  expect(frames.length, "frames sampled while the first finger held").toBeGreaterThan(30);
  expect(frames.filter((pressed) => !pressed)).toEqual([]);
  await expect.poll(() => pressLook(page)).toEqual(restLook);
});

test("a right-click on the hero draws no press", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const box = (await hero(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "right" });
  const seen = [];
  for (let frame = 0; frame < 10; frame++) {
    seen.push(await pressLook(page));
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  expect(seen.filter((look) => look.transform !== "none" || look.transitions.length > 0)).toEqual([]);
  await context.close();
});

test("a mouse press on the hero shows within 50 ms on a touch-first device", async ({ page }) => {
  const { shows } = await loadAndHoldMouseOnHero(page);
  expect(shows, "first pressed frame").toBeLessThan(50);
});

type PressLog = { start: number; end: number; clicks: number; scrollTop: number; scrolled: number; frames: { at: number; pressed: boolean }[] };

declare global {
  interface Window {
    pressLog: PressLog;
    pressTiming?: PressTiming;
    hiddenAt: number[];
  }
}

async function watchPress(page: Page, target: Target = hero) {
  await page.goto("/");
  await settle(page);
  await target(page).evaluate((target) => {
    const button = target.querySelector("[data-press-face]") ?? target;
    let scroller = target.parentElement!;
    while (scroller.parentElement && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const log: PressLog = { start: 0, end: 0, clicks: 0, scrollTop: scroller.scrollTop, scrolled: 0, frames: [] };
    addEventListener(
      "click",
      (event) => {
        if (event.target instanceof Node && target.contains(event.target)) log.clicks++;
        event.stopPropagation();
      },
      { capture: true },
    );
    addEventListener("pointerdown", (event) => (log.start ||= event.timeStamp), { capture: true });
    addEventListener("pointerup", (event) => (log.end = event.timeStamp), { capture: true });
    addEventListener("keyup", (event) => (log.end = event.timeStamp), { capture: true });
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
}

async function watchShortPhoneHero(page: Page, reducedMotion: Motion) {
  await page.setViewportSize(shortPhone);
  await page.emulateMedia({ reducedMotion });
  await watchPress(page);
}

async function touchPress(page: Page, { moves = [] as number[], gap = 8, hold = 400, release = true } = {}, target: Target = hero) {
  const box = (await target(page).boundingBox())!;
  const at = (dy: number) => [{ x: box.x + box.width / 2, y: box.y + box.height / 2 + dy }];
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    const log = window.pressLog;
    Object.assign(log, { start: 0, end: 0, frames: [], scrollTop: log.scrollTop + log.scrolled, scrolled: 0 });
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (const dy of moves) {
    await page.waitForTimeout(gap);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(dy) });
  }
  await page.waitForTimeout(hold);
  if (release) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => window.pressLog);
  const pressedAt = log.frames.filter((frame) => frame.pressed).map((frame) => Math.round(frame.at - log.start));
  return { scrolled: log.scrolled, pressedAt, cdp };
}

const scrollsFromHero = [
  { start: "a small first move", moves: [-8, -20, -35, -55, -80, -110, -140], gap: 8 },
  { start: "a slow drag", moves: [-10, -30, -50, -80, -120], gap: 40 },
  { start: "a large first move", moves: [-40, -80, -120], gap: 8 },
];

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  for (const { start, moves, gap } of scrollsFromHero) {
    test(`a scroll from the hero that starts with ${start} never shows the press, motion ${reducedMotion}`, async ({ page }) => {
      await watchShortPhoneHero(page, reducedMotion);
      const { scrolled, pressedAt } = await touchPress(page, { moves, gap, hold: 50 });
      expect(scrolled, "the page scrolled under the touch").toBeGreaterThan(50);
      expect(pressedAt).toEqual([]);
    });
  }

  test(`a key press on the hero after a touch scroll still shows the press, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    await touchPress(page, { moves: [-40, -80, -120], hold: 50 });
    await hero(page).focus();
    await page.keyboard.down(" ");
    await expect.poll(() => pressLook(page)).toEqual(pressedLook(reducedMotion));
  });

  test(`the hero presses on a held touch after the scroll-view delay, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    const { scrolled, pressedAt } = await touchPress(page, { release: false });
    expect(scrolled).toBe(0);
    expectScrollViewDelay(pressedAt);
    expect(pressedAt.at(-1), "still pressed 700 ms after touch-down").toBeGreaterThan(650);
  });

  test(`a held touch after a touch scroll still presses after the delay, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    expect((await touchPress(page, { moves: [-40, -80, -120], hold: 50 })).pressedAt).toEqual([]);
    await hero(page).scrollIntoViewIfNeeded();
    const { pressedAt } = await touchPress(page, { release: false });
    expectScrollViewDelay(pressedAt);
    expect(pressedAt.at(-1), "still pressed 700 ms after touch-down").toBeGreaterThan(650);
  });

  test(`a quick tap on the hero holds its press for the tap look after release, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    const pressOut = reducedMotion === "reduce" ? 0 : 200;
    const taps: Record<number, { heldAfterRelease: boolean; restsInTime: boolean }> = {};
    for (const hold of [60, 100, 140]) {
      await touchPress(page, { hold });
      await page.waitForTimeout(400);
      const log = await page.evaluate(() => window.pressLog);
      const lastPressed = (log.frames.filter((frame) => frame.pressed).at(-1)?.at ?? log.end) - log.end;
      taps[hold] = { heldAfterRelease: lastPressed >= pressOut + 70, restsInTime: lastPressed < pressOut + 180 && isRest(await pressLook(page)) };
    }
    const both = { heldAfterRelease: true, restsInTime: true };
    expect(taps).toEqual({ 60: both, 100: both, 140: both });
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Space and Enter press the hero until key-up, and blur lets a held key go, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    const button = hero(page);
    const seen: Record<string, unknown> = {};
    for (const key of [" ", "Enter"]) {
      await button.focus();
      await page.keyboard.down(key);
      await expect.poll(() => pressLook(page)).toEqual(pressedLook(reducedMotion));
      await page.keyboard.up(key);
      await expect.poll(() => pressLook(page)).toEqual(restLook);
      seen[key] = new URL(page.url()).pathname;
    }
    await button.focus();
    await page.keyboard.down(" ");
    await expect.poll(() => pressLook(page)).toEqual(pressedLook(reducedMotion));
    await button.blur();
    await expect.poll(() => pressLook(page)).toEqual(restLook);
    await page.keyboard.up(" ");
    await button.focus();
    await page.keyboard.down(" ");
    await expect.poll(() => pressLook(page), "a Space press after the blurred one").toEqual(pressedLook(reducedMotion));
    await page.keyboard.up(" ");
    await expect.poll(() => pressLook(page)).toEqual(restLook);
    expect(seen, "navigation stays stopped").toEqual({ " ": "/", Enter: "/" });
  });

  test(`a second finger on the hero draws no press, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    const box = (await hero(page).boundingBox())!;
    const resting = { x: 30, y: 30, id: 1 };
    const onHero = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [resting] });
    await page.waitForTimeout(100);
    await page.evaluate(() => Object.assign(window.pressLog, { start: 0, frames: [] }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [resting, onHero] });
    await page.waitForTimeout(400);
    const frames = await page.evaluate(() => window.pressLog.frames.filter((f) => f.pressed).length);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(frames).toBe(0);
  });
}

test("a pen press on the hero shows within 50 ms", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const box = (await hero(page).boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, pointerType: "pen" });
  const { shows } = await timePress(page, "pointerdown", async () => {
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...at, button: "left", buttons: 1, clickCount: 1, pointerType: "pen" });
  });
  expect(shows, "first pressed frame of a pen press").toBeLessThan(50);
  await context.close();
});

async function mouseFirstPageWithTouch(browser: Browser, reducedMotion: Motion) {
  const context = await browser.newContext({ viewport: shortDesktop, hasTouch: false, isMobile: false, reducedMotion });
  const page = await context.newPage();
  const reloadWithTouch = async () => {
    await watchPress(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  };
  return { context, page, reloadWithTouch };
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`with touch turned on after a mouse-first load, touch scrolls from the hero never press, motion ${reducedMotion}`, async ({ browser }) => {
    const { context, page, reloadWithTouch } = await mouseFirstPageWithTouch(browser, reducedMotion);
    const seen = [];
    for (const { moves, gap } of scrollsFromHero) {
      await reloadWithTouch();
      const { scrolled, pressedAt } = await touchPress(page, { moves, gap, hold: 50 });
      seen.push({ scrolled: scrolled > 50, pressedAt });
    }
    expect(seen).toEqual(Array(3).fill({ scrolled: true, pressedAt: [] }));
    await context.close();
  });

  test(`with touch turned on after a mouse-first load, a held touch waits and a mouse presses at once, motion ${reducedMotion}`, async ({ browser }) => {
    const { context, page, reloadWithTouch } = await mouseFirstPageWithTouch(browser, reducedMotion);
    await reloadWithTouch();
    const { pressedAt } = await touchPress(page, { release: false });
    expectScrollViewDelay(pressedAt);
    await reloadWithTouch();
    const box = (await hero(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const { shows } = await timePress(page, "mousedown", () => page.mouse.down());
    expect(shows, "first pressed frame of a mouse press").toBeLessThan(50);
    await context.close();
  });
}

test("under reduced motion a press dims a sheet button at once and never scales it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settle(page);
  expect(await pressLook(page, sheetButton)).toEqual({ transform: "none", opacity: "1", transitions: [] });
  await pressAndHold(sheetButton(page));
  const seen = [];
  for (let frame = 0; frame < 20; frame++) {
    seen.push(await pressLook(page, sheetButton));
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  expect(seen.at(-1)).toEqual({ transform: "none", opacity: "0.7", transitions: [] });
  expect(seen.filter((look) => look.transform !== "none" || look.transitions.length > 0)).toEqual([]);
});

test("the hero takes keyboard focus with a visible ring on its slip at 1280 px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
  await context.close();
});

const readPressLog = (page: Page) => page.evaluate(() => window.pressLog);

const clearPressLog = (page: Page) =>
  page.evaluate(() => Object.assign(window.pressLog, { start: 0, end: 0, clicks: 0, frames: [] }));

async function lastPressedAfterRelease(page: Page) {
  const log = await readPressLog(page);
  const pressed = log.frames.filter((frame) => frame.pressed);
  return { shown: pressed.length > 0, afterRelease: (pressed.at(-1)?.at ?? log.end) - log.end };
}

const pressOutFor = (reducedMotion: Motion) => (reducedMotion === "reduce" ? 0 : 200);

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`a quick Space tap on the hero rests at key-up with no tap look, motion ${reducedMotion}`, async ({ page }) => {
    await watchShortPhoneHero(page, reducedMotion);
    await hero(page).focus();
    await clearPressLog(page);
    await page.keyboard.down(" ");
    await page.waitForTimeout(40);
    await page.keyboard.up(" ");
    await page.waitForTimeout(500);
    const { shown, afterRelease } = await lastPressedAfterRelease(page);
    expect(shown, "the key press showed").toBe(true);
    expect(afterRelease, "last pressed frame after key-up").toBeLessThan(pressOutFor(reducedMotion) + 70);
  });

  test(`a mouse click on the hero rests at release with no tap look, motion ${reducedMotion}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false, reducedMotion });
    const page = await context.newPage();
    await watchPress(page);
    const box = (await hero(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await clearPressLog(page);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const { shown, afterRelease } = await lastPressedAfterRelease(page);
    expect(shown, "the click showed").toBe(true);
    expect(afterRelease, "last pressed frame after mouse-up").toBeLessThan(pressOutFor(reducedMotion) + 70);
    await context.close();
  });

  test(`a quick tap on a sheet button rests at release with no tap look, motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await watchPress(page, sheetButton);
    await touchPress(page, { hold: 60 }, sheetButton);
    await page.waitForTimeout(300);
    const { shown, afterRelease } = await lastPressedAfterRelease(page);
    expect(shown, "the tap showed").toBe(true);
    expect(afterRelease, "last pressed frame after touch-up").toBeLessThan(pressOutFor(reducedMotion) + 70);
  });
}

test("a touch on a sheet button that turns into a drag lets the press go once the browser takes the gesture", async ({ page }) => {
  await watchPress(page, sheetButton);
  const { pressedAt, cdp } = await touchPress(page, { moves: [-10, -25, -45, -70, -100], gap: 16, hold: 300, release: false }, sheetButton);
  const log = await readPressLog(page);
  expect(pressedAt[0], "the press showed on touch-down").toBeLessThan(50);
  expect(log.frames.at(-1)!.pressed, "pressed while the finger still drags").toBe(false);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  expect((await readPressLog(page)).clicks, "activations").toBe(0);
});

test("an Enter press after a Space press blurred while held still shows the press until key-up", async ({ page }) => {
  await watchShortPhoneHero(page, "no-preference");
  const button = hero(page);
  await button.focus();
  await page.keyboard.down(" ");
  await expect.poll(() => pressLook(page)).toEqual(pressedLook("no-preference"));
  await button.blur();
  await page.keyboard.up(" ");
  await expect.poll(() => pressLook(page)).toEqual(restLook);
  await button.focus();
  await page.keyboard.down("Enter");
  await expect.poll(() => pressLook(page), "Enter after the blurred Space").toEqual(pressedLook("no-preference"));
  await page.keyboard.up("Enter");
  await expect.poll(() => pressLook(page)).toEqual(restLook);
});

test("keys other than Space and Enter, and Cmd+Enter, draw no press on the focused hero", async ({ page }) => {
  await watchShortPhoneHero(page, "no-preference");
  await hero(page).focus();
  await clearPressLog(page);
  const seen: Record<string, number> = {};
  for (const keys of [["a"], ["Shift"], ["Tab"], ["Meta", "Enter"]]) {
    await hero(page).focus();
    await clearPressLog(page);
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(200);
    seen[keys.join("+")] = (await readPressLog(page)).frames.filter((frame) => frame.pressed).length;
    for (const key of keys.toReversed()) await page.keyboard.up(key);
  }
  expect(seen).toEqual({ a: 0, Shift: 0, Tab: 0, "Meta+Enter": 0 });
});

test("a mouse with its left button down passing over a held touch leaves it to press after the delay and stay pressed", async ({ page }) => {
  await watchShortPhoneHero(page, "no-preference");
  const box = (await hero(page).boundingBox())!;
  const finger = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const pass = async () => {
    for (const dy of [-60, 0, 60]) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: finger.x - 40, y: finger.y + dy, button: "none", buttons: 1 });
    }
  };
  await clearPressLog(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger] });
  await pass();
  await page.waitForTimeout(400);
  await pass();
  await page.waitForTimeout(300);
  const log = await readPressLog(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const pressedAt = log.frames.filter((frame) => frame.pressed).map((frame) => Math.round(frame.at - log.start));
  expectScrollViewDelay(pressedAt);
  const firstPressed = log.frames.findIndex((frame) => frame.pressed);
  expect(log.frames.slice(firstPressed).filter((frame) => !frame.pressed), "frames that let go while the finger held").toEqual([]);
});

const matrix = [320, 375, phone.width, 900, 1024, 1280].flatMap((width) =>
  (["light", "dark"] as const).flatMap((colorScheme) =>
    (["no-preference", "reduce"] as const).map((reducedMotion) => ({ width, colorScheme, reducedMotion })),
  ),
);

for (const { width, colorScheme, reducedMotion } of matrix) {
  test(`home matrix ${width} px ${colorScheme} motion ${reducedMotion} has no clipped text or errors`, async ({ browser }) => {
    const isPhone = width < 900;
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
      [...document.fonts].filter((f) => f.status === "loaded" && f.family.replaceAll('"', "") === "Plus Jakarta Sans").map((f) => f.weight),
    );
    expect(loaded.sort()).toEqual(["400", "500"]);
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
  expect(await page.evaluate(() => window.hiddenAt)).toEqual([5000]);
});
