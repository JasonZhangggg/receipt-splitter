import { addSheet, openAdd } from "./add-menu";
import { simulateKeyboard } from "./motion";
import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";
import { fromMore, viewAs } from "./header";

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

type Charge = { id: string; kind: "tax" | "tip"; name: string; amount: number };

async function createSplit(request: APIRequestContext, workerIndex: number, items: Row[] = rice, adjustments: (Bundle | Charge)[] = [], printed?: number): Promise<string> {
  creates += 1;
  const subtotal = printed ?? items.reduce((sum, { price }) => sum + price, 0);
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
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

const sheet = addSheet;
const field = (page: Page, name: string) => sheet(page).getByRole("textbox", { name, exact: true });
const fries = (page: Page) => page.getByRole("button", { name: /^Open Fries, \$6\.50, / });

async function addFries(page: Page) {
  await openAdd(page, "Item");
  await field(page, "Name").fill("Fries");
  await field(page, "Price").fill("6.50");
  await sheet(page).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0, live);
}

async function shareOf(page: Page, name: string): Promise<string> {
  await viewAs(page, name);
  const share = (await page.getByTestId("owe").textContent({ timeout: live.timeout })) ?? "";
  await page.getByRole("button", { name: "Back to you" }).click();
  return share;
}

test("an Item added on one phone shows on another with nobody having it, raises the Total by its price, and the Shares follow a claim on it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await expect(sam.getByTestId("total")).toHaveText("$8.00");

  await addFries(sam);
  await expect(sam.getByRole("button", { name: "Open Fries, $6.50, Nobody yet" })).toBeVisible(live);
  await expect(priya.getByRole("button", { name: "Open Fries, $6.50, Nobody yet" })).toBeVisible(live);
  for (const page of [sam, priya]) {
    await expect(page.getByTestId("total")).toHaveText("$14.50", live);
    await expect(page.getByRole("status").filter({ hasText: /short of|over the/ })).toHaveCount(0);
  }

  await sam.getByRole("button", { name: "Fries, check for Sam" }).click();
  await priya.getByRole("button", { name: "Fries, check for Priya" }).click();
  await expect(sam.getByRole("button", { name: /^Open Fries, \$6\.50, You, Priya, \$3\.25 yours$/ })).toBeVisible(live);
  await expect(sam.getByTestId("owe")).toHaveText("$3.25", live);
  await expect(priya.getByTestId("owe")).toHaveText("$3.25", live);
  expect(await shareOf(priya, "Sam")).toBe("$3.25");
});

test("people who check a new Item against id order (Priya, then Sam) still split it between them", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex));
  await pick(sam, "Sam");

  await addFries(sam);
  await viewAs(sam, "Priya");
  await expect(sam.getByRole("dialog", { name: "People" })).toHaveCount(0, live);
  await sam.getByRole("button", { name: "Fries, check for Priya" }).click();
  await sam.getByRole("dialog", { name: "Check Fries for Priya?" }).getByRole("button", { name: "Check for Priya" }).click();
  await sam.getByRole("button", { name: "Back to you" }).click();
  await sam.getByRole("button", { name: "Fries, check for Sam" }).click();
  await expect(sam.getByRole("button", { name: /^Open Fries, \$6\.50, You, Priya, \$3\.25 yours$/ })).toBeVisible(live);
  await expect(sam.getByTestId("owe")).toHaveText("$3.25");
  expect(await shareOf(sam, "Priya")).toBe("$3.25");
});

test("History lists the add, and Revert from another phone asks first and takes the row off both", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await addFries(sam);
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

  await openAdd(sam, "Item");
  await field(sam, "Name").fill("Fries");
  await field(sam, "Price").fill("6.50");
  await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();

  await expect(sheet(sam).getByText("A split holds at most 100 items.")).toBeVisible();
  await expect(field(sam, "Name")).toHaveValue("Fries");
  expect(sent.filter((frame) => frame.includes('"add"'))).toEqual([]);
});

test("Add item with no name focuses the name and says so, and Return walks name and price, then adds", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex));
  await pick(sam, "Sam");
  await openAdd(sam, "Item");

  await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();
  await expect(sheet(sam).getByText("Add a name.")).toBeVisible();
  await expect(field(sam, "Name")).toBeFocused();

  await sam.keyboard.type("Fries");
  await sam.keyboard.press("Enter");
  await expect(field(sam, "Price")).toBeFocused();
  await sam.keyboard.type("6.50");
  await sam.keyboard.press("Enter");

  await expect(sheet(sam)).toHaveCount(0, live);
  await expect(sam.getByRole("button", { name: "Open Fries, $6.50, Nobody yet" })).toBeVisible(live);

  await sam.getByRole("button", { name: "Open Fries, $6.50, Nobody yet" }).click();
  const edit = sam.getByRole("dialog", { name: "Edit item" });
  await edit.getByRole("textbox", { name: "Description" }).fill("large");
  await edit.getByRole("button", { name: "Close" }).click();
  await expect(sam.getByText("large", { exact: true })).toBeVisible(live);
});

