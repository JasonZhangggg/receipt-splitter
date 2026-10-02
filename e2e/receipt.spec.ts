import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });
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
    headers: { "cf-connecting-ip": `198.52.${100 + workerIndex}.${creates}` },
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

const pickSheet = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" });

async function open(browser: Browser, link: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

async function pick(page: Page, name: string) {
  await pickSheet(page).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

const firstBucket = (page: Page) => page.getByRole("button", { name: /^Beer Bucket, / }).first();
const guinness = (page: Page) => page.getByRole("button", { name: /^Open Guinness Draught 14\.9oz Can, \$7\.29, / });
const guinnessCircles = (page: Page, name: string) => page.getByRole("button", { name: `Guinness Draught 14.9oz Can, check for ${name}` });

test("a Beer Bucket opens and closes from the keyboard in place, says so through aria-expanded, and keeps focus on its header", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");

  await expect(page.getByRole("button", { name: "Beer Bucket, 6 items, 10% off, collapsed" })).toHaveCount(2);
  await firstBucket(page).focus();
  await page.keyboard.press("Enter");

  await expect(firstBucket(page)).toHaveAttribute("aria-expanded", "true");
  await expect(firstBucket(page)).toHaveAccessibleName("Beer Bucket, 6 items, 10% off, expanded");
  await expect(firstBucket(page)).toBeFocused();
  await expect(guinness(page)).toHaveCount(3);
  for (const row of await guinness(page).all()) await expect(row).toBeVisible();
  const region = await firstBucket(page).getAttribute("aria-controls");
  await expect(page.locator(`[id="${region}"]`).getByRole("button", { name: /^Open Guinness/ })).toHaveCount(3);
  await expect(page.locator(`[id="${region}"]`).getByRole("list", { name: "Beer Bucket" })).toHaveCount(1);

  await page.keyboard.press("Space");
  await expect(firstBucket(page)).toHaveAttribute("aria-expanded", "false");
  await expect(firstBucket(page)).toBeFocused();
  await expect(guinness(page)).toHaveCount(0);
  await expect(page.locator(`[id="${region}"]`).getByRole("list")).toHaveCount(0);
});

test("a Beer Bucket grows open over several frames instead of jumping to its full height", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  const region = await firstBucket(page).getAttribute("aria-controls");
  const heights = page.evaluate(
    (id) =>
      new Promise<number[]>((resolve) => {
        const box = document.getElementById(id ?? "");
        const seen: number[] = [];
        const sample = () => {
          seen.push(Math.round(box?.getBoundingClientRect().height ?? -1));
          if (seen.length < 90) requestAnimationFrame(sample);
          else resolve(seen);
        };
        requestAnimationFrame(sample);
      }),
    region,
  );
  await firstBucket(page).click();

  const seen = await heights;
  const full = seen.at(-1) ?? 0;
  expect(full).toBeGreaterThan(200);
  expect(seen.filter((height) => height > 0 && height < full * 0.9).length).toBeGreaterThan(2);
});

test("three Guinness cans are three rows at 7.29, and a circle checks only the can it is on", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await firstBucket(page).click();

  await expect(page.getByText("Qty")).toHaveCount(0);
  await expect(guinness(page)).toHaveCount(3);
  await guinnessCircles(page, "Sam").nth(1).click();

  await expect(guinnessCircles(page, "Sam").nth(1)).toHaveAttribute("aria-pressed", "true", live);
  await expect(guinnessCircles(page, "Sam").nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(guinnessCircles(page, "Sam").nth(2)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Open Guinness Draught 14.9oz Can, $7.29, had by Sam" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Open Guinness Draught 14.9oz Can, $7.29, nobody had it" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Guinness.*nobody had it/ }).getByText("Unclaimed", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Guinness.*had by Sam/ }).getByText("Unclaimed", { exact: true })).toHaveCount(0);
  await firstBucket(page).click();
  await expect(firstBucket(page)).toHaveAccessibleName("Beer Bucket, 6 items, 10% off, had by Sam, 5 unclaimed, collapsed");
  await expect(firstBucket(page).getByText("5 unclaimed", { exact: true })).toBeVisible();
});

test("a Bundle Item's sheet shows one can at its unit price, Delete item takes off that can only for everyone, and Revert brings back a whole Item", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await firstBucket(sam).click();
  await guinnessCircles(sam, "Sam").nth(2).click();
  await expect(guinnessCircles(sam, "Sam").nth(2)).toHaveAttribute("aria-pressed", "true", live);

  await guinness(sam).first().click();
  const sheet = sam.getByRole("dialog", { name: "Item" });
  await expect(sheet.getByText("In Beer Bucket. Its 10% off takes $0.73 off this line.")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("7.29");
  await expect(sheet.getByText("each", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Who had it" })).toHaveCount(1);
  await expect(sheet.getByRole("button", { name: "Less" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Delete item" }).click();

  await expect(sheet).toHaveCount(0, live);
  await expect(guinness(sam)).toHaveCount(2);
  await expect(sam.getByRole("button", { name: "Open Guinness Draught 14.9oz Can, $7.29, had by Sam" })).toHaveCount(1);
  await expect(firstBucket(sam)).toHaveAccessibleName("Beer Bucket, 5 items, 10% off, had by Sam, 4 unclaimed, expanded");
  await expect(firstBucket(priya)).toHaveAccessibleName("Beer Bucket, 5 items, 10% off, had by Sam, 4 unclaimed, collapsed", live);

  await sam.getByRole("button", { name: /^Open Michelob Ultra 16oz Aluminum Bottle, / }).first().click();
  await expect(sheet.getByText("each", { exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Delete item" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(firstBucket(priya)).toHaveAccessibleName("Beer Bucket, 4 items, 10% off, had by Sam, 3 unclaimed, collapsed", live);

  await sam.getByRole("button", { name: "History" }).click();
  await sam.getByRole("button", { name: "Revert Removed Michelob Ultra 16oz Aluminum Bottle" }).click();
  await expect(sam.getByText("Reverted")).toBeVisible(live);
  await expect(firstBucket(priya)).toHaveAccessibleName("Beer Bucket, 5 items, 10% off, had by Sam, 4 unclaimed, collapsed", live);
});

test("a name already on the Split keeps the cursor in Add yourself after Enter, so the next keys fix it", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pickSheet(page).getByRole("button", { name: "Not here? Add yourself" }).click();
  const field = page.getByRole("textbox", { name: "Your name" });
  await field.fill("Sam");
  await field.press("Enter");

  await expect(page.getByText("That name is already here.")).toBeVisible(live);
  await expect(field).toBeFocused();
  await page.keyboard.type(" K");
  await expect(field).toHaveValue("Sam K");
});

test("the pick sheet takes no taps while it leaves, so its Copy cannot fire after a name is picked", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const page = await (await newContext(browser)).newPage();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.routeWebSocket(/\/parties\/split-server\//, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (typeof message === "string" && JSON.parse(message).op?.type === "pick") void held.then(() => server.send(message));
      else server.send(message);
    });
  });
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  const copy = pickSheet(page).getByRole("button", { name: "Copy" });
  await copy.click({ trial: true });

  await pickSheet(page).getByRole("button", { name: "Jason", exact: true }).click();
  await expect(copy.click({ trial: true, timeout: 1_000 })).rejects.toThrow(/pointer events/);
  release();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible(live);
});
