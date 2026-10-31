import { addApp, addNames, dropFile, exampleReply, openExample, photo } from "./files";
import { features } from "../src/features";
import { expect, test, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });

const sentence = (page: Page) => page.getByTestId("sentence");
const reasonLine = (page: Page) => page.locator("[role=status][data-problem]");

async function settle(page: Page) {
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

const focusedName = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);

async function stored(page: Page, count: number) {
  await page.addInitScript((n) => {
    for (let i = 0; i < n; i++) {
      const id = `AnaBenCy${String(i).padStart(14, "0")}`;
      localStorage.setItem(`receipt-splitter:split:${id}`, JSON.stringify({ recent: { v: 2, names: ["Ana", "Ben"], total: 990 + i, added: Date.now() - i * 3600e3, seen: Date.now() } }));
    }
  }, count);
}

// Home always lists the newest three, whatever the screen and however long the sentence; on a short screen the page scrolls to them.
for (const [width, height] of [
  [390, 844],
  [375, 667],
] as const) {
  test(`at ${width}x${height} Recent splits shows the newest three and See all, even with a long sentence`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await stored(page, 20);
    await page.goto("/");
    await settle(page);
    const rows = page.getByRole("region", { name: "Recent splits" }).getByRole("link");
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole("button", { name: "See all 20" })).toBeVisible();
    await addApp(page);
    await addNames(page, "Jason", ...Array.from({ length: 8 }, (_, i) => `Guest ${i + 1}`));
    await page.keyboard.press("Escape");
    await expect(rows).toHaveCount(3);
    await rows.last().scrollIntoViewIfNeeded();
    const [last, create] = [(await rows.last().boundingBox())!, (await page.getByRole("button", { name: "Create link" }).boundingBox())!];
    expect(last.y + last.height).toBeLessThanOrEqual(create.y);
  });
}

test("the header's icons and wordmark sit at the same place on home, the Split page's gone state and not-found, with 32 px focus rings", async ({ page }) => {
  const icons = async (path: string) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /SplitWith/ }).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const names = ["How it works", ...(features.coffee ? ["Buy me a coffee"] : []), "Switch to dark mode", "Share link"];
    return page.evaluate((names) =>
      names.map((name) => {
        const face = document.querySelector(`[aria-label="${name}"] [data-press-face]`)!.getBoundingClientRect();
        return [Math.round(face.x + face.width / 2), Math.round(face.y + face.height / 2), Math.round(face.width), Math.round(face.height)];
      }),
      names,
    );
  };
  const home = await icons("/");
  expect(home).toEqual([
    [features.coffee ? 260 : 292, 33, 32, 32],
    ...(features.coffee ? [[292, 33, 32, 32]] : []),
    [324, 33, 32, 32],
    [356, 33, 32, 32],
  ]);
  expect(await icons("/s/nothing-here")).toEqual(home);
  expect(await icons("/nowhere/at-all")).toEqual(home);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /SplitWith/ })).toHaveCount(0);
  await page.goto("/nowhere/at-all");
  await expect(page.getByRole("link", { name: /SplitWith/ }).or(page.getByRole("button", { name: /SplitWith/ }))).toHaveCount(1);
});

test("the not-found page has a heading and a hint above its button", async ({ page }) => {
  await page.goto("/nowhere/at-all");
  await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
  await expect(page.getByText("Check the link, or start a new split.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Split a receipt", exact: true })).toBeVisible();
});

test("a name that fits on a line stays whole, however full the line", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await addNames(page, ...Array.from({ length: 11 }, (_, i) => `Friend number ${i + 1}`));
  await page.keyboard.press("Escape");
  const heights = await page.evaluate(() => [...document.querySelectorAll("[role=group]")].map((g) => g.getBoundingClientRect().height));
  expect(heights).toHaveLength(11);
  expect(Math.max(...heights)).toBeLessThan(50);
});

test("a long name wraps in its head, and its last letters, x and comma stay together", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await addNames(page, "Maximiliana Alexandropoulou-Featherstonehaugh", "Sam");
  await page.keyboard.press("Escape");
  const lines = await page.evaluate(() => {
    const group = document.querySelector('[role=group][aria-label^="Maximiliana"]')!;
    const tail = group.lastElementChild!.getBoundingClientRect();
    const cross = group.querySelector('[aria-label^="Remove "]')!.getBoundingClientRect();
    const next = document.querySelector('[role=group][aria-label="Sam"]')!.getClientRects()[0]!;
    return { height: group.getBoundingClientRect().height, tailMid: tail.top + tail.height / 2, crossMid: cross.top + cross.height / 2, tailLeft: tail.left, crossLeft: cross.left, nextTop: next.top, crossTop: cross.top };
  });
  expect(lines.height).toBeGreaterThan(60);
  expect(Math.abs(lines.tailMid - lines.crossMid)).toBeLessThan(8);
  expect(lines.crossLeft).toBeGreaterThan(lines.tailLeft);
  await expect(sentence(page)).not.toContainText(/\n,/);
});

test("removing a name or an app with the keyboard moves the focus to the next x, else the previous, else the add action or the app left", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await addNames(page, "Jason", "Ann", "Bo");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove Ann" }).focus();
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Remove Bo");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Remove Jason");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Add friends");

  await addApp(page);
  await addApp(page);
  await page.getByRole("button", { name: "Remove Cash App" }).focus();
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Remove PayPal");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Payment app, Venmo");
});

