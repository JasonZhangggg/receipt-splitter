import { addNames, openExample } from "./files";
import { simulateKeyboard } from "./motion";
import { fromMore } from "./header";
import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";

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

const list = (page: Page) => page.getByRole("region", { name: "Recent splits" });
const rows = (page: Page) => list(page).getByRole("link");
const action = (page: Page) => page.getByRole("button", { name: "Create link" });
const labels = (page: Page) => rows(page).evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")));

test("a fresh home has no Recent splits", async ({ page }) => {
  await page.goto("/");
  await expect(action(page)).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByText("Recent splits")).toHaveCount(0);
});

test("a Split this browser created heads Recent splits on the fresh home, and a tap opens its link", async ({ page }) => {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addNames(page, "Jason", "Sam");
  const sent = page.waitForRequest((request) => request.url().endsWith("/api/splits") && request.method() === "POST");
  await action(page).click();
  await expect(page.getByText("Link ready.")).toBeVisible({ timeout: 30_000 });
  const link = page.url();
  const total = `$${((await sent).postDataJSON().split.receipt.total / 100).toFixed(2)}`;
  await page.getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Your share \$/ })).toBeVisible();

  await page.getByRole("button", { name: "Split a receipt" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(`Jason and Sam, Today, 2 people, ${total}`);
  await rows(page).first().click();
  await expect(page).toHaveURL(link);
  await expect(page.getByRole("button", { name: /^Your share \$/ })).toBeVisible({ timeout: 30_000 });
});

test("Recent splits sits under the sentence, with no header link, and lists every stored Split newest first, past five", async ({ page }) => {
  await seed(page, [ana, jason, priya, kim, omar, lin, max]);
  await expect(page.getByRole("button", { name: "Recent splits", exact: true })).toHaveCount(0);
  const [words, listed] = [(await page.getByTestId("sentence").boundingBox())!, (await list(page).boundingBox())!];
  expect(listed.y).toBeGreaterThan(words.y + words.height);
  await expect(list(page).getByRole("heading", { name: "Recent splits" })).toBeVisible();
  expect(await labels(page)).toEqual([
    "Jason and Sam, Today, 2 people, $42.10",
    "Priya and Jo, Yesterday, 2 people, $128.75",
    "Ana, Ben, and 2 more, Oct 1, 4 people, $9.90",
    "Kim and Lee, Sep 29, 2 people, $31.00",
    "Omar, Sep 28, 1 person, $5.60",
    "Lin, Sep 20, 1 person, $14.00",
    "Max and Ivy, Sep 10, 2 people, $77.00",
  ]);
  expect(await rows(page).evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname))).toEqual(
    [jason, priya, ana, kim, omar, lin, max].map(({ id }) => `/s/${id}`),
  );
  expect((await rows(page).nth(2).innerText()).split("\n").filter(Boolean)).toEqual(["Ana, Ben, and 2 more", "Oct 1 · 4 people", "$9.90"]);
});

