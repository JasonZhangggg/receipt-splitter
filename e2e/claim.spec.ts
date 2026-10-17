import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";
import { fromMore, personRow, showPeople, viewAs } from "./header";

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

async function createSplit(request: APIRequestContext, workerIndex: number, participants = people): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${100 + workerIndex}.${creates}` },
    data: { split: { receipt: dinner, participants, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
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
  await expect(page.getByTestId("owe")).toBeVisible(live);
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
  await expect(priya.getByRole("button", { name: /^Open Rice, \$8\.00, Sam$/ })).toBeVisible(live);
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

test("That's me on a second browser takes the name, and the first browser drops back to browsing", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const first = await open(browser, link);
  await pick(first, "Sam");
  const second = await open(browser, link);

  await second.getByRole("button", { name: "Sam, picked on another phone" }).click();
  await second.getByRole("button", { name: "That's me" }).click();

  await expect(second.getByTestId("owe")).toBeVisible(live);
  await expect(first.getByText("Pick your name to check off what you had.")).toBeVisible(live);
  await expect(first.getByRole("button", { name: "Sam, you", exact: true })).toHaveCount(0, live);
});

test("Tostones split 2:1 by shares and the 2x Pitchers line claimed whole reach the other browser's Share", async ({ browser, request }, { workerIndex }) => {
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
  await expect(sam.getByText("2 shares")).toBeVisible(live);
  await sam.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  await expect(owe(sam)).toHaveText("$0.33", live);
  await expect(jason.getByTestId("line-tostones")).toContainText("$0.67 yours", live);

  await expect(jason.getByRole("button", { name: /^Open Pitchers/ })).toHaveCount(0);
  await expect(jason.getByRole("button", { name: /^Open 2x Pitchers, \$24\.00, / })).toHaveCount(1);
  await jason.getByRole("button", { name: /^Open 2x Pitchers/ }).click();
  await jason.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam" }).click();
  await expect(jason.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam" })).toHaveAttribute("aria-pressed", "true", live);
  await jason.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  await expect(owe(sam)).toHaveText("$24.33", live);
  await expect(sam.getByRole("button", { name: "Open 2x Pitchers, $24.00, You, $24.00 yours" })).toHaveCount(1, live);
});

test("a price change moves the Total everywhere, and a revert from another browser asks first and puts the price and the Total back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const jason = await open(browser, link);
  await pick(sam, "Sam");
  await pick(jason, "Jason");

  await sam.getByRole("button", { name: /^Open Sprite/ }).click();
  await sam.getByRole("textbox", { name: "Price" }).fill("2.75");
  await sam.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  await expect(jason.getByTestId("total")).toHaveText("$35.75", live);
  await expect(jason.getByText(/short of|over the/)).toHaveCount(0);

  await fromMore(jason, "History");
  await jason.getByRole("button", { name: "Revert Sprite" }).click();
  const confirm = jason.getByRole("alertdialog", { name: "Revert Sam's change?" }).getByRole("button", { name: "Revert" });
  await settled(confirm);
  await confirm.click();

  await expect(jason.getByText("Reverted")).toBeVisible(live);
  await expect(sam.getByRole("button", { name: /^Open Sprite, \$2\.50/ })).toBeVisible(live);
  await expect(sam.getByTestId("total")).toHaveText("$35.50", live);
});

test("a breakdown counts a 2x line as 1 item, as a Bundle header counts it", async ({ browser, request }, { workerIndex }) => {
  const priya = await open(browser, await createSplit(request, workerIndex));
  await pick(priya, "Priya");
  await circle(priya, "2x Pitchers", "Priya").click();
  await circle(priya, "Sprite", "Priya").click();
  await expect(owe(priya)).toHaveText("$26.50", live);

  await owe(priya).click();

  await expect(priya.getByTestId("footer").getByText(/^2 of \d+ items/)).toBeVisible(live);
});

test("the payer marks themselves paid, and another browser sees Paid $2.50 under their share", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const priya = await open(browser, link);
  const sam = await open(browser, link);
  await pick(priya, "Priya");
  await pick(sam, "Sam");
  await circle(priya, "Sprite", "Priya").click();
  await expect(owe(priya)).toHaveText("$2.50", live);

  await owe(priya).click();
  await priya.getByRole("button", { name: "I already paid" }).click();
  await expect(priya.getByTestId("footer").getByRole("button", { name: "Paid" })).toHaveText("✓ Paid", live);
  await expect(priya.getByTestId("footer").getByTestId("share-note")).toHaveCount(0);

  await viewAs(sam, "Priya");
  await sam.getByRole("button", { name: /, Show Priya's breakdown$/ }).click();
  await expect(sam.getByTestId("footer").getByTestId("share-note")).toHaveText("Paid $2.50", live);
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

  await priya.getByRole("button", { name: "Close" }).click();
  await circle(priya, "Sprite", "Priya").click();
  await expect(owe(priya)).toHaveText("$2.50", live);
  await owe(priya).click();
  await expect(priya.getByRole("link", { name: "Pay Jason $2.50 on Venmo" })).toBeVisible(live);
  await expect(priya.getByRole("button", { name: "I already paid" })).toBeVisible(live);
});

const asks = (page: Page, question: string) => page.getByRole("dialog", { name: question });

test("viewing Sam, Priya's first circle tap asks before checking Rice for him, a Cancel leaves it unchecked, and a yes holds until the selection changes", async ({ browser, request }, { workerIndex }) => {
  const priya = await open(browser, await createSplit(request, workerIndex));
  await pick(priya, "Priya");
  await viewAs(priya, "Sam");

  await circle(priya, "Rice", "Sam").click();
  await expect(asks(priya, "Check Rice for Sam?")).toBeVisible(live);
  await asks(priya, "Check Rice for Sam?").getByRole("button", { name: "Cancel" }).click();
  await expect(asks(priya, "Check Rice for Sam?")).toHaveCount(0, live);
  await expect(circle(priya, "Rice", "Sam")).toHaveAttribute("aria-pressed", "false");
  await expect(owe(priya)).toHaveText("$0.00");

  await circle(priya, "Rice", "Sam").click();
  await asks(priya, "Check Rice for Sam?").getByRole("button", { name: "Check for Sam" }).click();
  await expect(circle(priya, "Rice", "Sam")).toHaveAttribute("aria-pressed", "true", live);
  await expect(owe(priya)).toHaveText("$8.00", live);

  await circle(priya, "Tostones", "Sam").click();
  await expect(circle(priya, "Tostones", "Sam")).toHaveAttribute("aria-pressed", "true", live);
  await expect(owe(priya)).toHaveText("$9.00", live);
  await expect(priya.getByRole("dialog", { name: / for (Sam|Priya)\?$/ })).toHaveCount(0);

  await viewAs(priya, "Priya, you");
  await circle(priya, "Sprite", "Priya").click();
  await expect(circle(priya, "Sprite", "Priya")).toHaveAttribute("aria-pressed", "true", live);
  await expect(priya.getByRole("dialog", { name: / for (Sam|Priya)\?$/ })).toHaveCount(0);

  await viewAs(priya, "Sam");
  await circle(priya, "Rice", "Sam").click();
  await expect(asks(priya, "Uncheck Rice for Sam?")).toBeVisible(live);
  await asks(priya, "Uncheck Rice for Sam?").getByRole("button", { name: "Uncheck for Sam" }).click();
  await expect(circle(priya, "Rice", "Sam")).toHaveAttribute("aria-pressed", "false", live);
  await expect(owe(priya)).toHaveText("$1.00", live);
});

test("Priya's open confirm to check Rice for Sam closes when Jason removes Sam, and Sam's row is gone", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const jason = await open(browser, link);
  const priya = await open(browser, link);
  await pick(jason, "Jason");
  await pick(priya, "Priya");
  await viewAs(priya, "Sam");
  await circle(priya, "Rice", "Sam").click();
  await expect(asks(priya, "Check Rice for Sam?")).toBeVisible(live);

  await showPeople(jason, "Jason");
  await jason.getByRole("button", { name: "Remove someone" }).click();
  await jason.getByRole("dialog", { name: "People" }).getByRole("button", { name: "Remove Sam" }).click();
  await jason.getByRole("dialog", { name: "Options for Sam" }).getByRole("button", { name: "Remove Sam" }).click();

  await expect(asks(priya, "Check Rice for Sam?")).toHaveCount(0, live);
  await priya.getByRole("button", { name: "People", exact: true }).click();
  await expect(personRow(priya, "Priya, you")).toBeVisible(live);
  await expect(personRow(priya, "Sam")).toHaveCount(0);
  await priya.keyboard.press("Escape");
  await expect(circle(priya, "Rice", "Priya")).toHaveAttribute("aria-pressed", "false");
});

test("Priya's open confirm to check Rice for Sam closes when Jason deletes Rice", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const jason = await open(browser, link);
  const priya = await open(browser, link);
  await pick(jason, "Jason");
  await pick(priya, "Priya");
  await viewAs(priya, "Sam");
  await circle(priya, "Rice", "Sam").click();
  await expect(asks(priya, "Check Rice for Sam?")).toBeVisible(live);

  await jason.getByRole("button", { name: /^Open Rice, / }).click();
  await jason.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Delete item" }).click();

  await expect(asks(priya, "Check Rice for Sam?")).toHaveCount(0, live);
  await expect(circle(priya, "Rice", "Sam")).toHaveCount(0);
});

test("Priya's open confirm to check Rice for Sam closes when Sam checks Rice himself, so her yes cannot uncheck it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await viewAs(priya, "Sam");
  await circle(priya, "Rice", "Sam").click();
  await expect(asks(priya, "Check Rice for Sam?")).toBeVisible(live);

  await circle(sam, "Rice", "Sam").click();

  await expect(asks(priya, "Check Rice for Sam?")).toHaveCount(0, live);
  await expect(circle(priya, "Rice", "Sam")).toHaveAttribute("aria-pressed", "true", live);
});

const line = (page: Page, id: string) => page.getByTestId(`line-${id}`);
const count = (page: Page) => page.getByTestId("items-count");

/** Selects a person's chip and checks lines for them, saying yes to the first confirm. */
async function checkFor(page: Page, name: string, items: readonly string[]) {
  await viewAs(page, name);
  await expect(count(page)).toContainText("theirs", live);
  for (const [at, item] of items.entries()) {
    await circle(page, item, name).click();
    if (at === 0) await page.getByRole("dialog", { name: `Check ${item} for ${name}?` }).getByRole("button", { name: `Check for ${name}` }).click();
    await expect(page.getByRole("button", { name: `${item}, check for ${name}` })).toHaveAttribute("aria-pressed", "true", live);
  }
}

test("the dot is the viewer's own check, and each row says who had it and what the viewer pays, or what each pays", async ({ browser, request }, { workerIndex }) => {
  const jason = await open(browser, await createSplit(request, workerIndex, ["Jason", "Sam", "Priya", "Lee", "Ana"].map((name) => ({ id: name.toLowerCase(), name }))));
  await pick(jason, "Jason");

  await expect(line(jason, "sprite").getByTestId("checked")).toHaveCount(0);
  await expect(line(jason, "sprite")).toContainText("Nobody yet");
  await expect(count(jason)).toHaveText("0 of 4 yours");

  await circle(jason, "Rice", "Jason").click();
  await expect(jason.getByRole("button", { name: "Rice, check for Jason" })).toHaveAttribute("aria-pressed", "true", live);
  await expect(line(jason, "rice").getByTestId("checked")).toBeVisible();
  await expect(line(jason, "rice")).toContainText("You");
  await expect(line(jason, "rice")).toContainText("$8.00 yours");
  await expect(count(jason)).toHaveText("1 of 4 yours");

  await checkFor(jason, "Sam", ["Tostones", "Rice"]);
  await checkFor(jason, "Priya", ["Rice"]);
  await checkFor(jason, "Lee", ["Rice"]);
  await checkFor(jason, "Ana", ["Rice"]);
  await viewAs(jason, "Jason, you");
  await expect(count(jason)).toHaveText("1 of 4 yours", live);

  await expect(jason.getByRole("button", { name: "Tostones, check for Jason" })).toHaveAttribute("aria-pressed", "false");
  await expect(line(jason, "tostones").getByTestId("checked")).toHaveCount(0);
  await expect(line(jason, "tostones")).toContainText("Sam");
  await expect(line(jason, "rice")).toContainText("You, Sam, Priya, Lee, Ana");
  await expect(line(jason, "rice")).toContainText("$1.60 yours");
  await expect(line(jason, "rice").getByTestId("checked")).toBeVisible();

  await viewAs(jason, "Sam");
  await expect(count(jason)).toHaveText("2 of 4 theirs", live);
  await expect(jason.getByRole("button", { name: "Tostones, check for Sam" })).toHaveAttribute("aria-pressed", "true");
  await expect(line(jason, "tostones").getByTestId("checked")).toBeVisible();
  await expect(line(jason, "tostones")).toContainText("$1.00 theirs");
  await expect(line(jason, "rice")).toContainText("$1.60 theirs");
  await expect(jason.getByRole("button", { name: "Sprite, check for Sam" })).toHaveAttribute("aria-pressed", "false");

  await viewAs(jason, "Jason, you");
  await jason.setViewportSize({ width: 320, height: 640 });
  for (const id of ["rice", "tostones"]) {
    expect(await line(jason, id).evaluate((row) => row.scrollWidth <= row.clientWidth)).toBe(true);
  }
});

test("beside a long name the footer keeps its items count whole and shortens the name", async ({ browser, request }, { workerIndex }) => {
  const long = "Bartholomew Featherstonehaugh-Smythe";
  const jason = await open(browser, await createSplit(request, workerIndex, [{ id: "jason", name: "Jason" }, { id: "long", name: long }]));
  await pick(jason, "Jason");
  await viewAs(jason, long);
  await expect(count(jason)).toHaveText("0 of 4 theirs", live);
  const aside = jason.getByTestId("footer").getByText(/items · incl\. tax & tip$/);
  await expect(aside).toHaveText("0 of 4 items · incl. tax & tip");
  expect(await aside.evaluate((text) => text.scrollWidth <= text.clientWidth)).toBe(true);
});

const longName = "Samantha Okonkwo-Fitzgerald";

test("viewing a long-named person keeps every claimed row readable and the question and button short", async ({ browser, request }, { workerIndex }) => {
  const jason = await open(browser, await createSplit(request, workerIndex, [{ id: "jason", name: "Jason" }, { id: "sam", name: longName }]));
  await pick(jason, "Jason");
  await circle(jason, "Rice", "Jason").click();
  await expect(circle(jason, "Rice", "Jason")).toHaveAttribute("aria-pressed", "true", live);
  await viewAs(jason, longName);
  await circle(jason, "Rice", longName).click();
  await asks(jason, `Check Rice for ${longName}?`).getByRole("button", { name: "Check for Samantha" }).click();
  await expect(circle(jason, "Rice", longName)).toHaveAttribute("aria-pressed", "true", live);

  await expect(count(jason)).toHaveText("1 of 4 theirs");
  await expect(line(jason, "rice")).toContainText("$4.00 theirs");
  const name = await line(jason, "rice").getByText("Rice", { exact: true }).boundingBox();
  expect(name!.height).toBeLessThan(30);
});

test("the pick sheet's top edge sits 12 px below the links row", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  const sheet = page.getByRole("dialog", { name: "Which one are you?" });
  await settled(sheet);
  const links = (await page.getByRole("button", { name: "History", exact: true }).boundingBox())!;
  const top = (await sheet.boundingBox())!.y;
  expect(Math.abs(top - (links.y + links.height + 12))).toBeLessThanOrEqual(1);
});
