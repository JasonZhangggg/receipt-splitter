import { viewAs } from "./header";
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
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });
const note = (page: Page) => page.getByTestId("footer").getByTestId("share-note");
const owe = (page: Page) => page.getByTestId("owe");

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

  await expect(note(jason)).toHaveCount(0);
  await viewAs(jason, "Priya");
  await expect(jason.getByRole("button", { name: /^Priya's share \$14\.20, Show/ })).toBeVisible(live);
  await expect(note(jason)).toHaveCount(0);

  await owe(sam).click();
  await sam.getByTestId("breakdown").getByRole("button", { name: "I already paid" }).click();
  await expect(note(sam)).toHaveText("Paid $30.00", live);
  await viewAs(jason, "Jason, you");
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
  await viewAs(jason, "Sam");
  await expect(note(jason)).toHaveText("Paid $30.00 · $14.20 still owed", live);
});

test("a long name's share label and its paid line give way to the amount instead of pushing it off the screen", async ({ browser, request }, { workerIndex }) => {
  const long = "Maximiliana Castellanos-Whitfield";
  const people = [
    { id: "jason", name: "Jason" },
    { id: "max", name: long },
  ];
  const link = await createSplit(request, workerIndex, people);
  const jason = await join(browser, link, "Jason");
  const max = await join(browser, link, long);
  await circle(max, "Pho", long).click();
  await owe(max).click();
  await max.getByTestId("breakdown").getByRole("button", { name: "I already paid" }).click();
  await viewAs(jason, long);
  await expect(jason.getByRole("button", { name: new RegExp(`^${long}'s share \\$14\\.20, Show`) })).toBeVisible(live);
  await expect(note(jason)).toHaveText("Paid $14.20");
  const amount = (await owe(jason).boundingBox())!;
  const line = (await note(jason).boundingBox())!;
  expect([amount.x + amount.width <= 390, line.x + line.width <= 390]).toEqual([true, true]);
});
