import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "tostones", name: "Tostones", price: 100 },
    { id: "pitchers", name: "Pitchers", price: 2400, quantity: 2 },
    { id: "sprite", name: "Sprite", price: 250 },
  ],
  adjustments: [],
  subtotal: 3550,
  total: 3550,
};

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${140 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: dinner,
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

async function pick(page: Page, link: string, name: string): Promise<Page> {
  await page.goto(link);
  const asked = page.getByRole("dialog", { name: "Which one are you?" }).or(page.getByRole("complementary"));
  await asked.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
  return page;
}

const joinAs = async (browser: Browser, link: string, name: string) => pick(await (await newContext(browser)).newPage(), link, name);

const check = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` }).click();
const claimBar = (page: Page) => page.getByTestId("split-sheet").getByTestId("claim-bar");

async function expectLeft(pages: readonly Page[], amount: string) {
  for (const page of pages) {
    if (amount === "$0.00") await expect(claimBar(page)).toHaveAttribute("aria-valuenow", "100", live);
    else await expect(page.getByTestId("split-sheet").getByRole("progressbar", { name: `${amount} left to claim` })).toBeVisible(live);
  }
}

test("the left-to-claim bar counts what nobody fully had, a By amount remainder included, live on both phones, and the card has no Unclaimed line", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await joinAs(browser, link, "Sam");
  const priya = await joinAs(browser, link, "Priya");
  const both = [sam, priya] as const;

  await expect(sam.getByTestId("total")).toBeVisible(live);
  await expect(sam.getByText(/^Unclaimed/)).toHaveCount(0);

  await check(sam, "Rice", "Sam");
  await expectLeft(both, "$27.50");

  await check(priya, "Pitchers", "Priya");
  await expectLeft(both, "$3.50");

  await check(sam, "Tostones", "Sam");
  await expectLeft(both, "$2.50");

  await check(priya, "Sprite", "Priya");
  await expectLeft(both, "$0.00");

  const sheet = priya.getByRole("dialog", { name: "Item" });
  await priya.getByRole("button", { name: /^Open Sprite, / }).click();
  await sheet.getByRole("group", { name: "Split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await expectLeft(both, "$2.50");

  await sheet.getByRole("textbox", { name: "Priya's amount" }).fill("1.00");
  await expectLeft(both, "$1.50");

  await sheet.getByRole("textbox", { name: "Priya's amount" }).fill("2.50");
  await expectLeft(both, "$0.00");
});

test("the Your share breakdown says nothing about unclaimed lines while the bar names what is left", async ({ browser, request }, { workerIndex }) => {
  const sam = await joinAs(browser, await createSplit(request, workerIndex), "Sam");
  await check(sam, "Rice", "Sam");
  await expectLeft([sam], "$27.50");

  await sam.getByRole("button", { name: /^Your share .*, Show what you owe$/ }).click();
  const breakdown = sam.getByTestId("breakdown");
  await expect(breakdown).toBeVisible(live);
  await expect(breakdown.getByText("Rice", { exact: true })).toBeVisible();
  await expect(breakdown.getByTestId("unclaimed-items")).toHaveCount(0);
  await expect(breakdown.getByText(/unclaimed/i)).toHaveCount(0);
});

const centeredAddItem = async ({ page, request }: { page: Page; request: APIRequestContext }, { workerIndex }: { workerIndex: number }) => {
  await pick(page, await createSplit(request, workerIndex), "Sam");
  const add = page.getByRole("button", { name: "Add item", exact: true });
  await add.scrollIntoViewIfNeeded();
  const circle = page.getByRole("button", { name: "Sprite, check for Sam" });
  const middle = (box: { left: number; width: number }) => box.left + box.width / 2;
  await expect
    .poll(async () => {
      const dot = await circle.evaluate((target) => target.querySelector("div:empty")!.getBoundingClientRect().toJSON() as DOMRect);
      const { above, below, label, plus } = await add.evaluate((row) => {
        const box = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
        const text = [...row.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent === "Add item")!;
        return { above: box(row).top + 1, below: box(row.nextElementSibling!).top, label: box(text), plus: box(row.querySelector("svg")!) };
      });
      return {
        labelBetweenHairlines: Math.abs(label.top + label.height / 2 - (above + below) / 2) <= 1,
        plusOnCircleColumn: Math.abs(middle(plus) - middle(dot)) <= 1,
      };
    }, live)
    .toEqual({ labelBetweenHairlines: true, plusOnCircleColumn: true });
};

const title = "Add item sits halfway between the hairline above it and the Subtotal hairline, its plus centered on the Item circles";

test(`on a phone, ${title}`, centeredAddItem);

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  test(`on a desktop, ${title}`, centeredAddItem);
});