test("a name that is refused stays in the field, and the field stops at 40 characters", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await addNames(page, "Jason");
  const field = page.getByRole("textbox", { name: "Name", exact: true });
  await field.fill("Ann");
  await field.press("Enter");
  // The field capitalizes the first letter, so this is "JASON": the same name in other letters.
  await field.fill("jASON");
  await field.press("Enter");
  await expect(page.getByText("That name is already here.")).toBeVisible();
  await expect(field).toHaveValue("JASON");
  await expect(field).toHaveAttribute("maxlength", "40");
  await field.fill("Jasper");
  await field.press("Enter");
  await expect(field).toHaveValue("");
});

test("a photo dropped after a read replaces it", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await expect(page.getByTestId("receipt")).toContainText("$28.04");
  await dropFile(page, photo("e2e/fixtures/blank.png", "image/png"));
  await expect(page.getByTestId("reading-stage")).toBeVisible();
  await expect(page.getByTestId("receipt")).toContainText("$28.04");
});

test("the footer says nothing while a receipt is read", async ({ page }) => {
  await page.route("**/api/scan", () => new Promise(() => {}));
  await page.goto("/");
  await settle(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add the receipt" }).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(page.getByTestId("reading-stage")).toBeVisible();
  await expect(reasonLine(page)).toHaveText("");
});

test("every handle reason fits two lines beside the Create pill, and the footer keeps its height", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await addNames(page, "Jason");
  await page.keyboard.press("Escape");
  await addApp(page);
  await addApp(page);
  await addApp(page);
  const footerHeight = () => page.evaluate(() => document.querySelector("[role=status][data-problem]")!.parentElement!.parentElement!.getBoundingClientRect().height);
  const calm = await footerHeight();
  const handles: [string, string][] = [
    ["Venmo handle", "jason z"],
    ["Venmo handle", "jason!z"],
    ["Venmo handle", "a".repeat(31)],
    ["Venmo handle", "abc"],
    ["Venmo handle", "12345"],
    ["Cash App handle", "a b"],
    ["Cash App handle", "a_b"],
    ["Cash App handle", "ab\u200bc"],
    ["Venmo handle", "jason\u200bz"],
    ["PayPal handle", "p".repeat(81)],
    ["Zelle handle", "ann​@example.com"],
  ];
  for (const [field, value] of handles) {
    await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
    await page.getByRole("textbox", { name: "Cash App handle" }).fill("");
    await page.getByRole("textbox", { name: "PayPal handle" }).fill("");
    await page.getByRole("textbox", { name: "Zelle handle" }).fill("");
    await page.getByRole("textbox", { name: field }).fill(value);
    const lines = await reasonLine(page).evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines, `${field} ${value}: ${await reasonLine(page).innerText()}`).toBeLessThanOrEqual(2);
    expect(await footerHeight()).toBe(calm);
  }
});

test("a long handle stops short of the line's end, so its period stays beside it and the start of the handle stays in view", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  for (let i = 0; i < 3; i++) await addApp(page);
  const zelle = page.getByRole("textbox", { name: "Zelle handle" });
  await zelle.fill("maximiliana.alexandropoulou.featherstonehaugh@example-university.edu");
  await zelle.blur();
  const run = await zelle.evaluate((input) => {
    const wrapper = input.parentElement!.parentElement!;
    const field = input.getBoundingClientRect();
    const column = document.querySelector('[data-testid="sentence"]')!.getBoundingClientRect();
    return { lines: wrapper.getClientRects().length, scrolled: (input as HTMLInputElement).scrollLeft, room: column.right - field.right };
  });
  expect(run.lines).toBe(1);
  expect(run.scrolled).toBe(0);
  expect(run.room).toBeGreaterThan(0);
});

test("the Create link pill is 50 px tall", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const box = await page.getByRole("button", { name: "Create link" }).boundingBox();
  expect(box!.height).toBe(50);
});

test("when a read finishes, only the new amount fades in, not the words around it", async ({ page }) => {
  await page.addInitScript(() => {
    const faded = new Set<string>();
    Object.assign(window, { faded });
    new MutationObserver(() => {
      for (const el of document.querySelectorAll("[data-testid=receipt] [data-step-in], [data-testid=receipt][data-step-in]")) faded.add(el.textContent ?? "");
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await expect(page.getByTestId("receipt")).toContainText("$28.04");
  expect(await page.evaluate(() => [...(window as unknown as { faded: Set<string> }).faded])).toEqual(["$28.04"]);
});

test("a long place ends in an ellipsis inside the sentence at headline size, with its period beside it", async ({ page, context }) => {
  await page.goto("/");
  await settle(page);
  await openExample(page);
  await context.unroute("**/api/scan");
  await context.route("**/api/scan", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...exampleReply, place: "The Extraordinarily Long Named Neighborhood Gastropub & Brewery" }) }));
  await page.reload();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add the receipt" }).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  const place = page.getByRole("button", { name: /^Place, The Extraordinarily/ });
  await expect(place).toBeVisible();
  const [word, column] = [(await place.boundingBox())!, (await sentence(page).boundingBox())!];
  expect(word.x + word.width).toBeLessThanOrEqual(column.x + column.width - 8);
  expect(word.height).toBeLessThan(80);
});
