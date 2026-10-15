import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.setTimeout(60_000);

const live = { timeout: 15_000 };
const receipt = { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 };
let creates = 0;

async function open(request: APIRequestContext, browser: Browser, workerIndex: number): Promise<Page> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.18.${100 + workerIndex}.${creates}` },
    data: { split: { receipt, participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }], paymentHandles: [] } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  const page = await (await newContext(browser)).newPage();
  await page.goto(new URL(`/s/${id}`, response.url()).href);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

const dim = (page: Page) => page.getByTestId("sheet-dim");
const opacity = (page: Page) => dim(page).evaluate((el) => Number(getComputedStyle(el).opacity));

test("a sheet dims the whole page while it is open, and a tap on the dim closes it and takes the dim away", async ({ browser, request }, { workerIndex }) => {
  const page = await open(request, browser, workerIndex);
  await expect.poll(() => opacity(page), live).toBe(1);
  const size = page.viewportSize()!;
  expect(await dim(page).boundingBox()).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height });
  expect(await dim(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(23, 23, 23, 0.14)");

  await page.mouse.click(size.width / 2, 20);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0, live);
  await expect(dim(page)).toHaveCount(0);
});

test("the Item sheet dims the page, and a tap on the dim closes it and takes the dim away", async ({ browser, request }, { workerIndex }) => {
  const page = await open(request, browser, workerIndex);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  await expect(dim(page)).toHaveCount(0, live);

  await page.getByRole("button", { name: /^Open Rice, / }).click();
  await expect(page.getByTestId("item-sheet")).toBeVisible(live);
  await expect.poll(() => opacity(page), live).toBe(1);

  await page.mouse.click(20, 20);
  await expect(page.getByTestId("item-sheet")).toHaveCount(0, live);
  await expect(dim(page)).toHaveCount(0);
});

test("the dim takes the dark token in dark mode", async ({ browser, request }, { workerIndex }) => {
  const page = await open(request, browser, workerIndex);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => dim(page).evaluate((el) => getComputedStyle(el).backgroundColor), live).toBe("rgba(0, 0, 0, 0.36)");
});
