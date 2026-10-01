import { expect, test, type Locator, type Page } from "@playwright/test";

import { fallbackSamples } from "../src/ui/home-copy";
import { mountHarness } from "./harness";

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
    "Example",
    "Add receipt",
    "Take or upload a photo",
    "JPEG, PNG, or WebP",
    "V",
    "Venmo",
    "Me",
    "Add",
    "Create split link",
  ]);
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
  await page.waitForTimeout(300);
  const afterTouch = await pressLook(page, action);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await action(page).click({ force: true });
  await page.keyboard.down(" ");
  await page.waitForTimeout(300);
  expect({ afterTouch, afterClickAndSpace: await pressLook(page, action) }).toEqual({ afterTouch: restLook, afterClickAndSpace: restLook });
  await page.keyboard.up(" ");
});

test("a keydown on the disabled Create split link draws no press", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await action(page).evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  await page.waitForTimeout(200);
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
  const sheet = await sheetOf(action(page));
  const box = page.getByText("JPEG, PNG, or WebP", { exact: true }).locator("..");
  const subline = (await box.boundingBox())!;
  const wordmark = (await page.getByRole("heading", { name: "Receipt Splitter" }).boundingBox())!;
  const slip = (await hero(page).locator("[data-press-face]").boundingBox())!;
  expect({ sublineAboveSheet: subline.y + subline.height <= sheet.top, slipBelowHeader: slip.y >= wordmark.y + wordmark.height }).toEqual({
    sublineAboveSheet: true,
    slipBelowHeader: true,
  });
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
  expect((await edges(page.getByRole("heading", { name: "Receipt Splitter" })))[0]).toBe(47 + 20);
  expect((await edges(page.getByRole("button", { name: "Example" })))[1]).toBe(landscape.width - 47 - 20);
  const sheet = await sheetOf(action(page));
  expect([sheet.left, sheet.width]).toEqual([0, landscape.width]);
  const [left, right] = await edges(action(page));
  expect(left).toBeGreaterThanOrEqual(47 + 20);
  expect(right).toBeLessThanOrEqual(landscape.width - 47 - 20);
});

test("at 1280 px the drop area sits left of the 380 px panel with the upload glyph, and dark mode puts the page and the camera button on the charcoal ladder", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const zone = (await hero(page).boundingBox())!;
  const panel = await sheetOf(action(page));
  expect(await hero(page).innerText()).toBe("Drop a receipt\nChoose a photo, or paste one\nJPEG, PNG, or WebP");
  expect(panel.width).toBe(380);
  expect(zone.x + zone.width).toBeLessThan(panel.left);
  expect(zone.y).toBe(panel.top);
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
    sheetShadow: "rgb(227, 229, 232) 0px -1px 0px 0px, rgba(17, 18, 20, 0.06) 0px -12px 32px 0px",
    lift: "drop-shadow(rgba(17, 18, 20, 0.06) 0px 1px 1px) drop-shadow(rgba(17, 18, 20, 0.08) 0px 12px 20px)",
    themeColor: "#FFFFFF",
  },
  dark: {
    paper: "rgb(28, 29, 32)",
    hairline: "rgb(47, 49, 53)",
    ink: "rgb(242, 242, 243)",
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
        me: getComputedStyle(leaf("Me")).color,
        glyph: getComputedStyle(leaf("V")).color,
        handle: getComputedStyle(document.querySelector("input")!).fontSize,
      };
    });
    const themeColor = await page.locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${colorScheme})"]`).getAttribute("content");
    const tokens = looks[colorScheme];
    expect({ sheet, slip, text, themeColor }).toEqual({
      sheet: { shadow: tokens.sheetShadow, grab: [36, 5, tokens.hairline] },
      slip: { fill: tokens.paper, lift: tokens.lift, lines: [100, 70, 100, 70].map((width) => [width, 5, tokens.hairline]) },
      text: { title: ["28px", "400", "-0.56px", tokens.ink], me: tokens.ink, glyph: tokens.paper, handle: "16px" },
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
  expect([flush.heroTop, flush.heroBottom]).toEqual([56, flush.sheetTop]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 0, left: 0, right: 0 } });
  await page.reload();
  await settle(page);
  const notched = await layout();
  expect([notched.wordmarkTop - flush.wordmarkTop, notched.heroTop - flush.heroTop, notched.heroBottom]).toEqual([47, 47, notched.sheetTop]);
});

