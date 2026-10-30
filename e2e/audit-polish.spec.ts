import { addNames } from "./files";
import { features } from "../src/features";
import { expect, test, type APIRequestContext, type Locator, type Page } from "./without-ocr";
import { chooseMode } from "./split-mode";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, items = [{ id: "rice", name: "Rice", price: 800 }, { id: "pitcher", name: "Pitcher", price: 1200 }]): Promise<string> {
  creates += 1;
  const subtotal = items.reduce((sum, { price }) => sum + price, 0);
  const adjustments = [{ id: "tax", kind: "tax", name: "Tax", amount: 100 }];
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.61.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: { items, adjustments, subtotal, total: subtotal + 100 },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
          { id: "priya", name: "Priya" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function openAs(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

/** Home ignores taps and typing until the loader has left. */
async function home(page: Page) {
  await page.goto("/");
  await expect(page.locator("#root")).not.toHaveAttribute("inert", live);
}

/** The size a finger can hit: the element's own box, with whatever padding the page gives it. */
async function hitSize(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("not visible");
  return { width: Math.round(box.width), height: Math.round(box.height) };
}

async function expectHit(target: Locator, min: { width?: number; height?: number }) {
  const { width, height } = await hitSize(target);
  expect(width).toBeGreaterThanOrEqual(min.width ?? 44);
  expect(height).toBeGreaterThanOrEqual(min.height ?? 44);
}

const placeholderColor = (field: Locator) => field.evaluate((input) => getComputedStyle(input, "::placeholder").color);

test("the home blanks' placeholders and rules are ink, like the tappable words, in light and dark", async ({ page }) => {
  await home(page);
  const blank = page.getByRole("textbox", { name: "Your name" });
  await expect(blank).toBeVisible();
  expect(await placeholderColor(blank)).toBe("rgb(23, 23, 23)");
  await expect(blank.locator("..")).toHaveCSS("border-bottom-color", "rgb(23, 23, 23)");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(17, 17, 17)");
  await expect.poll(() => placeholderColor(blank)).toBe("rgb(237, 237, 237)");
  await expect(blank.locator("..")).toHaveCSS("border-bottom-color", "rgb(237, 237, 237)");
});

test("every tappable word and field in home's sentence has a hit area of at least 44 px, and the x after a name is 44 by 44", async ({ page }) => {
  await home(page);
  await expectHit(page.getByRole("button", { name: "Add the receipt" }), { height: 44 });
  await expectHit(page.getByRole("textbox", { name: "Your name" }), { height: 44, width: 44 });
  await expectHit(page.getByRole("textbox", { name: "Venmo handle" }), { height: 44, width: 44 });
  await expectHit(page.getByRole("button", { name: "Payment app, Venmo" }), { height: 44, width: 44 });

  await addNames(page, "Jason", "Sam");
  await expectHit(page.getByRole("button", { name: /^Remove Sam/ }), { height: 44, width: 44 });
  await expectHit(page.getByRole("textbox", { name: "Name", exact: true }), { height: 44, width: 44 });
});

test("a tap above a blank's text, inside its padding, still focuses it", async ({ page }) => {
  await home(page);
  const blank = page.getByRole("textbox", { name: "Venmo handle" });
  const box = (await blank.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43);
  await page.mouse.click(box.x + box.width / 2, box.y + 4);
  await expect(blank).toBeFocused();
});

test("Edit tax is titled for its kind, its options and amount are 44 px to hit, and Escape closes it with the amount focused", async ({ page, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await page.getByRole("button", { name: "Open Tax, $1.00" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit tax" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Edit tax" })).toBeVisible();
  await expect(sheet.getByRole("group", { name: "What to add" })).toHaveCount(0);

  const kinds = sheet.getByRole("group", { name: "Kind" });
  await expectHit(kinds.getByRole("button", { name: "Tip", exact: true }), { width: 44 });
  await expectHit(kinds.getByRole("button", { name: "Tax", exact: true }), { width: 44 });
  const amount = sheet.getByRole("textbox", { name: "Amount", exact: true });
  await expectHit(amount, { height: 44, width: 44 });

  await amount.focus();
  await expect(amount).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0, live);
});

test("Edit item takes Escape from a focused field, and its Price and By amount fields are 44 px to hit", async ({ page, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await page.getByRole("button", { name: /^Open Rice, / }).click();
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  await expect(sheet).toBeVisible();
  const price = sheet.getByRole("textbox", { name: "Price", exact: true });
  await expectHit(price, { height: 44, width: 44 });

  await sheet.getByRole("button", { name: "Sam, you", exact: true }).click();
  await sheet.getByRole("button", { name: "Priya", exact: true }).click();
  await chooseMode(sheet, "By amount");
  const sams = sheet.getByRole("textbox", { name: "Sam's amount" });
  await expectHit(sams, { height: 44, width: 44 });
  // A By amount that doesn't add up holds the sheet open, so go back to Evenly before closing.
  await chooseMode(sheet, "Evenly");

  await price.focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0, live);
});

test("the Add sheet's kind options are 44 px wide, Tip included", async ({ page, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await page.getByTestId("receipt").getByRole("button", { name: "Add item, tax, tip or discount", exact: true }).click();
  const kinds = page.getByRole("dialog", { name: "Add to the receipt" }).getByRole("group", { name: "What to add" });
  await expectHit(kinds.getByRole("button", { name: "Tip", exact: true }), { width: 44 });
});

test("deleting an Item reads Deleted in the undo bar and in History, with Sam named as who", async ({ page, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await page.getByRole("button", { name: /^Open Pitcher, / }).click();
  await page.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Delete item" }).click();
  await expect(page.getByText("Deleted Pitcher")).toBeVisible(live);

  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByTestId("history-sheet");
  await expect(history.getByText("Deleted Pitcher")).toBeVisible(live);
  await expect(history.getByText("Removed Pitcher")).toHaveCount(0);
  await expect(history.getByText(/^Sam · /)).toBeVisible();
  await expect(history.getByText("Jason", { exact: true })).toBeVisible();
});

test("a confirm's Cancel is an underlined text link, not a filled button", async ({ page, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Priya");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("dialog", { name: "People" }).getByRole("button", { name: "Sam", exact: true }).click();
  await page.getByRole("button", { name: "Rice, check for Sam" }).click();
  const cancel = page.getByRole("dialog", { name: "Check Rice for Sam?" }).getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await expect(cancel.getByText("Cancel")).toHaveCSS("text-decoration-line", "underline");
  await expect(cancel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await cancel.click();
  await expect(page.getByRole("dialog", { name: "Check Rice for Sam?" })).toHaveCount(0, live);
});

test("Share without Web Share copies the link and says Link copied, or says it could not", async ({ page, request, context }, { workerIndex }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const link = await createSplit(request, workerIndex);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await openAs(page, link, "Sam");
  await page.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible(live);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { value: () => Promise.reject(new Error("denied")), configurable: true }));
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByText("Couldn't copy the link.")).toBeVisible(live);
});

test("home, the Split page and the not-found page set How it works, coffee (when on), the theme toggle and Share 32 px apart, and Share off a Split copies the site's link", async ({ page, request, context }, { workerIndex }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  const glyphs = () =>
    page.locator("[data-icon]").evaluateAll((icons) =>
      icons
        .filter((icon) => icon.getBoundingClientRect().y < 80 && getComputedStyle(icon.parentElement!).opacity !== "0")
        .map((icon) => [icon.getAttribute("data-icon"), Math.round(icon.getBoundingClientRect().x + icon.getBoundingClientRect().width / 2)]),
    );
  const row = [["help", features.coffee ? 260 : 292], ...(features.coffee ? [["coffee", 292]] : []), ["sun", 324], ["share", 356]];
  const link = await createSplit(request, workerIndex);
  await openAs(page, link, "Sam");
  expect(await glyphs()).toEqual(row);
  for (const path of ["/", "/nope"]) {
    await page.goto(path);
    await expect(page.locator("#root")).not.toHaveAttribute("inert", live);
    expect(await glyphs()).toEqual(row);
    await page.getByRole("button", { name: "Share link" }).click();
    await expect(page.getByText("Link copied")).toBeVisible(live);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL("/", page.url()).href);
  }
});
