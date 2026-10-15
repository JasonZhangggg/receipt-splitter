import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";
import { fromMore } from "./header";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "sprite", name: "Sprite", price: 250 },
  ],
  adjustments: [],
  subtotal: 1050,
  total: 1050,
};

test("on a desktop window twelve names wrap onto more lines and none is clipped", async ({ browser, request }, { workerIndex }) => {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(await createSplit(request, workerIndex, dozen));
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
  const sam = page;
  await expect(owe(sam)).toBeVisible(live);
  await sam.getByRole("button", { name: "People", exact: true }).click();
  await expect(chip(sam, "Sam, you")).toBeVisible(live);
  await sam.waitForTimeout(600);
  const lines = () =>
    people(sam)
      .getByRole("button")
      .evaluateAll((chips) => new Set(chips.map((element) => Math.round(element.getBoundingClientRect().top))).size);
  await expect.poll(lines, live).toBeGreaterThan(1);

  const group = await people(sam).boundingBox();
  for (const name of dozen) {
    const box = await chip(sam, name === "Sam" ? "Sam, you" : name).boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(group?.x ?? 0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((group?.x ?? 0) + (group?.width ?? 0) + 1);
  }
});

const dozen = ["Jason", "Sam", "Priya", "Alexandra", "Bartholomew", "Chen", "Dmitri", "Esperanza", "Fatima", "Giovanni", "Hiroshi", "Ingrid"];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, names = ["Jason", "Sam", "Priya"]): Promise<string> {
  creates += 1;
  const participants = names.map((name) => ({ id: name.toLowerCase(), name }));
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${150 + workerIndex}.${creates}` },
    data: { split: { receipt: dinner, participants, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

/** A touch drive needs the test's own page, which has the phone profile's touch screen; a second browser is a plain context. */
async function open(from: Browser | Page, link: string, name: string): Promise<Page> {
  const page = "goto" in from ? from : await (await newContext(from)).newPage();
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(owe(page)).toBeVisible(live);
  return page;
}

/** Opens the People sheet; a hold that starts while the sheet is still rising lands on the chip it covers, so it settles first. */
async function showPeople(page: Page, name: string) {
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(chip(page, `${name}, you`)).toBeVisible(live);
  await page.waitForTimeout(600);
}

async function hidePeople(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "People" })).toHaveCount(0, live);
}

const people = (page: Page) => page.getByRole("group", { name: "People" });
const chip = (page: Page, name: string) => people(page).getByRole("button", { name, exact: true });
const menu = (page: Page, name: string) => page.getByRole("dialog", { name: `Options for ${name}` });
const owe = (page: Page) => page.getByTestId("owe");

/** Drives a real touch through Chromium's input pipeline, so a hold reaches the press responder's timer and a drag scrolls natively. */
async function touch(target: Locator, { holdMs = 0, dx = 0 }: { holdMs?: number; dx?: number }) {
  const page = target.page();
  test.skip(page.context().browser()?.browserType().name() !== "chromium", "a real touch goes through Chromium's CDP; the iOS Simulator check covers WebKit");
  const box = await target.boundingBox();
  if (!box) throw new Error("no box to touch");
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10 && dx !== 0; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * step) / 10, y }] });
    await page.waitForTimeout(16);
  }
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("a long-press on a chip opens Remove without selecting, a tap still selects, and the Host's chip offers nothing", async ({ page, request }, { workerIndex }) => {
  const sam = await open(page, await createSplit(request, workerIndex), "Sam");
  await showPeople(sam, "Sam");

  await touch(chip(sam, "Priya"), { holdMs: 800 });
  await expect(menu(sam, "Priya").getByRole("button", { name: "Remove Priya" })).toBeVisible(live);
  await expect(sam.getByText("Your share")).toBeVisible();
  const selected = await sam.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected).toBe("");

  await sam.keyboard.press("Escape");
  await expect(menu(sam, "Priya")).toHaveCount(0, live);
  await chip(sam, "Priya").click();
  await expect(sam.getByRole("button", { name: /Priya's breakdown$/ })).toBeVisible(live);
  await showPeople(sam, "Sam");

  await touch(chip(sam, "Jason"), { holdMs: 800 });
  await sam.waitForTimeout(300);
  await expect(sam.getByRole("dialog", { name: /^Options for / })).toHaveCount(0);
});

test("removing a person who checked an Item gives the other claimer the whole Item, unpicks their phone, and History can revert it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const priya = await open(browser, link, "Priya");
  await sam.getByRole("button", { name: "Rice, check for Sam" }).click();
  await priya.getByRole("button", { name: "Rice, check for Priya" }).click();
  await expect(owe(sam)).toHaveText("$4.00", live);

  await showPeople(sam, "Sam");
  await chip(sam, "Priya").click({ button: "right" });
  await expect(menu(sam, "Priya").getByText("Removing Priya unchecks 1 item.")).toBeVisible(live);
  await menu(sam, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(chip(sam, "Priya")).toHaveCount(0, live);
  await hidePeople(sam);
  await expect(owe(sam)).toHaveText("$8.00", live);
  await expect(priya.getByText("Pick your name to check off what you had.")).toBeVisible(live);
  await priya.getByRole("button", { name: "People", exact: true }).click({ timeout: 3000 });
  await expect(chip(priya, "Sam")).toBeVisible(live);
  await expect(chip(priya, "Priya")).toHaveCount(0);
  await hidePeople(priya);

  await fromMore(sam, "History");
  await expect(sam.getByText("Removed Priya from the split")).toBeVisible(live);
  await sam.getByRole("button", { name: /^Revert Removed Priya/ }).click();
  await expect(owe(sam)).toHaveText("$4.00", live);
  await sam.keyboard.press("Escape");
  await expect(sam.getByRole("dialog", { name: "History" })).toHaveCount(0, live);
  await showPeople(sam, "Sam");
  await expect(chip(sam, "Priya")).toBeVisible(live);
});

test("Payments open on a phone closes when another phone removes its person", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const priya = await open(browser, link, "Priya");
  await fromMore(priya, "Payments");
  await expect(priya.getByRole("list", { name: "Payments" })).toBeVisible(live);

  await showPeople(sam, "Sam");
  await chip(sam, "Priya").click({ button: "right" });
  await menu(sam, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(priya.getByRole("list", { name: "Payments" })).toHaveCount(0, live);
  await expect(priya.getByText("Pick your name to check off what you had.")).toBeVisible(live);
});

test("a menu open for someone another phone removes closes, and the next long-press still opens a menu", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, ["Jason", "Sam", "Priya", "Lee"]);
  const sam = await open(browser, link, "Sam");
  const jason = await open(browser, link, "Jason");

  await showPeople(sam, "Sam");
  await showPeople(jason, "Jason");
  await chip(sam, "Priya").click({ button: "right" });
  await expect(menu(sam, "Priya")).toBeVisible(live);
  await chip(jason, "Priya").click({ button: "right" });
  await menu(jason, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(menu(sam, "Priya")).toHaveCount(0, live);
  await chip(sam, "Lee").click({ button: "right" });
  await expect(menu(sam, "Lee").getByRole("button", { name: "Remove Lee" })).toBeVisible(live);
});

test("a removal the server refuses says so under the chips, and the person stays", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const context = await newContext(browser);
  const sam = await context.newPage();
  await sam.routeWebSocket(/\/parties\//, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      const frame = JSON.parse(String(message));
      if (frame.op?.type === "removeParticipant") client.send(JSON.stringify({ type: "rejected", ref: frame.ref, rejection: { reason: "tooLarge" } }));
      else server.send(message);
    });
    server.onMessage((message) => client.send(message));
  });
  await sam.goto(link);
  await sam.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
  await expect(owe(sam)).toBeVisible(live);
  await showPeople(sam, "Sam");

  await chip(sam, "Priya").click({ button: "right" });
  await menu(sam, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(sam.getByText("Couldn't save that. Check it and try again.")).toBeVisible(live);
  await expect(chip(sam, "Priya")).toBeVisible();
});

