import { fallbackSamples } from "../src/ui/home-copy";
import { openExample } from "./files";
import { animationsDone, frames, runs, sample, simulateKeyboard } from "./motion";
import { mountHarness } from "./harness";
import { expect, test, type Locator, type Page } from "./without-ocr";

const phone = { width: 390, height: 844 };

test.use({ viewport: phone });

type Target = (page: Page) => Locator;

const hero: Target = (page) => page.getByRole("button", { name: /^(Add|Drop a) receipt/ });

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
    const { top, left, width, height } = el.closest("[data-sheet]")!.getBoundingClientRect();
    return { top, left, width, height };
  });

const appPicker = (page: Page) => page.getByRole("combobox", { name: "Payment app" });

const action = (page: Page) => page.getByRole("button", { name: "Create split link" });

test("the empty home at 390 px shows the hero over the sheet, and only those words", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(appPicker(page)).toHaveValue("venmo");
  await page.locator("#root select").evaluateAll((pickers) => pickers.forEach((picker) => ((picker as HTMLElement).style.display = "none")));
  expect((await page.locator("#root").innerText()).split("\n").filter(Boolean)).toEqual([
    "Receipt Splitter",
    "Add receipt",
    "JPEG, PNG, or WebP",
    "V",
    "Venmo",
    "Your name",
    "Create split link",
  ]);
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveAttribute("placeholder", "@username");
  await expect(page.getByRole("button", { name: "Add another payment app" })).toBeVisible();
  await expect(page.getByRole("group", { name: "People at the table" })).toContainText("Your name");
  await expect(action(page)).toHaveAttribute("aria-disabled", "true");
});

test("Add receipt takes keyboard focus with a visible ring at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
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
  await frames(page, 18);
  const afterTouch = await pressLook(page, action);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await action(page).click({ force: true });
  await page.keyboard.down(" ");
  await frames(page, 18);
  expect({ afterTouch, afterClickAndSpace: await pressLook(page, action) }).toEqual({ afterTouch: restLook, afterClickAndSpace: restLook });
  await page.keyboard.up(" ");
});

test("with no way to pay, Create split link shows no note until a tap, which puts the cursor in the Venmo handle and says what is missing", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await expect(action(page)).not.toHaveAttribute("aria-describedby");
  await expect(action(page)).not.toHaveAttribute("aria-disabled");
  await expect(page.getByText("Add how to pay you.")).toHaveCount(0);
  await action(page).click();
  const handle = page.getByRole("textbox", { name: "Venmo handle" });
  await expect(handle).toBeFocused();
  await expect(handle).toBeInViewport({ ratio: 1 });
  await expect(action(page)).toHaveAccessibleDescription("Add how to pay you.");
  await expect(page.getByText("Add how to pay you.")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await handle.pressSequentially("@j");
  await expect(page.getByText("Add how to pay you.")).toHaveCount(0);
});

test("a Venmo username Venmo would refuse keeps the link uncreated, and a tap puts the cursor in it and names Venmo's rule", async ({ page }) => {
  const creates: string[] = [];
  page.on("request", (request) => request.url().includes("/api/split") && creates.push(request.url()));
  await page.goto("/");
  await settle(page);
  await openExample(page);
  const handle = page.getByRole("textbox", { name: "Venmo handle" });
  await handle.fill("test");
  await page.getByRole("group", { name: "People at the table" }).getByRole("button", { name: "Your name" }).click();
  const name = page.getByRole("textbox", { name: "Your name", exact: true });
  await name.fill("Jason");
  await name.press("Enter");
  await expect(action(page)).not.toHaveAttribute("aria-disabled");
  await action(page).click();
  await expect(handle).toBeFocused();
  await expect(action(page)).toHaveAccessibleDescription("Venmo usernames are 5 to 30 letters, numbers, - or _.");
  await expect(page).toHaveURL(/\/$/);
  expect(creates).toEqual([]);
  await handle.pressSequentially("test");
  await expect(page.getByText("Venmo usernames are 5 to 30 letters, numbers, - or _.")).toHaveCount(0);
});

const iphoneKeyboard = 336;

const aboveKeyboard = (field: Locator) =>
  field.evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    const { offsetTop, height } = window.visualViewport!;
    return top >= offsetTop && bottom <= offsetTop + height;
  });

