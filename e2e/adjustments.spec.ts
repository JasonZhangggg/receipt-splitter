import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";

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

async function settled(page: Page, testId: string) {
  const top = () => page.getByTestId(testId).evaluate((element) => element.getBoundingClientRect().top);
  await expect.poll(async () => (await top()) - (await new Promise<number>((resolve) => setTimeout(() => void top().then(resolve), 120))), live).toBe(0);
}

/** A finger swiping the grab bar down, as iOS reports it: after a touch iOS never ended, the next touch comes with isPrimary false. */
async function swipeDown(page: Page, testId: string, { isPrimary = true } = {}) {
  await settled(page, testId);
  await page.getByTestId(testId).evaluate(async (surface, isPrimary) => {
    Element.prototype.setPointerCapture = () => {};
    const grab = surface.querySelector("[data-sheet-grab]")!;
    const x = innerWidth / 2;
    const from = grab.getBoundingClientRect().top + 8;
    const fire = (type: string, y: number) =>
      grab.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 42, pointerType: "touch", isPrimary, clientX: x, clientY: y }));
    fire("pointerdown", from);
    for (let dy = 30; dy <= 300; dy += 30) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      fire("pointermove", from + dy);
    }
    fire("pointerup", from + 300);
  }, isPrimary);
}

/** The touch that opens iOS's Cut/Copy/Paste menu on a field: a pointerdown that never gets a pointerup or pointercancel. */
const editMenuTouch = (field: Locator) =>
  field.evaluate((input) => {
    const box = input.getBoundingClientRect();
    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
  });

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

test("an amount typed as 4 reads 4.00 after Done, and the Total follows it", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await amountIn(sam, "Charge").fill("4");
  await amountIn(sam, "Charge").press("Enter");

  await expect(amountIn(sam, "Charge")).toHaveValue("4.00");
  await expect(priya.getByTestId("total")).toHaveText("$22.00", live);
});

test("a discount that would take the Total under $0.00 keeps its sheet open on the problem through Close, the scrim, Escape and a swipe, and Close never takes focus from the field", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: "Open Coupon, -$2.00" }).click();
  const sheet = dialog(sam, "Discount");
  const amount = amountIn(sam, "Discount", "Amount off");
  await expect(sheet.getByText("-$", { exact: true })).toBeVisible();
  await amount.fill("50");
  const blurs = await amount.evaluateHandle((input) => {
    const seen: string[] = [];
    input.addEventListener("blur", () => seen.push("blur"));
    return seen;
  });

  for (let press = 0; press < 2; press += 1) {
    await closeSheet(sam, "Discount");
    await expect(sheet.getByRole("status")).toHaveText("That takes the total under $0.00.");
    await expect(amount).toBeFocused();
  }
  expect(await blurs.jsonValue()).toEqual([]);
  await expect(amount).toHaveValue("50");
  await sam.mouse.click(phone.width / 2, 40);
  await expect(amount).not.toBeFocused();
  await expect(amount).toHaveValue("50.00");
  await sheet.getByRole("button", { name: "Close", exact: true }).press("Enter");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("status")).toHaveText("That takes the total under $0.00.");
  await sam.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await expect(amount).not.toBeFocused();
  await swipeDown(sam, "adjustment-sheet");
  await settled(sam, "adjustment-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("status")).toHaveText("That takes the total under $0.00.");
  await expect(amount).not.toBeFocused();
  await expect(amount).toHaveValue("50.00");
  for (const page of [sam, priya]) await expect(page.getByTestId("total")).toHaveText("$19.00");

  await amountIn(sam, "Discount", "Amount off").fill("3");
  await closeSheet(sam, "Discount");
  await expect(sheet).toHaveCount(0, live);
  for (const page of [sam, priya]) {
    await expect(page.getByRole("button", { name: "Open Coupon, -$3.00" })).toBeVisible(live);
    await expect(page.getByTestId("total")).toHaveText("$18.00", live);
  }
});

