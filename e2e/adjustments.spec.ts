import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

type Adjustment = { id: string; kind: string; name: string; amount: number; bundle?: { name: string; items: string[] } };
const items = [
  { id: "rice", name: "Rice", price: 800 },
  { id: "pitcher", name: "Pitcher", price: 1200 },
];
const charges: Adjustment[] = [
  { id: "tax", kind: "tax", name: "Tax", amount: 100 },
  { id: "coupon", kind: "discount", name: "Coupon", amount: -200 },
];
const bucket: Adjustment[] = [{ id: "bucket", kind: "bundleDiscount", name: "Bucket deal", amount: -200, bundle: { name: "Beer Bucket", items: ["rice", "pitcher"] } }];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, adjustments: Adjustment[] = charges): Promise<string> {
  creates += 1;
  const subtotal = items.reduce((sum, { price }) => sum + price, 0);
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.55.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: { items, adjustments, subtotal, total: subtotal + adjustments.reduce((sum, { amount }) => sum + amount, 0) },
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

async function open(browser: Browser, link: string, viewport = phone): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(viewport);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

async function pick(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

/** Sam had the Rice and Priya the Pitcher, each picked on their own phone. */
async function samAndPriya(browser: Browser, link: string, inBundle = false): Promise<readonly [Page, Page]> {
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  if (inBundle) for (const page of [sam, priya]) await page.getByRole("button", { name: /^Beer Bucket, / }).click();
  await sam.getByRole("button", { name: "Rice, check for Sam" }).click();
  await priya.getByRole("button", { name: "Pitcher, check for Priya" }).click();
  await expect(sam.getByRole("button", { name: /^Open Pitcher, \$12\.00, had by Priya$/ })).toBeVisible(live);
  return [sam, priya];
}

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const amountIn = (page: Page, sheet: string, name = "Amount") => dialog(page, sheet).getByRole("textbox", { name, exact: true });
const closeSheet = (page: Page, sheet: string) => dialog(page, sheet).getByRole("button", { name: "Close", exact: true }).click();

test("a tax fixed on one phone moves the Total and every Share on both", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await expect(sam.getByTestId("total")).toHaveText("$19.00");
  await expect(sam.getByTestId("owe")).toHaveText("$7.60", live);

  await sam.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await amountIn(sam, "Charge").fill("3.00");
  await closeSheet(sam, "Charge");

  for (const page of [sam, priya]) {
    await expect(page.getByTestId("total")).toHaveText("$21.00", live);
    await expect(page.getByRole("button", { name: "Open Tax, $3.00" })).toBeVisible(live);
  }
  await expect(sam.getByTestId("owe")).toHaveText("$8.40", live);
  await expect(priya.getByTestId("owe")).toHaveText("$12.60", live);
});

test("a tip added from the receipt shows on both phones with the Total up by it", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));

  await sam.getByRole("button", { name: "Add tax, tip or discount" }).click();
  const sheet = dialog(sam, "Add tax, tip or discount");
  await expect(sheet.getByRole("button", { name: "Tip", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Add tip", exact: true }).click();
  await expect(sheet.getByRole("status")).toHaveText("Add an amount.");
  await expect(amountIn(sam, "Add tax, tip or discount")).toBeFocused();
  await amountIn(sam, "Add tax, tip or discount").fill("4");
  await amountIn(sam, "Add tax, tip or discount").press("Enter");
  await expect(sheet).toHaveCount(0, live);

  for (const page of [sam, priya]) {
    await expect(page.getByRole("button", { name: "Open Tip, $4.00" })).toBeVisible(live);
    await expect(page.getByTestId("total")).toHaveText("$23.00", live);
  }
  await expect(priya.getByTestId("owe")).toHaveText("$13.80", live);
});

test("a deleted discount leaves both phones and raises the Total", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));

  await priya.getByRole("button", { name: "Open Coupon, -$2.00" }).click();
  await expect(amountIn(priya, "Discount", "Amount off")).toHaveValue("2.00");
  await dialog(priya, "Discount").getByRole("button", { name: "Delete discount" }).click();
  await expect(dialog(priya, "Discount")).toHaveCount(0, live);

  for (const page of [sam, priya]) {
    await expect(page.getByRole("button", { name: /^Open Coupon/ })).toHaveCount(0, live);
    await expect(page.getByTestId("total")).toHaveText("$21.00", live);
  }
});

test("a Bundle discount takes a new amount off and keeps its Items", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex, bucket), true);
  await expect(sam.getByTestId("total")).toHaveText("$18.00");
  await expect(sam.getByTestId("owe")).toHaveText("$7.20", live);

  await sam.getByRole("button", { name: "Open Bucket deal, -$2.00" }).click();
  await expect(dialog(sam, "Discount").getByText("This discount comes off the 2 items in Beer Bucket.")).toBeVisible();
  await expect(dialog(sam, "Discount").getByRole("group", { name: "Kind" })).toHaveCount(0);
  await amountIn(sam, "Discount", "Amount off").fill("5");
  await closeSheet(sam, "Discount");

  for (const page of [sam, priya]) await expect(page.getByTestId("total")).toHaveText("$15.00", live);
  await expect(sam.getByRole("button", { name: "Open Bucket deal, -$5.00" })).toBeVisible(live);
  await expect(sam.getByRole("button", { name: /^Open Rice, \$8\.00, had by Sam$/ })).toBeVisible();
  await expect(sam.getByTestId("owe")).toHaveText("$6.00", live);
});

test("Revert from the other phone asks first and puts the tax and the Total back on both", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await amountIn(sam, "Charge").fill("3.00");
  await closeSheet(sam, "Charge");
  await expect(priya.getByTestId("total")).toHaveText("$21.00", live);

  await priya.getByRole("button", { name: "History" }).click();
  await priya.getByRole("button", { name: "Revert Tax" }).click();
  await priya.getByRole("alertdialog", { name: "Revert Sam's change?" }).getByRole("button", { name: "Revert" }).click();
  await expect(priya.getByText("Reverted")).toBeVisible(live);

  for (const page of [sam, priya]) {
    await expect(page.getByRole("button", { name: "Open Tax, $1.00" })).toBeVisible(live);
    await expect(page.getByTestId("total")).toHaveText("$19.00", live);
  }
});

test("a tax turned into a discount on desktop opens in a popover and flips the line's sign", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex), { width: 1440, height: 900 });
  await pick(page, "Sam");

  await page.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await dialog(page, "Charge").getByRole("group", { name: "Kind" }).getByRole("button", { name: "Discount" }).click();
  // Named for the saved kind, the popover is renamed once the switch saves.
  const popover = page.getByRole("dialog");
  await expect(popover.getByRole("heading", { name: "Discount" })).toBeVisible();
  await expect(popover.getByRole("textbox", { name: "Amount off", exact: true })).toHaveValue("1.00");

  await expect(page.getByRole("button", { name: "Open Tax, -$1.00" })).toBeVisible(live);
  await expect(dialog(page, "Discount")).toBeVisible();
  await expect(page.getByTestId("total")).toHaveText("$17.00", live);
  await page.keyboard.press("Escape");
  await expect(dialog(page, "Discount")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Tax, -$1.00" })).toBeFocused();
});
