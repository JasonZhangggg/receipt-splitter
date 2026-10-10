import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const menu = {
  items: [
    { id: "pho", name: "Pho", price: 1420 },
    { id: "wings", name: "Wings", price: 1400 },
    { id: "tea", name: "Tea", price: 1600 },
  ],
  adjustments: [],
  subtotal: 4420,
  total: 4420,
};

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, participants: readonly object[]): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${140 + workerIndex}.${creates}` },
    data: { split: { receipt: menu, participants, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function join(browser: Browser, link: string, name: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
  return page;
}

const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });
const note = (page: Page) => page.getByTestId("split-sheet").getByTestId("share-note");
const bar = (page: Page) => page.getByTestId("split-sheet").getByTestId("claim-bar");
const owe = (page: Page) => page.getByTestId("owe");
// Where the share row rests once the sheet has stopped gliding.
async function top(page: Page): Promise<number> {
  let last = Number.NaN;
  for (;;) {
    const y = (await owe(page).boundingBox())!.y;
    if (y === last) return y;
    last = y;
    await page.waitForTimeout(150);
  }
}

test("the folded sheet says what is left to claim as Items are checked, then drops the line once everything is claimed, and the share row never moves", async ({ browser, request }, { workerIndex }) => {
  const people = [
    { id: "jason", name: "Jason" },
    { id: "sam", name: "Sam" },
  ];
  const sam = await join(browser, await createSplit(request, workerIndex, people), "Sam");
  await expect(note(sam)).toHaveText("$44.20 left to claim", live);
  await expect(bar(sam)).toHaveCount(1);
  const before = await top(sam);

  await circle(sam, "Pho", "Sam").click();
  await expect(note(sam)).toHaveText("$30.00 left to claim", live);
  await expect(sam.getByTestId("unclaimed")).toHaveText("$30.00");
  await circle(sam, "Wings", "Sam").click();
  await expect(note(sam)).toHaveText("$16.00 left to claim", live);
  await circle(sam, "Tea", "Sam").click();
  await expect(owe(sam)).toHaveText("$44.20", live);
  await expect(note(sam)).toHaveCount(0);
  await expect(bar(sam)).toHaveCount(0);
  expect(await top(sam)).toBe(before);
});

test("the line under a share reads nothing unpaid, Paid, too much, still owed, and the Host's count of who paid them", async ({ browser, request }, { workerIndex }) => {
  const people = [
    { id: "jason", name: "Jason" },
    { id: "sam", name: "Sam" },
    { id: "priya", name: "Priya" },
  ];
  const link = await createSplit(request, workerIndex, people);
  const jason = await join(browser, link, "Jason");
  const sam = await join(browser, link, "Sam");
  const priya = await join(browser, link, "Priya");
  await circle(sam, "Wings", "Sam").click();
  await circle(sam, "Tea", "Sam").click();
  await circle(priya, "Pho", "Priya").click();
  await expect(owe(sam)).toHaveText("$30.00", live);
  await expect(jason.getByTestId("unclaimed")).toHaveText("$0.00", live);

  await expect(note(jason)).toHaveCount(0);
  await jason.getByRole("button", { name: "Priya", exact: true }).click();
  await expect(jason.getByRole("button", { name: /^Priya's share \$14\.20, Show/ })).toBeVisible(live);
  await expect(note(jason)).toHaveCount(0);

  await owe(sam).click();
  await sam.getByTestId("breakdown").getByRole("button", { name: "I already paid" }).click();
  await expect(note(sam)).toHaveText("Paid $30.00", live);
  await jason.getByRole("button", { name: "Jason, you", exact: true }).click();
  await expect(note(jason)).toHaveText("1 of 2 paid you", live);

  await circle(priya, "Tea", "Priya").click();
  await expect(note(sam)).toHaveText("Paid $30.00 · $8.00 too much", live);
  await expect(note(jason)).toHaveText("1 of 2 paid you");

  await circle(priya, "Tea", "Priya").click();
  await circle(priya, "Pho", "Priya").click();
  await sam.getByTestId("breakdown").getByRole("button", { name: /^Your share/ }).click();
  await circle(sam, "Pho", "Sam").click();
  await expect(note(sam)).toHaveText("Paid $30.00 · $14.20 still owed", live);
  await expect(note(jason)).toHaveText("0 of 1 paid you", live);
  await jason.getByRole("button", { name: "Sam, paid too little", exact: true }).click();
  await expect(note(jason)).toHaveText("Paid $30.00 · $14.20 still owed", live);
});

test("a long name's share label and its line give way to the amount instead of pushing it off the screen", async ({ browser, request }, { workerIndex }) => {
  const long = "Maximiliana Castellanos-Whitfield";
  const people = [
    { id: "jason", name: "Jason" },
    { id: "max", name: long },
  ];
  const jason = await join(browser, await createSplit(request, workerIndex, people), "Jason");
  await jason.getByRole("button", { name: long, exact: true }).click();
  await expect(jason.getByRole("button", { name: new RegExp(`^${long}'s share \\$0\\.00, Show`) })).toBeVisible(live);
  await expect(note(jason)).toHaveText("$44.20 left to claim");
  const amount = (await owe(jason).boundingBox())!;
  const line = (await note(jason).boundingBox())!;
  expect([amount.x + amount.width <= 390, line.x + line.width <= amount.x]).toEqual([true, true]);
});

test.describe("on desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("the pane's share row keeps its height when the line under the share goes away", async ({ browser, request }, { workerIndex }) => {
    const people = [
      { id: "jason", name: "Jason" },
      { id: "sam", name: "Sam" },
    ];
    const sam = await (await newContext(browser)).newPage();
    await sam.goto(await createSplit(request, workerIndex, people));
    const pane = sam.getByRole("complementary");
    await pane.getByRole("button", { name: "Sam", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Sam, you", exact: true })).toBeVisible(live);
    const row = pane.getByTestId("share").locator("..");
    await expect(pane.getByTestId("share-note")).toHaveText("$44.20 left to claim", live);
    const withLine = (await row.boundingBox())!.height;

    for (const item of ["Pho", "Wings", "Tea"]) await circle(sam, item, "Sam").click();
    await expect(pane.getByTestId("share")).toHaveText("$44.20", live);
    await expect(pane.getByTestId("share-note")).toHaveCount(0);
    expect((await row.boundingBox())!.height).toBe(withLine);
  });
});