const keyboardUp = (page: Page) => expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(page.viewportSize()!.height - iphoneKeyboard);
const keyboardDown = (page: Page) => expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(page.viewportSize()!.height);

// Home (operator, 2026-10-04): only the panel rises above the keyboard; the page and its background never move.
test.describe("with the iPhone keyboard up", () => {
  test.beforeEach(async ({ page }) => {
    await simulateKeyboard(page, iphoneKeyboard);
    await page.goto("/");
    await settle(page);
  });

  test("the focused handle field and name field stay in view above the keyboard", async ({ page }) => {
    const handle = page.getByRole("textbox", { name: "Venmo handle" });
    await handle.tap();
    await expect(handle).toBeFocused();
    await keyboardUp(page);
    await expect.poll(() => aboveKeyboard(handle)).toBe(true);

    await page.getByRole("group", { name: "People at the table" }).getByRole("button", { name: "Your name" }).tap();
    const name = page.getByRole("textbox", { name: "Your name", exact: true });
    await expect(name).toBeFocused();
    await expect.poll(() => aboveKeyboard(name)).toBe(true);
  });

  test("only the panel moves: it rises above the keyboard in one direction, and the heading never moves on screen", async ({ page }) => {
    const onScreen = `(selector) => Math.round(document.querySelector(selector).getBoundingClientRect().top - visualViewport.offsetTop)`;
    const read = `(() => { const at = ${onScreen}; return { heading: at("h1"), panel: at("[data-sheet-surface]") }; })()`;
    const rest: { heading: number; panel: number } = await page.evaluate(read);
    const tops = await sample<{ heading: number; panel: number }>(page, read);
    await page.getByRole("textbox", { name: "Venmo handle" }).tap();
    await keyboardUp(page);
    await animationsDone(page);
    const rising = (await tops()).map((top) => top.panel);
    expect(await action(page).evaluate((el) => el.getBoundingClientRect().bottom <= visualViewport!.height)).toBe(true);
    await page.getByRole("group", { name: "People at the table" }).getByRole("button", { name: "Your name" }).tap();
    await animationsDone(page);
    await page.locator("h1").tap();
    await keyboardDown(page);
    await animationsDone(page);

    const seen = await tops();
    expect(runs(seen.map((top) => top.heading))).toEqual([rest.heading]);
    expect(await page.evaluate(() => [window.scrollY, visualViewport!.offsetTop])).toEqual([0, 0]);
    expect(rising.filter((top, i) => i > 0 && top > rising[i - 1])).toEqual([]);
    expect(rising.at(-1)).toBeLessThan(rest.panel);
    expect(seen.at(-1)!.panel).toBe(rest.panel);
  });

  test("the hero keeps its layout while the keyboard is up", async ({ page }) => {
    const drop = `[...document.querySelectorAll("[role='button'] div")].find((el) => getComputedStyle(el).borderTopStyle === "dashed")`;
    const size = (box: { width: number; height: number }) => `${Math.round(box.width)}x${Math.round(box.height)}`;
    const before = size(await page.evaluate(`${drop}.getBoundingClientRect()`));
    const sizes = await sample<string>(page, `(() => { const box = ${drop}.getBoundingClientRect(); return Math.round(box.width) + "x" + Math.round(box.height); })()`);
    await page.getByRole("textbox", { name: "Venmo handle" }).tap();
    await keyboardUp(page);
    await animationsDone(page);
    await page.locator("h1").tap();
    await keyboardDown(page);
    await animationsDone(page);
    expect(runs(await sizes())).toEqual([before]);
  });
});

test.describe("with the iPhone keyboard up and twelve names", () => {
  for (const height of [phone.height, 667]) {
    test(`the focused name field stays in view above the keyboard at ${height} px tall`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height });
      await simulateKeyboard(page, iphoneKeyboard);
      await page.goto("/");
      await settle(page);

      const people = page.getByRole("group", { name: "People at the table" });
      await people.getByRole("button", { name: "Your name" }).tap();
      for (let i = 1; i <= 12; i++) {
        await page.keyboard.type(`Guest ${i}`);
        await page.keyboard.press("Enter");
      }
      await expect(people.getByRole("button", { name: /^Remove / })).toHaveCount(12);
      const field = page.getByRole("textbox", { name: "Name", exact: true });
      await expect(field).toBeFocused();
      await keyboardUp(page);
      await expect.poll(() => aboveKeyboard(field)).toBe(true);
    });
  }
});

