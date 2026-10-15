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
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

const joinAs = async (browser: Browser, link: string, name: string) => pick(await (await newContext(browser)).newPage(), link, name);

const check = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` }).click();
const totalLine = (page: Page) => [page.getByTestId("unclaimed-count"), page.getByTestId("unclaimed")] as const;

async function expectLine(pages: readonly Page[], label: string, amount: string) {
  for (const page of pages) {
    const [count, figure] = totalLine(page);
    await expect(count).toHaveText(label, live);
    await expect(figure).toHaveText(amount, live);
  }
}

test("the Unclaimed total line counts the lines nobody fully had, a quantity line once and a By amount remainder as one, live on both phones", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await joinAs(browser, link, "Sam");
  const priya = await joinAs(browser, link, "Priya");
  const both = [sam, priya] as const;

  await expect(sam.getByTestId("unclaimed-count")).toHaveCount(0);

  await check(sam, "Rice", "Sam");
  await expectLine(both, "Unclaimed · 3 items", "$27.50");

  await check(priya, "Pitchers", "Priya");
  await expectLine(both, "Unclaimed · 2 items", "$3.50");

  await check(sam, "Tostones", "Sam");
  await expectLine(both, "Unclaimed · 1 item", "$2.50");

  await check(priya, "Sprite", "Priya");
  await expectLine(both, "Unclaimed", "$0.00");

  await check(sam, "Sprite", "Sam");
  await expectLine(both, "Unclaimed", "$0.00");

  const sheet = priya.getByRole("dialog", { name: "Edit item" });
  await priya.getByRole("button", { name: /^Open Sprite, / }).click();
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await priya.waitForTimeout(1200);
  await expectLine(both, "Unclaimed", "$0.00");

  await sheet.getByRole("textbox", { name: "Priya's amount" }).fill("1.00");
  await sheet.getByRole("button", { name: "Give Sam the rest, $1.50" }).click();
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $2.50 assigned");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expectLine(both, "Unclaimed", "$0.00");

  await check(sam, "Sprite", "Sam");
  await expectLine(both, "Unclaimed · 1 item", "$1.50");

  await priya.getByRole("button", { name: /^Open Sprite, / }).click();
  await sheet.getByRole("textbox", { name: "Priya's amount" }).fill("2.50");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expectLine(both, "Unclaimed", "$0.00");
});

test("the Your share breakdown says nothing about unclaimed lines while the total line counts them", async ({ browser, request }, { workerIndex }) => {
  const sam = await joinAs(browser, await createSplit(request, workerIndex), "Sam");
  await check(sam, "Rice", "Sam");
  await expectLine([sam], "Unclaimed · 3 items", "$27.50");

  await sam.getByRole("button", { name: /^Your share .*, Show what you owe$/ }).click();
  const breakdown = sam.getByTestId("breakdown");
  await expect(breakdown).toBeVisible(live);
  await expect(breakdown.getByText("Rice", { exact: true })).toBeVisible();
  await expect(breakdown.getByTestId("unclaimed-items")).toHaveCount(0);
  await expect(breakdown.getByText(/unclaimed/i)).toHaveCount(0);
});
