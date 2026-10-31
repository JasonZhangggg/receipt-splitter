import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";
import { viewAs } from "./header";

/**
 * The Split page's desktop layout (docs/plans/desktop-layout.md, docs/plans/spread-layout.md): the receipt on the left and a
 * column on the right that holds what a phone shows in bottom sheets, centered as one frame. Every click and key path runs at 1440x900 and 1024x768, light mode,
 * then the 390px phone is smoked to show the footer and sheets are untouched.
 */

test.setTimeout(90_000);

const live = { timeout: 15_000 };
const venmo = { service: "venmo", handle: "jason-z" };
const zelle = { service: "zelle", handle: "jason@example.com" };

const menu = {
  items: [
    { id: "rice", name: "Chicken Fried Rice", price: 799 },
    { id: "tropic", name: "California Tropic", price: 799 },
    { id: "tostones", name: "Tostones", price: 100 },
    { id: "sprite", name: "Sprite", price: 250 },
    { id: "perrier", name: "Perrier", price: 350 },
  ],
  adjustments: [
    { id: "tax", kind: "tax", name: "Tax", amount: 161 },
    { id: "fees", kind: "serviceCharge", name: "Service fees", amount: 345 },
  ],
  subtotal: 2298,
  total: 2804,
};
const people = ["Jason", "Sam", "Priya", "Lee"].map((name) => ({ id: name.toLowerCase(), name }));

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, paymentHandles: readonly object[] = [venmo], receipt: object = menu, participants: readonly object[] = people, place?: string): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.57.${workerIndex}.${creates}` },
    data: { split: { receipt, participants, paymentHandles, ...(place === undefined ? {} : { place }) } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

/** Every console error and uncaught error on every page of the running test; each test ends by expecting none. */
let problems: string[] = [];

function watch(page: Page) {
  page.on("console", (message) => message.type() === "error" && problems.push(`console: ${message.text()}`));
  page.on("pageerror", (error) => problems.push(`pageerror: ${error}`));
}

test.beforeEach(({ page }) => {
  problems = [];
  watch(page);
});

test.afterEach(() => {
  expect(problems, "console errors").toEqual([]);
});

const asking = (page: Page) => page.getByRole("region", { name: "Which one are you?" });
const column = (page: Page, name: string) => page.getByRole("region", { name });
const shareColumn = (page: Page) => page.getByTestId("share-panel");
const switcher = (page: Page) => shareColumn(page).getByRole("button", { name: /Choose whose share to show$/ });
const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });
const line = (page: Page, item: string) => page.getByRole("button", { name: new RegExp(`^Open ${item}, `) });
const adjustmentRow = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^Open ${name}, `) });
const share = (page: Page) => page.getByTestId("share");
const picker = (page: Page) => page.getByRole("dialog", { name: "Choose whose share to show" });
const addLink = (page: Page) => page.getByRole("button", { name: "Add item, tax, tip or discount", exact: true });
const undo = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || document.activeElement?.tagName || null);

async function openSplit(page: Page, link: string) {
  await page.goto(link);
  await expect(asking(page).getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  // The boot loader keeps the page inert for a moment after it paints, and a focus() there is dropped.
  await expect(page.locator("#root")).not.toHaveAttribute("inert", live);
}

async function pick(page: Page, name: string) {
  await asking(page).getByRole("button", { name, exact: true }).click();
  await expect(shareColumn(page)).toBeVisible(live);
  await expect(asking(page)).toHaveCount(0, live);
  // The share view slides back in over the pick; it rests in place once the pick has slid away and nothing is inert.
  await expect.poll(() => page.evaluate(() => document.querySelectorAll("[inert]").length), live).toBe(0);
}

async function second(browser: Browser, link: string, name: string, size: { width: number; height: number }): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  watch(page);
  await page.setViewportSize(size);
  await openSplit(page, link);
  await pick(page, name);
  return page;
}

async function openPicker(page: Page) {
  await switcher(page).click();
  await expect(picker(page)).toBeVisible(live);
}

async function openPeople(page: Page) {
  await openPicker(page);
  await picker(page).getByRole("button", { name: "Edit people" }).click();
  await expect(column(page, "People")).toBeVisible(live);
}

/** The toast must be on screen and the topmost thing at its center, not under the column or the receipt. */
async function expectToastShown(page: Page, text: string | RegExp) {
  const toast = page.getByText(text);
  await expect(toast).toBeVisible(live);
  const box = (await toast.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  const topmost = await toast.evaluate((element) => {
    const at = element.getBoundingClientRect();
    const hit = document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2);
    return hit !== null && element.contains(hit);
  });
  expect(topmost, "toast is the topmost thing at its center").toBe(true);
}

const sizes = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

