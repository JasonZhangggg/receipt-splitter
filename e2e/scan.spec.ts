import { expect, test, type Page } from "@playwright/test";

import { frames, runs, sample } from "./motion";
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

const card = (page: Page) => page.getByTestId("receipt");

type SentReceipt = { items: { name: string; price: number }[]; adjustments: { name: string; amount: number }[] };

/** What Create split link sends, caught before it reaches the Worker so no Split is made. */
async function sentReceipt(page: Page): Promise<SentReceipt> {
  await page.route("**/api/splits", (route) => route.abort());
  const sent = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/splits"));
  await action(page).click();
  const receipt: SentReceipt = (await sent).postDataJSON().split.receipt;
  await page.unroute("**/api/splits");
  return receipt;
}

const itemsOf = ({ items }: SentReceipt) => items.map(({ name, price }) => `${name} ${(price / 100).toFixed(2)}`);

const items1040 = [
  "Chicken Fried Rice And Egg 7.99",
  "California Tropic And Miso 7.99",
  "Add Two Tostones 1.00",
  "Sprite 2.50",
  "Perrier Sparkling Water 3.50",
];

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

  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addName(page, "Jason");
  const created = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/splits"));
  await action(page).click();
  const sent = (await created).postDataJSON().split.receipt;
  expect(itemsOf(sent)).toEqual([
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
  expect(sent.adjustments.map(({ name, amount }: { name: string; amount: number }) => `${name} ${amount}`)).toEqual([
    "Beer Bucket Discount (10%) -451",
    "Beer Bucket Discount (10%) -463",
    "Tax 494",
    "Tip 3226",
  ]);
  const bundles = sent.adjustments.flatMap((row: { kind: string; amount: number; bundle?: object }) => (row.kind === "bundleDiscount" ? [[row.amount, row.bundle]] : []));

  expect(bundles).toEqual([
    [-451, { name: "Beer Bucket", items: ["i2", "i3", "i4", "i5"] }],
    [-463, { name: "Beer Bucket", items: ["i6", "i7", "i8", "i9"] }],
  ]);
});

test.describe("reading SRD receipt 1040", () => {
  test.setTimeout(120_000);

  test("chosen through the picker, it reads five Items, Tip $0.00, Total $28.04, and Create split link with no name says so and opens the name field", async ({ page }) => {
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByRole("status", { name: "Reading receipt" })).toBeVisible();
    await expect(card(page)).toBeVisible(scanTimeout);

    expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["srd-1040.jpg", "5 items", "$28.04"]);
    await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Add your name." });
    await action(page).click();
    await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Jason");
    await page.keyboard.press("Enter");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
    expect(itemsOf(await sentReceipt(page))).toEqual(items1040);
  });
});

test("a read with a price over the limit creates the link, and the Split page fixes the row the note points at", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `198.54.${testInfo.workerIndex}.${testInfo.retry + 1}` } }));
  await page.goto("/");
  await choose(page, "e2e/fixtures/example-price-over-limit.png");
  await expect(card(page)).toBeVisible(scanTimeout);

  expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["example-price-over-limit.png", "5 items", "$28.04"]);
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Items are $3.50 short of the subtotal." });

  await action(page).click();
  await expect(page).toHaveURL(/\/s\/[\w-]+$/, { timeout: 30_000 });
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByText("Items are $3.50 short of the subtotal.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Open Perrier Sparkling Water, \$0\.00/ }).click();
  await page.getByRole("dialog", { name: "Item" }).getByRole("textbox", { name: "Price" }).fill("3.50");
  await page.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("button", { name: /^Open Perrier Sparkling Water, \$3\.50/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Items are $3.50 short of the subtotal.")).toHaveCount(0);
});

test("a read with no Items keeps Create split link off with its reason, and home offers no editor", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await choose(page, "e2e/fixtures/blank.png");
  await expect(card(page)).toBeVisible(scanTimeout);

  expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["blank.png", "0 items", "$0.00"]);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add item" })).toHaveCount(0);
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Couldn't read any items. Try another photo." });
  const picker = page.waitForEvent("filechooser");
  await action(page).click();
  await picker;
  await expect(page).toHaveURL(/\/$/);
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
    await frames(page, 3);
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
    await frames(page, 3);
    expect(await page.getByTestId("reading-line").count()).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    release();
    await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);
  });
});

