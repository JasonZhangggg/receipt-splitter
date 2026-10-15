import { addRow, openAdd } from "./add-menu";
import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";
import { fromMore } from "./header";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone });
test.setTimeout(90_000);

const live = { timeout: 15_000 };
let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const items = [
    { id: "rice", name: "Rice", price: 800 },
    { id: "pitcher", name: "Pitcher", price: 1200 },
    { id: "fries", name: "Fries", price: 500 },
  ];
  const adjustments = [
    { id: "tax", kind: "tax", name: "Tax", amount: 100 },
    { id: "coupon", kind: "discount", name: "Coupon", amount: -100 },
  ];
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.56.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: { items, adjustments, subtotal: 2500, total: 2500 },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function samsPhone(browser: Browser, link: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(phone);
  await page.goto(link);
  const pick = page.getByRole("dialog", { name: "Which one are you?" });
  await expect(pick).toBeVisible(live);
  await pick.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

type Close = "Enter" | "Space" | "assistive click";

/** Tab or a screen reader lands on Close, then a key presses it or the screen reader activates it, which reaches the page as a click with no pointer. */
async function closeBy(how: Close, sheet: Locator) {
  const close = sheet.getByRole("button", { name: "Close", exact: true });
  await close.focus();
  if (how === "assistive click") return close.evaluate((button: HTMLElement) => button.click());
  await close.press(how === "Space" ? " " : "Enter");
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);

for (const how of ["Enter", "Space", "assistive click"] as const) {
  test(`${how} on Close gives focus back to the row or button that opened each sheet`, async ({ browser, request }, { workerIndex }) => {
    const sam = await samsPhone(browser, await createSplit(request, workerIndex));
    const openers: readonly (readonly [Locator, string, () => Promise<void>])[] = [
      [sam.getByRole("button", { name: /^Open Rice, / }), "Edit item", () => sam.getByRole("button", { name: /^Open Rice, / }).click()],
      [sam.getByRole("button", { name: "Open Coupon, -$1.00" }), "Discount", () => sam.getByRole("button", { name: "Open Coupon, -$1.00" }).click()],
      [addRow(sam), "Add to the receipt", () => openAdd(sam, "Item")],
      [addRow(sam), "Add to the receipt", () => openAdd(sam, "Tip")],
      [sam.getByRole("button", { name: "History", exact: true }), "History", () => fromMore(sam, "History")],
    ];
    for (const [opener, title, open] of openers) {
      await open();
      const sheet = sam.getByRole("dialog", { name: title });
      await expect(sheet).toBeVisible();
      await closeBy(how, sheet);
      await expect(sheet).toHaveCount(0, live);
      await expect(opener, `${title} gives focus back`).toBeFocused();
    }
  });
}

test("Delete item pressed from the keyboard gives focus to the next row", async ({ browser, request }, { workerIndex }) => {
  const sam = await samsPhone(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: /^Open Pitcher, / }).click();
  const sheet = sam.getByRole("dialog", { name: "Edit item" });
  await sheet.getByRole("button", { name: "Delete item", exact: true }).focus();
  await sam.keyboard.press("Enter");
  await expect(sheet).toHaveCount(0, live);
  await expect(sam.getByRole("button", { name: /^Open Pitcher, / })).toHaveCount(0);
  await expect(sam.getByRole("button", { name: /^Open Fries, / })).toBeFocused();
});

test("Close, just look pressed from the keyboard gives focus to Which one are you?", async ({ browser, request }, { workerIndex }) => {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(phone);
  await page.goto(await createSplit(request, workerIndex));
  const pick = page.getByRole("dialog", { name: "Which one are you?" });
  await expect(pick).toBeVisible(live);
  // focus() does not wait the way a click does, and the page takes no input until the first-load loader lifts.
  await expect(page.locator("#root")).not.toHaveAttribute("inert", live);
  await pick.getByRole("button", { name: "Close, just look", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Which one are you?", exact: true })).toBeFocused(live);
});

test("a swipe down closes the Item sheet without moving focus or scrolling the page", async ({ browser, request }, { workerIndex }) => {
  const sam = await samsPhone(browser, await createSplit(request, workerIndex));
  const row = sam.getByRole("button", { name: /^Open Rice, / });
  await row.click();
  const sheet = sam.getByRole("dialog", { name: "Edit item" });
  await expect(sheet).toBeVisible();
  const focusBefore = await focused(sam);
  const before = await sam.evaluate(() => [scrollY, ...[...document.querySelectorAll("*")].filter((el) => el.scrollTop > 0).map((el) => el.scrollTop)]);
  await sam.getByTestId("item-sheet").evaluate(async (surface) => {
    Element.prototype.setPointerCapture = () => {};
    const grab = surface.querySelector("[data-sheet-grab]")!;
    const from = grab.getBoundingClientRect().top + 8;
    const fire = (type: string, y: number) =>
      grab.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 43, pointerType: "touch", isPrimary: true, clientX: innerWidth / 2, clientY: y }));
    fire("pointerdown", from);
    for (let dy = 30; dy <= 300; dy += 30) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      fire("pointermove", from + dy);
    }
    fire("pointerup", from + 300);
  });
  await expect(sheet).toHaveCount(0, live);
  expect(await focused(sam)).toBe(focusBefore);
  expect(await sam.evaluate(() => [scrollY, ...[...document.querySelectorAll("*")].filter((el) => el.scrollTop > 0).map((el) => el.scrollTop)])).toEqual(before);
});

