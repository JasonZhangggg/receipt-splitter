import { fallbackSamples } from "../src/ui/home-copy";
import { dropZone, exampleReply, openExample } from "./files";
import { simulateKeyboard } from "./motion";
import { mountHarness } from "./harness";
import { expect, test, type Locator, type Page } from "./without-ocr";

const phone = { width: 390, height: 844 };

test.use({ viewport: phone });

const hero = dropZone;

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
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

const appPicker = (page: Page) => page.getByRole("combobox", { name: "Payment app" });
const action = (page: Page) => page.getByRole("button", { name: "Create split link" });
const people = (page: Page) => page.getByRole("region", { name: "Who’s at the table" });
const addName = (page: Page) => people(page).getByRole("button", { name: /^Add (your )?name$/ });
const venmo = (page: Page) => page.getByRole("textbox", { name: "Venmo handle" });
const removers = (page: Page) => people(page).getByRole("button", { name: /^Remove / });

test("the empty home at 390 px shows the take-photo block, the two lists and a gray Create, and only those words", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(appPicker(page)).toHaveValue("venmo");
  await page.locator("#root select").evaluateAll((pickers) => pickers.forEach((picker) => ((picker as HTMLElement).style.display = "none")));
  expect((await page.locator("#root").innerText()).split("\n").filter(Boolean)).toEqual([
    "SplitWith",
    "Snap the receipt. Friends tap what they had and pay you back.",
    "Add the receipt",
    "or choose a file",
    "How friends pay you",
    "Add another way to get paid",
    "Who’s at the table",
    "Add your name",
    "Add a receipt first.",
    "Create split link",
  ]);
  await expect(venmo(page)).toHaveAttribute("placeholder", "@username");
  await expect(action(page)).toHaveAccessibleDescription("Add a receipt first.");
});

test("the header has the theme toggle and no menu, share or Example, and Recent splits only once there are stored splits", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  for (const name of ["Menu", "Share SplitWith", "Example", "Recent splits"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    localStorage.setItem("receipt-splitter:split:AnaBenCy00000000000001", JSON.stringify({ recent: { names: ["Ana", "Ben"], total: 990, added: Date.now(), seen: Date.now() } })),
  );
  await page.reload();
  await settle(page);
  await page.getByRole("button", { name: "Recent splits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Recent splits" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Ana and Ben/ })).toBeVisible();
});

test("Add the receipt takes keyboard focus with a visible ring at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
});

test("the take-photo block takes keyboard focus with a visible ring at 1280 px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
  await context.close();
});

const venmoRule = "Venmo usernames need at least 5 characters. This one has 4.";

async function addHost(page: Page, name: string) {
  await addName(page).click();
  const field = page.getByRole("textbox", { name: "Your name", exact: true });
  await field.fill(name);
  await field.press("Enter");
}

test("with no way to pay, Create split link shows no note and creates the Split", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await addHost(page, "Jason");
  await expect(action(page)).not.toHaveAttribute("aria-describedby");
  await action(page).click();
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{24}$/);
});

test("with no name, Create split link names what is missing before a tap, and a tap opens the name field without creating", async ({ page }) => {
  const creates: string[] = [];
  page.on("request", (request) => request.url().includes("/api/splits") && creates.push(request.url()));
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await expect(action(page)).toHaveAccessibleDescription("Add your name first.");
  await expect(page.getByText("Add your name first.")).toBeVisible();
  await action(page).click();
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  expect(creates).toEqual([]);
});

test("a Venmo username Venmo would refuse says why before a tap, and a tap puts the cursor in it without creating", async ({ page }) => {
  const creates: string[] = [];
  page.on("request", (request) => request.url().includes("/api/splits") && creates.push(request.url()));
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await venmo(page).fill("test");
  await addHost(page, "Jason");
  await expect(action(page)).toHaveAccessibleDescription(venmoRule);
  await expect(page.getByText(venmoRule)).toBeVisible();
  await action(page).click();
  await expect(venmo(page)).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  expect(creates).toEqual([]);
  await venmo(page).pressSequentially("test");
  await expect(page.getByText(venmoRule)).toHaveCount(0);
  await expect(action(page)).not.toHaveAttribute("aria-describedby");
});