test("a reload keeps only the handle, and once the model is cached a reload and a new scan work offline", async ({ page, context }) => {
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
  await expect(page.getByRole("button", { name: /^Add receipt/ })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");

  await choose(page, "e2e/fixtures/srd-1040-no-sprite.jpg");
  await expect(card(page)).toContainText("srd-1040-no-sprite.jpg", scanTimeout);
  await expect(card(page)).toContainText("4 items");
  await expect(card(page)).toContainText("$28.04");
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
});

test("the payment apps and handles follow the Host's choices and survive a reload, and the names do not", async ({ page }) => {
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
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
  const people = page.getByRole("group", { name: "People at the table" });
  expect((await people.innerText()).split("\n").filter(Boolean)).toEqual(["Your name"]);
  expect(await page.getByRole("combobox", { name: "Payment app" }).evaluateAll((pickers) => pickers.map((picker) => (picker as HTMLSelectElement).value))).toEqual([
    "cashApp",
    "venmo",
  ]);
  await openExample(page);
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
});

test.describe("the sheet", () => {
  const grab = (page: Page) => page.locator("[data-sheet-grab]");
  const sheetTop = (page: Page) => page.locator("[data-sheet-surface]").evaluate((el) => Math.round(el.getBoundingClientRect().top));

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

  test("a slow short drag on the grab handle springs back to rest", async ({ page }) => {
    await page.goto("/");
    const open = await sheetTop(page);
    await drag(page, 25, { steps: 10, stepMs: 50 });
    await expect.poll(() => sheetTop(page)).toBe(open);
  });

  test("a touch while the sheet settles catches it where it is, and a release sends it back to rest", async ({ page }) => {
    await page.goto("/");
    await expect(grab(page)).toBeVisible();
    const open = await sheetTop(page);
    const offset = () => page.locator("[data-sheet-surface]").evaluate((el) => Math.round(new DOMMatrix(getComputedStyle(el).transform).f));
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd", dy = 0) => {
      const box = (await grab(page).boundingBox())!;
      const point = { x: 4, y: box.y + box.height / 2 + dy };
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [point] });
    };
    const cdp = await page.context().newCDPSession(page);
    await touch("touchStart");
    await touch("touchMove", 70);
    await touch("touchEnd");
    const released = await offset();
    await expect.poll(offset, { intervals: [16] }).not.toBe(released);
    await touch("touchStart");
    const caught = await offset();
    await frames(page, 12);
    const held = await offset();
    await touch("touchEnd");

    expect(caught).toBeGreaterThan(0);
    expect(held).toBe(caught);
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
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  expect(itemsOf(await sentReceipt(page))).toEqual(items1040);
});

