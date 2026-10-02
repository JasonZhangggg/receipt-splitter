import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";

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

const people = [
  { id: "jason", name: "Jason" },
  { id: "sam", name: "Sam" },
  { id: "priya", name: "Priya" },
];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${100 + workerIndex}.${creates}` },
    data: { split: { receipt: dinner, participants: people, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function open(browser: Browser, link: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

async function pick(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

async function settled(target: Locator) {
  const top = async () => (await target.boundingBox())?.y;
  await expect.poll(async () => {
    const before = await top();
    await target.page().waitForTimeout(100);
    return before !== undefined && before === (await top());
  }, live).toBe(true);
}

const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });
const owe = (page: Page) => page.getByTestId("owe");

test("two browsers pick, check lines, and see each other's claims and Shares, and a reload keeps them", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");

  await circle(sam, "Rice", "Sam").click();
  await expect(circle(sam, "Rice", "Sam")).toHaveAttribute("aria-pressed", "true", live);
  await expect(priya.getByRole("button", { name: /^Open Rice, \$8\.00, had by Sam$/ })).toBeVisible(live);
  await circle(priya, "Tostones", "Priya").click();
  await circle(sam, "Tostones", "Sam").click();

  await expect(owe(sam)).toHaveText("$8.50", live);
  await expect(owe(priya)).toHaveText("$0.50", live);
  await expect(sam.getByTestId("unclaimed")).toHaveText("$26.50", live);

  await sam.reload();
  await expect(owe(sam)).toHaveText("$8.50", live);
  await expect(circle(sam, "Rice", "Sam")).toHaveAttribute("aria-pressed", "true", live);
});

test("a closed pick sheet browses with no name, and a tap on a circle asks again", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const lee = await open(browser, link);

  await lee.getByRole("button", { name: "Close, just look" }).click();
  await expect(lee.getByText("Pick your name to check off what you had.")).toBeVisible(live);
  await expect(lee.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0, live);

  await lee.getByRole("button", { name: "Who had Rice" }).click();
  await expect(lee.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
});

async function framesAfter(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const frames: { top: number; asking: boolean }[] = [];
    Object.assign(window, { sheetFrames: frames });
    const sample = () => {
      const sheet = document.querySelector('[data-testid="split-sheet"]');
      if (sheet) frames.push({ top: Math.round(sheet.getBoundingClientRect().top), asking: [...sheet.querySelectorAll('[role="heading"]')].some((heading) => heading.textContent === "Which one are you?") });
      if (frames.length < 120) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await act();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sheetFrames: unknown[] }).sheetFrames.length), live).toBe(120);
  return page.evaluate(() => (window as unknown as { sheetFrames: { top: number; asking: boolean }[] }).sheetFrames);
}

for (const [how, act] of [
  ["picking a name", (page: Page) => page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click()],
  ["closing", (page: Page) => page.getByRole("button", { name: "Close, just look" }).click()],
] as const) {
  test(`${how} lowers the pick sheet from the frame its rows go, with no frame of the short sheet still up`, async ({ browser, request }, { workerIndex }) => {
    const page = await open(browser, await createSplit(request, workerIndex));
    await settled(page.getByTestId("split-sheet"));
    const frames = await framesAfter(page, () => act(page));
    const up = frames[0].top;
    const swap = frames.findIndex((frame) => !frame.asking);
    expect(swap).toBeGreaterThan(0);
    expect(frames.slice(swap).filter((frame) => frame.top <= up)).toEqual([]);
  });
}

test("the pick sheet copies the link below Not here, and shows Share only where the phone can share", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const page = await open(browser, link);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const sheet = page.getByRole("dialog", { name: "Which one are you?" });
  await expect(sheet.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  const notHere = await sheet.getByRole("button", { name: "Not here? Add yourself" }).boundingBox();
  const copy = sheet.getByRole("button", { name: "Copy" });
  expect((await copy.boundingBox())!.y).toBeGreaterThan(notHere!.y + notHere!.height);
  await copy.click();
  await expect(sheet.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(new URL(link).pathname).toMatch(/^\/s\/[\w-]+$/);

  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(navigator, "share", { value: async (data: ShareData) => void shared.push(data) });
  });
  await page.reload();
  await sheet.getByRole("button", { name: "Share", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared)).toEqual([{ url: link }]);
});

test("That's me on a second browser takes the name, and the first browser drops back to browsing", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const first = await open(browser, link);
  await pick(first, "Sam");
  const second = await open(browser, link);

  await second.getByRole("button", { name: "Sam, picked on another phone" }).click();
  await second.getByRole("button", { name: "That's me" }).click();

  await expect(second.getByRole("button", { name: "Sam, you", exact: true })).toBeVisible(live);
  await expect(first.getByText("Pick your name to check off what you had.")).toBeVisible(live);
  await expect(first.getByRole("button", { name: "Sam, you", exact: true })).toHaveCount(0, live);
});

test("Tostones split 2:1 by shares and a pitcher on its second unit reach the other browser's Share", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const jason = await open(browser, link);
  await pick(sam, "Sam");
  await pick(jason, "Jason");
  await circle(sam, "Tostones", "Sam").click();
  await circle(jason, "Tostones", "Jason").click();
  await expect(owe(sam)).toHaveText("$0.50", live);

  await sam.getByRole("button", { name: /^Open Tostones/ }).click();
  await sam.getByRole("button", { name: "By shares" }).click();
  await sam.getByRole("button", { name: "More shares for Jason" }).click();
  await expect(sam.getByText("3 shares")).toBeVisible(live);
  await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
  await expect(owe(sam)).toHaveText("$0.33", live);
  await expect(jason.getByText("2:1")).toBeVisible(live);

  await jason.getByRole("button", { name: /^Open Pitchers/ }).click();
  await jason.getByRole("group", { name: "Who had it, 2 of 2" }).getByRole("button", { name: "Sam" }).click();
  await jason.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
  await expect(owe(sam)).toHaveText("$12.33", live);
});

test("a price change shows the mismatch everywhere, and a revert from another browser asks first and puts the price back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const jason = await open(browser, link);
  await pick(sam, "Sam");
  await pick(jason, "Jason");

  await sam.getByRole("button", { name: /^Open Sprite/ }).click();
  await sam.getByRole("textbox", { name: "Price" }).fill("2.75");
  await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
  await expect(jason.getByText("Items are $0.25 over the subtotal.")).toBeVisible(live);

  await jason.getByRole("button", { name: "History" }).click();
  await expect.poll(async () => (await jason.getByTestId("split-sheet").boundingBox())?.y, live).toBeGreaterThanOrEqual(844);
  await jason.getByRole("button", { name: "Revert Sprite" }).click();
  const confirm = jason.getByRole("alertdialog", { name: "Revert Sam's change?" }).getByRole("button", { name: "Revert" });
  await settled(confirm);
  await confirm.click();

  await expect(jason.getByText("Reverted")).toBeVisible(live);
  await expect(sam.getByText("Items are $0.25 over the subtotal.")).toHaveCount(0, live);
  await expect(sam.getByRole("button", { name: /^Open Sprite, \$2\.50/ })).toBeVisible(live);
});

test("the payer marks themselves paid, and another browser sees Paid on their breakdown", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const priya = await open(browser, link);
  const sam = await open(browser, link);
  await pick(priya, "Priya");
  await pick(sam, "Sam");
  await circle(priya, "Sprite", "Priya").click();
  await expect(owe(priya)).toHaveText("$2.50", live);

  await owe(priya).click();
  await priya.getByRole("button", { name: "I already paid" }).click();
  await expect(priya.getByText("You paid")).toBeVisible(live);

  await sam.getByRole("button", { name: "Priya", exact: true }).click();
  await expect(sam.getByTestId("breakdown").getByText("Paid", { exact: true })).toBeVisible(live);
  await expect(sam.getByText("Priya paid")).toBeVisible(live);
});

test("someone who owes $0.00 sees no Pay button and no I already paid, and both appear once they check a line", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const priya = await open(browser, link);
  await pick(priya, "Priya");
  await expect(owe(priya)).toHaveText("$0.00", live);

  await owe(priya).click();
  await expect(priya.getByTestId("breakdown")).toBeVisible(live);
  await expect(priya.getByRole("link", { name: /^Pay Jason/ })).toHaveCount(0);
  await expect(priya.getByRole("button", { name: "I already paid" })).toHaveCount(0);

  await circle(priya, "Sprite", "Priya").click();
  await expect(priya.getByRole("link", { name: "Pay Jason $2.50 on Venmo" })).toBeVisible(live);
  await expect(priya.getByRole("button", { name: "I already paid" })).toBeVisible(live);
});