test.describe("the phone panel", () => {
  const panelTop = (page: Page) => page.locator("[data-sheet-surface]").evaluate((el) => el.getBoundingClientRect().top);
  const actionTop = async (page: Page) => (await action(page).boundingBox())!.y;
  const tops = (page: Page) =>
    page.evaluate(
      () =>
        new Promise<{ panel: number; action: number }>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve({
                panel: document.querySelector("[data-sheet-surface]")!.getBoundingClientRect().top,
                action: [...document.querySelectorAll("[role='button']")].find((el) => el.textContent === "Create split link")!.getBoundingClientRect().top,
              }),
            ),
          ),
        ),
    );
  const paymentArea = async (page: Page) => {
    const panel = (await page.locator("[data-sheet-surface]").boundingBox())!;
    const field = (await page.getByRole("textbox", { name: "Venmo handle" }).boundingBox())!;
    return { x: panel.x + 4, y: field.y + field.height / 2 };
  };
  async function touchDown(page: Page, from: { x: number; y: number }) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove", y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x: from.x, y }] });
    await send("touchStart", from.y);
    return {
      moveBy: async (by: number, steps = 8) => {
        for (let step = 1; step <= steps; step++) await send("touchMove", from.y + (by * step) / steps);
      },
      release: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
    };
  }

  test("a drag from the payment area moves the whole panel with the finger, then it springs back to the same rest", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const rest = await tops(page);

    const finger = await touchDown(page, await paymentArea(page));
    await finger.moveBy(80);
    const held = await tops(page);
    await finger.release();

    expect(held.panel - rest.panel).toBeGreaterThan(20);
    expect(held.panel - rest.panel).toBeLessThan(80);
    expect(held.action - rest.action).toBeCloseTo(held.panel - rest.panel, 0);
    await expect.poll(() => panelTop(page)).toBe(rest.panel);
    expect(await actionTop(page)).toBe(rest.action);
    await expect(page.getByRole("textbox", { name: "Venmo handle" })).toBeVisible();
  });

  test("dragged up from its grab handle, the panel and Create split link stay one piece with no gap and no page showing below", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const rest = await panelTop(page);
    const grab = (await page.locator("[data-sheet-grab]").boundingBox())!;

    const finger = await touchDown(page, { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 });
    await finger.moveBy(-120);
    const covered = await page.evaluate(
      ([x, ys]) => ys.map((y) => !!document.elementFromPoint(x, y)?.closest("[data-sheet-surface]")),
      [phone.width / 2, [(await actionTop(page)) - 2, phone.height - 2]] as const,
    );
    const lifted = rest - (await panelTop(page));
    await finger.release();

    expect(lifted).toBeGreaterThan(20);
    expect(covered).toEqual([true, true]);
    await expect.poll(() => panelTop(page)).toBe(rest);
  });

  test("under reduced motion a drag from the payment area leaves the panel where it is", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await settle(page);
    const rest = await tops(page);

    const finger = await touchDown(page, await paymentArea(page));
    await finger.moveBy(80);
    const held = await tops(page);
    await finger.release();

    expect(held).toEqual(rest);
  });

  test("a tap on the Venmo handle that wanders a few pixels focuses it and leaves the panel at rest", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const rest = await panelTop(page);
    const field = (await page.getByRole("textbox", { name: "Venmo handle" }).boundingBox())!;

    const finger = await touchDown(page, { x: field.x + 20, y: field.y + field.height / 2 });
    await finger.moveBy(6, 3);
    await finger.release();

    await expect(page.getByRole("textbox", { name: "Venmo handle" })).toBeFocused();
    expect(await panelTop(page)).toBe(rest);
  });
});

test("a keydown on the disabled Create split link draws no press", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await action(page).evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  await frames(page, 12);
  expect(await pressLook(page, action)).toEqual(restLook);
});

