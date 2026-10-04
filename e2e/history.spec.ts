import { openExample } from "./files";
import { simulateKeyboard } from "./motion";
import { expect, test, type Locator, type Page } from "./without-ocr";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone, serviceWorkers: "block", timezoneId: "America/Los_Angeles" });
test.setTimeout(90_000);

let tests = 0;

test.beforeEach(async ({ context }, testInfo) => {
  tests += 1;
  const ip = `198.53.${testInfo.workerIndex}.${tests}`;
  await context.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }));
});

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-04T12:00:00-07:00").getTime();

type Stored = { id: string; names: string[]; total: number; added: number; seen?: number };

const ana: Stored = { id: "AnaBenCy00000000000001", names: ["Ana", "Ben", "Cy", "Dee"], total: 990, added: now - 3 * DAY };
const jason: Stored = { id: "JasonSam00000000000002", names: ["Jason", "Sam"], total: 4210, added: now - 2 * 60 * 60 * 1000 };
const priya: Stored = { id: "PriyaJo000000000000003", names: ["Priya", "Jo"], total: 12875, added: now - DAY - 60_000 };
const kim: Stored = { id: "KimLee00000000000000004", names: ["Kim", "Lee"], total: 3100, added: now - 5 * DAY };
const omar: Stored = { id: "OmarNia0000000000000005", names: ["Omar"], total: 560, added: now - 6 * DAY };

async function seed(page: Page, splits: Stored[]) {
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await page.evaluate((splits) => {
    for (const { id, names, total, added, seen } of splits) localStorage.setItem(`receipt-splitter:split:${id}`, JSON.stringify({ recent: { names, total, added, seen: seen ?? added } }));
  }, splits);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
}

const recent = (page: Page) => page.getByRole("region", { name: "Recent splits" });
const rows = (page: Page) => recent(page).getByRole("link");
const action = (page: Page) => page.getByRole("button", { name: "Create split link" });

test("a fresh home shows no Recent splits", async ({ page }) => {
  await page.goto("/");
  await expect(action(page)).toBeVisible();
  await expect(page.getByText("Recent splits")).toHaveCount(0);
});

test("a Split this browser created heads the fresh home's Recent splits, and a tap opens its link", async ({ page }) => {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  for (const [index, name] of ["Jason", "Sam"].entries()) {
    await page.getByRole("button", { name: index === 0 ? "Your name" : "Add a name" }).click();
    await page.getByRole("textbox", { name: index === 0 ? "Your name" : "Name", exact: true }).fill(name);
    await page.keyboard.press("Enter");
  }
  const sent = page.waitForRequest((request) => request.url().endsWith("/api/splits") && request.method() === "POST");
  await action(page).click();
  await expect(page.getByText("Link ready.")).toBeVisible({ timeout: 30_000 });
  const link = page.url();
  const total = `$${((await sent).postDataJSON().split.receipt.total / 100).toFixed(2)}`;
  await page.getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Split a receipt" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(`Jason and Sam, Today, ${total}`);
  await rows(page).first().click();
  await expect(page).toHaveURL(link);
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible({ timeout: 30_000 });
});

test("three stored Splits list newest first with their names, days, and totals, between the hero and the panel", async ({ page }) => {
  await seed(page, [ana, jason, priya]);
  await expect(rows(page)).toHaveCount(3);
  expect(await rows(page).evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")))).toEqual([
    "Jason and Sam, Today, $42.10",
    "Priya and Jo, Yesterday, $128.75",
    "Ana, Ben, and 2 more, Oct 1, $9.90",
  ]);
  expect(await rows(page).evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname))).toEqual([`/s/${jason.id}`, `/s/${priya.id}`, `/s/${ana.id}`]);

  const hero = (await page.getByRole("button", { name: /^Add receipt/ }).boundingBox())!;
  const list = (await recent(page).boundingBox())!;
  const panel = await page.locator("[data-sheet-surface]").evaluate((el) => el.getBoundingClientRect().top);
  expect(list.y).toBeGreaterThanOrEqual(hero.y + hero.height);
  expect(list.y + list.height).toBeLessThanOrEqual(panel);
});

test("a Split this browser last opened 61 days ago is not listed, and one opened 59 days ago is", async ({ page }) => {
  await seed(page, [
    { ...jason, added: now - 90 * DAY, seen: now - 61 * DAY },
    { ...priya, added: now - 90 * DAY, seen: now - 59 * DAY },
  ]);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(/^Priya and Jo, /);
});