test("Example lines up with the wordmark", async ({ page }) => {
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

for (const [width, wide] of [
  [899, false],
  [900, true],
] as const) {
  test(`at ${width} px the sheet ${wide ? "is" : "is not"} the 380 px panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await settle(page);
    const sheet = await sheetOf(action(page));
    expect(sheet.width === 380).toBe(wide);
  });
}

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
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6"/>',
  camera:
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

test("each icon draws its own glyph in its color with a 1.5 stroke, hidden from assistive tech, at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const icons = await page.locator("[data-icon]").evaluateAll((wrappers) =>
    wrappers.map((wrapper) => {
      const img = wrapper.querySelector("img")!;
      const svg = new DOMParser().parseFromString(decodeURIComponent(img.src.replace(/^data:image\/svg\+xml;utf8,/, "")), "image/svg+xml").documentElement;
      return {
        icon: wrapper.getAttribute("data-icon"),
        hidden: wrapper.getAttribute("aria-hidden"),
        alt: img.getAttribute("alt"),
        stroke: svg.getAttribute("stroke"),
        width: svg.getAttribute("stroke-width"),
        glyph: svg.innerHTML.replaceAll(' xmlns="http://www.w3.org/2000/svg"', ""),
      };
    }),
  );
  const icon = (name: keyof typeof glyphs, stroke: string) => ({ icon: name, hidden: "true", alt: "", stroke, width: "1.5", glyph: glyphs[name] });
  expect(icons).toEqual([icon("receipt", "#696D74"), icon("camera", "#FFFFFF"), icon("chevron", "#696D74"), icon("plus", "#111214"), icon("plus", "#696D74")]);
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
  import { FileRow } from "./src/ui/components/file-row";
  const thumbnail = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='52'><rect width='40' height='52' fill='%23c8a'/></svg>";
  window.presses = 0;
  createRoot(document.getElementById("root")).render(
    <SafeAreaProvider>
      <View style={{ width: 350, padding: 20, gap: 16 }}>
        <Button label="Create split link" onPress={() => window.presses++} reason="Items are $0.50 short." />
        <FileRow name="IMG_4127.jpg" items={5} thumbnail={thumbnail} onReplace={() => {}} />
        <FileRow name="IMG_4128.jpg" items={1} thumbnail={thumbnail} onReplace={() => {}} />
      </View>
    </SafeAreaProvider>,
  );
`;

const ink = { light: { action: "rgb(17, 18, 20)", onAction: "rgb(255, 255, 255)", flagWash: "rgb(255, 239, 158)", flag: "rgb(90, 69, 0)" }, dark: { action: "rgb(242, 242, 243)", onAction: "rgb(17, 18, 20)", flagWash: "rgb(70, 58, 12)", flag: "rgb(255, 226, 122)" } };

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
      reason: ["Items are $0.50 short.", ink[colorScheme].flagWash, ink[colorScheme].flag],
      reasonAbove: true,
    });
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { presses: number }).presses)).toBe(1);
  });
}

test("the file row shows the thumbnail, the file name, the item count, and a replace button", async ({ page }) => {
  await mountHarness(page, componentHarness);
  await expect(page.getByRole("button", { name: "Replace receipt" })).toHaveCount(2);
  const rows = await page.getByRole("button", { name: "Replace receipt" }).evaluateAll((buttons) =>
    buttons.map((button) => {
      const row = button.parentElement!;
      const thumbnail = row.firstElementChild!;
      const box = (el: Element) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)];
      return {
        text: row.innerText.split("\n"),
        thumbnail: [box(thumbnail), thumbnail.querySelector("img")?.getAttribute("src")?.startsWith("data:image/svg+xml") ?? false],
        replace: [box(button), button.querySelector("[data-icon]")?.getAttribute("data-icon")],
      };
    }),
  );
  const thumbnail = [[40, 52], true];
  const replace = [[44, 44], "camera"];
  expect(rows).toEqual([
    { text: ["IMG_4127.jpg", "5 items"], thumbnail, replace },
    { text: ["IMG_4128.jpg", "1 item"], thumbnail, replace },
  ]);
});
