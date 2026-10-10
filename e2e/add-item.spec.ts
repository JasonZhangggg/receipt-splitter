import { simulateKeyboard } from "./motion";
import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";
import { fromMore } from "./header";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

type Row = { id: string; name: string; price: number };
const rice: Row[] = [{ id: "rice", name: "Rice", price: 800 }];
type Bundle = { id: string; kind: "bundleDiscount"; name: string; amount: number; bundle: { name: string; items: string[] } };
const bucket: Bundle[] = [{ id: "bucket", kind: "bundleDiscount", name: "Bucket deal", amount: -200, bundle: { name: "Beer Bucket", items: ["pitcher", "sprite"] } }];
const bucketRows: Row[] = [...rice, { id: "pitcher", name: "Pitcher", price: 1200 }, { id: "sprite", name: "Sprite", price: 250 }];
const hundred: Row[] = Array.from({ length: 100 }, (_, at) => ({ id: `i${at}`, name: `Item ${at}`, price: 100 }));

let creates = 0;

/** The printed Subtotal counts `missing` cents more than `items`, as when the reading missed a line. */
async function createSplit(request: APIRequestContext, workerIndex: number, items: Row[] = rice, missing = 0, adjustments: Bundle[] = []): Promise<string> {
  creates += 1;
  const subtotal = items.reduce((sum, { price }) => sum + price, missing);
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.54.${100 + workerIndex}.${creates}` },
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

async function open(browser: Browser, link: string, before: (page: Page) => void = () => {}): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(phone);
  before(page);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

async function pick(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

const addRow = (page: Page) => page.getByRole("button", { name: "Add item", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "New item" });
const field = (page: Page, name: string) => sheet(page).getByRole("textbox", { name, exact: true });
const fries = (page: Page) => page.getByRole("button", { name: /^Open Fries, \$6\.50, / });

async function addFries(page: Page, who: string[]) {
  await addRow(page).click();
  await field(page, "Item name").fill("Fries");
  await field(page, "Price").fill("6.50");
  for (const name of who) await sheet(page).getByRole("group", { name: "Who had it" }).getByRole("button", { name, exact: true }).click();
  await sheet(page).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0, live);
}

async function shareOf(page: Page, name: string): Promise<string> {
  await page.getByRole("button", { name: new RegExp(`^${name}(, you)?$`) }).click();
  const share = (await page.getByTestId("owe").textContent({ timeout: live.timeout })) ?? "";
  await page.getByRole("button", { name: new RegExp(`^${name}(, you)?$`) }).click();
  return share;
}

test("an Item added on one phone shows on another with who had it, and the Shares follow a claim on it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, rice, 650);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  const totalNote = sam.getByRole("status").filter({ hasText: "$6.50" });
  await expect(totalNote).toBeVisible();

  await addFries(sam, ["Sam"]);
  await expect(sam.getByRole("button", { name: "Open Fries, $6.50, had by Sam" })).toBeVisible(live);
  await expect(priya.getByRole("button", { name: "Open Fries, $6.50, had by Sam" })).toBeVisible(live);
  await expect(sam.getByTestId("owe")).toHaveText("$6.50");
  await expect(totalNote).toHaveCount(0);

  await priya.getByRole("button", { name: "Fries, check for Priya" }).click();
  await expect(sam.getByRole("button", { name: /^Open Fries, \$6\.50, had by (Sam, Priya|Priya, Sam)$/ })).toBeVisible(live);
  await expect(sam.getByTestId("owe")).toHaveText("$3.25", live);
  await expect(priya.getByTestId("owe")).toHaveText("$3.25", live);
  expect(await shareOf(priya, "Sam")).toBe("$3.25");
});

test("people tapped in Who had it against id order (Sam, then Priya) still add the Item split between them", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, rice, 650));
  await pick(sam, "Sam");

  await addFries(sam, ["Sam", "Priya"]);
  await expect(sam.getByRole("button", { name: /^Open Fries, \$6\.50, had by (Sam, Priya|Priya, Sam)$/ })).toBeVisible(live);
  await expect(sam.getByTestId("owe")).toHaveText("$3.25");
  expect(await shareOf(sam, "Priya")).toBe("$3.25");
});

test("History lists the add, and Revert from another phone asks first and takes the row off both", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await addFries(sam, []);
  await expect(fries(priya)).toBeVisible(live);

  await fromMore(priya, "History");
  await priya.getByRole("button", { name: "Revert Added Fries" }).click();
  await priya.getByRole("alertdialog", { name: "Revert Sam's change?" }).getByRole("button", { name: "Revert" }).click();
  await expect(priya.getByText("Reverted")).toBeVisible(live);
  await expect(fries(sam)).toHaveCount(0, live);
  await expect(fries(priya)).toHaveCount(0);
});

test("a Split at 100 Items says it is full and sends nothing", async ({ browser, request }, { workerIndex }) => {
  const sent: string[] = [];
  const sam = await open(browser, await createSplit(request, workerIndex, hundred), (page) =>
    page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => typeof payload === "string" && sent.push(payload))),
  );
  await pick(sam, "Sam");
  await expect.poll(() => sent.some((frame) => frame.includes('"pick"'))).toBe(true);

  await addRow(sam).click();
  await field(sam, "Item name").fill("Fries");
  await field(sam, "Price").fill("6.50");
  await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();

  await expect(sheet(sam).getByText("A split holds at most 100 items.")).toBeVisible();
  await expect(field(sam, "Item name")).toHaveValue("Fries");
  expect(sent.filter((frame) => frame.includes('"add"'))).toEqual([]);
});

test("Add item with no name focuses the name and says so, and Return walks name, detail and price, then adds", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex));
  await pick(sam, "Sam");
  await addRow(sam).click();

  await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(sheet(sam).getByText("Add a name.")).toBeVisible();
  await expect(field(sam, "Item name")).toBeFocused();

  await sam.keyboard.type("Fries");
  await sam.keyboard.press("Enter");
  await expect(field(sam, "Detail")).toBeFocused();
  await sam.keyboard.type("large");
  await sam.keyboard.press("Enter");
  await expect(field(sam, "Price")).toBeFocused();
  await sam.keyboard.type("6.50");
  await sam.keyboard.press("Enter");

  await expect(sheet(sam)).toHaveCount(0, live);
  await expect(sam.getByRole("button", { name: "Open Fries, $6.50, nobody had it" })).toBeVisible(live);
  await expect(sam.getByText("large", { exact: true })).toBeVisible();
});

test("the sheet keeps its top and height when a problem line appears", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex));
  await pick(sam, "Sam");
  await addRow(sam).click();
  await expect(field(sam, "Item name")).toBeVisible();
  await sam.waitForTimeout(800);
  const box = async () => {
    const { y, height } = (await sheet(sam).boundingBox())!;
    return { top: Math.round(y), height: Math.round(height) };
  };
  const before = await box();

  await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(sheet(sam).getByText("Add a name.")).toBeVisible();
  expect(await box()).toEqual(before);
  await sam.waitForTimeout(400);
  expect(await box()).toEqual(before);
});

const iphoneKeyboard = 336;

const aboveKeyboard = (target: Locator) =>
  target.evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    const { offsetTop, height } = window.visualViewport!;
    return top >= offsetTop && bottom <= offsetTop + height;
  });

test("with the iPhone keyboard up, each focused field of the add sheet is above it and the sheet keeps its place", async ({ page, request }, { workerIndex }) => {
  await simulateKeyboard(page, iphoneKeyboard);
  await page.goto(await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await addRow(page).click();
  const surface = page.getByTestId("add-sheet");
  await expect(surface).toBeVisible();
  await page.waitForTimeout(600);
  const top = async () => Math.round((await surface.boundingBox())!.y);
  const rest = await top();

  for (const name of ["Item name", "Detail", "Price"]) {
    await field(page, name).tap();
    await expect(field(page, name)).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(phone.height - iphoneKeyboard);
    await expect.poll(() => aboveKeyboard(field(page, name))).toBe(true);
    expect(await top()).toBe(rest);
  }
});

/** A page whose own frames run `rafDelay` ms late, with the browser's frame kept for sampling. */
async function slowFramesOpen(browser: Browser, link: string, rafDelay: number): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(phone);
  await page.addInitScript((delay) => {
    const frame = window.requestAnimationFrame.bind(window);
    Object.assign(window, { sampleFrame: frame });
    if (delay > 0) window.requestAnimationFrame = (callback) => frame(() => setTimeout(() => frame(callback), delay));
  }, rafDelay);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

for (const rafDelay of [0, 200]) {
  test(`the added row's first painted frame is at height 0, and it opens with its claim on every frame, with frames ${rafDelay} ms late @frame-timing`, async ({ browser, request }, { workerIndex }) => {
    const sam = await slowFramesOpen(browser, await createSplit(request, workerIndex, bucketRows, 0, bucket), rafDelay);
    await pick(sam, "Sam");
    await addRow(sam).click();
    await field(sam, "Item name").fill("Fries");
    await field(sam, "Price").fill("6.50");
    await sheet(sam).getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam", exact: true }).click();

    const frames = sam.evaluate(
      () =>
        new Promise<{ height: number; opacity: number; claimed: boolean }[]>((resolve) => {
          const frame = (window as unknown as { sampleFrame: typeof requestAnimationFrame }).sampleFrame;
          const seen: { height: number; opacity: number; claimed: boolean }[] = [];
          const started = performance.now();
          const sample = () => {
            const row = [...document.querySelectorAll('[data-testid^="line-"]')].find((line) => line.textContent?.includes("Fries"));
            const box = row?.parentElement;
            if (row && box) {
              const label = row.querySelector('[aria-label^="Open Fries"]')?.getAttribute("aria-label") ?? "";
              seen.push({ height: Math.round(box.getBoundingClientRect().height), opacity: Number(getComputedStyle(box).opacity), claimed: label.includes("had by Sam") });
            }
            if (performance.now() - started < 4000) frame(sample);
            else resolve(seen);
          };
          frame(sample);
        }),
    );
    await sam.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();

    const seen = await frames;
    const full = seen.at(-1)!.height;
    expect(full).toBeGreaterThanOrEqual(44);
    expect(seen.every(({ claimed }) => claimed)).toBe(true);
    expect(seen[0].height).toBeLessThanOrEqual(4);
    expect(seen[0].opacity).toBeLessThanOrEqual(0.1);
    expect(seen.every(({ height }, at) => at === 0 || height >= seen[at - 1].height)).toBe(true);
  });
}