test("a tap on the gray Create focuses the blocking field", async ({ page }) => {
  let finishRead = () => {};
  const readFinished = new Promise<void>((resolve) => (finishRead = resolve));
  await page.context().route("**/ocr-worker.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      headers: { "cross-origin-embedder-policy": "require-corp", "cross-origin-resource-policy": "same-origin" },
      body: "self.onmessage = ({ data }) => { if (data.type === 'recognize') self.postMessage({ id: data.id, boxes: [] }); };",
    }),
  );
  await page.context().route("**/api/scan", async (route) => {
    await readFinished;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(exampleReply) });
  });
  await page.goto("/");
  await settle(page);
  await action(page).click();
  await expect(hero(page)).toBeFocused();

  const reasonLine = page.locator("[role=status][data-problem]");
  await expect(reasonLine).toHaveText("Add a receipt first.");
  await expect(reasonLine).toHaveAttribute("data-problem", "true");

  const chooser = page.waitForEvent("filechooser");
  await hero(page).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(reasonLine).toHaveText("Reading the receipt.");
  await expect(reasonLine).toHaveAttribute("data-problem", "false");
  finishRead();
  await expect(page.getByTestId("receipt")).toBeVisible();
  await venmo(page).fill("test");
  await action(page).click();
  await expect(venmo(page)).toBeFocused();

  await venmo(page).fill("jason-z");
  await action(page).click();
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
});

const iphoneKeyboard = 336;

const aboveKeyboard = (field: Locator) =>
  field.evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    const { offsetTop, height } = window.visualViewport!;
    return top >= offsetTop && bottom <= offsetTop + height;
  });

const keyboardUp = (page: Page) => expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(page.viewportSize()!.height - iphoneKeyboard);

// Rule 17: a focused field is never under the keyboard. There is no panel, so the page's own scroller makes the room.
test.describe("with the iPhone keyboard up", () => {
  test.beforeEach(async ({ page }) => {
    await simulateKeyboard(page, iphoneKeyboard);
    await page.goto("/");
    await settle(page);
  });

  test("the focused handle field and name field stay in view above the keyboard", async ({ page }) => {
    await venmo(page).tap();
    await expect(venmo(page)).toBeFocused();
    await keyboardUp(page);
    await expect.poll(() => aboveKeyboard(venmo(page))).toBe(true);

    await addName(page).tap();
    const name = page.getByRole("textbox", { name: "Your name", exact: true });
    await expect(name).toBeFocused();
    await expect.poll(() => aboveKeyboard(name)).toBe(true);
  });

  test("the window never scrolls, and the page rests where it was when the keyboard goes", async ({ page }) => {
    const scrolled = () => page.evaluate(() => [window.scrollY, document.querySelector("h1")!.getBoundingClientRect().top]);
    const rest = await scrolled();
    await venmo(page).tap();
    await keyboardUp(page);
    await addName(page).tap();
    await page.locator("h1").tap();
    await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(phone.height);
    await expect.poll(scrolled).toEqual(rest);
  });
});

test.describe("with the iPhone keyboard up and twelve names", () => {
  for (const height of [phone.height, 667]) {
    test(`the focused name field stays in view above the keyboard at ${height} px tall`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height });
      await simulateKeyboard(page, iphoneKeyboard);
      await page.goto("/");
      await settle(page);

      await addName(page).tap();
      for (let i = 1; i <= 12; i++) {
        await page.keyboard.type(`Guest ${i}`);
        await page.keyboard.press("Enter");
      }
      await expect(removers(page)).toHaveCount(12);
      const field = page.getByRole("textbox", { name: "Name", exact: true });
      await expect(field).toBeFocused();
      await keyboardUp(page);
      await expect.poll(() => aboveKeyboard(field)).toBe(true);
    });
  }
});