test("a swipe down still closes the sheet after a touch on a field that iOS never ended", async ({ browser, request }, { workerIndex }) => {
  const [sam] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: "Open Coupon, -$2.00" }).click();
  await editMenuTouch(amountIn(sam, "Discount", "Amount off"));
  await swipeDown(sam, "adjustment-sheet", { isPrimary: false });
  await expect(dialog(sam, "Discount")).toHaveCount(0, live);
});

test("a sheet left open with a typed name keeps the amount another phone fixed, and both edits stay", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await dialog(sam, "Charge").getByRole("textbox", { name: "Name", exact: true }).fill("Sales tax");
  await expect(priya.getByRole("button", { name: "Open Sales tax, $1.00" })).toBeVisible(live);

  await priya.getByRole("button", { name: "Open Sales tax, $1.00" }).click();
  await amountIn(priya, "Charge").fill("3.00");
  await closeSheet(priya, "Charge");
  await expect(amountIn(sam, "Charge")).toHaveValue("3.00", live);
  await closeSheet(sam, "Charge");
  // Past the sheet's save delay, so a late save from Sam's sheet would have landed.
  await sam.waitForTimeout(1500);

  for (const page of [sam, priya]) {
    await expect(page.getByRole("button", { name: "Open Sales tax, $3.00" })).toBeVisible();
    await expect(page.getByTestId("total")).toHaveText("$21.00");
  }
});

test("a sheet left open with a typed amount keeps the name another phone gave the line", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await sam.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await amountIn(sam, "Charge").fill("2.50");
  await expect(priya.getByTestId("total")).toHaveText("$20.50", live);

  await priya.getByRole("button", { name: "Open Tax, $2.50" }).click();
  await dialog(priya, "Charge").getByRole("textbox", { name: "Name", exact: true }).fill("VAT");
  await closeSheet(priya, "Charge");
  await expect(dialog(sam, "Charge").getByRole("textbox", { name: "Name", exact: true })).toHaveValue("VAT", live);
  await closeSheet(sam, "Charge");
  await sam.waitForTimeout(1500);

  for (const page of [sam, priya]) {
    await expect(page.getByRole("button", { name: "Open VAT, $2.50" })).toBeVisible();
    await expect(page.getByTestId("total")).toHaveText("$20.50");
  }
});

test("Your share stays open while another phone fixes the tax, and its lines follow", async ({ browser, request }, { workerIndex }) => {
  const [sam, priya] = await samAndPriya(browser, await createSplit(request, workerIndex));
  await priya.getByTestId("owe").click();
  const breakdown = priya.getByTestId("breakdown");
  await expect(breakdown).toBeVisible(live);
  await expect(breakdown).toContainText("$11.40");

  await sam.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await amountIn(sam, "Charge").fill("9.00");
  await closeSheet(sam, "Charge");

  await expect(breakdown).toContainText("$5.40", live);
  await expect(breakdown).toContainText("$16.20");
  await expect(breakdown).toBeVisible();
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

test("a tax turned into a discount on desktop opens in a popover, takes the name Discount and flips the line's sign", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex), { width: 1440, height: 900 });
  const pane = page.getByRole("complementary");
  await pane.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(pane.getByRole("button", { name: "Sam, you", exact: true })).toBeVisible(live);

  await page.getByRole("button", { name: "Open Tax, $1.00" }).click();
  await dialog(page, "Charge").getByRole("group", { name: "Kind" }).getByRole("button", { name: "Discount" }).click();
  // Named for the saved kind, the popover is renamed once the switch saves.
  const popover = page.getByRole("dialog");
  await expect(popover.getByRole("heading", { name: "Discount" })).toBeVisible();
  await expect(popover.getByRole("textbox", { name: "Amount off", exact: true })).toHaveValue("1.00");
  await expect(popover.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Discount");

  await expect(page.getByRole("button", { name: "Open Discount, -$1.00" })).toBeVisible(live);
  await expect(dialog(page, "Discount")).toBeVisible();
  await expect(page.getByTestId("total")).toHaveText("$17.00", live);
  await page.keyboard.press("Escape");
  await expect(dialog(page, "Discount")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Discount, -$1.00" })).toBeFocused();
});
