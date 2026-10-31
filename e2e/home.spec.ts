import { fallbackSamples } from "../src/ui/home-copy";
import { features } from "../src/features";
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

const appWord = (page: Page, app = "Venmo") => page.getByRole("button", { name: `Payment app, ${app}` });
const appMenu = (page: Page) => page.getByRole("dialog", { name: "Payment app" });
const action = (page: Page) => page.getByRole("button", { name: "Create link" });
const sentence = (page: Page) => page.getByTestId("sentence");
const yourName = (page: Page) => page.getByRole("textbox", { name: "Your name", exact: true });
const venmo = (page: Page) => page.getByRole("textbox", { name: "Venmo handle" });
const removers = (page: Page) => sentence(page).getByRole("button", { name: /^Remove / });
/** The sentence as it reads on screen, one line. */
async function said(page: Page) {
  return (await sentence(page).innerText()).replace(/\u2060/g, "").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
}

test("the empty home at 390 px is one sentence with its blanks and actions, and a gray Create link, and only those words", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(appWord(page)).toBeVisible();
  expect(await said(page)).toBe("I paid the bill. Add the receipt. Friends tap what they had and pay me back on Venmo at. I’m, here with add friends.");
  const words = await sentence(page).innerText();
  expect((await page.locator("#root").innerText()).replace(words, "").split("\n").filter(Boolean)).toEqual(["SplitWith", "Add your name first.", "Create link"]);
  await expect(venmo(page)).toHaveAttribute("placeholder", "@username");
  await expect(yourName(page)).toHaveAttribute("placeholder", "your name");
  await expect(action(page)).toHaveAccessibleDescription("Add your name first.");
  await expect(page.getByRole("button", { name: "Add the receipt" })).toHaveCount(1);
});

test("the header has only the wordmark, How it works, the coffee icon when it is switched on, the theme toggle and Share, and Recent splits shows under the sentence only once there are stored splits", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  const coffee = page.getByRole("link", { name: "Buy me a coffee" });
  if (features.coffee)
    expect([await coffee.getAttribute("href"), await coffee.getAttribute("target"), await coffee.getAttribute("rel")]).toEqual(["https://venmo.com/u/Jason-Zhang-162", "_blank", "noopener noreferrer"]);
  else await expect(coffee).toHaveCount(0);
  const help = page.getByRole("link", { name: "How it works" });
  expect([await help.getAttribute("href"), await help.getAttribute("target")]).toEqual(["/how-it-works", null]);
  // The glyphs sit 32 px apart, the last at the same place as on the Split page.
  const centers = await page.locator("[data-icon]").evaluateAll((icons) =>
    icons
      .filter((icon) => icon.getBoundingClientRect().y < 80 && getComputedStyle(icon.parentElement!).opacity !== "0")
      .map((icon) => [icon.getAttribute("data-icon"), Math.round(icon.getBoundingClientRect().x + icon.getBoundingClientRect().width / 2)]),
  );
  expect(centers).toEqual([["help", features.coffee ? 260 : 292], ...(features.coffee ? [["coffee", 292]] : []), ["sun", 324], ["share", 356]]);
  for (const name of ["Menu", "Example", "Recent splits"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recent splits" })).toHaveCount(0);
  await page.evaluate(() =>
    localStorage.setItem("receipt-splitter:split:AnaBenCy00000000000001", JSON.stringify({ recent: { v: 2, names: ["Ana", "Ben"], you: 0, total: 990, added: Date.now(), seen: Date.now() } })),
  );
  await page.reload();
  await settle(page);
  await expect(page.getByRole("button", { name: "Recent splits", exact: true })).toHaveCount(0);
  const list = page.getByRole("region", { name: "Recent splits" });
  expect((await list.innerText()).split("\n").filter(Boolean)).toEqual(["Recent splits", "Ana and Ben", "Today · 2 people", "$9.90", "You paid"]);
  await expect(list.getByRole("link", { name: "Ana and Ben, Today, 2 people, $9.90, You paid" })).toHaveAttribute("href", "/s/AnaBenCy00000000000001");
});

test("Add the receipt takes keyboard focus with a visible ring at 390 px", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
});