test("the sheet stands 247 px, taller than the 223 px prototype, at 390 by 844", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const sheet = await sheetOf(action(page));
  expect(sheet.top + sheet.height).toBe(phone.height);
  expect(sheet.height).toBe(247);
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
  const camera = hero(page).locator("[data-press-face] > div").last();
  expect(await bottom(camera), "camera button bottom").toBeLessThanOrEqual(sheet.top);
  expect(await bottom(page.getByText("Add receipt", { exact: true })), "Add receipt bottom").toBeLessThanOrEqual(sheet.top);
});

test("the whole upload box sits above the sheet at 375 by 667 with both safe-area insets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await page.goto("/");
  await settle(page);
  const fit = async () => {
    const sheet = await sheetOf(action(page));
    const box = (await page.getByText("JPEG, PNG, or WebP", { exact: true }).locator("..").boundingBox())!;
    const wordmark = (await page.getByRole("heading", { name: "Receipt Splitter" }).boundingBox())!;
    const slip = (await hero(page).locator("[data-press-face]").boundingBox())!;
    return { boxAboveSheet: box.y + box.height <= sheet.top, slipBelowHeader: slip.y >= wordmark.y + wordmark.height };
  };
  await expect.poll(fit).toEqual({ boxAboveSheet: true, slipBelowHeader: true });
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
  expect((await sheetOf(action(page))).height, "sheet height with the inset").toBe(281);
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
  expect((await edges(page.getByRole("heading", { name: "Receipt Splitter" })))[0]).toBe(47 + 22);
  expect((await edges(page.getByRole("button", { name: "Example" })))[1]).toBe(landscape.width - 47 - 22);
  const sheet = await sheetOf(action(page));
  expect([sheet.left, sheet.width]).toEqual([0, landscape.width]);
  const [left, right] = await edges(action(page));
  expect(left).toBeGreaterThanOrEqual(47 + 22);
  expect(right).toBeLessThanOrEqual(landscape.width - 47 - 22);
});

const centerOf = async (target: Locator) => {
  const box = (await target.boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), left: Math.round(box.x), width: Math.round(box.width) };
};

for (const width of [1024, 1440]) {
  test(`at ${width} px the drop area, the payment row, and Create split link share one centered column`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await settle(page);
    const zone = await centerOf(hero(page));
    const pay = await centerOf(page.getByRole("textbox", { name: "Venmo handle" }).locator("xpath=../.."));
    const create = await centerOf(action(page));
    expect(zone.x).toBe(width / 2);
    expect([pay.left, pay.width]).toEqual([zone.left, zone.width]);
    expect([create.left, create.width]).toEqual([zone.left, zone.width]);
    await expect(page.locator("[data-sheet]")).toHaveCount(0);
    expect(await hero(page).innerText()).toBe("Drop a receipt\nChoose a photo, or paste one\nJPEG, PNG, or WebP");
  });
}

test("at 1280 px in dark mode the page and the camera button sit on the charcoal ladder", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const colors = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    slip: getComputedStyle(document.querySelector("[data-press-face]")!).backgroundColor,
    cameraButton: getComputedStyle(document.querySelector("[data-press-face] > div:last-child")!).backgroundColor,
    glyph: document.querySelector("[data-press-face] [data-icon]")!.getAttribute("data-icon"),
  }));
  expect(colors).toEqual({
    page: "rgb(18, 19, 21)",
    slip: "rgb(28, 29, 32)",
    cameraButton: "rgb(242, 242, 243)",
    glyph: "upload",
  });
  await context.close();
});

const looks = {
  light: {
    paper: "rgb(245, 246, 247)",
    hairline: "rgb(227, 229, 232)",
    ink: "rgb(17, 18, 20)",
    muted: "rgb(105, 109, 116)",
    sheetShadow: "rgb(227, 229, 232) 0px -1px 0px 0px, rgba(17, 18, 20, 0.06) 0px -12px 32px 0px",
    lift: "drop-shadow(rgba(17, 18, 20, 0.06) 0px 1px 1px) drop-shadow(rgba(17, 18, 20, 0.08) 0px 12px 20px)",
    themeColor: "#FFFFFF",
  },
  dark: {
    paper: "rgb(28, 29, 32)",
    hairline: "rgb(47, 49, 53)",
    ink: "rgb(242, 242, 243)",
    muted: "rgb(160, 163, 169)",
    sheetShadow: "rgb(47, 49, 53) 0px -1px 0px 0px, rgba(0, 0, 0, 0.4) 0px -14px 36px 0px, rgba(255, 255, 255, 0.04) 0px 1px 0px 0px inset",
    lift: "drop-shadow(rgba(0, 0, 0, 0.4) 0px 1px 1px) drop-shadow(rgba(0, 0, 0, 0.35) 0px 12px 18px)",
    themeColor: "#121315",
  },
};