test("at 1440 px Recent splits shares the sentence's column, and a click opens the Split", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, [ana, jason, priya]);
  const [words, listed] = [(await page.getByTestId("sentence").boundingBox())!, (await list(page).boundingBox())!];
  expect([Math.round(listed.x), Math.round(listed.width)]).toEqual([Math.round(words.x), Math.round(words.width)]);
  await rows(page).nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/s/${priya.id}$`));
});

test("a Split this browser last opened 61 days ago is not listed, and one opened 59 days ago is", async ({ page }) => {
  await seed(page, [
    { ...jason, added: now - 90 * DAY, seen: now - 61 * DAY },
    { ...priya, added: now - 90 * DAY, seen: now - 59 * DAY },
  ]);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(/^Priya and Jo, /);
});

test("an entry whose link says the split has expired is gone back on home, and the list hides with the last one", async ({ page }) => {
  await seed(page, [jason, priya]);
  await rows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`/s/${jason.id}$`));
  await expect(page.getByRole("heading", { name: "We can't find this split" })).toBeVisible();
  await page.getByRole("button", { name: "Split a receipt" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName(/^Priya and Jo, /);

  await rows(page).first().click();
  await expect(page.getByRole("heading", { name: "We can't find this split" })).toBeVisible();
  await page.getByRole("button", { name: "Split a receipt" }).last().click();
  await expect(action(page)).toBeVisible();
  await expect(list(page)).toHaveCount(0);
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

test("with stored Splits and the iPhone keyboard up, the focused handle field stays above the keyboard", async ({ page }) => {
  await simulateKeyboard(page, iphoneKeyboard);
  await seed(page, [ana, jason, priya]);
  await expect(list(page)).toBeVisible();
  const handle = page.getByRole("textbox", { name: "Venmo handle" });
  await handle.tap();
  await expect(handle).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(phone.height - iphoneKeyboard);
  await expect.poll(() => aboveKeyboard(handle)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

const live = { timeout: 15_000 };
let splits = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  splits += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.56.${100 + workerIndex}.${splits}` },
    data: {
      split: {
        receipt: {
          items: [{ id: "rice", name: "Rice", price: 800 }, { id: "pitcher", name: "Pitcher", price: 1200 }],
          adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 100 }, { id: "coupon", kind: "discount", name: "Coupon", amount: -200 }],
          subtotal: 2000,
          total: 1900,
        },
        participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }, { id: "priya", name: "Priya" }],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  return new URL(`/s/${(await response.json()).id}`, response.url()).href;
}

async function joinAs(browser: Browser, link: string, name: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(phone);
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const editAmount = async (page: Page, row: string, sheetName: string, field: string, amount: string) => {
  await page.getByRole("button", { name: row }).click();
  await sheet(page, sheetName).getByRole("textbox", { name: field, exact: true }).fill(amount);
  await sheet(page, sheetName).getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet(page, sheetName)).toHaveCount(0, live);
};

test("Revert of another person's change asks first, then applies and settles the row to Reverted", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await joinAs(browser, link, "Sam");
  const priya = await joinAs(browser, link, "Priya");
  await editAmount(sam, "Open Tax, $1.00", "Charge", "Amount", "3.00");
  await expect(priya.getByTestId("total")).toHaveText("$21.00", live);

  await fromMore(priya, "History");
  await priya.getByRole("button", { name: "Revert Tax" }).click();
  const ask = priya.getByRole("alertdialog", { name: "Revert Sam's change?" });
  await expect(ask).toBeVisible();
  await expect(priya.getByTestId("total"), "nothing changes until the answer").toHaveText("$21.00");
  await ask.getByRole("button", { name: "Revert" }).click();
  await expect(priya.getByText("Reverted")).toBeVisible(live);
  await expect(priya.getByRole("button", { name: "Revert Tax" })).toHaveCount(0, live);
  for (const page of [sam, priya]) await expect(page.getByTestId("total")).toHaveText("$19.00", live);
});

test("another phone reverts the same change first: the open question goes away, nothing is said, and the revert applies once", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await joinAs(browser, link, "Sam");
  const priya = await joinAs(browser, link, "Priya");
  await editAmount(sam, "Open Tax, $1.00", "Charge", "Amount", "3.00");
  await expect(priya.getByTestId("total")).toHaveText("$21.00", live);

  await fromMore(priya, "History");
  await priya.getByRole("button", { name: "Revert Tax" }).click();
  const ask = priya.getByRole("alertdialog", { name: "Revert Sam's change?" });
  await expect(ask).toBeVisible();

  await fromMore(sam, "History");
  await sam.getByRole("button", { name: "Revert Tax" }).click();
  await expect(sam.getByText("Reverted")).toBeVisible(live);

  await expect(ask).toHaveCount(0, live);
  await expect(priya.getByText("Reverted")).toBeVisible(live);
  await expect(priya.getByText("Couldn't revert that")).toHaveCount(0);
  for (const page of [sam, priya]) await expect(page.getByTestId("total")).toHaveText("$19.00", live);
});

