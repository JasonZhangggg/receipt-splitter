import { expect, test, type Page } from "@playwright/test";

import { runs, sample } from "./motion";
import { addNames, dropFile, dropZone, openExample, pasteFile, photo } from "./files";

test.use({ viewport: { width: 390, height: 844 } });

const receipt1040 = "bench/data/srd-1040.jpg";
const scanTimeout = { timeout: 60_000 };

const action = (page: Page) => page.getByRole("button", { name: "Create link" });

async function choose(page: Page, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await dropZone(page).click();
  await (await chooser).setFiles(file);
}

const card = (page: Page) => page.getByTestId("receipt");
/** The read clause of home's sentence as it reads, on one line. */
const shown = async (page: Page) => (await card(page).innerText()).replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();

type SentReceipt = { items: { name: string; price: number }[]; adjustments: { name: string; amount: number }[] };

/** What Create link sends, caught before it reaches the Worker so no Split is made. */
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

const addName = (page: Page, name: string) => addNames(page, name);

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

  expect(await shown(page)).toBe("I paid $207.29. Change.");
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

  test("chosen through the picker, it reads five Items, Tip $0.00, Total $28.04, and Create link with no name says so and opens the name field", async ({ page }) => {
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByTestId("reading")).toBeVisible();
    await expect(card(page)).toBeVisible(scanTimeout);

    expect(await shown(page)).toBe("I paid $28.04. Change.");
    await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Add your name first." });
    await action(page).click();
    await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Jason");
    await page.keyboard.press("Enter");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
    expect(itemsOf(await sentReceipt(page))).toEqual(items1040);
  });
});