test.describe("reading through the server", () => {
  const reply = {
    items: [
      { name: "Club Sandwich", price: 1050, quantity: null, details: [], discounts: [{ name: "Member discount", amount: -200 }] },
      { name: "Cold Brew", price: 575, quantity: null, details: ["Large", "oat milk"], discounts: [] },
      { name: "Hot Wings", price: 900, quantity: null, details: [], discounts: [] },
      { name: "Garlic Fries", price: 500, quantity: null, details: [], discounts: [] },
    ],
    bundles: [{ name: "Wing Bucket", items: [2, 3], discounts: [{ name: "Bucket discount", amount: -300 }] }],
    adjustments: [{ kind: "tax", name: "Tax", amount: 290 }],
    subtotal: { amount: 2725, beforeDiscounts: false },
    total: 3015,
    check: { passed: true, gaps: { subtotal: 0, total: 0 } },
  };
  const onDevice = ["topgolf-synthetic.png", "9 items", "$207.29"];

  test.beforeEach(async ({ page }) => {
    const rate = Number(process.env.CPU_THROTTLE ?? 1);
    if (rate > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
  });

  test("a route reading fills the receipt, its discount shows as the Item's detail on the Split page, and the upload is a JPEG with the OCR lines", async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    let body: { photo: string; ocrLines: string[] } | null = null;
    await page.route("**/api/scan", (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ json: reply });
    });
    await page.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `198.54.${testInfo.workerIndex}.${testInfo.retry + 1}` } }));
    await page.goto("/");
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");
    await expect(card(page)).toBeVisible(scanTimeout);

    expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(["topgolf-synthetic.png", "4 items", "$30.15"]);
    expect(body!.photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(body!.ocrLines.some((line) => /Gameplay/.test(line))).toBe(true);

    await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
    await addName(page, "Jason");
    await action(page).click();
    await expect(page).toHaveURL(/\/s\/[\w-]+$/, { timeout: 30_000 });

    await expect(page.getByTestId("line-i1")).toContainText("$2.00 off");
    await expect(page.getByTestId("line-i2")).toContainText("Large, oat milk");
    await expect(page.getByTestId("line-i2")).not.toContainText("off");
  });

  for (const [status, why] of [
    [429, "a refused scan"],
    [502, "an unreadable scan"],
  ] as const) {
    test(`${why} (${status}) falls back to the on-device reading with no message`, async ({ page }) => {
      test.setTimeout(120_000);
      let asked = false;
      await page.route("**/api/scan", (route) => {
        asked = true;
        return route.fulfill({ status, json: { refused: status === 429 ? "rateLimited" : "unreadable" } });
      });
      await page.goto("/");
      await choose(page, "e2e/fixtures/topgolf-synthetic.png");
      await expect(card(page)).toBeVisible(scanTimeout);

      expect(asked).toBe(true);
      expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(onDevice);
    });
  }

  test("a scan with no reply in 15 s falls back to the on-device reading, and home reads until then", async ({ page }) => {
    test.setTimeout(90_000);
    let askedAt = 0;
    await page.route("**/api/scan", () => {
      askedAt = Date.now();
    });
    await page.goto("/");
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");
    await expect.poll(() => askedAt, scanTimeout).toBeGreaterThan(0);

    await expect(page.getByRole("status", { name: "Reading receipt" })).toBeVisible();
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    expect(Date.now() - askedAt).toBeGreaterThan(14_000);
    expect((await card(page).innerText()).split("\n").filter(Boolean)).toEqual(onDevice);
  });

  test("the line under the reading bar names each stage in turn, one line per frame, and leaves with the bar", async ({ page }) => {
    test.setTimeout(120_000);
    const releaseOcr = await holdTheDownload(page);
    let answer = () => {};
    const answered = new Promise<void>((resolve) => (answer = resolve));
    let askedAt = 0;
    await page.route("**/api/scan", async (route) => {
      askedAt = Date.now();
      await answered;
      await route.fulfill({ json: reply });
    });
    await page.goto("/");
    const lines = await sample<string[]>(page, `[...document.querySelectorAll('[data-testid="reading-stage"]')].map((line) => line.textContent)`);
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");

    const stage = page.getByTestId("reading-stage");
    await expect(stage).toHaveText("Finding the text");
    releaseOcr();
    await expect(stage).toHaveText("Matching items to prices", scanTimeout);
    await expect.poll(() => askedAt).toBeGreaterThan(0);
    await expect(stage).toHaveText("Taking a few more seconds", { timeout: 10_000 });
    expect(Date.now() - askedAt).toBeGreaterThan(3_000);
    answer();
    await expect(card(page)).toBeVisible(scanTimeout);
    await expect(stage).toHaveCount(0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const seen = await lines();
    expect(seen.filter((frame) => frame.length > 1)).toEqual([]);
    expect(runs(seen.map((frame) => frame[0] ?? ""))).toEqual(["", "Finding the text", "Matching items to prices", "Taking a few more seconds", ""]);
  });

  test("a large photo uploads at most 1 MB, at most 2048 px on its long edge", async ({ page }) => {
    test.setTimeout(150_000);
    let sent: { bytes: number; photo: string } | null = null;
    await page.route("**/api/scan", (route) => {
      const posted = route.request().postData() ?? "";
      sent = { bytes: Buffer.byteLength(posted), photo: JSON.parse(posted).photo };
      return route.fulfill({ json: reply });
    });
    await page.goto("/");
    const large = await page.evaluate(async (base64) => {
      const image = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))], { type: "image/png" }));
      const canvas = Object.assign(document.createElement("canvas"), { width: image.width * 3, height: image.height * 3 });
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let at = 0; at < pixels.data.length; at += 4) {
        const grain = (Math.random() - 0.5) * 40;
        for (let channel = 0; channel < 3; channel++) pixels.data[at + channel] += grain;
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
      return btoa(text);
    }, photo("e2e/fixtures/topgolf-synthetic.png", "image/png").buffer.toString("base64"));
    expect(large.length * 0.75).toBeGreaterThan(2 * 1024 * 1024);

    await pasteFile(page, { name: "large.png", mimeType: "image/png", buffer: Buffer.from(large, "base64") });
    await expect(card(page)).toBeVisible(scanTimeout);

    expect(sent!.bytes).toBeLessThanOrEqual(1024 * 1024);
    const edges = await page.evaluate(async (dataUrl) => {
      const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
      return [image.width, image.height];
    }, sent!.photo);
    expect(Math.max(...edges)).toBeLessThanOrEqual(2048);
  });
});