test("a Revert leaves a later edit of someone else standing", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await joinAs(browser, link, "Sam");
  const priya = await joinAs(browser, link, "Priya");
  await editAmount(sam, "Open Tax, $1.00", "Charge", "Amount", "3.00");
  await expect(priya.getByTestId("total")).toHaveText("$21.00", live);
  await editAmount(priya, "Open Coupon, -$2.00", "Discount", "Amount off", "5");
  await expect(sam.getByTestId("total")).toHaveText("$18.00", live);

  await fromMore(sam, "History");
  await sam.getByRole("button", { name: "Revert Tax" }).click();
  await expect(sam.getByText("Reverted")).toBeVisible(live);
  for (const page of [sam, priya]) {
    await expect(page.getByTestId("total")).toHaveText("$16.00", live);
    await expect(page.getByRole("button", { name: "Open Coupon, -$5.00" })).toBeVisible();
  }
});

const eight = Array.from({ length: 8 }, (_, i): Stored => ({ id: `Seed${i + 1}`.padEnd(22, "0"), names: [`Guest${i + 1}`, "Sam"], total: 1000 * (i + 1), added: now - (i + 1) * 60_000 }));

const pageScroller = (page: Page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>("div")].find((el) => el.scrollHeight > el.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY));
    return el ? { top: el.scrollTop, max: el.scrollHeight - el.clientHeight } : null;
  });
const scrollTo = (page: Page, to: number | "end") =>
  page.evaluate((to) => {
    const el = [...document.querySelectorAll<HTMLElement>("div")].find((el) => el.scrollHeight > el.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY))!;
    el.scrollTop = to === "end" ? el.scrollHeight : to;
  }, to);
const topOf = async (locator: Locator) => Math.round((await locator.boundingBox())!.y);

test("with eight Recent splits the header and sentence stay pinned while the list scrolls, and its last row ends above the footer", async ({ page }) => {
  await seed(page, eight);
  const sentence = page.getByTestId("sentence");
  const heading = page.getByRole("heading", { name: "SplitWith" });
  const rest = [await topOf(heading), await topOf(sentence)];
  expect(rest).toEqual([30, 104]);
  expect((await pageScroller(page))!.max).toBeGreaterThan(100);
  await scrollTo(page, "end");
  await expect(rows(page).last()).toBeVisible();
  expect([await topOf(heading), await topOf(sentence)]).toEqual(rest);
  const [last, footer] = [(await rows(page).last().boundingBox())!, (await action(page).boundingBox())!];
  expect(last.y + last.height).toBeLessThanOrEqual(footer.y);
});

test("with no Recent splits nothing scrolls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
  expect(await pageScroller(page)).toBeNull();
});

test("twelve names make the sentence too tall to pin, so the whole page scrolls and the header leaves", async ({ page }) => {
  await seed(page, eight);
  await addNames(page, "Jason", ...Array.from({ length: 12 }, (_, i) => `Guest number ${i + 1}`));
  const heading = page.getByRole("heading", { name: "SplitWith" });
  await scrollTo(page, "end");
  expect(await topOf(heading)).toBeLessThan(0);
  await expect(rows(page).last()).toBeVisible();
});

test("Revert on your own change locks from the first tap, so a second tap during the arrow's swing sends no second undo", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await (await newContext(browser)).newPage();
  await sam.setViewportSize(phone);
  const undos: string[] = [];
  sam.on("websocket", (socket) => socket.on("framesent", ({ payload }) => String(payload).includes('"type":"undo"') && undos.push(String(payload))));
  await sam.goto(link);
  await sam.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
  await expect(sam.getByTestId("owe")).toBeVisible(live);
  await editAmount(sam, "Open Tax, $1.00", "Charge", "Amount", "3.00");
  await expect(sam.getByTestId("total")).toHaveText("$21.00", live);

  await fromMore(sam, "History");
  const revert = sam.getByRole("button", { name: "Revert Tax" });
  await revert.click();
  await expect(revert).toHaveAttribute("aria-disabled", "true");
  await sam.waitForTimeout(120);
  await revert.click({ force: true });
  await expect(sam.getByText("Reverted")).toBeVisible(live);
  await sam.waitForTimeout(500);
  expect(undos).toHaveLength(1);
  await expect(sam.getByTestId("total")).toHaveText("$19.00");
});