test("a read with a price over the limit creates the link, and a price typed into the row the note points at moves the Total by that price", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `198.54.${testInfo.workerIndex}.${testInfo.retry + 1}` } }));
  await page.goto("/");
  await choose(page, "e2e/fixtures/example-price-over-limit.png");
  await expect(card(page)).toBeVisible(scanTimeout);

  expect(await shown(page)).toBe("I paid $28.04. Change.");
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Items are $3.50 short of the subtotal." });

  await action(page).click();
  await expect(page).toHaveURL(/\/s\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByText("Items are $3.50 short of the subtotal.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Open Perrier Sparkling Water, \$0\.00/ }).click();
  await page.getByRole("dialog", { name: "Edit item" }).getByRole("textbox", { name: "Price" }).fill("3.50");
  await page.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("button", { name: /^Open Perrier Sparkling Water, \$3\.50/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("total")).toHaveText("$31.54");
  await expect(page.getByText("Items are $3.50 short of the subtotal.")).toBeVisible();
});

test("a read with no Items keeps Create link off with its reason, and home offers no editor", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await choose(page, "e2e/fixtures/blank.png");
  await expect(card(page)).toBeVisible(scanTimeout);

  expect(await shown(page)).toBe("I paid the bill. Try another photo, or add the items myself.");
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add item, tax, tip or discount", exact: true })).toHaveCount(0);
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Couldn't read any items. Try another photo." });
  await expect(page.getByRole("status").filter({ hasText: "Couldn't read any items. Try another photo." })).toHaveCSS("color", "rgb(196, 52, 42)");
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

  expect(await shown(page)).toBe("I paid $28.04. Change.");
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: "Items are $2.50 short of the subtotal." });

  await action(page).click();
  await expect(page).toHaveURL(/\/s\/[\w-]+$/, { timeout: 30_000 });
});

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 820 }, isMobile: false, hasTouch: false });
  test.setTimeout(120_000);

  test("an image dropped on the page and an image pasted both read, a PDF gets one refusal line, and a drop or paste on a finished read replaces it", async ({ page }) => {
    await page.goto("/");
    const zone = dropZone(page);

    await expect(dropZone(page)).toBeVisible();
    await dropFile(page, { name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
    await expect(page.getByText("That file is not a photo.")).toBeVisible();
    await expect(zone).toBeVisible();

    await pasteFile(page, photo("e2e/fixtures/blank.png", "image/png"));
    await expect(card(page)).toHaveText("I paid the bill. Try another photo, or add the items myself.", scanTimeout);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(dropZone(page)).toBeVisible();
    await dropFile(page, photo(receipt1040));
    await expect(card(page)).toContainText("$28.04", scanTimeout);

    await dropFile(page, photo("e2e/fixtures/blank.png", "image/png"));
    await expect(card(page)).toHaveText("I paid the bill. Try another photo, or add the items myself.", scanTimeout);
    await dropFile(page, photo(receipt1040));
    await expect(card(page)).toContainText("$28.04", scanTimeout);
    await pasteFile(page, photo("e2e/fixtures/blank.png", "image/png"));
    await expect(card(page)).toHaveText("I paid the bill. Try another photo, or add the items myself.", scanTimeout);
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

  test("puts the step word in place of Add the receipt, with no progress bar, and stops moving once the total shows", async ({ page }) => {
    const release = await holdTheDownload(page);
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByTestId("reading")).toHaveText("I paid the bill. Reading the receipt.");
    await expect(page.getByRole("button", { name: "Add the receipt" })).toHaveCount(0);
    await expect(page.getByTestId("reading"), "focus follows the button that left").toBeFocused();
    await expect(page.locator("[data-problem]"), "the footer stays quiet while the step word speaks").toHaveAttribute("aria-live", "off");
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    const sweeping = await page.getByTestId("reading-stage").evaluate((word) => word.getAnimations().map((animation) => (animation as CSSAnimation).animationName));
    expect(sweeping).toEqual(["rs-sweep"]);

    release();
    await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);
    await expect(page.getByTestId("reading-stage")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("under reduced motion only a short opacity fade runs while it reads, with no sweep", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const release = await holdTheDownload(page);
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByTestId("reading")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.getByTestId("reading-stage")).toHaveText("Reading the receipt");
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
  await expect(dropZone(page)).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");

  await choose(page, "e2e/fixtures/srd-1040-no-sprite.jpg");
  await expect(card(page)).toContainText("$28.04", scanTimeout);
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
});

test("the payment apps and handles follow the Host's choices and survive a reload, and the names do not", async ({ page }) => {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("combobox", { name: "Payment app" }).selectOption("cashApp");
  await expect(page.getByRole("textbox", { name: "Cash App handle" })).toHaveAttribute("placeholder", "$cashtag");
  await page.getByRole("button", { name: "Add another way to get paid" }).click();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveAttribute("placeholder", "@username");
  for (const name of ["Jason", "Sam", "Priya"]) await addName(page, name);
  await page.getByRole("button", { name: "Remove Sam" }).click();
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("@jason-z");
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toHaveValue("");
  await expect(page.getByRole("group")).toHaveCount(0);
  expect(await page.getByRole("combobox", { name: "Payment app" }).evaluateAll((pickers) => pickers.map((picker) => (picker as HTMLSelectElement).value))).toEqual([
    "cashApp",
    "venmo",
  ]);
  await openExample(page);
  await addName(page, "Jason");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
});

test("with three more ways to get paid and seven names, Create link stays on screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Add another way to get paid" }).click();
  for (const name of ["Jason", "Sam", "Priya", "Lee", "Ana", "Jo", "Kai"]) await addName(page, name);
  await expect(action(page)).toBeInViewport();
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
  const onDevice = "I paid $207.29. Change.";

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

    expect(await shown(page)).toBe("I paid $30.15. Change.");
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
      expect(await shown(page)).toBe(onDevice);
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

    await expect(page.getByTestId("reading")).toBeVisible();
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    expect(Date.now() - askedAt).toBeGreaterThan(14_000);
    expect(await shown(page)).toBe(onDevice);
  });

  test("a model download held back for 5 s sends the photo with no OCR lines, and the server's receipt shows", async ({ page }) => {
    test.setTimeout(90_000);
    const releaseOcr = await holdTheDownload(page);
    let sent: { photo: string; ocrLines: string[] } | null = null;
    let askedAt = 0;
    await page.route("**/api/scan", (route) => {
      askedAt = Date.now();
      sent = route.request().postDataJSON();
      return route.fulfill({ json: reply });
    });
    await page.goto("/");
    const pickedAt = Date.now();
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");

    await expect(page.getByTestId("reading-stage")).toHaveText("Reading the receipt");
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    expect(askedAt - pickedAt).toBeGreaterThan(4_500);
    expect(askedAt - pickedAt).toBeLessThan(8_000);
    expect(sent!.ocrLines).toEqual([]);
    expect(sent!.photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(await shown(page)).toBe("I paid $30.15. Change.");
    releaseOcr();
  });

  test("a model download that fails sends the photo with no OCR lines at once", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/models/**", (route) => route.abort());
    await page.route("**/ort/**", (route) => route.abort());
    let sent: { ocrLines: string[] } | null = null;
    let askedAt = 0;
    await page.route("**/api/scan", (route) => {
      askedAt = Date.now();
      sent = route.request().postDataJSON();
      return route.fulfill({ json: reply });
    });
    await page.goto("/");
    const pickedAt = Date.now();
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");

    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    expect(askedAt - pickedAt).toBeLessThan(4_000);
    expect(sent!.ocrLines).toEqual([]);
    expect(await shown(page)).toBe("I paid $30.15. Change.");
  });

  test("with the model unavailable and the photo-only read refused, home ends as it does with no reading", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/models/**", (route) => route.abort());
    await page.route("**/ort/**", (route) => route.abort());
    let asked = 0;
    await page.route("**/api/scan", (route) => {
      asked++;
      return route.fulfill({ status: 502, json: { refused: "unreadable" } });
    });
    await page.goto("/");
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");

    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    expect(asked).toBe(1);
    expect(await shown(page)).toBe("I paid the bill. Try another photo, or add the items myself.");
  });

  test("a model that is ready in time still sends the OCR lines", async ({ page }) => {
    test.setTimeout(150_000);
    let sent: { ocrLines: string[] } | null = null;
    await page.route("**/api/scan", (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ json: reply });
    });
    await page.goto("/");
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");
    await expect(card(page)).toBeVisible(scanTimeout);

    expect(sent!.ocrLines.length).toBeGreaterThan(5);
    expect(sent!.ocrLines.some((line) => /Gameplay/.test(line))).toBe(true);
  });

  test("the step word names each real stage in turn, one word per frame, and leaves when the total shows", async ({ page }) => {
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
    await expect(stage).toHaveText("Reading the receipt");
    releaseOcr();
    await expect(stage).toHaveText("Matching prices", scanTimeout);
    await expect.poll(() => askedAt).toBeGreaterThan(0);
    await expect(stage).toHaveText("Taking a few more seconds", { timeout: 10_000 });
    expect(Date.now() - askedAt).toBeGreaterThan(3_000);
    answer();
    await expect(card(page)).toBeVisible(scanTimeout);
    await expect(stage).toHaveCount(0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const seen = await lines();
    expect(seen.filter((frame) => frame.length > 1)).toEqual([]);
    expect(runs(seen.map((frame) => frame[0] ?? ""))).toEqual(["", "Reading the receipt", "Finding the text", "Matching prices", "Taking a few more seconds", ""]);
  });

  test("on the photo route the step word never goes back to Finding the text when the download lands late", async ({ page }) => {
    test.setTimeout(120_000);
    const releaseOcr = await holdTheDownload(page);
    let answer = () => {};
    const answered = new Promise<void>((resolve) => (answer = resolve));
    let sent: { ocrLines: string[] } | null = null;
    await page.route("**/api/scan", async (route) => {
      sent = route.request().postDataJSON();
      await answered;
      await route.fulfill({ json: reply });
    });
    await page.goto("/");
    const lines = await sample<string[]>(page, `[...document.querySelectorAll('[data-testid="reading-stage"]')].map((line) => line.textContent)`);
    await choose(page, "e2e/fixtures/topgolf-synthetic.png");

    const stage = page.getByTestId("reading-stage");
    await expect(stage).toHaveText("Matching prices", { timeout: 10_000 });
    expect(sent!.ocrLines).toEqual([]);
    releaseOcr();
    await expect(stage).toHaveText("Taking a few more seconds", { timeout: 10_000 });
    // Long enough for the released download to build the engine and start looking for text, which reports the step Finding the text names.
    await page.waitForTimeout(4_000);
    answer();
    await expect(card(page)).toBeVisible(scanTimeout);
    await expect(stage).toHaveCount(0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const seen = await lines();
    expect(seen.filter((frame) => frame.length > 1)).toEqual([]);
    expect(runs(seen.map((frame) => frame[0] ?? ""))).toEqual(["", "Reading the receipt", "Matching prices", "Taking a few more seconds", ""]);
    expect(await shown(page)).toBe("I paid $30.15. Change.");
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
