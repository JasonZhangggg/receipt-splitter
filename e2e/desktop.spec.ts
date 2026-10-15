import { addRow } from "./add-menu";
import { expect, newContext, test, type APIRequestContext, type Page } from "./without-ocr";
import { viewAs } from "./header";

const desktop = { width: 1440, height: 900 };
test.use({ viewport: desktop, isMobile: false, hasTouch: false });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

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

const pick_ = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" });
const footer = (page: Page) => page.getByTestId("footer");
const itemPopover = (page: Page) => page.getByRole("dialog", { name: "Item" });
const gameplay = (page: Page) => page.getByRole("button", { name: /^Open Gameplay, \$87\.75, / });
const firstBucket = (page: Page) => page.getByRole("button", { name: /^Beer Bucket, / }).first();
const guinness = (page: Page) => page.getByRole("button", { name: /^Open 3x Guinness Draught 14\.9oz Can, \$21\.87, / });
const cans = (page: Page) => page.getByRole("button", { name: /^Open Guinness Draught 14\.9oz Can, \$7\.29, / });

async function open(page: Page, link: string) {
  await page.goto(link);
  await expect(pick_(page).getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
}

async function pick(page: Page, name: string) {
  await pick_(page).getByRole("button", { name, exact: true }).click();
  await expect(footer(page).getByTestId("owe")).toBeVisible(live);
}

test("the wordmark is the page's only level-1 heading, and the pick sheet's question is level 2", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("SplitWith, split a receipt");
  await expect(pick_(page).getByRole("heading", { name: "Which one are you?", level: 2 })).toBeVisible();
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

test("a Claim in the popover updates Your share in the right pane", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await expect(footer(page).getByTestId("owe")).toHaveText("$0.00");

  await gameplay(page).click();
  await itemPopover(page).getByRole("button", { name: "Sam", exact: true }).click();

  await expect(footer(page).getByTestId("owe")).toHaveText("$106.94", live);
  await expect(itemPopover(page)).toBeVisible();
  await expect(page.getByTestId("receipt")).toContainText("Gameplay");
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

test("Delete item on a line whose neighbors sit inside collapsed Bundles hands focus to the next Bundle's header", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await gameplay(page).click();
  await itemPopover(page).getByRole("button", { name: "Delete item" }).click();

  await expect(itemPopover(page)).toHaveCount(0, live);
  await expect(gameplay(page)).toHaveCount(0);
  await expect(firstBucket(page)).toBeFocused();
  await expect(firstBucket(page)).toHaveAttribute("aria-expanded", "false");
});

test("at phone width Escape closes the Item, Add menu and History sheets and hands focus back to what opened them, the History link for History", async ({ page, request }, { workerIndex }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(await createSplit(request, workerIndex));
  const asked = page.getByRole("dialog", { name: "Which one are you?" });
  await asked.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(asked).toHaveCount(0, live);
  const sheets = [
    { trigger: gameplay(page), sheet: page.getByTestId("item-sheet") },
    { trigger: addRow(page), sheet: page.getByRole("dialog", { name: "Add to the receipt" }) },
    { trigger: page.getByRole("button", { name: "History", exact: true }), sheet: page.getByTestId("history-sheet") },
  ];
  for (const { trigger, sheet } of sheets) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(sheet).toHaveCount(0, live);
    await expect(trigger).toBeFocused();
  }
});

test("another device's Delete item closes the open popover and hands focus to the next line", async ({ page, browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const ultra = (on: Page) => on.getByRole("button", { name: /^Open Michelob Ultra 16oz Aluminum Bottle, / }).first();
  await open(page, link);
  await pick(page, "Sam");
  await firstBucket(page).click();
  await ultra(page).click();
  await expect(itemPopover(page)).toBeVisible();
  const priya = await (await newContext(browser)).newPage();
  await priya.setViewportSize(desktop);
  await open(priya, link);
  await pick(priya, "Priya");
  await firstBucket(priya).click();
  await ultra(priya).click();

  await itemPopover(priya).getByRole("button", { name: "Delete item" }).click();

  await expect(itemPopover(page)).toHaveCount(0, live);
  await expect(ultra(page)).toHaveCount(0);
  await expect(guinness(page)).toBeFocused();
});

test("the confirm for checking Gameplay for Sam hangs just below its circle, and its yes checks it", async ({ page, request }, { workerIndex }) => {
  await open(page, await createSplit(request, workerIndex));
  await pick(page, "Priya");
  await viewAs(page, "Sam");

  const gameplayCircle = page.getByRole("button", { name: "Gameplay, check for Sam" });
  await gameplayCircle.click();
  const dialog = page.getByRole("dialog", { name: "Check Gameplay for Sam?" });
  await expect(dialog).toBeVisible(live);
  const row = (await gameplayCircle.boundingBox())!;
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.y - (row.y + row.height))).toBe(6);
  await dialog.getByRole("button", { name: "Check for Sam" }).click();
  await expect(gameplayCircle).toHaveAttribute("aria-pressed", "true", live);
  await expect(dialog).toHaveCount(0, live);
});
