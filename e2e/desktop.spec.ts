import { expect, test, type APIRequestContext, type Locator, type Page } from "./without-ocr";

const desktop = { width: 1440, height: 900 };
test.use({ viewport: desktop, isMobile: false, hasTouch: false });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

// SLOW_FRAMES=1 runs every case with each animation frame 200 ms late, as on a loaded CI runner.
test.beforeEach(async ({ page }) => {
  if (!process.env.SLOW_FRAMES) return;
  await page.addInitScript(() => {
    const now = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => window.setTimeout(() => now(callback), 200);
  });
});

const bucket = (run: 1 | 2, guinness: number, watermelon: number) => [
  { id: `ultra${run}`, name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
  { id: `guinness${run}`, name: "Guinness Draught 14.9oz Can", price: 729 * guinness, quantity: guinness },
  { id: `pineapple${run}`, name: "High Noon Pineapple 12oz Can", price: 849 },
  { id: `watermelon${run}`, name: "High Noon Watermelon 12oz Can", price: 849 * watermelon, ...(watermelon > 1 ? { quantity: watermelon } : {}) },
];

const topgolf = {
  items: [{ id: "gameplay", name: "Gameplay", price: 8775 }, ...bucket(1, 3, 1), ...bucket(2, 2, 2)],
  adjustments: [
    { id: "bucket1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["ultra1", "guinness1", "pineapple1", "watermelon1"] } },
    { id: "bucket2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: { name: "Beer Bucket", items: ["ultra2", "guinness2", "pineapple2", "watermelon2"] } },
    { id: "tax", kind: "tax", name: "Tax", amount: 494 },
    { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
  ],
  subtotal: 17923,
  total: 20729,
};

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.55.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: topgolf,
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

const pane = (page: Page) => page.getByRole("complementary");
const receipt = (page: Page) => page.getByTestId("receipt");
const itemPopover = (page: Page) => page.getByRole("dialog", { name: "Item" });
const gameplay = (page: Page) => page.getByRole("button", { name: /^Open Gameplay, \$87\.75, / });
const firstBucket = (page: Page) => page.getByRole("button", { name: /^Beer Bucket, / }).first();
const guinness = (page: Page) => page.getByRole("button", { name: /^Open 3x Guinness Draught 14\.9oz Can, \$21\.87, / });
const cans = (page: Page) => page.getByRole("button", { name: /^Open Guinness Draught 14\.9oz Can, \$7\.29, / });

async function open(page: Page, link: string) {
  await page.goto(link);
  await expect(pane(page).getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
}

async function pick(page: Page, name: string) {
  await pane(page).getByRole("button", { name, exact: true }).click();
  await expect(pane(page).getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

type Box = { x: number; y: number; width: number; height: number };

async function box(target: Locator): Promise<Box> {
  const found = await target.boundingBox();
  if (!found) throw new Error("not laid out");
  return found;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (a: Box, { width, height }: { width: number; height: number }) => a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height;

test("a click on a line opens its detail as a popover under that line, while the right pane stays in view", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");

  await gameplay(page).click();

  await expect(itemPopover(page)).toBeVisible();
  await expect(page.getByTestId("item-sheet")).toHaveCount(0);
  const line = await box(gameplay(page));
  const popover = await box(itemPopover(page));
  expect(popover.y).toBeGreaterThanOrEqual(line.y + line.height);
  expect(popover.y).toBeLessThan(line.y + line.height + 24);
  expect(inside(popover, desktop)).toBe(true);
  await expect(pane(page).getByTestId("share")).toBeVisible();
  expect(overlaps(popover, await box(pane(page)))).toBe(false);
});

test("Enter opens a line's popover, and Escape closes it with focus back on the line", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");

  await gameplay(page).focus();
  await page.keyboard.press("Enter");
  await expect(itemPopover(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(itemPopover(page)).toHaveCount(0);
  await expect(gameplay(page)).toBeFocused();
});

test("a click outside the popover closes it", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await gameplay(page).click();
  await expect(itemPopover(page)).toBeVisible();

  await page.mouse.click(20, desktop.height - 20);

  await expect(itemPopover(page)).toHaveCount(0);
});

test("a Claim in the popover updates Your share in the right pane", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await expect(pane(page).getByTestId("share")).toHaveText("$0.00");

  await gameplay(page).click();
  await itemPopover(page).getByRole("button", { name: "Sam", exact: true }).click();

  await expect(pane(page).getByTestId("share")).toHaveText("$106.94", live);
  await expect(itemPopover(page)).toBeVisible();
  await expect(pane(page)).toContainText("Gameplay");
});

test("Split on a quantity-3 line leaves three one-unit rows, and Delete item on one leaves two", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await firstBucket(page).click();

  await guinness(page).click();
  await itemPopover(page).getByRole("button", { name: "Split into 3" }).click();

  await expect(itemPopover(page)).toHaveCount(0, live);
  await expect(guinness(page)).toHaveCount(0);
  await expect(cans(page)).toHaveCount(3, live);

  await cans(page).nth(1).click();
  await itemPopover(page).getByRole("button", { name: "Delete item" }).click();

  await expect(itemPopover(page)).toHaveCount(0, live);
  await expect(cans(page)).toHaveCount(2, live);
});

test("Add item opens its form as a popover from its row, and the new row lands in the receipt with its claim", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  const addRow = receipt(page).getByRole("button", { name: "Add item", exact: true });
  const form = page.getByRole("dialog", { name: "New item" });

  await addRow.click();

  await expect(form).toBeVisible();
  await expect(page.getByTestId("add-sheet")).toHaveCount(0);
  const row = await box(addRow);
  const popover = await box(form);
  expect(inside(popover, desktop)).toBe(true);
  expect(popover.y >= row.y + row.height || popover.y + popover.height <= row.y).toBe(true);

  await form.getByRole("textbox", { name: "Item name", exact: true }).fill("Fries");
  await form.getByRole("textbox", { name: "Price", exact: true }).fill("6.50");
  await form.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam", exact: true }).click();
  await form.getByRole("button", { name: "Add item", exact: true }).click();

  await expect(form).toHaveCount(0, live);
  await expect(page.getByRole("button", { name: "Open Fries, $6.50, had by Sam" })).toBeVisible(live);
  await expect(pane(page)).toContainText("Fries");
});

test("History opens as a popover from its button, and Escape hands focus back to the button", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  const history = page.getByRole("button", { name: "History", exact: true });
  const list = page.getByRole("dialog", { name: "History" });

  await history.click();

  await expect(list).toBeVisible();
  await expect(page.getByTestId("history-sheet")).toHaveCount(0);
  const button = await box(history);
  const popover = await box(list);
  expect(popover.y).toBeGreaterThanOrEqual(button.y + button.height);
  expect(inside(popover, desktop)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(history).toBeFocused();
});

for (const width of [1024, 1440]) {
  test(`at ${width} px the receipt and the right pane sit side by side in the middle, and a popover stays on screen and off the pane`, async ({ page, request }, { workerIndex }) => {
    const viewport = { width, height: 800 };
    await page.setViewportSize(viewport);
    await open(page, await createSplit(request, workerIndex));

    const card = await box(receipt(page));
    const side = await box(pane(page));
    expect(overlaps(card, side)).toBe(false);
    expect(side.x).toBeGreaterThan(card.x + card.width);
    expect(Math.abs(side.y - card.y)).toBeLessThan(2);
    const left = card.x;
    const right = width - (side.x + side.width);
    expect(Math.abs(left - right)).toBeLessThan(2);
    await expect(page.getByTestId("split-sheet")).toHaveCount(0);

    await pick(page, "Sam");
    await page.getByRole("button", { name: /^Beer Bucket, / }).last().click();
    const last = page.getByRole("button", { name: /^Open 2x High Noon Watermelon 12oz Can, / });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const popover = await box(itemPopover(page));
    expect(inside(popover, viewport)).toBe(true);
    expect(overlaps(popover, await box(pane(page)))).toBe(false);
  });
}

test("under 1024 px the Split page keeps the phone layout with its bottom sheet", async ({ page, request }, { workerIndex }) => {
  await page.setViewportSize({ width: 1023, height: 800 });
  await page.goto(await createSplit(request, workerIndex));

  await expect(page.getByRole("dialog", { name: "Which one are you?" })).toBeVisible(live);
  await expect(page.getByRole("complementary")).toHaveCount(0);
});
