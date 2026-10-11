import { openExample } from "./files";
import { fromMenu, menuButton, menuPopover } from "./header";
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
const lin: Stored = { id: "LinOnly0000000000000006", names: ["Lin"], total: 1400, added: now - 14 * DAY };
const max: Stored = { id: "MaxIvy00000000000000007", names: ["Max", "Ivy"], total: 7700, added: now - 24 * DAY };

async function seed(page: Page, splits: Stored[]) {
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await page.evaluate((splits) => {
    for (const { id, names, total, added, seen } of splits) localStorage.setItem(`receipt-splitter:split:${id}`, JSON.stringify({ recent: { names, total, added, seen: seen ?? added } }));
  }, splits);
  await page.reload();
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
}

const icon = (page: Page) => menuButton(page);
/** Opens the header menu and picks History, which opens the list. */
const openList = (page: Page) => fromMenu(page, "History");
const list = (page: Page) => page.getByRole("dialog", { name: "Recent splits" });
const rows = (page: Page) => list(page).getByRole("link");
const action = (page: Page) => page.getByRole("button", { name: "Create split link" });
const labels = (page: Page) => rows(page).evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")));
const focusedName = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);

test("a fresh home's menu holds no History row", async ({ page }) => {
  await page.goto("/");
  await expect(action(page)).toBeVisible();
  await icon(page).click();
  await expect(menuPopover(page).getByRole("button", { name: "Dark mode", exact: true })).toBeVisible();
  await expect(menuPopover(page).getByRole("button", { name: "History", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Recent splits")).toHaveCount(0);
});

test("a Split this browser created heads Recent splits on the fresh home, and a tap opens its link", async ({ page }) => {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  for (const [index, name] of ["Jason", "Sam"].entries()) {
    await page.getByRole("button", { name: index === 0 ? "Add name" : "Add a name" }).click();
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
  await openList(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(`Jason and Sam, Today, ${total}`);
  await rows(page).first().click();
  await expect(page).toHaveURL(link);
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible({ timeout: 30_000 });
});

test("the menu button sits at the top right of home and History lists every stored Split newest first, past five", async ({ page }) => {
  await seed(page, [ana, jason, priya, kim, omar, lin, max]);
  await expect(page.getByText("Recent splits")).toHaveCount(0);
  const box = (await icon(page).boundingBox())!;
  expect(box.x + box.width).toBeGreaterThanOrEqual(phone.width - 22);
  expect(box.y + box.height).toBeLessThanOrEqual(72);
  expect([box.width, box.height]).toEqual([44, 44]);

  await openList(page);
  await expect(list(page).getByRole("heading", { name: "Recent splits" })).toBeVisible();
  expect(await labels(page)).toEqual([
    "Jason and Sam, Today, $42.10",
    "Priya and Jo, Yesterday, $128.75",
    "Ana, Ben, and 2 more, Oct 1, $9.90",
    "Kim and Lee, Sep 29, $31.00",
    "Omar, Sep 28, $5.60",
    "Lin, Sep 20, $14.00",
    "Max and Ivy, Sep 10, $77.00",
  ]);
  expect(await rows(page).evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname))).toEqual(
    [jason, priya, ana, kim, omar, lin, max].map(({ id }) => `/s/${id}`),
  );
});

test("the phone sheet closes on a scrim tap and on Escape, and focus returns to the icon", async ({ page }) => {
  await seed(page, [ana, jason]);
  await openList(page);
  await expect(rows(page)).toHaveCount(2);
  await page.mouse.click(phone.width / 2, 40);
  await expect(list(page)).toHaveCount(0);
  expect(await focusedName(page)).toBe("Menu");

  await openList(page);
  await expect(rows(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(list(page)).toHaveCount(0);
  expect(await focusedName(page)).toBe("Menu");
});

test("the menu button announces a dialog popup and its expanded state follows the menu", async ({ page }) => {
  await seed(page, [ana, jason]);
  const state = () => icon(page).evaluate((el) => [el.getAttribute("aria-haspopup"), el.getAttribute("aria-expanded")]);
  expect(await state()).toEqual(["dialog", "false"]);
  await icon(page).click();
  await expect(menuPopover(page)).toBeVisible();
  expect(await state()).toEqual(["dialog", "true"]);
  await page.keyboard.press("Escape");
  await expect(menuPopover(page)).toHaveCount(0);
  expect(await state()).toEqual(["dialog", "false"]);
});

test("at 1440 px the list is a popover under the icon that closes on an outside click and on Escape, with focus back on the icon", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, [ana, jason, priya, kim, omar, lin]);
  const button = (await icon(page).boundingBox())!;
  expect(button.x + button.width).toBeGreaterThan(1440 - 80);
  await openList(page);
  await expect(rows(page)).toHaveCount(6);
  const popover = (await list(page).boundingBox())!;
  expect(popover.y).toBeGreaterThanOrEqual(button.y + button.height);
  expect(Math.abs(popover.x + popover.width - (button.x + button.width))).toBeLessThanOrEqual(16);
  expect(popover.width).toBeLessThan(480);

  await page.mouse.click(200, 600);
  await expect(list(page)).toHaveCount(0);
  expect(await focusedName(page)).toBe("Menu");

  await openList(page);
  await expect(rows(page)).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(list(page)).toHaveCount(0);
  expect(await focusedName(page)).toBe("Menu");

  await openList(page);
  await rows(page).nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/s/${priya.id}$`));
});

test("a Split this browser last opened 61 days ago is not listed, and one opened 59 days ago is", async ({ page }) => {
  await seed(page, [
    { ...jason, added: now - 90 * DAY, seen: now - 61 * DAY },
    { ...priya, added: now - 90 * DAY, seen: now - 59 * DAY },
  ]);
  await openList(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(/^Priya and Jo, /);
});

test("an entry whose link says the split has expired is gone back on home, and the icon hides with the last one", async ({ page }) => {
  await seed(page, [jason, priya]);
  await openList(page);
  await rows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`/s/${jason.id}$`));
  await expect(page.getByRole("heading", { name: "This split has expired" })).toBeVisible();
  await page.getByRole("button", { name: "Split a receipt" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await openList(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(/^Priya and Jo, /);

  await rows(page).first().click();
  await expect(page.getByRole("heading", { name: "This split has expired" })).toBeVisible();
  await page.getByRole("button", { name: "Split a receipt" }).last().click();
  await expect(action(page)).toBeVisible();
  await icon(page).click();
  await expect(menuPopover(page).getByRole("button", { name: "History", exact: true })).toHaveCount(0);
});

const dashedBox = (page: Page) =>
  page.getByRole("button", { name: /^Add receipt/ }).evaluate((hero) => {
    const box = [hero, ...hero.querySelectorAll("div")].find((el) => getComputedStyle(el).borderTopStyle === "dashed")!.getBoundingClientRect();
    const header = document.querySelector('[role="heading"][aria-level="1"]')!.parentElement!.getBoundingClientRect();
    const panel = document.querySelector("[data-sheet-surface]")!.getBoundingClientRect();
    return { aboveBox: Math.round(box.top - header.bottom), belowBox: Math.round(panel.top - box.bottom), top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) };
  });

for (const height of [844, 740]) {
  test(`at 390 by ${height} the dashed Add receipt box fills the page from the header to the panel with 44 px above and 48 px below`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await seed(page, [jason]);
    const { aboveBox, belowBox } = await dashedBox(page);
    expect(aboveBox).toBe(44);
    expect(belowBox).toBe(48);
  });
}

test("at 390 by 700 the dashed Add receipt box shrinks to 273 px with 44 px above and at least 16 px clear of the panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seed(page, [jason]);
  const { aboveBox, belowBox, height } = await dashedBox(page);
  expect(height).toBe(273);
  expect(aboveBox).toBe(44);
  expect(belowBox).toBeGreaterThanOrEqual(16);
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
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
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

test("with stored Splits and the iPhone keyboard up, the focused handle field stays above the keyboard and only the panel moves", async ({ page }) => {
  await simulateKeyboard(page, iphoneKeyboard);
  await seed(page, [ana, jason, priya]);
  await expect(icon(page)).toBeVisible();
  const panelTop = () => page.locator("[data-sheet-surface]").evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
  const boxTop = async () => (await dashedBox(page)).top + (await page.evaluate(() => Math.round(window.scrollY)));
  const rest = { panel: await panelTop(), box: await boxTop() };
  const handle = page.getByRole("textbox", { name: "Venmo handle" });
  await handle.tap();
  await expect(handle).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(phone.height - iphoneKeyboard);
  await expect.poll(() => aboveKeyboard(handle)).toBe(true);
  expect(await boxTop()).toBe(rest.box);
  expect(await panelTop()).toBeLessThan(rest.panel);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
