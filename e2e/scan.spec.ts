import { expect, test, type Page } from "@playwright/test";

import { dropFile, dropZone, openExample, pasteFile, photo } from "./files";

test.use({ viewport: { width: 390, height: 844 } });

const receipt1040 = "bench/data/srd-1040.jpg";
const scanTimeout = { timeout: 60_000 };

const action = (page: Page) => page.getByRole("button", { name: "Create split link" });

async function choose(page: Page, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Add|Drop a) receipt/ }).click();
  await (await chooser).setFiles(file);
}

const items = (page: Page) => page.getByRole("list", { name: "Items" }).getByRole("listitem");

async function readItems(page: Page) {
  return items(page).evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll("input")].map((input) => input.value).join(" ")),
  );
}

const card = (page: Page) => page.getByTestId("receipt");

const draftItems = (page: Page) =>
  page.evaluate(() =>
    (JSON.parse(localStorage.getItem("receipt-splitter:draft")!).draft.scan.receipt.items as { name: string; price: number }[]).map(
      ({ name, price }) => `${name} ${(price / 100).toFixed(2)}`,
    ),
  );

const items1040 = [
  "Chicken Fried Rice And Egg 7.99",
  "California Tropic And Miso 7.99",
  "Add Two Tostones 1.00",
  "Sprite 2.50",
  "Perrier Sparkling Water 3.50",
];

const amount = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

async function addName(page: Page, name: string) {
  const first = await page.getByRole("button", { name: "Your name" }).count();
  await page.getByRole("button", { name: first ? "Your name" : "Add a name" }).click();
  await page.getByRole("textbox", { name: first ? "Your name" : "Name", exact: true }).fill(name);
  await page.keyboard.press("Enter");
}

async function noteLook(page: Page) {
  const described = await action(page).getAttribute("aria-describedby");
  return page.locator(`[id="${described}"]`).evaluate((note) => {
    const style = getComputedStyle(note);
    return [style.backgroundColor, style.color];
  });
}

async function blockedBy(page: Page) {
  const button = action(page);
  const described = await button.getAttribute("aria-describedby");
  return {
    disabled: await button.getAttribute("aria-disabled"),
    reason: described ? await page.locator(`[id="${described}"]`).textContent() : null,
  };
}

test("the synthetic Topgolf receipt reads as two Beer Bucket Bundles, and the link carries each Bundle with its own Items", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await choose(page, "e2e/fixtures/topgolf-synthetic.png");
  await expect(card(page)).toBeVisible(scanTimeout);

  expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["topgolf-synthetic.png", "9 items", "$207.29"]);
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  expect(await draftItems(page)).toEqual([
    "Gameplay 87.75",
    "Michelob Ultra 16oz Aluminum Bottle 6.29",
    "Guinness Draught 14.9oz Can 21.87",
    "High Noon Pineapple 12oz Can 8.49",
    "High Noon Watermelon 12oz Can 8.49",
    "Michelob Ultra 16oz Aluminum Bottle 6.29",
    "Guinness Draught 14.9oz Can 14.58",
    "High Noon Pineapple 12oz Can 8.49",
    "High Noon Watermelon 12oz Can 16.98",
  ]);
  expect(
    await page.evaluate(() =>
      (JSON.parse(localStorage.getItem("receipt-splitter:draft")!).draft.scan.receipt.adjustments as { name: string; amount: number }[]).map(({ name, amount }) => `${name} ${amount}`),
    ),
  ).toEqual(["Beer Bucket Discount (10%) -451", "Beer Bucket Discount (10%) -463", "Tax 494"]);

  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addName(page, "Jason");
  const created = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/splits"));
  await action(page).click();
  const bundles = (await created).postDataJSON().split.receipt.adjustments.flatMap((row: { kind: string; amount: number; bundle?: object }) =>
    row.kind === "bundleDiscount" ? [[row.amount, row.bundle]] : [],
  );

  expect(bundles).toEqual([
    [-451, { name: "Beer Bucket", items: ["i2", "i3", "i4", "i5"] }],
    [-463, { name: "Beer Bucket", items: ["i6", "i7", "i8", "i9"] }],
  ]);
});