for (const colorScheme of ["light", "dark"] as const) {
  test(`the slip, the sheet, the chips, and the type follow the design tokens at 390 px, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await settle(page);
    const sheet = await page.locator("[data-sheet-surface]").evaluate((sheet) => {
      const grab = sheet.querySelector("[data-sheet-grab] > div")!;
      const { width, height } = grab.getBoundingClientRect();
      return { shadow: getComputedStyle(sheet).boxShadow, grab: [width, height, getComputedStyle(grab).backgroundColor] };
    });
    const slip = await hero(page).locator("[data-press-face]").evaluate((el) => ({
      fill: getComputedStyle(el).backgroundColor,
      lift: getComputedStyle(el).filter,
      lines: [...el.firstElementChild!.children].map((line) => [Math.round(line.getBoundingClientRect().width), line.getBoundingClientRect().height, getComputedStyle(line).backgroundColor]),
    }));
    const text = await page.evaluate(() => {
      const leaf = (content: string) => [...document.querySelectorAll("#root *")].find((el) => !el.childElementCount && el.textContent === content)!;
      const font = (content: string) => {
        const style = getComputedStyle(leaf(content));
        return [style.fontSize, style.fontWeight, style.letterSpacing, style.color];
      };
      return {
        title: font("Add receipt"),
        name: getComputedStyle(leaf("Your name")).color,
        glyph: getComputedStyle(leaf("V")).color,
        handle: getComputedStyle(document.querySelector("input")!).fontSize,
      };
    });
    const themeColor = await page.locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${colorScheme})"]`).getAttribute("content");
    const tokens = looks[colorScheme];
    expect({ sheet, slip, text, themeColor }).toEqual({
      sheet: { shadow: tokens.sheetShadow, grab: [36, 5, tokens.hairline] },
      slip: { fill: tokens.paper, lift: tokens.lift, lines: [100, 70, 100, 70].map((width) => [width, 5, tokens.hairline]) },
      text: { title: ["26px", "400", "-0.52px", tokens.ink], name: tokens.muted, glyph: tokens.paper, handle: "16px" },
      themeColor: tokens.themeColor,
    });
  });
}

test("the hero fills the space between the header and the sheet, and the header clears the top safe-area inset", async ({ page }) => {
  const layout = async () => {
    const heroBox = (await hero(page).boundingBox())!;
    const sheet = await sheetOf(action(page));
    const wordmark = (await page.getByRole("heading", { name: "Receipt Splitter" }).boundingBox())!;
    return { heroTop: heroBox.y, heroBottom: heroBox.y + heroBox.height, sheetTop: sheet.top, wordmarkTop: wordmark.y };
  };
  await page.goto("/");
  await settle(page);
  const flush = await layout();
  expect([flush.heroTop, flush.heroBottom]).toEqual([60, flush.sheetTop]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 0, left: 0, right: 0 } });
  await page.reload();
  await settle(page);
  const notched = await layout();
  expect([notched.wordmarkTop - flush.wordmarkTop, notched.heroTop - flush.heroTop, notched.heroBottom]).toEqual([47, 47, notched.sheetTop]);
});

test("Example lines up with the wordmark", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/");
  await settle(page);
  const middle = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    return box.y + box.height / 2;
  };
  const wordmark = await middle(page.getByRole("heading", { name: "Receipt Splitter" }));
  const example = await middle(page.getByText("Example", { exact: true }));
  expect(Math.abs(example - wordmark)).toBeLessThanOrEqual(1);
});