test("the sheet keeps its top and height when a problem line appears", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex));
  await pick(sam, "Sam");
  await openAdd(sam, "Item");
  await expect(field(sam, "Name")).toBeVisible();
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
  await openAdd(page, "Item");
  const surface = page.getByTestId("add-sheet");
  await expect(surface).toBeVisible();
  await page.waitForTimeout(600);
  const top = async () => Math.round((await surface.boundingBox())!.y);
  const rest = await top();

  for (const name of ["Name", "Price"]) {
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
  test(`the added row's first painted frame is at height 0, and it opens at full height, with frames ${rafDelay} ms late @frame-timing`, async ({ browser, request }, { workerIndex }) => {
    const sam = await slowFramesOpen(browser, await createSplit(request, workerIndex, bucketRows, bucket), rafDelay);
    await pick(sam, "Sam");
    await openAdd(sam, "Item");
    await field(sam, "Name").fill("Fries");
    await field(sam, "Price").fill("6.50");

    const frames = sam.evaluate(
      () =>
        new Promise<{ height: number; opacity: number }[]>((resolve) => {
          const frame = (window as unknown as { sampleFrame: typeof requestAnimationFrame }).sampleFrame;
          const seen: { height: number; opacity: number }[] = [];
          const started = performance.now();
          const sample = () => {
            const row = [...document.querySelectorAll('[data-testid^="line-"]')].find((line) => line.textContent?.includes("Fries"));
            const box = row?.parentElement;
            if (row && box) {
              seen.push({ height: Math.round(box.getBoundingClientRect().height), opacity: Number(getComputedStyle(box).opacity) });
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
    expect(seen[0].height).toBeLessThanOrEqual(4);
    expect(seen[0].opacity).toBeLessThanOrEqual(0.1);
    expect(seen.every(({ height }, at) => at === 0 || height >= seen[at - 1].height)).toBe(true);
  });
}

// The reading missed a $6.50 line: Rice is $8.00 and the printed Subtotal and Total are $14.50.
const missedLine = (request: APIRequestContext, workerIndex: number) => createSplit(request, workerIndex, rice, [], 1450);
const shortNote = (page: Page) => page.getByRole("status").filter({ hasText: /short of|over the/ });

test("on a receipt short of its Subtotal, the Add sheet offers the missing amount, a tap fills it, and adding it leaves the Total as printed", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await missedLine(request, workerIndex));
  await pick(sam, "Sam");
  await expect(shortNote(sam)).toHaveText("Items are $6.50 short of the subtotal.");

  await openAdd(sam, "Item");
  await expect(sheet(sam).getByText("The receipt is $6.50 short.")).toBeVisible();
  await expect(field(sam, "Price")).toHaveValue("");
  await sheet(sam).getByRole("button", { name: "Use $6.50", exact: true }).click();
  await expect(field(sam, "Price")).toHaveValue("6.50");
  await sheet(sam).getByRole("group", { name: "What to add" }).getByRole("button", { name: "Tax", exact: true }).click();
  await expect(sheet(sam).getByRole("button", { name: "Use $6.50", exact: true })).toHaveCount(0);
  await sheet(sam).getByRole("group", { name: "What to add" }).getByRole("button", { name: "Item", exact: true }).click();
  await field(sam, "Name").fill("Fries");
  await sheet(sam).getByRole("button", { name: "Add item", exact: true }).click();

  await expect(fries(sam)).toBeVisible(live);
  await expect(sam.getByTestId("total")).toHaveText("$14.50");
  await expect(shortNote(sam)).toHaveCount(0);
});

test("the tax and tip note shows only for an Item, and only on a receipt with tax or tip", async ({ browser, request }, { workerIndex }) => {
  const note = (page: Page) => sheet(page).getByText(/stays? at the receipt's amounts?/);
  const charges: Charge[] = [
    { id: "tax", kind: "tax", name: "Tax", amount: 70 },
    { id: "tip", kind: "tip", name: "Tip", amount: 160 },
  ];
  const taxed = await open(browser, await createSplit(request, workerIndex, rice, charges));
  const plain = await open(browser, await createSplit(request, workerIndex));
  await pick(taxed, "Sam");
  await pick(plain, "Sam");

  await openAdd(taxed, "Item");
  await expect(note(taxed)).toHaveText("Tax and tip stay at the receipt's amounts and are shared across the new item too.");
  for (const kind of ["Tax", "Tip", "Discount"] as const) {
    await sheet(taxed).getByRole("group", { name: "What to add" }).getByRole("button", { name: kind, exact: true }).click();
    await expect(note(taxed)).toHaveCount(0);
  }
  await openAdd(plain, "Item");
  await expect(note(plain)).toHaveCount(0);
  await expect(sheet(plain).getByText(/short\.$/)).toHaveCount(0);
});

test("a price edit moves the Total by the difference on every phone, and on a short receipt typed slowly it fills the shortfall once", async ({ browser, request }, { workerIndex }) => {
  const even = await createSplit(request, workerIndex);
  const sam = await open(browser, even);
  const priya = await open(browser, even);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await sam.getByRole("button", { name: /^Open Rice, \$8\.00/ }).click();
  await sam.getByRole("dialog", { name: "Edit item" }).getByRole("textbox", { name: "Price" }).fill("10.00");
  await sam.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  for (const page of [sam, priya]) {
    await expect(page.getByTestId("total")).toHaveText("$10.00", live);
    await expect(shortNote(page)).toHaveCount(0);
  }

  const short = await open(browser, await missedLine(request, workerIndex));
  await pick(short, "Sam");
  await short.getByRole("button", { name: /^Open Rice, \$8\.00/ }).click();
  const price = short.getByRole("dialog", { name: "Edit item" }).getByRole("textbox", { name: "Price" });
  await price.click();
  await expect.poll(() => price.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!))).toBe("8.00");
  await short.keyboard.type("1");
  await short.waitForTimeout(1200);
  await short.keyboard.type("0.00");
  await short.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  await expect(short.getByRole("button", { name: /^Open Rice, \$10\.00/ })).toBeVisible(live);
  await expect(short.getByTestId("total")).toHaveText("$14.50");
  await expect(shortNote(short)).toHaveText("Items are $4.50 short of the subtotal.");
});
