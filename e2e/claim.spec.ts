import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

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
    data: { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX", split: { receipt: dinner, participants: people, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function open(browser: Browser, link: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible();
  return page;
}

async function pick(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible();
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
  await expect(circle(sam, "Rice", "Sam")).toHaveAttribute("aria-pressed", "true");
  await expect(priya.getByRole("button", { name: /^Open Rice, \$8\.00, had by Sam$/ })).toBeVisible();
  await circle(priya, "Tostones", "Priya").click();
  await circle(sam, "Tostones", "Sam").click();

  await expect(owe(sam)).toHaveText("$8.50");
  await expect(owe(priya)).toHaveText("$0.50");
  await expect(sam.getByTestId("unclaimed")).toHaveText("$26.50");

  await sam.reload();
  await expect(owe(sam)).toHaveText("$8.50");
  await expect(circle(sam, "Rice", "Sam")).toHaveAttribute("aria-pressed", "true");
});

test("a closed pick sheet browses with no name, and a tap on a circle asks again", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const lee = await open(browser, link);

  await lee.getByRole("button", { name: "Close, just look" }).click();
  await expect(lee.getByText("Pick your name to check off what you had.")).toBeVisible();
  await expect(lee.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0);

  await lee.getByRole("button", { name: "Who had Rice" }).click();
  await expect(lee.getByRole("heading", { name: "Which one are you?" })).toBeVisible();
});

test("That's me on a second browser takes the name, and the first browser drops back to browsing", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const first = await open(browser, link);
  await pick(first, "Sam");
  const second = await open(browser, link);

  await second.getByRole("button", { name: "Sam, picked on another phone" }).click();
  await second.getByRole("button", { name: "That's me" }).click();

  await expect(second.getByRole("button", { name: "Sam, you", exact: true })).toBeVisible();
  await expect(first.getByText("Pick your name to check off what you had.")).toBeVisible();
  await expect(first.getByRole("button", { name: "Sam, you", exact: true })).toHaveCount(0);
});

test("Tostones split 2:1 by shares and a pitcher on its second unit reach the other browser's Share", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const jason = await open(browser, link);
  await pick(sam, "Sam");
  await pick(jason, "Jason");
  await circle(sam, "Tostones", "Sam").click();
  await circle(jason, "Tostones", "Jason").click();
  await expect(owe(sam)).toHaveText("$0.50");

  await sam.getByRole("button", { name: /^Open Tostones/ }).click();
  await sam.getByRole("button", { name: "By shares" }).click();
  await sam.getByRole("button", { name: "More shares for Jason" }).click();
  await expect(sam.getByText("3 shares")).toBeVisible();
  await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
  await expect(owe(sam)).toHaveText("$0.33");
  await expect(jason.getByText("2:1")).toBeVisible();

  await jason.getByRole("button", { name: /^Open Pitchers/ }).click();
  await jason.getByRole("group", { name: "Who had it, 2 of 2" }).getByRole("button", { name: "Sam" }).click();
  await jason.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();
  await expect(owe(sam)).toHaveText("$12.33");
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
  await expect(jason.getByText("Items are $0.25 over.")).toBeVisible();

  await jason.getByRole("button", { name: "History" }).click();
  await jason.getByRole("button", { name: "Revert Sprite" }).click();
  await expect(jason.getByRole("alertdialog", { name: "Revert Sam's change?" })).toBeVisible();
  await jason.getByRole("alertdialog").getByRole("button", { name: "Revert" }).click();

  await expect(jason.getByText("Reverted")).toBeVisible();
  await expect(sam.getByText("Items are $0.25 over.")).toHaveCount(0);
  await expect(sam.getByRole("button", { name: /^Open Sprite, \$2\.50/ })).toBeVisible();
});

test("the payer marks themselves paid, and another browser sees Paid on their breakdown", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const priya = await open(browser, link);
  const sam = await open(browser, link);
  await pick(priya, "Priya");
  await pick(sam, "Sam");
  await circle(priya, "Sprite", "Priya").click();
  await expect(owe(priya)).toHaveText("$2.50");

  await owe(priya).click();
  await priya.getByRole("button", { name: "I already paid" }).click();
  await expect(priya.getByText("You paid")).toBeVisible();

  await sam.getByRole("button", { name: "Priya", exact: true }).click();
  await expect(sam.getByTestId("breakdown").getByText("Paid", { exact: true })).toBeVisible();
  await expect(sam.getByText("Priya paid")).toBeVisible();
});