for (const [width, sheet] of [
  [899, 1],
  [900, 0],
] as const) {
  test(`at ${width} px the payment row and the names ${sheet ? "sit in the bottom sheet" : "sit in the page column"}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await settle(page);
    await expect(page.locator("[data-sheet]")).toHaveCount(sheet);
    await expect(page.getByRole("group", { name: "People at the table" })).toBeVisible();
  });
}

test("Example shows from 768 px and not below", async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 800 });
  await page.goto("/");
  await settle(page);
  await page.setViewportSize({ width: 768, height: 800 });
  await expect(page.getByRole("button", { name: "Example" })).toBeVisible();
  await page.setViewportSize(phone);
  await expect(page.getByRole("button", { name: "Example" })).toHaveCount(0);
});

test("names go in by keyboard alone: Enter adds the chip and leaves a fresh field focused for the next", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const people = page.getByRole("group", { name: "People at the table" });
  await people.getByRole("button", { name: "Your name" }).click();
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
  await expect(people.getByRole("button", { name: "Add a name" })).toHaveText("Add");

  for (const name of ["Sam", "Priya"]) {
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await expect(people.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  expect(await people.getByRole("button", { name: /^Remove / }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))).toEqual([
    "Remove Sam",
    "Remove Priya",
  ]);
  const next = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(next).toBeFocused();
  await expect(next).toHaveValue("");
});

test("the handle placeholder fits its field at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await settle(page);
  const fit = await page.getByRole("textbox", { name: "Venmo handle" }).evaluate((input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { placeholder: input.placeholder, fits: ctx.measureText(input.placeholder).width <= room };
  });
  expect(fit).toEqual({ placeholder: "@username", fits: true });
  await expect(appPicker(page)).toBeVisible();
});

const glyphs = {
  camera:
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

test("each icon draws its own glyph in its color with a 1.5 stroke, hidden from assistive tech, at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const icons = await page.locator("[data-icon]").evaluateAll((svgs) =>
    svgs.map((svg) => ({
      icon: svg.getAttribute("data-icon"),
      hidden: svg.getAttribute("aria-hidden"),
      stroke: svg.getAttribute("stroke"),
      width: svg.getAttribute("stroke-width"),
      glyph: [...svg.children].map((shape) => new XMLSerializer().serializeToString(shape).replace(' xmlns="http://www.w3.org/2000/svg"', "")).join(""),
    })),
  );
  const icon = (name: keyof typeof glyphs, stroke: string) => ({ icon: name, hidden: "true", stroke, width: "1.5", glyph: glyphs[name] });
  expect(icons).toEqual([icon("camera", "#FFFFFF"), icon("chevron", "#696D74"), icon("plus", "#111214"), icon("plus", "#696D74")]);
});

for (const [width, named] of [
  [359, false],
  [360, true],
] as const) {
  test(`the payment picker ${named ? "shows" : "hides"} the app name at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await settle(page);
    const face = page.locator("[data-app-picker] [data-press-face]");
    expect(await face.innerText()).toBe(named ? "V\nVenmo" : "V");
  });
}

test("the payment app picker is a native select over its face that lists the four apps with Venmo first", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const picker = appPicker(page);
  expect(await picker.locator("option").allTextContents()).toEqual(["Venmo", "Cash App", "PayPal", "Zelle"]);
  const face = page.locator("[data-app-picker] [data-press-face]");
  const [faceBox, pickerBox] = [(await face.boundingBox())!, (await picker.boundingBox())!];
  expect(pickerBox.x <= faceBox.x && pickerBox.x + pickerBox.width >= faceBox.x + faceBox.width).toBe(true);
  await picker.selectOption("zelle");
  await expect(page.getByRole("textbox", { name: "Zelle handle" })).toHaveAttribute("placeholder", "Email or phone");
});