test("an entry whose link says the split has expired is gone back on home", async ({ page }) => {
  await seed(page, [jason, priya]);
  await rows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`/s/${jason.id}$`));
  await expect(page.getByRole("heading", { name: "This split has expired" })).toBeVisible();
  await page.getByRole("button", { name: "Split a receipt" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(/^Priya and Jo, /);
});

test("the list hides once a receipt is on home", async ({ page }) => {
  await seed(page, [jason]);
  await expect(rows(page)).toHaveCount(1);
  await openExample(page);
  await expect(page.getByText("Recent splits")).toHaveCount(0);
});

test("five stored Splits show three on the phone, with the list ending above the panel", async ({ page }) => {
  await seed(page, [ana, jason, priya, kim, omar]);
  await expect(rows(page)).toHaveCount(3);
  expect(await rows(page).evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname))).toEqual([`/s/${jason.id}`, `/s/${priya.id}`, `/s/${ana.id}`]);
  const list = (await recent(page).boundingBox())!;
  const panel = await page.locator("[data-sheet-surface]").evaluate((el) => el.getBoundingClientRect().top);
  expect(panel - (list.y + list.height)).toBeLessThanOrEqual(40);
});

const shownAbovePanel = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector("[data-sheet-surface]")!.getBoundingClientRect().top;
    const bottoms = [...document.querySelectorAll('[aria-label="Recent splits"] a')].map((row) => row.getBoundingClientRect().bottom);
    return { shown: bottoms.length, above: bottoms.filter((bottom) => bottom <= panel).length };
  });

test("on a shorter phone, Recent splits shows only the rows that end above the panel, and shows more once there is room", async ({ page }) => {
  await seed(page, [ana, jason, priya, kim, omar]);
  expect(await shownAbovePanel(page)).toEqual({ shown: 3, above: 3 });

  await page.setViewportSize({ width: 390, height: 700 });
  await seed(page, [ana, jason, priya, kim, omar]);
  const at700 = await shownAbovePanel(page);
  expect(at700.above).toBe(at700.shown);
  expect(at700.shown).toBeLessThan(3);

  await page.setViewportSize({ width: 390, height: 600 });
  await seed(page, [ana, jason, priya, kim, omar]);
  const at600 = await shownAbovePanel(page);
  expect(at600.above).toBe(at600.shown);
  expect(at600.shown).toBeLessThanOrEqual(at700.shown);

  await page.setViewportSize(phone);
  await expect.poll(() => shownAbovePanel(page)).toEqual({ shown: 3, above: 3 });
});

test("at 1440 px five stored Splits show five, under Create split link, sharing the column's left edge and width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, [ana, jason, priya, kim, omar]);
  await expect(rows(page)).toHaveCount(5);
  const create = (await action(page).boundingBox())!;
  const list = (await recent(page).boundingBox())!;
  expect(list.y).toBeGreaterThan(create.y + create.height);
  expect([Math.round(list.x), Math.round(list.width)]).toEqual([Math.round(create.x), Math.round(create.width)]);
});

const blockStorage = (page: Page) =>
  page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    }),
  );

test("home renders with blocked storage", async ({ page }) => {
  await blockStorage(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Receipt Splitter" })).toBeVisible();
  await expect(action(page)).toBeVisible();
});

test("a live Split page renders with blocked storage", async ({ page }) => {
  const response = await page.request.post("/api/splits", {
    headers: { "cf-connecting-ip": "198.53.250.1" },
    data: {
      split: {
        receipt: { items: [{ id: "i1", name: "Pizza", price: 2000 }], adjustments: [], subtotal: 2000, total: 2000 },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  await blockStorage(page);
  await page.goto(`/s/${(await response.json()).id}`);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible({ timeout: 30_000 });
});

const iphoneKeyboard = 336;

const aboveKeyboard = (field: Locator) =>
  field.evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    const { offsetTop, height } = window.visualViewport!;
    return top >= offsetTop && bottom <= offsetTop + height;
  });

test("with three Splits and the iPhone keyboard up, the focused handle field stays above the keyboard and the panel keeps its page position", async ({ page }) => {
  await simulateKeyboard(page, iphoneKeyboard);
  await seed(page, [ana, jason, priya]);
  await expect(rows(page)).toHaveCount(3);
  const panelTop = () => page.locator("[data-sheet-surface]").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const rest = await panelTop();
  const handle = page.getByRole("textbox", { name: "Venmo handle" });
  await handle.tap();
  await expect(handle).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(phone.height - iphoneKeyboard);
  await expect.poll(() => aboveKeyboard(handle)).toBe(true);
  expect(await panelTop()).toBe(rest);
});