for (const size of sizes) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: false, hasTouch: false, colorScheme: "light", permissions: ["clipboard-read", "clipboard-write"] });

    test("the layout: receipt left, the column right, no footer, the total as the title, and the links once, in the top bar", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await expect(page.getByTestId("footer")).toHaveCount(0);
      await expect(page.getByTestId("split-title")).toHaveText("$28.04");
      await expect(page.getByTestId("paid-by")).toHaveText("Paid by Jason");
      await expect(page.getByText(/Click the dot/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "People", exact: true })).toHaveCount(1);
      const links = (await page.getByRole("button", { name: "People", exact: true }).boundingBox())!;
      expect(links.y).toBeLessThan((await page.getByTestId("split-title").boundingBox())!.y);
      const box = (await shareColumn(page).boundingBox())!;
      expect(Math.round(box.width)).toBeGreaterThanOrEqual(360);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      const receipt = (await page.getByTestId("receipt").boundingBox())!;
      expect(receipt.x + receipt.width).toBeLessThanOrEqual(box.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    });

    test("the pick column: the receipt stays clickable, a name shows that person's column, and the pick column goes", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await expect(asking(page).getByText("Jason invited you to split $28.04")).toBeVisible();
      await expect(asking(page).getByRole("button", { name: "Not here? Add yourself" })).toBeVisible();
      await expect(line(page, "Sprite")).toBeVisible();

      await pick(page, "Sam");

      await expect(column(page, "What you had")).toBeVisible();
      await expect(share(page)).toHaveText("$0.00");
      await expect(circle(page, "Sprite", "Sam")).toBeVisible();
    });

    test("Back, just look leaves the receipt, and the 'Which one are you?' link brings the pick column back", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));

      await asking(page).getByRole("button", { name: "Back, just look" }).click();
      await expect(asking(page).getByRole("heading", { name: "Which one are you?" })).toHaveCount(0, live);
      const again = shareColumn(page).getByRole("button", { name: "Which one are you?" });
      await expect(again).toBeVisible(live);

      await again.click();
      await expect(asking(page).getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
      await pick(page, "Priya");
      await expect(circle(page, "Sprite", "Priya")).toBeVisible();
    });

    test("Not here? Add yourself adds a new person who is then you", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await asking(page).getByRole("button", { name: "Not here? Add yourself" }).click();
      const name = asking(page).getByRole("textbox", { name: "Your name" });
      await expect(name).toBeVisible();

      await name.fill("Zoe");
      await asking(page).getByRole("button", { name: "Join as Zoe" }).click();

      await expect(shareColumn(page)).toBeVisible(live);
      await expect(circle(page, "Sprite", "Zoe")).toBeVisible(live);
      await openPicker(page);
      await expect(picker(page).getByRole("button", { name: "You" })).toContainText("$0.00");
      await expect(picker(page).getByRole("button", { name: "Jason" })).toBeVisible();
    });

    test("claim dots on the left update the column live: items, tax and fees, and the share, and unchecking undoes it", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await expect(shareColumn(page)).toContainText("Check off what you had.");

      await circle(page, "Sprite", "Sam").click();

      await expect(share(page)).toHaveText("$3.05", live);
      await expect(shareColumn(page)).toContainText("Sprite");
      await expect(shareColumn(page)).toContainText("$2.50");
      await expect(shareColumn(page)).toContainText("Tax");
      await expect(shareColumn(page)).toContainText("$0.17");
      await expect(shareColumn(page)).toContainText("$0.38");
      await circle(page, "Perrier", "Sam").click();
      await expect(share(page)).toHaveText("$7.32", live);
      await expect(shareColumn(page)).toContainText("Perrier");

      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$4.27", live);
      await expect(shareColumn(page)).not.toContainText("Sprite");
    });

    test("two browsers on one Split: a claim in one shows in the other's list and share", async ({ page, browser, request }, { workerIndex }) => {
      const link = await createSplit(request, workerIndex);
      await openSplit(page, link);
      await pick(page, "Sam");
      const priya = await second(browser, link, "Priya", size);

      await circle(priya, "Perrier", "Priya").click();
      await expect(share(priya)).toHaveText("$4.27", live);
      await expect(line(page, "Perrier")).toContainText("Priya", live);

      await circle(page, "Perrier", "Sam").click();
      await expect(share(page)).toHaveText(/^\$2\.1[34]$/, live);
      await expect(share(priya)).toHaveText(/^\$2\.1[34]$/, live);
      await expect(line(priya, "Perrier")).toContainText("Sam", live);
      await openPicker(page);
      await expect(picker(page).getByRole("button", { name: "Priya" })).toContainText(/\$2\.1[34]/);
    });

    test("the people menu lists everyone with a share, checks the one shown, and choosing someone switches the column and the left list", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);

      await openPicker(page);
      const rows = picker(page).getByRole("button");
      await expect(rows).toHaveCount(5);
      await expect(picker(page).getByRole("button", { name: "You" })).toHaveAttribute("aria-pressed", "true");
      await expect(picker(page).getByRole("button", { name: "You" })).toContainText("$3.05");
      await expect(picker(page).getByRole("button", { name: "Priya" })).toHaveAttribute("aria-pressed", "false");
      await expect(picker(page).getByRole("button", { name: "Edit people" })).toBeVisible();

      await picker(page).getByRole("button", { name: "Priya" }).click();

      await expect(picker(page)).toHaveCount(0, live);
      await expect(column(page, "What Priya had")).toBeVisible(live);
      await expect(share(page)).toHaveText("$0.00");
      await expect(page.getByText("Viewing as Priya.")).toBeVisible();
      await expect(circle(page, "Sprite", "Priya")).toBeVisible();
      await expect(switcher(page)).toContainText("Priya's share");

      await page.getByRole("button", { name: "Back to you" }).click();
      await expect(column(page, "What you had")).toBeVisible(live);
      await expect(page.getByText("Viewing as Priya.")).toHaveCount(0, live);
      await expect(share(page)).toHaveText("$3.05");
      await expect(circle(page, "Sprite", "Sam")).toBeVisible();
    });

    test("the people menu closes on Escape and on a click outside, and focus returns to its trigger each time", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await openPicker(page);
      await page.keyboard.press("Escape");
      await expect(picker(page)).toHaveCount(0, live);
      await expect(switcher(page)).toBeFocused();
      await expect(shareColumn(page)).toBeVisible();

      await openPicker(page);
      await page.mouse.click(size.width / 2 - 150, size.height - 40);
      await expect(picker(page)).toHaveCount(0, live);
      await expect(switcher(page)).toBeFocused();

      await switcher(page).focus();
      await page.keyboard.press("Enter");
      await expect(picker(page)).toBeVisible(live);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Escape");
      await expect(picker(page)).toHaveCount(0, live);
      await expect(switcher(page)).toBeFocused();
    });

    test("Edit people opens People in the column, and a person's row shows their share", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await openPeople(page);

      await expect(column(page, "People").getByRole("button", { name: "Sam, you" })).toBeVisible();
      await expect(column(page, "People").getByRole("button", { name: "Switch account" })).toBeVisible();
      await column(page, "People").getByRole("button", { name: /^Priya/ }).click();
      await expect(column(page, "What Priya had")).toBeVisible(live);
      await expect(page.getByText("Viewing as Priya.")).toBeVisible();
    });

    test("People: add a person, remove someone, switch account", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await openPeople(page);
      const people = column(page, "People");

      await people.getByRole("button", { name: "Add a person" }).click();
      await people.getByRole("textbox").fill("Zoe");
      await page.keyboard.press("Enter");
      await expect(people.getByRole("button", { name: /^Zoe/ })).toBeVisible(live);

      await people.getByRole("button", { name: "Remove someone" }).click();
      await people.getByRole("button", { name: "Remove Lee" }).click();
      const options = page.getByRole("dialog", { name: "Options for Lee" });
      await expect(options).toBeVisible(live);
      await options.getByRole("button", { name: "Remove Lee" }).click();
      await expect(people.getByRole("button", { name: /Lee/ })).toHaveCount(0, live);
      await people.getByRole("button", { name: "Done" }).click();

      await people.getByRole("button", { name: "Switch account" }).click();
      await expect(people).toContainText("Click the name that's you on this computer.");
      await people.getByRole("button", { name: /^Priya/ }).click();
      await expect(column(page, "What you had")).toBeVisible(live);
      await expect(circle(page, "Sprite", "Priya")).toBeVisible(live);
      await expect(circle(page, "Sprite", "Sam")).toHaveCount(0);
    });

    test("Remove someone in the column: Escape closes the person's menu first, then the column", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await openPeople(page);
      await column(page, "People").getByRole("button", { name: "Remove someone" }).click();
      await column(page, "People").getByRole("button", { name: "Remove Priya" }).click();
      const options = page.getByRole("dialog", { name: "Options for Priya" });
      await expect(options).toBeVisible(live);

      await page.keyboard.press("Escape");
      await expect(options).toHaveCount(0, live);
      await expect(column(page, "People")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(column(page, "People")).toHaveCount(0, live);
      await expect(column(page, "What you had")).toBeVisible(live);
    });

    test("a line opens Edit item in the column, and clicking another line switches to it", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await line(page, "Sprite").click();
      await expect(column(page, "Edit item")).toBeVisible(live);
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Sprite");
      await expect(page.getByRole("textbox", { name: "Price" })).toHaveValue("2.50");
      await expect(page.getByTestId("footer")).toHaveCount(0);

      await line(page, "Perrier").click();
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Perrier", live);
      await expect(page.getByRole("textbox", { name: "Price" })).toHaveValue("3.50");
      await expect(column(page, "Edit item")).toHaveCount(1);
    });

    test("a half-typed name and price are saved, not lost, when another line is clicked", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Sprite").click();
      await page.getByRole("textbox", { name: "Item name" }).fill("Sprite Zero");

      await line(page, "Perrier").click();
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Perrier", live);
      await expect(line(page, "Sprite Zero")).toContainText("$2.50", live);

      await page.getByRole("textbox", { name: "Price" }).fill("9.99");
      await line(page, "Tostones").click();
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Tostones", live);
      await expect(line(page, "Perrier")).toContainText("$9.99", live);
    });

    test("rename and price edits save to the receipt and the Total, and the column's share follows", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);
      await line(page, "Sprite").click();

      await page.getByRole("textbox", { name: "Item name" }).fill("Fanta");
      await page.getByRole("textbox", { name: "Price" }).fill("4.00");
      await page.getByRole("textbox", { name: "Price" }).blur();

      await expect(line(page, "Fanta")).toContainText("$4.00", live);
      await expect(page.getByTestId("receipt")).toContainText("$29.54", live);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(share(page)).toHaveText("$4.83", live);
      await expect(shareColumn(page)).toContainText("Fanta");
    });

    test("the split modes menu opens in the item column, Escape closes it before the column, and By shares applies", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Sprite").click();
      const modes = page.getByRole("button", { name: /How to split/ });

      await modes.click();
      await expect(page.getByText("Give more to whoever had more")).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(page.getByText("Give more to whoever had more")).toHaveCount(0, live);
      await expect(column(page, "Edit item")).toBeVisible();
      await expect(modes).toBeFocused();
      // Clicking the link scrolls it into view; its tap area hangs past the row, and the column used to scroll 8px sideways to show it.
      expect(await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => el.scrollLeft > 0).length)).toBe(0);

      await modes.click();
      await page.getByText("Give more to whoever had more").click();
      await expect(modes).toContainText("By shares", live);
      await expect(column(page, "Edit item")).toBeVisible();
    });

    test("a claim made in Edit item updates the left list and the share", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Sprite").click();

      await column(page, "Edit item").getByRole("button", { name: "Sam, you" }).click();

      await expect(line(page, "Sprite")).toContainText("You", live);
      await expect(circle(page, "Sprite", "Sam")).toHaveAttribute("aria-pressed", "true", live);
      await page.keyboard.press("Escape");
      await expect(share(page)).toHaveText("$3.05", live);
    });

    test("Delete item removes the line and the Total, the Undo toast is on screen, and Undo puts it back", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Tostones").click();

      await column(page, "Edit item").getByRole("button", { name: "Delete item" }).click();

      await expect(column(page, "Edit item")).toHaveCount(0, live);
      await expect(line(page, "Tostones")).toHaveCount(0, live);
      await expect(page.getByTestId("receipt")).toContainText("$27.04");
      await expectToastShown(page, /Deleted/);
      await expect(undo(page)).toBeVisible();

      await undo(page).click();
      await expect(line(page, "Tostones")).toBeVisible(live);
      await expect(page.getByTestId("receipt")).toContainText("$28.04", live);
    });

    test("Escape closes Edit item, and focus returns to the line; the Close button does too", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await line(page, "Sprite").click();
      await expect(column(page, "Edit item")).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(column(page, "Edit item")).toHaveCount(0, live);
      await expect(line(page, "Sprite")).toBeFocused();
      await expect(column(page, "What you had")).toBeVisible(live);

      await line(page, "Sprite").click();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(column(page, "Edit item")).toHaveCount(0, live);
      await expect(line(page, "Sprite")).toBeFocused();
    });

    test("Add item, then tax, tip and a discount, each lands on the receipt and the Total", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      const add = column(page, "Add to the receipt");
      const kind = (name: string) => add.getByRole("group", { name: "What to add" }).getByRole("button", { name, exact: true });

      await addLink(page).click();
      await expect(add).toBeVisible(live);
      await add.getByRole("textbox", { name: "Name" }).fill("Fries");
      await add.getByRole("textbox", { name: "Price" }).fill("5.00");
      await add.getByRole("button", { name: "Add item" }).click();
      await expect(line(page, "Fries")).toBeVisible(live);
      await expect(page.getByTestId("receipt")).toContainText("$33.04", live);

      await addLink(page).click();
      await kind("Tip").click();
      await add.getByRole("textbox", { name: /Amount|Price/ }).fill("4.00");
      await add.getByRole("button", { name: /^Add/ }).last().click();
      await expect(adjustmentRow(page, "Tip")).toBeVisible(live);
      await expect(page.getByTestId("receipt")).toContainText("$37.04", live);

      await addLink(page).click();
      await kind("Discount").click();
      await add.getByRole("textbox", { name: /Amount|Price/ }).fill("2.00");
      await add.getByRole("button", { name: /^Add/ }).last().click();
      await expect(page.getByTestId("receipt")).toContainText("$35.04", live);
    });

    test("an adjustment row opens Edit tax in the column, edits save to the Total, and Escape returns focus to the row", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await adjustmentRow(page, "Tax").click();
      const edit = column(page, "Edit tax");
      await expect(edit).toBeVisible(live);
      await expect(edit.getByRole("textbox", { name: "Amount" })).toHaveValue("1.61");
      await edit.getByRole("textbox", { name: "Amount" }).fill("2.61");
      await edit.getByRole("textbox", { name: "Amount" }).blur();
      await expect(page.getByTestId("receipt")).toContainText("$29.04", live);

      await adjustmentRow(page, "Service fees").click();
      await expect(column(page, "Edit service charge").or(column(page, "Edit fee"))).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(adjustmentRow(page, "Service fees")).toBeFocused();
    });

    test("Payments opens in the column and Escape closes it", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();

      await page.getByRole("button", { name: "Payments", exact: true }).click();

      await expect(column(page, "Payments")).toBeVisible(live);
      await expect(column(page, "Payments")).toContainText("Everyone pays Jason.");
      await expect(column(page, "Payments").getByRole("button", { name: /^Sam, you, Not paid/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(column(page, "Payments")).toHaveCount(0, live);
      await expect(column(page, "What you had")).toBeVisible(live);
    });

    test("after Escape closes Payments, focus returns to the Payments link", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await page.getByRole("button", { name: "Payments", exact: true }).click();
      await expect(column(page, "Payments")).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(column(page, "What you had")).toBeVisible(live);

      await expect(page.getByRole("button", { name: "Payments", exact: true })).toBeFocused();
    });

    test("after Escape closes History, focus returns to the History link", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");

      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(column(page, "History")).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(column(page, "What you had")).toBeVisible(live);

      await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
    });

    test("after Escape closes People (opened from Edit people), focus returns to the people menu trigger", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await openPeople(page);

      await page.keyboard.press("Escape");
      await expect(column(page, "What you had")).toBeVisible(live);

      await expect(switcher(page)).toBeFocused();
    });

    test("History: your own revert applies at once from the arrow, and someone else's change asks 'Revert Sam's change?' first", async ({ page, browser, request }, { workerIndex }) => {
      const link = await createSplit(request, workerIndex);
      await openSplit(page, link);
      await pick(page, "Sam");
      await line(page, "Sprite").click();
      await page.getByRole("textbox", { name: "Price" }).fill("4.00");
      await page.getByRole("textbox", { name: "Price" }).blur();
      await expect(page.getByTestId("receipt")).toContainText("$29.54", live);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(column(page, "History")).toContainText("Sprite");

      await column(page, "History").getByRole("button", { name: "Revert Sprite" }).click();
      await expect(page.getByTestId("receipt")).toContainText("$28.04", live);
      await expect(column(page, "History")).toContainText("Reverted");

      const priya = await second(browser, link, "Priya", size);
      await line(priya, "Perrier").click();
      await priya.getByRole("textbox", { name: "Price" }).fill("5.00");
      await priya.getByRole("textbox", { name: "Price" }).blur();
      await expect(page.getByTestId("receipt")).toContainText("$29.54", live);
      await column(page, "History").getByRole("button", { name: "Revert Perrier" }).click();
      const ask = page.getByRole("dialog", { name: "Revert Priya's change?" });
      await expect(ask).toBeVisible(live);
      await ask.getByRole("button", { name: "Revert" }).click();
      await expect(page.getByTestId("receipt")).toContainText("$28.04", live);
    });

    test("pay: the Venmo link, the handle line, Mark as paid with an Undo toast, Undo, and Mark as not paid", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await expect(shareColumn(page).getByRole("link", { name: /^Pay Jason/ })).toHaveCount(0);
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);

      const pay = shareColumn(page).getByRole("link", { name: "Pay Jason $3.05 on Venmo" });
      await expect(pay).toHaveAttribute("href", "https://venmo.com/jason-z?txn=pay&amount=3.05&note=Receipt%20split");
      await expect(shareColumn(page).getByText("Venmo @jason-z")).toBeVisible();
      await expect(shareColumn(page).getByRole("combobox", { name: "Pay with" })).toHaveCount(0);
      await expect(shareColumn(page).getByText("Paid another way?")).toBeVisible();

      await shareColumn(page).getByRole("button", { name: "Mark as paid" }).click();
      await expect(shareColumn(page)).toContainText("You paid $3.05", live);
      await expect(pay).toHaveCount(0);
      await shareColumn(page).getByRole("button", { name: "Mark as not paid" }).click();
      await expect(shareColumn(page).getByRole("button", { name: "Mark as paid" })).toBeVisible(live);
      await expect(pay).toBeVisible();
    });

    test("pay with Venmo and Zelle: the method select appears, Zelle swaps the button for a copy button, and it copies the handle", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex, [venmo, zelle]));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);
      const method = shareColumn(page).getByRole("combobox", { name: "Pay with" });
      await expect(method).toBeVisible();
      await expect(shareColumn(page).getByRole("link", { name: "Pay Jason $3.05 on Venmo" })).toBeVisible();

      await method.selectOption("zelle");

      const copy = shareColumn(page).getByRole("button", { name: "Copy jason@example.com to pay Jason $3.05 on Zelle" });
      await expect(copy).toBeVisible(live);
      await expect(shareColumn(page).getByText("Zelle jason@example.com")).toBeVisible();
      await page.waitForTimeout(600);
      await copy.click();
      await expect(shareColumn(page)).toContainText("Copied", live);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("jason@example.com");
      const pill = (await copy.boundingBox())!;
      const column_ = (await shareColumn(page).boundingBox())!;
      expect(pill.x + pill.width).toBeLessThanOrEqual(column_.x + column_.width);
    });

    test("the host's own column (pick Jason) has no pay button and no 'Mark as paid'", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Jason");
      await circle(page, "Sprite", "Jason").click();
      await expect(share(page)).toHaveText("$3.05", live);

      await expect(shareColumn(page).getByRole("link", { name: /^Pay Jason/ })).toHaveCount(0);
      await expect(shareColumn(page).getByRole("button", { name: "Mark as paid" })).toHaveCount(0);
      await expect(shareColumn(page).getByText("Paid another way?")).toHaveCount(0);
    });

    test("viewing someone else who owes shows their share and a pay button for you to pay, not their own mark-as-paid", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await openPicker(page);
      await picker(page).getByRole("button", { name: "Jason" }).click();

      await expect(column(page, "What Jason had")).toBeVisible(live);
      await expect(shareColumn(page).getByRole("link", { name: /^Pay Jason/ })).toHaveCount(0);
      await expect(page.getByText("Viewing as Jason.")).toBeVisible();
    });

    test("viewing someone else: ticking a dot asks 'Check Sprite for Priya?', its yes updates their column, and there is no pay button for them", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await openPicker(page);
      await picker(page).getByRole("button", { name: "Priya" }).click();
      await expect(column(page, "What Priya had")).toBeVisible(live);

      await circle(page, "Sprite", "Priya").click();
      const ask = page.getByRole("dialog", { name: "Check Sprite for Priya?" });
      await expect(ask).toBeVisible(live);
      await ask.getByRole("button", { name: "Check for Priya" }).click();

      await expect(share(page)).toHaveText("$3.05", live);
      await expect(shareColumn(page)).toContainText("Priya's share");
      await expect(shareColumn(page).getByRole("link", { name: /^Pay/ })).toHaveCount(0);
      await expect(shareColumn(page).getByRole("button", { name: /Mark as/ })).toHaveCount(0);
      await line(page, "Sprite").click();
      await expect(column(page, "Edit item")).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(column(page, "What Priya had")).toBeVisible(live);
      await expect(page.getByText("Viewing as Priya.")).toBeVisible();
    });

    test("while the pick column is open, a click on a line leaves the pick column as it is, and a dot closes nothing but asks to pick", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));

      await line(page, "Sprite").click();
      await page.waitForTimeout(400);

      await expect(asking(page).getByRole("heading", { name: "Which one are you?" })).toBeVisible();
      await expect(column(page, "Edit item")).toHaveCount(0);
    });

    test("another browser deleting the open item closes Edit item cleanly and the column returns to the share", async ({ page, browser, request }, { workerIndex }) => {
      const link = await createSplit(request, workerIndex);
      await openSplit(page, link);
      await pick(page, "Sam");
      const priya = await second(browser, link, "Priya", size);
      await line(page, "Perrier").click();
      await expect(column(page, "Edit item")).toBeVisible(live);

      await line(priya, "Perrier").click();
      await priya.getByRole("button", { name: "Delete item" }).click();

      await expect(line(page, "Perrier")).toHaveCount(0, live);
      await expect(column(page, "Edit item")).toHaveCount(0, live);
      await expect(column(page, "What you had")).toBeVisible(live);
      await page.getByRole("button", { name: "Sprite, check for Sam" }).click();
      await expect(share(page)).toHaveText("$3.15", live);
    });

    test("long names: a long item name and a long person name wrap or truncate without horizontal scroll or a column spill", async ({ page, request }, { workerIndex }) => {
      const long = {
        items: [
          { id: "a", name: "Seasonal Wood-Fired Margherita Pizza With Extra Burrata And Basil Leaves Garnish", price: 123456 },
          { id: "b", name: "Tea", price: 300 },
        ],
        adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 5000 }],
        subtotal: 123756,
        total: 128756,
      };
      const names = [{ id: "jason", name: "Jason" }, { id: "bart", name: "Bartholomew Montgomery-Featherstonehaugh" }];
      await openSplit(page, await createSplit(request, workerIndex, [venmo], long, names));
      await pick(page, "Bartholomew Montgomery-Featherstonehaugh");
      await page.getByRole("button", { name: /^Open Seasonal/ }).click();
      await expect(column(page, "Edit item")).toBeVisible(live);
      await column(page, "Edit item").getByRole("button", { name: /Bartholomew/ }).click();
      await page.keyboard.press("Escape");
      await expect(share(page)).toBeVisible(live);

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
      const panel = (await shareColumn(page).boundingBox())!;
      for (const box of await shareColumn(page).getByRole("button").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right))) expect(box).toBeLessThanOrEqual(panel.x + panel.width + 1);
      await expect(share(page)).toHaveText("$1,284.44", live);
    });

    test("resize: Edit item open at wide, down to 800 (phone layout, sheet) and back keeps it open and nothing is stuck", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Sprite").click();
      await expect(column(page, "Edit item")).toBeVisible(live);

      await page.setViewportSize({ width: 800, height: 900 });
      await expect(page.getByTestId("item-sheet")).toBeVisible(live);
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Sprite");
      await page.setViewportSize(size);
      await expect(column(page, "Edit item")).toBeVisible(live);
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Sprite");

      await line(page, "Perrier").click();
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Perrier", live);
      await page.keyboard.press("Escape");
      await expect(column(page, "What you had")).toBeVisible(live);
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);
    });

    test("resize: a bottom sheet open at 800 becomes the column at wide, the receipt is still clickable, and closing works", async ({ page, request }, { workerIndex }) => {
      await page.setViewportSize({ width: 800, height: 900 });
      await page.goto(await createSplit(request, workerIndex));
      await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
      await expect(page.getByTestId("footer")).toBeVisible(live);
      await line(page, "Sprite").click();
      await expect(page.getByTestId("item-sheet")).toBeVisible(live);

      await page.setViewportSize(size);

      await expect(column(page, "Edit item")).toBeVisible(live);
      await expect(page.getByTestId("footer")).toHaveCount(0);
      await line(page, "Perrier").click();
      await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Perrier", live);
      await column(page, "Edit item").getByRole("button", { name: "Back", exact: true }).click();
      await expect(column(page, "Edit item")).toHaveCount(0, live);
      await switcher(page).click();
      await expect(picker(page)).toBeVisible(live);
    });

    test("resize: the pick column open at wide becomes the pick sheet at 800 and back", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));

      await page.setViewportSize({ width: 800, height: 900 });
      await expect(page.getByRole("dialog", { name: "Which one are you?" })).toBeVisible(live);
      await page.setViewportSize(size);
      await expect(asking(page).getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
      await pick(page, "Sam");
    });

    test("keyboard only: Tab walks the header, the receipt, then the right column, and Enter and Space work on dots and lines", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await asking(page).getByRole("button", { name: "Sam", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(shareColumn(page)).toBeVisible(live);

      await page.locator("body").evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.getByRole("button", { name: "Switch to dark mode" }).focus();
      const order: string[] = [];
      for (let step = 0; step < 24; step++) {
        await page.keyboard.press("Tab");
        order.push((await focused(page)) ?? "");
      }
      const at = (needle: RegExp) => order.findIndex((label) => needle.test(label));
      expect(at(/^Share link/)).toBe(0);
      expect(at(/^All, 5$/)).toBeGreaterThan(0);
      expect(at(/^Chicken Fried Rice, check for Sam/)).toBeGreaterThan(at(/^Shared, 0$/));
      expect(at(/^Add item, tax, tip or discount/)).toBeGreaterThan(at(/^Open Perrier/));
      expect(at(/Choose whose share to show$/)).toBeGreaterThan(at(/^Add item/));
      // The links sit in the top bar, just before the header's icons, which start with How it works.
      await page.getByRole("button", { name: "Switch to dark mode" }).focus();
      await page.keyboard.press("Shift+Tab");
      expect(await focused(page)).toBe("How it works");
      await page.keyboard.press("Shift+Tab");
      expect(await focused(page)).toBe("History");

      await circle(page, "Sprite", "Sam").focus();
      await page.keyboard.press("Space");
      await expect(share(page)).toHaveText("$3.05", live);
      await circle(page, "Sprite", "Sam").focus();
      await page.keyboard.press("Enter");
      await expect(share(page)).toHaveText("$0.00", live);

      await line(page, "Sprite").focus();
      await page.keyboard.press("Enter");
      await expect(column(page, "Edit item")).toBeVisible(live);
      await page.keyboard.press("Escape");
      await expect(line(page, "Sprite")).toBeFocused();
      await page.keyboard.press("Space");
      await expect(column(page, "Edit item")).toBeVisible(live);
      await page.getByRole("textbox", { name: "Item name" }).focus();
      await page.keyboard.press("Escape");
      await expect(column(page, "Edit item")).toHaveCount(0, live);
      await expect(line(page, "Sprite")).toBeFocused();
    });

    test("keyboard only: Edit item's fields come after the receipt in Tab order, and the people menu traps Tab and Escape returns focus", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Sprite").focus();
      await page.keyboard.press("Enter");
      await expect(column(page, "Edit item")).toBeVisible(live);

      // The Total row is the receipt's last stop.
      await page.getByRole("button", { name: /^Open Total/ }).focus();
      const order: string[] = [];
      for (let step = 0; step < 5; step++) {
        await page.keyboard.press("Tab");
        order.push((await focused(page)) ?? "");
      }
      expect(order.slice(0, 4)).toEqual(["Back", "Delete item", "Item name", "Price"]);

      await page.keyboard.press("Escape");
      await switcher(page).focus();
      await page.keyboard.press("Enter");
      await expect(picker(page)).toBeVisible(live);
      const seen = new Set<string>();
      for (let step = 0; step < 8; step++) {
        await page.keyboard.press("Tab");
        seen.add((await focused(page)) ?? "");
      }
      expect([...seen].sort()).toEqual(["Edit people", "Jason", "Lee", "Priya", "You"].sort());
      await page.keyboard.press("Escape");
      await expect(switcher(page)).toBeFocused();
    });

    test("keyboard only: Back, just look on the pick column hands focus to the 'Which one are you?' link", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await asking(page).getByRole("button", { name: "Back, just look" }).focus();

      await page.keyboard.press("Enter");

      await expect(shareColumn(page).getByRole("button", { name: "Which one are you?" })).toBeVisible(live);
      await expect(shareColumn(page).getByRole("button", { name: "Which one are you?" })).toBeFocused();
    });

    test("toasts stay visible over the column: Undo after Delete item is the topmost thing on screen", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await line(page, "Perrier").click();
      await column(page, "Edit item").getByRole("button", { name: "Delete item" }).click();

      await expectToastShown(page, /Deleted/);
      const hit = await undo(page).evaluate((element) => {
        const at = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2));
      });
      expect(hit).toBe(true);
    });

    test("the wide layout holds for the dark/light toggle and the Share button too: both reachable beside the column", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      for (const name of ["Switch to dark mode", "Share link"]) {
        const box = (await page.getByRole("button", { name }).boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        const topmost = await page.getByRole("button", { name }).evaluate((element) => {
          const at = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2));
        });
        expect(topmost, name).toBe(true);
      }
    });
  });
}

