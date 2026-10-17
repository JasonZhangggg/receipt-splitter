import { addRow, openAdd, addSheet } from "./add-menu";
import { addNames, dropZone, openExample } from "./files";
import { fromMore, youAre } from "./header";
import { expect, newContext, test, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.setTimeout(90_000);

let tests = 0;

test.beforeEach(async ({ context }, testInfo) => {
  tests += 1;
  const ip = `198.55.${testInfo.workerIndex}.${tests}`;
  await context.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }));
});

const live = { timeout: 30_000 };
const question = (page: Page) => page.getByRole("heading", { name: "Which one are you?" });

async function fillHome(page: Page, ...names: string[]) {
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addNames(page, "Jason", ...names);
}

test("the creating browser opens the Split already picked as the Host, and a friend's browser is still asked", async ({ page, browser }) => {
  await page.goto("/");
  await openExample(page);
  await fillHome(page, "Sam");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  await expect(question(page)).toHaveCount(0);
  await youAre(page, "Jason");

  const sam = await (await newContext(browser)).newPage();
  await sam.goto(page.url());
  await expect(question(sam)).toBeVisible(live);
  await expect(sam.getByRole("dialog", { name: "Which one are you?" }).getByRole("listitem")).toHaveText(["JasonPicked on another phone", "Sam"]);
});

test("a photo that is not a receipt says so, and the Host adds every item by hand on the new Split", async ({ page }) => {
  await page.route("**/api/scan", (route) => route.fulfill({ status: 422, json: { refused: "notReceipt" } }));
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await dropZone(page).click();
  await (await chooser).setFiles("e2e/fixtures/blank.png");

  const receipt = page.getByTestId("receipt");
  await expect(receipt).toHaveText(/^I paid the bill\. Try another photo, or add the items myself\.$/, live);
  await expect(page.getByRole("status").filter({ hasText: "That doesn't look like a receipt. Try another photo." })).toBeVisible();

  await page.getByRole("button", { name: "add the items myself" }).click();
  await expect(receipt).toHaveText("I’ll add the items myself. Change.");
  await fillHome(page);
  await expect(page.getByRole("button", { name: "Create link" })).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Create link" }).click();

  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{24}$/, live);
  await expect(question(page)).toHaveCount(0);
  await expect(addRow(page)).toBeVisible(live);
  await expect(page.getByRole("list", { name: "Items" }).getByRole("button")).toHaveCount(0);

  await openAdd(page, "Item");
  await addSheet(page).getByRole("textbox", { name: "Name", exact: true }).fill("Pizza");
  await addSheet(page).getByRole("textbox", { name: "Price", exact: true }).fill("12.00");
  await addSheet(page).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Open Pizza, \$12\.00/ })).toBeVisible(live);
  await expect(page.getByTestId("total")).toHaveText("$12.00");
});

test("the first item added by hand can be reverted in History, putting the Split back to no items", async ({ page }) => {
  await page.route("**/api/scan", (route) => route.fulfill({ status: 422, json: { refused: "notReceipt" } }));
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await dropZone(page).click();
  await (await chooser).setFiles("e2e/fixtures/blank.png");
  await page.getByRole("button", { name: "add the items myself" }).click();
  await fillHome(page);
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{24}$/, live);

  await openAdd(page, "Item");
  await addSheet(page).getByRole("textbox", { name: "Name", exact: true }).fill("Pizza");
  await addSheet(page).getByRole("textbox", { name: "Price", exact: true }).fill("12.00");
  await addSheet(page).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByTestId("total")).toHaveText("$12.00", live);

  await fromMore(page, "History");
  await page.getByRole("button", { name: "Revert Added Pizza" }).click();
  await expect(page.getByText("Reverted")).toBeVisible(live);
  await expect(page.getByTestId("total")).toHaveText("$0.00", live);
});