test("the Create pill clears the bottom safe-area inset, and the header and pill clear a landscape notch", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
  await page.goto("/");
  await settle(page);
  const pill = (await action(page).boundingBox())!;
  expect(pill.y + pill.height).toBeLessThanOrEqual(phone.height - 34);

  const landscape = { width: 844, height: 390 };
  await page.setViewportSize(landscape);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
  await page.reload();
  await settle(page);
  const edges = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    return [box.x, box.x + box.width];
  };
  expect((await edges(page.getByRole("heading", { name: "SplitWith" })))[0]).toBeGreaterThanOrEqual(47);
  // The toggle's box hangs 12 px into the gutter so its glyph lines up with the content.
  expect((await edges(page.getByRole("button", { name: "Switch to dark mode" })))[1]).toBeLessThanOrEqual(landscape.width - 47 + 12);
  const [left, right] = await edges(action(page));
  expect(left).toBeGreaterThanOrEqual(47);
  expect(right).toBeLessThanOrEqual(landscape.width - 47);
});

const centerOf = async (target: Locator) => {
  const box = (await target.boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), left: Math.round(box.x), width: Math.round(box.width) };
};

for (const width of [1024, 1440]) {
  test(`at ${width} px the receipt block, the payment row, the names and Create split link share one centered column`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await settle(page);
    const receipt = await centerOf(page.getByRole("region", { name: "Receipt" }));
    const pay = await centerOf(page.getByRole("region", { name: "How friends pay you" }));
    const names = await centerOf(people(page));
    const create = await centerOf(action(page));
    expect(receipt.x).toBe(width / 2);
    for (const other of [pay, names, create]) expect([other.left, other.width]).toEqual([receipt.left, receipt.width]);
    await expect(page.getByText("Drop or paste a photo here")).toBeVisible();
  });
}

test("Enter adds a name and keeps the field open", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await addName(page).click();
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();

  for (const name of ["Sam", "Priya"]) {
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await expect(removers(page)).toHaveCount(2);
  expect(await removers(page).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))).toEqual(["Remove Sam", "Remove Priya"]);
  const next = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(next).toBeFocused();
  await expect(next).toHaveValue("");
});

test("the Host is the first name, named \"<name>, you\", and a name leaves with its remove button", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await addName(page).click();
  for (const name of ["Jason", "Sam"]) {
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await expect(people(page).getByRole("group")).toHaveCount(2);
  await expect(people(page).getByRole("group", { name: "Jason, you" })).toBeVisible();
  await expect(people(page).getByRole("group", { name: "Sam", exact: true })).toBeVisible();
  await people(page).getByRole("button", { name: "Remove Sam" }).click();
  await expect(people(page).getByRole("group")).toHaveCount(1);
});

test("the handle placeholder fits its field at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await settle(page);
  const fit = await venmo(page).evaluate((input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { placeholder: input.placeholder, fits: ctx.measureText(input.placeholder).width <= room };
  });
  expect(fit).toEqual({ placeholder: "@username", fits: true });
  await expect(appPicker(page)).toBeVisible();
});

test("each icon draws a glyph, hidden from assistive tech, at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const icons = await page.locator("[data-icon]").evaluateAll((svgs) =>
    svgs.map((svg) => ({
      icon: svg.getAttribute("data-icon"),
      hidden: svg.getAttribute("aria-hidden"),
      drawn: svg.children.length > 0,
    })),
  );
  const icon = (name: string) => ({ icon: name, hidden: "true", drawn: true });
  expect(icons).toEqual([icon("sun"), icon("moon"), icon("camera"), icon("chevron"), icon("plus"), icon("plus"), icon("arrow")]);
});

test("the payment app picker is a native select that lists the four apps with Venmo first", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const picker = appPicker(page);
  expect(await picker.locator("option").allTextContents()).toEqual(["Venmo", "Cash App", "PayPal", "Zelle"]);
  await picker.selectOption("zelle");
  await expect(page.getByRole("textbox", { name: "Zelle handle" })).toHaveAttribute("placeholder", "Email or phone");
});