test.describe("reading SRD receipt 1040", () => {
  test.setTimeout(120_000);

  test("chosen through the picker, it reads five Items, Tip $0.00, Total $28.04, and Create split link with no handle goes to the Venmo handle", async ({ page }) => {
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByRole("status", { name: "Reading receipt" })).toBeVisible();
    await expect(card(page)).toBeVisible(scanTimeout);

    expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["srd-1040.jpg", "5 items", "$28.04"]);
    await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
    expect(await draftItems(page)).toEqual(items1040);
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
    await action(page).click();
    await expect(page.getByRole("textbox", { name: "Venmo handle" })).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
    expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Add your name." });
    await addName(page, "Jason");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  });
});

test.describe("fixing the Example receipt in the home editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await openExample(page);
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("receipt-splitter:draft")!);
      saved.draft.scan.fixOnHome = true;
      localStorage.setItem("receipt-splitter:draft", JSON.stringify(saved));
    });
    await page.reload();
    await expect(page.getByRole("list", { name: "Items" })).toBeVisible();
    await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
    await addName(page, "Jason");
  });

  test("a price edit that breaks the Total check highlights the row and notes the gap, unhighlighted, without blocking Create split link", async ({ page }) => {
    const perrier = page.getByRole("textbox", { name: /^Price of Perrier Sparkling Water/ });
    await perrier.click();
    await page.keyboard.type("3.00");
    const flagged = () => items(page).evaluateAll((rows) => rows.filter((row) => row.dataset.flagged === "true").map((row) => row.querySelector("input")!.value));
    await expect.poll(flagged).toEqual(["Perrier Sparkling Water"]);
    await expect(page.getByRole("textbox", { name: "Price of Perrier Sparkling Water, check this price" })).toBeVisible();
    await expect.poll(() => blockedBy(page)).toEqual({ disabled: null, reason: "Items are $0.50 short of the subtotal." });
    expect(await noteLook(page)).toEqual(["rgba(0, 0, 0, 0)", "rgb(105, 109, 116)"]);

    await perrier.fill("3.50");
    expect(await flagged()).toEqual([]);
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  });

  test("a tip typed as 4.60 moves the Total to $32.64 and keeps the action enabled", async ({ page }) => {
    await amount(page, "Tip").click();
    await page.keyboard.type("4.60");
    await amount(page, "Tip").blur();
    await expect(amount(page, "Tip")).toHaveValue("$4.60");
    await expect(amount(page, "Total")).toHaveValue("$32.64");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  });

  test("adding a missing Item and deleting a row each update the note in one step", async ({ page }) => {
    await page.getByRole("button", { name: "Remove Sprite" }).click();
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Items are $2.50 short of the subtotal." });
    await page.getByRole("button", { name: "Add item" }).click();
    expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Name every item." });
    await page.getByRole("textbox", { name: "Name of item 5" }).fill("Sprite");
    await page.getByRole("textbox", { name: "Price of Sprite" }).fill("2.50");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
    expect(await readItems(page)).toEqual([
      "Chicken Fried Rice And Egg 7.99",
      "California Tropic And Miso 7.99",
      "Add Two Tostones 1.00",
      "Perrier Sparkling Water 3.50",
      "Sprite 2.50",
    ]);
  });
});

test("a failed read opens the empty editor with the file row, and two typed Items and a total pass the check", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await choose(page, "e2e/fixtures/blank.png");
  await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);
  await expect(page.getByText("blank.png")).toBeVisible();
  await expect(page.getByText("0 items")).toBeVisible();
  expect(await readItems(page)).toEqual([]);
  expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Add an item." });

  for (const [n, name, price] of [
    [1, "Pad thai", "14.00"],
    [2, "Iced tea", "4.00"],
  ]) {
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByRole("textbox", { name: `Name of item ${n}` }).fill(String(name));
    await page.getByRole("textbox", { name: `Price of ${name}` }).fill(String(price));
  }
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Items are $18.00 over the total." });
  await amount(page, "Total").fill("18.00");
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  await expect(page.getByText("2 items")).toBeVisible();

  await amount(page, "Tip").fill("4.60");
  await page.getByRole("textbox", { name: /^Price of Iced tea/ }).fill("3.00");
  await expect(amount(page, "Total")).toHaveValue("$22.60");
  await page.reload();
  await expect(amount(page, "Tip")).toHaveValue("$4.60");
  await expect(page.getByRole("textbox", { name: /^Price of Iced tea/ })).toHaveValue("3.00");
  await expect(amount(page, "Total")).toHaveValue("$22.60");
  expect(await readItems(page)).toEqual(["Pad thai 14.00", "Iced tea 3.00"]);
});