test.describe("phone, 390px: the footer and the bottom sheets are as before", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });

  test("pick, claim, open Edit item, close, and the wide column never appears", async ({ page, request }, { workerIndex }) => {
    await page.goto(await createSplit(request, workerIndex));
    const asked = page.getByRole("dialog", { name: "Which one are you?" });
    await expect(asked.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
    await expect(page.getByTestId("share-panel")).toHaveCount(0);
    await asked.getByRole("button", { name: "Sam", exact: true }).click();
    await expect(page.getByTestId("footer").getByTestId("owe")).toBeVisible(live);

    await circle(page, "Sprite", "Sam").click();
    await expect(page.getByTestId("footer").getByTestId("owe")).toHaveText("$3.05", live);
    await expect(page.getByText(/Tap the dot/)).toHaveCount(0);
    await expect(page.getByTestId("paid-by")).toHaveText("Paid by Jason");
    await expect(page.getByRole("button", { name: "People", exact: true })).toBeVisible();

    await line(page, "Sprite").click();
    await expect(page.getByTestId("item-sheet")).toBeVisible(live);
    await expect(page.getByRole("dialog", { name: "Edit item" })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByTestId("item-sheet")).toHaveCount(0, live);

    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByTestId("history-sheet")).toBeVisible(live);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("history-sheet")).toHaveCount(0, live);
    await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("a keyboard pick lands focus somewhere sensible on the phone (baseline for the wide layout's)", async ({ page, request }, { workerIndex }) => {
    await page.goto(await createSplit(request, workerIndex));
    const asked = page.getByRole("dialog", { name: "Which one are you?" });
    await expect(asked.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
    await expect(page.locator("#root")).not.toHaveAttribute("inert", live);
    await asked.getByRole("button", { name: "Sam", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("footer").getByTestId("owe")).toBeVisible(live);
    await page.waitForTimeout(600);
    test.info().annotations.push({ type: "phone focus after keyboard pick", description: String(await focused(page)) });
  });
});

test.describe("spread layout: a centered frame, filters and the share bar", () => {
  const filterTab = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}, \\d+$`) });

  test.describe("2000x900", () => {
    test.use({ viewport: { width: 2000, height: 900 }, isMobile: false, hasTouch: false, colorScheme: "light" });

    test("the frame sits in the middle of the window and the page scrolls as one, with the column held at the top", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex, [venmo], { ...menu, items: Array.from({ length: 24 }, (_, at) => ({ id: `line${at}`, name: `Line ${at + 1}`, price: 100 })), subtotal: 2400, total: 2906 }));
      await pick(page, "Sam");

      const width = await page.evaluate(() => document.documentElement.clientWidth);
      const receipt = (await page.getByTestId("receipt").boundingBox())!;
      const panel = (await shareColumn(page).boundingBox())!;
      expect(Math.abs(receipt.x - (width - (panel.x + panel.width)))).toBeLessThanOrEqual(2);

      // One scroll container, the full width of the window, so its scroll bar sits at the window's edge.
      const scrollers = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("*")]
            .filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight)
            .map((element) => ({ right: Math.round(element.getBoundingClientRect().right), top: element.scrollTop })),
        );
      const [only, ...others] = await scrollers();
      expect(others).toEqual([]);
      expect(only.right).toBe(2000);
      await page.mouse.move(receipt.x + 40, 600);
      await page.mouse.wheel(0, 500);
      await expect.poll(async () => (await scrollers())[0].top).toBeGreaterThan(0);
      const held = (await shareColumn(page).boundingBox())!;
      expect(held.y).toBeGreaterThanOrEqual(0);
      expect(held.y).toBeLessThan(panel.y);
    });
  });

  test.describe("1440x900", () => {
    test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, colorScheme: "light" });

    test("the tabs filter the list with their counts, the Total shows only under All, and an empty filter says so", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);

      await expect(filterTab(page, "All")).toHaveAccessibleName("All, 5");
      await expect(filterTab(page, "Yours")).toHaveAccessibleName("Yours, 1");
      await filterTab(page, "Yours").click();
      await expect(filterTab(page, "Yours")).toHaveAttribute("aria-pressed", "true");
      await expect(line(page, "Sprite")).toBeVisible();
      await expect(line(page, "Perrier")).toHaveCount(0);
      await expect(page.getByTestId("total")).toHaveCount(0);

      await filterTab(page, "Nobody yet").click();
      await expect(line(page, "Sprite")).toHaveCount(0);
      await expect(line(page, "Perrier")).toBeVisible();

      await filterTab(page, "Shared").click();
      await expect(page.getByTestId("filter-empty")).toHaveText("No item is shared yet.");

      await filterTab(page, "All").click();
      await expect(page.getByTestId("total")).toHaveText("$28.04");
      await expect(line(page, "Perrier")).toBeVisible();
    });

    test("the column leads with the share at the title's size and the bar's legend", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(page.getByTestId("share-amount")).toHaveText("$3.05", live);
      await expect(shareColumn(page).getByTestId("share-bar")).toHaveAttribute("aria-label", "11% of the bill");
      await expect(shareColumn(page).getByText("Unclaimed $24.99")).toBeVisible();
      const amount = (await page.getByTestId("share-amount").boundingBox())!;
      const title = (await page.getByTestId("split-title").boundingBox())!;
      expect(Math.abs(amount.y - title.y)).toBeLessThanOrEqual(1);
    });

    test("a long receipt's share column ends within the window at the top of the page", async ({ page, request }, { workerIndex }) => {
      const long = { ...menu, items: Array.from({ length: 24 }, (_, at) => ({ id: `line${at}`, name: `Line ${at + 1}`, price: 100 })), subtotal: 2400, total: 2906 };
      await openSplit(page, await createSplit(request, workerIndex, [venmo], long));
      await pick(page, "Sam");
      await expect(page.getByTestId("receipt")).toBeVisible(live);
      // At scrollTop 0 the sticky column's last pixel is on screen.
      const bottom = async () => {
        const box = (await shareColumn(page).boundingBox())!;
        return box.y + box.height;
      };
      await expect.poll(bottom, live).toBeLessThanOrEqual(900);
      expect(await page.evaluate(() => [...document.querySelectorAll("*")].filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollTop > 0).length)).toBe(0);
    });

    test("with the default menu the page has nothing to scroll", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await expect(page.getByTestId("receipt")).toBeVisible(live);
      const slack = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("*")]
            .filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY) && (element as HTMLElement).offsetWidth >= document.documentElement.clientWidth - 1)
            .map((element) => element.scrollHeight - element.clientHeight),
        );
      await expect.poll(async () => (await slack()).length, live).toBeGreaterThan(0);
      await expect.poll(async () => Math.max(...(await slack())), live).toBeLessThanOrEqual(1);
      const root = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
      expect(root).toBeLessThanOrEqual(1);
    });

    test("claiming the last line out of Yours by keyboard moves focus to the filter tab", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);
      await filterTab(page, "Yours").click();
      await expect(filterTab(page, "Yours")).toHaveAttribute("aria-pressed", "true");
      await expect(line(page, "Perrier")).toHaveCount(0);

      // Unchecking the only line under Yours empties the list; focus lands on the current filter tab.
      await circle(page, "Sprite", "Sam").focus();
      await page.keyboard.press("Space");
      await expect(page.getByTestId("filter-empty")).toHaveText("Nothing checked yet.", live);
      await expect(line(page, "Sprite")).toHaveCount(0, live);
      const onTab = () => page.evaluate(() => document.activeElement?.matches('[data-testid="filter-tabs"] [aria-pressed="true"]') ?? false);
      await expect.poll(onTab, live).toBe(true);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toMatch(/^Yours, \d+$/);

    });

    test("claiming a line out of Nobody yet by keyboard moves focus to the next line's dot", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      await circle(page, "Sprite", "Sam").click();
      await expect(share(page)).toHaveText("$3.05", live);
      await filterTab(page, "Nobody yet").click();
      await expect(filterTab(page, "Nobody yet")).toHaveAttribute("aria-pressed", "true");
      await expect(line(page, "Sprite")).toHaveCount(0);
      await circle(page, "Tostones", "Sam").focus();
      await page.keyboard.press("Space");
      await expect(line(page, "Tostones")).toHaveCount(0, live);
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")), live).toBe("Perrier, check for Sam");
    });

    test("hovering a muted row turns its price from gray to ink", async ({ page, request }, { workerIndex }) => {
      await openSplit(page, await createSplit(request, workerIndex));
      await pick(page, "Sam");
      // Sam has not claimed Perrier, so its line is quiet.
      const price = line(page, "Perrier").getByText("$3.50", { exact: true });
      const color = () => price.evaluate((element) => getComputedStyle(element).color);
      // The price eases between colors, so read it once two reads 150 ms apart agree.
      const settled = async () => {
        let last = "";
        await expect.poll(async () => last === (last = await color()), { intervals: [150], timeout: 5000 }).toBe(true);
        return last;
      };
      await page.mouse.move(5, 5);
      const before = await settled();
      await line(page, "Perrier").hover();
      await expect.poll(color, live).not.toBe(before);
      const hovered = await settled();
      await page.mouse.move(5, 5);
      await expect.poll(color, live).toBe(before);
      // Ink is the dark one: it reads darker than the muted gray.
      const luminance = (rgb: string) => rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
      expect(luminance(hovered)).toBeLessThan(luminance(before));
    });
  });

  test.describe("phone, 390px", () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });

    test("a long place drops a size and stays within three lines and the column's width", async ({ page, request }, { workerIndex }) => {
      // 64 characters, the longest a place can be, with one word wider than the column.
      const place = "Golden Lotus Noodle House Supercalifragilisticexpialidocious Bar";
      await page.goto(await createSplit(request, workerIndex, [venmo], menu, people, place));
      const title = page.getByTestId("split-title");
      await expect(title).toBeVisible(live);
      const size = await title.evaluate((element) => ({ font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height, fits: element.scrollWidth <= element.clientWidth }));
      expect(size.font).toBe(34);
      expect(size.height).toBeLessThanOrEqual(3 * 38 + 1);
      expect(size.fits).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });

    test("the Show all menu filters the list and the button reads the pick; the footer has no share bar and no items count", async ({ page, request }, { workerIndex }) => {
      await page.goto(await createSplit(request, workerIndex));
      const asked = page.getByRole("dialog", { name: "Which one are you?" });
      await asked.getByRole("button", { name: "Sam", exact: true }).click();
      await expect(page.getByTestId("footer").getByTestId("owe")).toBeVisible(live);
      await circle(page, "Sprite", "Sam").click();
      await expect(page.getByTestId("footer").getByTestId("owe")).toHaveText("$3.05", live);
      await expect(page.getByTestId("footer").getByTestId("share-bar")).toHaveCount(0);
      await expect(page.getByTestId("footer").getByText(/incl\. tax/)).toHaveCount(0);

      await expect(page.getByRole("button", { name: "Show items: Show all 5", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^Show items/ }).click();
      const menuBox = page.getByRole("dialog", { name: "Show items" });
      await expect(menuBox).toBeVisible(live);
      await menuBox.getByRole("button", { name: "Nobody yet, 4" }).click();
      await expect(menuBox).toHaveCount(0, live);
      await expect(page.getByRole("button", { name: "Show items: Nobody yet 4", exact: true })).toBeVisible();
      await expect(line(page, "Sprite")).toHaveCount(0);
      await expect(page.getByTestId("total")).toHaveCount(0);

      // Claiming a line under Nobody yet moves it out of the list.
      await circle(page, "Perrier", "Sam").click();
      await expect(line(page, "Perrier")).toHaveCount(0, live);
      await expect(page.getByRole("button", { name: "Show items: Nobody yet 3", exact: true })).toBeVisible();
    });

    test("a viewed person with a 30-character first name ellipsizes in the Items line and the page stays within the window", async ({ page, request }, { workerIndex }) => {
      const longName = "Bartholomewwwwwwwwwwwwwwwwwwww";
      expect(longName).toHaveLength(30);
      await page.goto(await createSplit(request, workerIndex, [venmo], menu, [...people, { id: "long", name: longName }]));
      await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click();
      await expect(page.getByTestId("footer").getByTestId("owe")).toBeVisible(live);
      await viewAs(page, longName);
      await page.getByRole("button", { name: /^Show items/ }).click();
      const menuBox = page.getByRole("dialog", { name: "Show items" });
      await expect(menuBox).toBeVisible(live);
      await menuBox.getByRole("button", { name: new RegExp(`^${longName}'s, \\d+$`) }).click();
      await expect(menuBox).toHaveCount(0, live);
      const button = page.getByRole("button", { name: new RegExp(`^Show items: ${longName}'s \\d+$`) });
      await expect(button).toBeVisible(live);
      await page.waitForTimeout(600);
      const box = (await button.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });
  });

  test.describe("phone, 360px", () => {
    test.use({ viewport: { width: 360, height: 780 }, colorScheme: "light" });

    test("a share past $999.99 shows whole beside the pill", async ({ page, request }, { workerIndex }) => {
      const big = { items: [{ id: "feast", name: "Feast", price: 123456 }], adjustments: [], subtotal: 123456, total: 123456 };
      await page.goto(await createSplit(request, workerIndex, [venmo], big));
      await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
      const footer = page.getByTestId("footer");
      await expect(footer.getByTestId("owe")).toBeVisible(live);
      await circle(page, "Feast", "Sam").click();
      const owe = footer.getByTestId("owe");
      await expect(owe).toHaveText("$1,234.56", live);
      await page.waitForTimeout(600);
      const fits = await owe.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth, height: element.getBoundingClientRect().height }));
      expect(fits.scroll).toBeLessThanOrEqual(fits.client);
      expect(fits.height).toBeLessThanOrEqual(51);
      const amount = (await owe.boundingBox())!;
      const pill = (await footer.getByRole("button", { name: "Pay Jason" }).boundingBox())!;
      expect(amount.x + amount.width).toBeLessThanOrEqual(pill.x + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    });
  });
});