test("a second way to get paid takes the next free app, and its remove button takes it away", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: "Add another way to get paid" }).click();
  await expect(page.getByRole("textbox", { name: "Cash App handle" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Cash App" }).click();
  await expect(page.getByRole("textbox", { name: "Cash App handle" })).toHaveCount(0);
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
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replaceAll('"', "") === "Geist").map((f) => f.status));
  expect(loaded).toEqual(["loaded", "loaded"]);
  const immutable = { status: 200, type: "font/woff2", cache: "public, max-age=31536000, immutable" };
  expect(fonts.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
    { path: "/fonts/geist-400-<hash>.woff2", ...immutable },
    { path: "/fonts/geist-500-<hash>.woff2", ...immutable },
  ]);
});

const fontWidths = [320, phone.width, 1280];

for (const width of fontWidths) {
  test(`the fallback faces keep every text line and its glyph box where Geist puts them at ${width} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: phone.height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await settle(page);
    const layout = () =>
      page.evaluate(() => ({
        faces: [...document.fonts].filter((f) => f.family.replaceAll('"', "") === "Geist").length,
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
          if (rule instanceof CSSFontFaceRule && rule.style.getPropertyValue("font-family").replaceAll('"', "") === "Geist") sheet.deleteRule(i);
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

test("no sample line is wider in the shipped fallback face than in Geist", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const widest = await page.evaluate(async (samples) => {
    const result: Record<string, { ratio: number; line: string; faces: string[] }> = {};
    for (const weight of ["400", "500"] as const) {
      const faces = await Promise.all(
        ["Geist", "Geist Fallback"].map(
          async (face) => (await document.fonts.load(`${weight} 100px "${face}"`))[0]?.status ?? "missing",
        ),
      );
      const width = (face: string, line: string) => {
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${weight} 1000px "${face}"`;
        return ctx.measureText(line).width;
      };
      const ratios = samples[weight].map((line) => ({ ratio: width("Geist Fallback", line) / width("Geist", line), line }));
      const top = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      result[weight] = { ...top, faces };
    }
    return result;
  }, fallbackSamples);
  for (const weight of ["400", "500"]) {
    expect(widest[weight].faces, `${weight} web and fallback faces`).toEqual(["loaded", "loaded"]);
    expect(widest[weight].ratio, `"${widest[weight].line}" in the ${weight} fallback against Geist`).toBeLessThanOrEqual(1);
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
    await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
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
      [...document.fonts].filter((f) => f.status === "loaded" && f.family.replaceAll('"', "") === "Geist").map((f) => f.weight),
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
        <ReceiptSummary items={5} total={2804} thumbnail={thumbnail} onView={() => window.views++} onReplace={() => window.replaces++} />
        <ReceiptSummary items={1} total={1599} thumbnail={null} onReplace={() => {}} />
      </View>
    </SafeAreaProvider>,
  );
`;

for (const colorScheme of ["light", "dark"] as const) {
  test(`an enabled primary Button presses, with its reason line above it, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await mountHarness(page, componentHarness);
    const button = page.getByRole("button", { name: "Create split link" });
    await expect(button).toBeVisible();
    const look = await button.evaluate((el) => {
      const reason = document.getElementById(el.getAttribute("aria-describedby")!)!;
      return {
        disabled: el.getAttribute("aria-disabled"),
        reason: reason.textContent,
        reasonAbove: reason.getBoundingClientRect().bottom <= el.getBoundingClientRect().top,
      };
    });
    expect(look).toEqual({
      disabled: null,
      reason: "Items are $0.50 short.",
      reasonAbove: true,
    });
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { presses: number }).presses)).toBe(1);
  });
}

test("the receipt card leads with its title and the total, then the item count and Replace, and opens the photo only when there is one", async ({ page }) => {
  await mountHarness(page, componentHarness);
  const cards = page.getByTestId("receipt");
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.split("\n").filter(Boolean)))).toEqual([
    ["Receipt", "$28.04", "5 items", "Replace"],
    ["Receipt", "$15.99", "1 item", "Replace"],
  ]);
  await expect(page.getByRole("button", { name: "View receipt photo" })).toHaveCount(1);
  await page.getByRole("button", { name: "View receipt photo" }).click();
  await page.getByRole("button", { name: "Replace receipt" }).first().click();
  expect(await page.evaluate(() => [(window as unknown as { views: number }).views, (window as unknown as { replaces: number }).replaces])).toEqual([1, 1]);
});
