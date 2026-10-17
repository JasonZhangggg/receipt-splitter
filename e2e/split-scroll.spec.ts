import { expect, test, type APIRequestContext, type Locator, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const items = Array.from({ length: 30 }, (_, i) => ({ id: `item${i + 1}`, name: `Dish ${i + 1}`, price: 1000 }));
let creates = 0;

async function openSplit(page: Page, request: APIRequestContext, workerIndex: number) {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.54.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: { items, adjustments: [], subtotal: 30_000, total: 30_000 },
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
  await page.goto(`/s/${id}`);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click(live);
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

/** Scrolls the page's own scroller to `to` px, or to its end, and returns where it landed. */
const scrollPage = (page: Page, to: number | "end") =>
  page.evaluate((to) => {
    const scroller = [...document.querySelectorAll<HTMLElement>("div")].find((el) => el.scrollHeight > el.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY))!;
    scroller.scrollTop = to === "end" ? scroller.scrollHeight : to;
    return scroller.scrollTop;
  }, to);

const box = async (locator: Locator) => {
  const { x, y, width, height } = (await locator.boundingBox())!;
  return [Math.round(x), Math.round(y), Math.round(width), Math.round(height)];
};

test("the Split page header scrolls away with the list", async ({ page, request }, { workerIndex }) => {
  await openSplit(page, request, workerIndex);
  const header = page.getByRole("heading", { level: 1 });
  const rest = await box(header);
  expect(rest).toEqual([24, 11, 68, 44]);
  expect(await scrollPage(page, "end")).toBeGreaterThan(1000);
  await expect(page.getByRole("button", { name: "SplitWith, split a receipt" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Open Dish 30, / })).toBeVisible();
  expect((await header.boundingBox())!.y).toBeLessThan(0);
});

test("the Split page header holds the coffee cup, the theme toggle and Share, evenly spaced", async ({ page, request }, { workerIndex }) => {
  await openSplit(page, request, workerIndex);
  const coffee = page.getByRole("link", { name: "Buy me a coffee" });
  expect([await coffee.getAttribute("href"), await coffee.getAttribute("target")]).toEqual(["https://venmo.com/u/Jason-Zhang-162", "_blank"]);
  const centers = await page.locator("[data-icon]").evaluateAll((icons) =>
    icons
      .filter((icon) => icon.getBoundingClientRect().y < 60 && getComputedStyle(icon.parentElement!).opacity !== "0")
      .map((icon) => [icon.getAttribute("data-icon"), Math.round(icon.getBoundingClientRect().x + icon.getBoundingClientRect().width / 2)]),
  );
  expect(centers).toEqual([["coffee", 292], ["sun", 324], ["share", 356]]);
});
