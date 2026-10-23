import { fromMore, peopleSheet, showPeople } from "./header";
import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.setTimeout(60_000);

const live = { timeout: 15_000 };
let creates = 0;

async function samsPage(browser: Browser, request: APIRequestContext, workerIndex: number, viewport: { width: number; height: number }): Promise<Page> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.57.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
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
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(viewport);
  await page.goto(new URL(`/s/${id}`, response.url()).href);
  const wide = viewport.width >= 1024;
  const pick = page.getByRole(wide ? "region" : "dialog", { name: "Which one are you?" });
  await expect(pick).toBeVisible(live);
  await pick.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(page.getByTestId(wide ? "share" : "owe")).toBeVisible(live);
  return page;
}

test("a sheet opened by keyboard keeps Tab inside it and takes the page out of reach", async ({ browser, request }, { workerIndex }) => {
  const sam = await samsPage(browser, request, workerIndex, { width: 390, height: 844 });
  await sam.getByRole("button", { name: "People", exact: true }).focus();
  await sam.keyboard.press("Enter");
  const sheet = sam.getByRole("dialog", { name: "People" });
  await expect(sheet).toBeVisible(live);
  await expect(sheet).toHaveAttribute("aria-modal", "true");

  for (let press = 1; press <= 30; press++) {
    await sam.keyboard.press("Tab");
    expect(await sheet.evaluate((el) => el.contains(document.activeElement)), `Tab ${press} stays in the dialog`).toBe(true);
  }
  await sam.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0, live);
  await expect(sam.getByRole("button", { name: "People", exact: true })).toBeFocused();
  expect(await sam.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
});

test("a tap on the dim still closes a sheet that holds the page inert", async ({ browser, request }, { workerIndex }) => {
  const sam = await samsPage(browser, request, workerIndex, { width: 390, height: 844 });
  await showPeople(sam, "Sam");
  await expect(peopleSheet(sam)).toBeVisible(live);
  await sam.mouse.click(195, 20);
  await expect(peopleSheet(sam)).toHaveCount(0, live);
});

test("on a desktop History shows in the right column beside the receipt instead of a centered sheet, and the receipt stays clickable", async ({ browser, request }, { workerIndex }) => {
  const sam = await samsPage(browser, request, workerIndex, { width: 1440, height: 900 });
  const receipt = (await sam.getByTestId("receipt").boundingBox())!;
  await fromMore(sam, "History");
  const panel = sam.getByRole("region", { name: "History" });
  await expect(panel).toBeVisible(live);
  await expect(sam.getByRole("dialog")).toHaveCount(0);
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(receipt.x + receipt.width);
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
  expect(await sam.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
  await sam.getByRole("button", { name: /^Open Rice, / }).click();
  await expect(sam.getByRole("region", { name: "Edit item" })).toBeVisible(live);
});