test("a scan that fails the Total check shows the card, a quiet note, and still creates the link", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `198.53.${testInfo.workerIndex}.${testInfo.retry + 1}` } }));
  await page.goto("/");
  await choose(page, "e2e/fixtures/srd-1040-no-sprite.jpg");
  await expect(card(page)).toBeVisible(scanTimeout);

  expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["srd-1040-no-sprite.jpg", "4 items", "$28.04"]);
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Items are $2.50 short of the subtotal." });
  expect(await noteLook(page)).toEqual(["rgba(0, 0, 0, 0)", "rgb(105, 109, 116)"]);

  await action(page).click();
  await expect(page).toHaveURL(/\/s\/[\w-]+$/, { timeout: 30_000 });
});

test.describe("the photo viewer", () => {
  test.setTimeout(120_000);
  const viewer = (page: Page) => page.getByRole("dialog");
  const view = (page: Page) => page.getByRole("button", { name: "View receipt photo" }).click();

  test("at 390 px the thumbnail opens the photo full screen, and its close button and Escape close it", async ({ page }) => {
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(card(page)).toBeVisible(scanTimeout);

    await view(page);
    await expect(viewer(page).getByRole("img", { name: "srd-1040.jpg" })).toBeVisible();
    await expect(viewer(page).getByText("srd-1040.jpg")).toBeVisible();
    await viewer(page).getByRole("button", { name: "Close photo" }).click();
    await expect(viewer(page)).toHaveCount(0);

    await view(page);
    await expect(viewer(page).getByRole("button", { name: "Close photo" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);
  });

  test("at 1280 px a click on the scrim and Escape close the photo, and the camera on the card replaces it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(card(page)).toBeVisible(scanTimeout);

    await view(page);
    await expect(viewer(page).getByRole("img", { name: "srd-1040.jpg" })).toBeVisible();
    await page.mouse.click(20, 400);
    await expect(viewer(page)).toHaveCount(0);
    await view(page);
    await expect(viewer(page).getByRole("button", { name: "Close photo" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);

    const chooser = page.waitForEvent("filechooser");
    await card(page).getByRole("button", { name: "Replace receipt" }).click();
    await (await chooser).setFiles("e2e/fixtures/srd-1040-no-sprite.jpg");
    await expect(card(page)).toContainText("srd-1040-no-sprite.jpg", scanTimeout);
    await view(page);
    await expect(viewer(page).getByRole("img", { name: "srd-1040-no-sprite.jpg" })).toBeVisible();
  });

  test("the Example has no photo, so its card has nothing to open", async ({ page }) => {
    await page.goto("/");
    await openExample(page);
    await expect(card(page)).toContainText("Example receipt");
    await expect(page.getByRole("button", { name: "View receipt photo" })).toHaveCount(0);
  });
});

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 820 }, isMobile: false, hasTouch: false });
  test.setTimeout(120_000);

  test("an image dropped on the page and an image pasted both read, a PDF gets one refusal line, and a drop on the read state changes nothing", async ({ page }) => {
    await page.goto("/");
    const zone = page.getByRole("button", { name: /^Drop a receipt/ });

    await expect(dropZone(page)).toBeVisible();
    await dropFile(page, { name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
    await expect(page.getByText("That file is not a photo.")).toBeVisible();
    await expect(zone).toBeVisible();

    await pasteFile(page, photo("e2e/fixtures/blank.png", "image/png"));
    await expect(page.getByText("blank.png")).toBeVisible(scanTimeout);
    await expect(page.getByText("0 items")).toBeVisible();

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(dropZone(page)).toBeVisible();
    await dropFile(page, photo(receipt1040));
    await expect(card(page)).toContainText("5 items", scanTimeout);
    await expect(card(page)).toContainText("srd-1040.jpg");

    await dropFile(page, photo("e2e/fixtures/blank.png", "image/png"));
    await pasteFile(page, photo("e2e/fixtures/blank.png", "image/png"));
    await page.waitForTimeout(500);
    await expect(page.getByText("srd-1040.jpg")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

async function holdTheDownload(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/models/en_PP-OCRv5_rec_mobile.dict.txt", async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

test.describe("the reading state", () => {
  test.setTimeout(120_000);

  test("darkens the slip's lines one at a time and stops when the Items show", async ({ page }) => {
    const release = await holdTheDownload(page);
    await page.goto("/");
    await choose(page, receipt1040);
    const lines = page.getByTestId("reading-line");
    await expect(lines).toHaveCount(7);
    const darkAt = await lines.evaluateAll((all) =>
      all.map((line) => {
        const effect = line.getAnimations()[0].effect as KeyframeEffect;
        return effect.getKeyframes().find((frame) => Number(frame.opacity) === 1)!.computedOffset;
      }),
    );
    expect(darkAt.every((at, i) => i === 0 || at > darkAt[i - 1])).toBe(true);
    const darkFrom = await lines.evaluateAll((all) => {
      const animations = all.map((line) => line.getAnimations()[0]);
      animations.forEach((animation) => animation.pause());
      const cycle = Number(animations[0].effect!.getComputedTiming().duration);
      const first: (number | null)[] = all.map(() => null);
      for (let time = 0; time <= cycle; time += 5) {
        animations.forEach((animation) => (animation.currentTime = time));
        all.forEach((line, i) => {
          if (first[i] === null && Number(getComputedStyle(line).opacity) > 0.9) first[i] = time;
        });
      }
      return first;
    });
    const order = darkFrom.map((at, line) => ({ at: at ?? Infinity, line })).sort((a, b) => a.at - b.at).map(({ line }) => line);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6]);

    release();
    await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);
    await expect(lines).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("under reduced motion holds the lines still and runs no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const release = await holdTheDownload(page);
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByRole("status", { name: "Reading receipt" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.getByTestId("reading-line").count()).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    release();
    await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);
  });
});

test("a reload keeps the draft, and once the model is cached a reload and a new scan work offline", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await choose(page, receipt1040);
  await expect(card(page)).toBeVisible(scanTimeout);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await expect
    .poll(() => page.evaluate(async () => (await caches.match("/")) !== undefined && navigator.serviceWorker.controller !== null), { timeout: 30_000 })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(card(page)).toContainText("$28.04");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
  expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Add your name." });

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Replace receipt" }).click();
  await (await chooser).setFiles("e2e/fixtures/srd-1040-no-sprite.jpg");
  await expect(card(page)).toContainText("srd-1040-no-sprite.jpg", scanTimeout);
  await expect(card(page)).toContainText("4 items");
  await expect(card(page)).toContainText("$28.04");
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
});

test("the payment apps and names follow the Host's choices and survive a reload", async ({ page }) => {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("combobox", { name: "Payment app" }).selectOption("cashApp");
  await expect(page.getByRole("textbox", { name: "Cash App handle" })).toHaveAttribute("placeholder", "$cashtag");
  await page.getByRole("button", { name: "Add another payment app" }).click();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveAttribute("placeholder", "@username");
  for (const name of ["Jason", "Sam", "Priya"]) await addName(page, name);
  await page.getByRole("button", { name: "Remove Sam" }).click();
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");

  await page.reload();
  const people = page.getByRole("group", { name: "People at the table" });
  await expect(people).toContainText("Priya");
  expect((await people.innerText()).split("\n").filter(Boolean)).toEqual(["Jason", "Priya", "Add"]);
  expect(await page.getByRole("combobox", { name: "Payment app" }).evaluateAll((pickers) => pickers.map((picker) => (picker as HTMLSelectElement).value))).toEqual([
    "cashApp",
    "venmo",
  ]);
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
});

test.describe("the sheet", () => {
  const grab = (page: Page) => page.locator("[data-sheet-grab]");
  const sheetTop = (page: Page) => page.locator("[data-sheet-surface]").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const actionTop = async (page: Page) => Math.round((await action(page).boundingBox())!.y);

  async function drag(page: Page, by: number, { steps = 12, stepMs = 16 } = {}) {
    const box = (await grab(page).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const start = Date.now() / 1000;
    const at = (step: number) => start + (step * stepMs) / 1000;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }], timestamp: at(0) });
    for (let step = 1; step <= steps; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (by * step) / steps }], timestamp: at(step) });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: at(steps) });
  }

  test("a drag down on the grab handle collapses it to the action, follows the finger, and a flick up opens it again", async ({ page }) => {
    await page.goto("/");
    await openExample(page);
    const open = { sheet: await sheetTop(page), action: await actionTop(page) };
    const handle = page.getByRole("textbox", { name: "Venmo handle" });

    await drag(page, 160);
    await expect(grab(page)).toHaveAttribute("aria-expanded", "false");
    await expect(handle).toBeHidden();
    expect(await actionTop(page)).toBe(open.action);
    expect(await sheetTop(page)).toBeGreaterThan(open.sheet);

    await drag(page, -50, { steps: 3, stepMs: 8 });
    await expect(grab(page)).toHaveAttribute("aria-expanded", "true");
    await expect(handle).toBeVisible();
    await expect.poll(() => sheetTop(page)).toBe(open.sheet);
  });

  test("a slow short drag springs back open, and the handle toggles with a tap or the keyboard", async ({ page }) => {
    await page.goto("/");
    const open = await sheetTop(page);
    await drag(page, 25, { steps: 10, stepMs: 50 });
    await expect.poll(() => sheetTop(page)).toBe(open);
    await expect(grab(page)).toHaveAttribute("aria-expanded", "true");

    await grab(page).tap();
    await expect(grab(page)).toHaveAttribute("aria-expanded", "false");
    await grab(page).focus();
    await page.keyboard.press("Enter");
    await expect(grab(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => sheetTop(page)).toBe(open);
  });

  test("a touch while the sheet settles catches it where it is, and a tap then sends it back the other way", async ({ page }) => {
    await page.goto("/");
    await expect(grab(page)).toBeVisible();
    const open = await sheetTop(page);
    const offset = () => page.locator("[data-sheet-surface]").evaluate((el) => Math.round(new DOMMatrix(getComputedStyle(el).transform).f));
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd", dy = 0) => {
      const box = (await grab(page).boundingBox())!;
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 + dy };
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [point] });
    };
    const cdp = await page.context().newCDPSession(page);
    await touch("touchStart");
    await touch("touchMove", 70);
    await touch("touchEnd");
    const released = await offset();
    await expect.poll(offset).not.toBe(released);
    await touch("touchStart");
    const caught = await offset();
    await page.waitForTimeout(200);
    const held = await offset();
    await touch("touchEnd");

    expect(caught).toBeGreaterThan(0);
    expect(held).toBe(caught);
    await expect(grab(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => sheetTop(page)).toBe(open);
  });

  test("a tall sheet scrolls its own content and keeps the action on screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Add another payment app" }).click();
    for (const name of ["Jason", "Sam", "Priya", "Lee", "Ana", "Jo", "Kai"]) await addName(page, name);
    const scrolls = await page.locator("[data-sheet-surface]").evaluate((sheet) =>
      [...sheet.querySelectorAll("div")].some((el) => getComputedStyle(el).overflowY === "auto" && el.scrollHeight > el.clientHeight),
    );
    expect(scrolls).toBe(true);
    await expect(action(page)).toBeInViewport();
  });
});

test("an EXIF-rotated phone photo reads upright", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await choose(page, "e2e/fixtures/srd-1040-exif-rotated.jpg");
  await expect(card(page)).toContainText("$28.04", scanTimeout);
  expect(await draftItems(page)).toEqual(items1040);
});