test("the fonts load as same-origin WOFF2 files with an immutable cache header while the page stays cross-origin isolated", async ({ page }) => {
  const fonts: { path: string; status: number; type: string | undefined; cache: string | undefined }[] = [];
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (!pathname.startsWith("/fonts/")) return;
    const headers = response.headers();
    fonts.push({ path: pathname.replace(/-[0-9a-f]{10}\./, "-<hash>."), status: response.status(), type: headers["content-type"], cache: headers["cache-control"] });
  });
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replaceAll('"', "") === "Plus Jakarta Sans").map((f) => f.status));
  expect(loaded).toEqual(["loaded", "loaded"]);
  const immutable = { status: 200, type: "font/woff2", cache: "public, max-age=31536000, immutable" };
  expect(fonts.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
    { path: "/fonts/plus-jakarta-sans-400-<hash>.woff2", ...immutable },
    { path: "/fonts/plus-jakarta-sans-500-<hash>.woff2", ...immutable },
  ]);
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
          .filter((el) => el.childElementCount === 0 && el.textContent?.trim() && el.localName !== "option")
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
        .filter((el) => el.childElementCount === 0 && el.textContent?.trim() && el.localName !== "option")
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

const componentHarness = `
  import { createRoot } from "react-dom/client";
  import { View } from "react-native";
  import { SafeAreaProvider } from "react-native-safe-area-context";
  import { Button } from "./src/ui/components/button";
  import { ReceiptSummary } from "./src/ui/receipt-input/receipt-summary";
  const thumbnail = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='52'><rect width='40' height='52' fill='%23c8a'/></svg>";
  window.presses = 0;
  window.views = 0;
  window.replaces = 0;
  createRoot(document.getElementById("root")).render(
    <SafeAreaProvider>
      <View style={{ width: 350, padding: 20, gap: 16 }}>
        <Button label="Create split link" onPress={() => window.presses++} reason="Items are $0.50 short." />
        <ReceiptSummary name="IMG_4127.jpg" items={5} total={2804} thumbnail={thumbnail} onView={() => window.views++} onReplace={() => window.replaces++} />
        <ReceiptSummary name="Example receipt" items={1} total={1599} thumbnail={null} onReplace={() => {}} stacked />
      </View>
    </SafeAreaProvider>,
  );
`;

const ink = { light: { action: "rgb(17, 18, 20)", onAction: "rgb(255, 255, 255)", muted: "rgb(105, 109, 116)" }, dark: { action: "rgb(242, 242, 243)", onAction: "rgb(17, 18, 20)", muted: "rgb(160, 163, 169)" } };

for (const colorScheme of ["light", "dark"] as const) {
  test(`an enabled primary Button is a 54 px pill in the action color with its reason line above it, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await mountHarness(page, componentHarness);
    const button = page.getByRole("button", { name: "Create split link" });
    await expect(button).toBeVisible();
    const look = await button.evaluate((el) => {
      const face = getComputedStyle(el.firstElementChild!);
      const reason = document.getElementById(el.getAttribute("aria-describedby")!)!;
      const label = getComputedStyle(el.querySelector('[dir="auto"]')!);
      return {
        disabled: el.getAttribute("aria-disabled"),
        height: el.getBoundingClientRect().height,
        radius: face.borderTopLeftRadius,
        fill: face.backgroundColor,
        label: label.color,
        reason: [reason.textContent, getComputedStyle(reason).backgroundColor, getComputedStyle(reason).color],
        reasonAbove: reason.getBoundingClientRect().bottom <= el.getBoundingClientRect().top,
      };
    });
    expect(look).toEqual({
      disabled: null,
      height: 54,
      radius: "27px",
      fill: ink[colorScheme].action,
      label: ink[colorScheme].onAction,
      reason: ["Items are $0.50 short.", "rgba(0, 0, 0, 0)", ink[colorScheme].muted],
      reasonAbove: true,
    });
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { presses: number }).presses)).toBe(1);
  });
}

test("the receipt card shows the file name, the item count, and the total, and opens the photo only when there is one", async ({ page }) => {
  await mountHarness(page, componentHarness);
  const cards = page.getByTestId("receipt");
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.split("\n").filter(Boolean)))).toEqual([
    ["IMG_4127.jpg", "5 items", "$28.04", "Total"],
    ["Example receipt", "1 item", "$15.99"],
  ]);
  await expect(page.getByRole("button", { name: "View receipt photo" })).toHaveCount(1);
  await page.getByRole("button", { name: "View receipt photo" }).click();
  await cards.first().getByRole("button", { name: "Replace receipt" }).click();
  expect(await page.evaluate(() => [(window as unknown as { views: number }).views, (window as unknown as { replaces: number }).replaces])).toEqual([1, 1]);
});