test("Add the receipt takes keyboard focus with a visible ring at 1280 px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  await settle(page);
  const button = await tabTo(hero(page));
  await expect(button).toBeFocused();
  expect(await focusRing(button)).toEqual(["solid", "2px"]);
  await context.close();
});

const venmoRule = "Venmo usernames need at least 5 characters.";

async function addHost(page: Page, name: string) {
  await yourName(page).fill(name);
  await yourName(page).press("Enter");
}

test("with no way to pay, Create link shows no note and creates the Split", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await addHost(page, "Jason");
  await expect(action(page)).not.toHaveAttribute("aria-describedby");
  await action(page).click();
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{24}$/);
});

test("with no name, Create link names what is missing before a tap, and a tap opens the name field without creating", async ({ page }) => {
  const creates: string[] = [];
  page.on("request", (request) => request.url().includes("/api/splits") && creates.push(request.url()));
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await expect(action(page)).toHaveAccessibleDescription("Add your name first.");
  await expect(page.getByText("Add your name first.")).toBeVisible();
  await action(page).click();
  await expect(yourName(page)).toBeFocused();
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
  await expect(yourName(page)).toBeFocused();

  const reasonLine = page.locator("[role=status][data-problem]");
  await expect(reasonLine).toHaveText("Add your name first.");
  await expect(reasonLine).toHaveAttribute("data-problem", "true");

  const chooser = page.waitForEvent("filechooser");
  await hero(page).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(page.getByTestId("reading-stage")).toBeVisible();
  await expect(reasonLine).toHaveText("");
  await expect(reasonLine).toHaveAttribute("data-problem", "false");
  finishRead();
  await expect(page.getByTestId("receipt")).toBeVisible();
  await venmo(page).fill("test");
  await action(page).click();
  await expect(venmo(page)).toBeFocused();

  await venmo(page).fill("jason-z");
  await action(page).click();
  await expect(yourName(page)).toBeFocused();
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

    await yourName(page).tap();
    const name = yourName(page);
    await expect(name).toBeFocused();
    await expect.poll(() => aboveKeyboard(name)).toBe(true);
  });

  test("the window never scrolls, and the page rests where it was when the keyboard goes", async ({ page }) => {
    const scrolled = () => page.evaluate(() => [window.scrollY, document.querySelector("h1")!.getBoundingClientRect().top]);
    const rest = await scrolled();
    await venmo(page).tap();
    await keyboardUp(page);
    await yourName(page).tap();
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

      await yourName(page).tap();
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

test("at 320 px a 40-letter name and twelve more stay inside the column, and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await settle(page);
  await yourName(page).fill("A".repeat(40));
  await yourName(page).press("Enter");
  for (let i = 1; i <= 12; i++) {
    await page.keyboard.type(`Guest ${i}`);
    await page.keyboard.press("Enter");
  }
  await expect(removers(page)).toHaveCount(13);
  const words = (await sentence(page).boundingBox())!;
  const longName = await sentence(page).getByRole("group", { name: `${"A".repeat(40)}, you` }).evaluate((group) => {
    const text = document.createRange();
    text.selectNodeContents(group.firstElementChild!);
    return [...new Set([...text.getClientRects()].map((line) => `${Math.round(line.top)} ${Math.round(line.right)}`))].map((line) => Number(line.split(" ")[1]));
  });
  expect(longName.length).toBeGreaterThan(1);
  for (const right of longName) expect(right).toBeLessThanOrEqual(Math.round(words.x + words.width));
  const besideItsName = await removers(page).evaluateAll((buttons) =>
    buttons.map((button) => {
      const name = button.previousElementSibling!.getBoundingClientRect();
      const x = button.getBoundingClientRect();
      return x.top + x.height / 2 >= name.top && x.top + x.height / 2 <= name.bottom && x.left + x.width / 2 >= name.left;
    }),
  );
  expect(besideItsName).toEqual(Array(13).fill(true));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
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
  test(`at ${width} px home is the Split page's centered frame: the sentence at its left edge, Create link under the sentence with its reason after it, and no footer bar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await settle(page);
    // 680 px for the sentence and a column beside it, 112 px apart from 1280 px and 56 under it.
    const inner = Math.min(width - 96, width >= 1280 ? 680 + 112 + 420 : 680 + 56 + 380);
    const left = Math.round((width - inner) / 2);
    const words = await centerOf(sentence(page));
    const reason = (await page.locator("[role=status][data-problem]").boundingBox())!;
    const create = (await action(page).boundingBox())!;
    const wordmark = (await page.getByRole("heading", { name: "SplitWith" }).boundingBox())!;
    expect([Math.round(wordmark.x), words.left, Math.round(create.x)]).toEqual([left, left, left]);
    expect(create.y).toBeGreaterThan((await sentence(page).boundingBox())!.y + 100);
    expect(reason.x).toBeGreaterThan(create.x + create.width);
    expect(Math.abs(reason.y + reason.height / 2 - (create.y + create.height / 2))).toBeLessThan(2);
    expect(create.y + create.height).toBeLessThan(900 - 100);
  });
}

test("add friends opens a friend field before your name is in, Enter keeps it open, and your name's Enter moves on to the friends", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: "Add friends" }).click();
  const next = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(next).toBeFocused();

  for (const name of ["Sam", "Priya"]) {
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await expect(removers(page)).toHaveCount(2);
  expect(await removers(page).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))).toEqual(["Remove Sam", "Remove Priya"]);
  await expect(next).toBeFocused();
  await expect(next).toHaveValue("");
  await expect(yourName(page)).toHaveCount(1);
  await page.locator("h1").click();
  await expect.poll(() => said(page)).toContain("I’m, here with Sam, Priya and add more.");

  await yourName(page).click();
  await page.keyboard.type("Jason");
  await page.keyboard.press("Enter");
  await expect(next).toBeFocused();
  await expect(yourName(page)).toHaveCount(0);
  await page.keyboard.type("Priya");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That name is already here.");
  await page.locator("h1").click();
  await expect.poll(() => said(page)).toContain("I’m Jason, here with Sam, Priya and add more.");
});

// iOS Safari marks the return key with keyCode 229 when it pressed the key for its own text system, as with a pending autocorrect, and React Native
// Web drops every such Enter. An input method (Japanese, Chinese) composes first, and its 229 Enter only confirms the composition.
const enterAs229 = (field: Locator, { composed }: { composed: boolean }) =>
  field.evaluate((input, composed) => {
    if (composed) input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    if (composed) input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    for (const type of ["keydown", "keyup"]) input.dispatchEvent(new KeyboardEvent(type, { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }));
  }, composed);

test("an Enter that iOS marks as its own (keyCode 229) still adds the name, but one that confirms an input method's text does not", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: "Add friends" }).click();
  const next = page.getByRole("textbox", { name: "Name", exact: true });
  await page.keyboard.type("Dwight");
  await enterAs229(next, { composed: false });
  await expect(sentence(page).getByRole("group", { name: "Dwight", exact: true })).toBeVisible();
  await expect(next).toBeFocused();
  await expect(next).toHaveValue("");

  await page.keyboard.type("Kenji");
  await enterAs229(next, { composed: true });
  await expect(next, "confirming the input method's text leaves the name to be finished").toHaveValue("Kenji");
  await expect(sentence(page).getByRole("group", { name: "Kenji", exact: true })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(sentence(page).getByRole("group", { name: "Kenji", exact: true })).toBeVisible();
});

test("names are not autocorrected or spell-checked, so a friend's name goes in as typed", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: "Add friends" }).click();
  for (const field of [yourName(page), page.getByRole("textbox", { name: "Name", exact: true })]) {
    await expect(field).toHaveAttribute("autocorrect", "off");
    await expect(field).toHaveAttribute("spellcheck", "false");
  }
});

test("a tap on add friends while a typed name waits for Enter keeps the name and opens the friend field", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await yourName(page).click();
  await page.keyboard.type("Jason");
  await page.getByRole("button", { name: "Add friends" }).click();
  await expect(sentence(page).getByRole("group", { name: "Jason, you" })).toBeVisible();
  const next = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(next).toBeFocused();
  await page.keyboard.type("Sam");
  await page.keyboard.press("Enter");
  await expect(sentence(page).getByRole("group", { name: "Sam", exact: true })).toBeVisible();
});

test("the Host is the first name, named \"<name>, you\", and a name leaves with its remove button", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await yourName(page).click();
  for (const name of ["Jason", "Sam"]) {
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await expect(sentence(page).getByRole("group")).toHaveCount(2);
  await expect(sentence(page).getByRole("group", { name: "Jason, you" })).toBeVisible();
  await expect(sentence(page).getByRole("group", { name: "Sam", exact: true })).toBeVisible();
  await sentence(page).getByRole("button", { name: "Remove Sam" }).click();
  await expect(sentence(page).getByRole("group")).toHaveCount(1);
});

test("the handle placeholder fits its field at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await settle(page);
  const fit = await venmo(page).evaluate((input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.letterSpacing = style.letterSpacing;
    // The field sizes to its placeholder, so compare against its fractional width: clientWidth rounds and can land either side of the text.
    const room = input.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    return { placeholder: input.placeholder, fits: ctx.measureText(input.placeholder).width <= room + 0.5 };
  });
  expect(fit).toEqual({ placeholder: "@username", fits: true });
  await expect(appWord(page)).toBeVisible();
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
  expect(icons).toEqual([icon("help"), ...(features.coffee ? [icon("coffee")] : []), icon("sun"), icon("moon"), icon("share"), icon("chevron"), icon("arrow")]);
});

test("the app's name opens the app menu: the four apps with Venmo first and ticked, then Add a second app, and a pick switches the app", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await appWord(page).click();
  await expect(appWord(page)).toHaveAttribute("aria-expanded", "true");
  await expect(appMenu(page).getByRole("button")).toHaveText(["Venmo", "Cash App", "PayPal", "Zelle", "Add a second app"]);
  await expect(appMenu(page).getByRole("button", { name: "Venmo" })).toHaveAttribute("aria-pressed", "true");
  await appMenu(page).getByRole("button", { name: "Zelle" }).click();
  await expect(appMenu(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Zelle handle" })).toHaveAttribute("placeholder", "email or phone");
  await expect(appWord(page, "Zelle")).toHaveAttribute("aria-expanded", "false");
});

test("Add a second app in the app menu adds the next free app with its field focused, an x follows each app's name, and an x takes its app away", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(page.getByRole("button", { name: "Remove Venmo" })).toHaveCount(0);
  await appWord(page).click();
  await appMenu(page).getByRole("button", { name: "Add a second app" }).click();
  await expect(page.getByRole("textbox", { name: "Cash App handle" })).toBeFocused();
  await expect(appMenu(page)).toHaveCount(0);
  expect(await said(page)).toContain("pay me back on Venmo at or Cash App at.");
  // The second clause's menu lists only the apps the first doesn't use, and adds a third.
  await appWord(page, "Cash App").click();
  await expect(appMenu(page).getByRole("button")).toHaveText(["Cash App", "PayPal", "Zelle", "Add another app"]);
  await page.keyboard.press("Escape");
  await expect(appMenu(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Venmo" }).click();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Cash App" })).toHaveCount(0);
  expect(await said(page)).toContain("pay me back on Cash App at.");
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
  test(`the fallback faces keep every text line outside the sentence, and the sentence's box, where Geist puts them at ${width} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: phone.height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await settle(page);
    const layout = () =>
      page.evaluate(() => ({
        faces: [...document.fonts].filter((f) => f.family.replaceAll('"', "") === "Geist").length,
        sentence: (() => {
          const { top, height, width } = document.querySelector('[data-testid="sentence"]')!.getBoundingClientRect();
          return [top, height, width].map(Math.round);
        })(),
        lines: [...document.querySelectorAll("#root *")]
          .filter((el) => el.childElementCount === 0 && el.textContent?.trim() && el.localName !== "option" && !el.closest('[data-testid="sentence"]'))
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
    expect(fallback.sentence).toEqual(web.sentence);
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
  window.presses = 0;
  createRoot(document.getElementById("root")).render(
    <SafeAreaProvider>
      <View style={{ width: 350, padding: 20, gap: 16 }}>
        <Button label="Create split link" onPress={() => window.presses++} reason="Items are $0.50 short." />
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
