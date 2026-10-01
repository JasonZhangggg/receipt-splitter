import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const receipt1040 = "bench/data/srd-1040.jpg";
const scanTimeout = { timeout: 60_000 };

const action = (page: Page) => page.getByRole("button", { name: "Create split link" });

async function choose(page: Page, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^(Add|Drop a) receipt/ }).click();
  await (await chooser).setFiles(file);
}

const items = (page: Page) => page.getByTestId("receipt").getByRole("listitem");

async function readItems(page: Page) {
  return items(page).evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll("input")].map((input) => input.value).join(" ")),
  );
}

const amount = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

async function blockedBy(page: Page) {
  const button = action(page);
  const described = await button.getAttribute("aria-describedby");
  return {
    disabled: await button.getAttribute("aria-disabled"),
    reason: described ? await page.locator(`[id="${described}"]`).textContent() : null,
  };
}

test.describe("reading SRD receipt 1040", () => {
  test.setTimeout(120_000);

  test("chosen through the picker, it reads five Items, Tip $0.00, Total $28.04, and a Venmo handle enables Create split link", async ({ page }) => {
    await page.goto("/");
    await choose(page, receipt1040);
    await expect(page.getByRole("status", { name: "Reading receipt" })).toBeVisible();
    await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);

    await expect(page.getByText("srd-1040.jpg")).toBeVisible();
    await expect(page.getByText("5 items")).toBeVisible();
    expect(await readItems(page)).toEqual([
      "Chicken Fried Rice And Egg 7.99",
      "California Tropic And Miso 7.99",
      "Add Two Tostones 1.00",
      "Sprite 2.50",
      "Perrier Sparkling Water 3.50",
    ]);
    for (const [name, value] of [
      ["Subtotal", "$22.98"],
      ["Tax", "$1.61"],
      ["Service fees on tables", "$3.45"],
      ["Tip", "$0.00"],
      ["Total", "$28.04"],
    ]) {
      await expect(amount(page, name)).toHaveValue(value);
    }
    expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Add how to pay you." });

    await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  });
});

test.describe("fixing the Example receipt", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Example" }).click();
    await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  });

  test("a price edit that breaks the Total check highlights the row and names the gap until the numbers add up again", async ({ page }) => {
    const perrier = page.getByRole("textbox", { name: /^Price of Perrier Sparkling Water/ });
    await perrier.fill("3.00");
    const flagged = () => items(page).evaluateAll((rows) => rows.filter((row) => row.dataset.flagged === "true").map((row) => row.querySelector("input")!.value));
    expect(await flagged()).toEqual(["Perrier Sparkling Water"]);
    await expect(page.getByRole("textbox", { name: "Price of Perrier Sparkling Water, check this price" })).toBeVisible();
    expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Items are $0.50 short." });
    const wash = await page.getByTestId("item-i5").evaluate((row) => getComputedStyle(row).backgroundColor);
    expect(wash).toBe("rgb(255, 239, 158)");

    await perrier.fill("3.50");
    expect(await flagged()).toEqual([]);
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  });

  test("a tip edit to 4.60 moves the Total to $32.64 and keeps the action enabled", async ({ page }) => {
    await amount(page, "Tip").fill("4.60");
    await amount(page, "Tip").blur();
    await expect(amount(page, "Tip")).toHaveValue("$4.60");
    await expect(amount(page, "Total")).toHaveValue("$32.64");
    expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  });

  test("adding a missing Item and deleting a row each update the reason in one step", async ({ page }) => {
    await page.getByRole("button", { name: "Remove Sprite" }).click();
    expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Items are $2.50 short." });
    await page.getByRole("button", { name: "Add item" }).click();
    expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Items are $2.50 short." });
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
  expect(await blockedBy(page)).toEqual({ disabled: "true", reason: "Items are $18.00 over." });
  await amount(page, "Total").fill("18.00");
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("@jason-z");
  expect(await blockedBy(page)).toEqual({ disabled: null, reason: null });
  await expect(page.getByText("2 items")).toBeVisible();
});
