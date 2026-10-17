import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";
import { fromMore } from "./header";
import { snapAt } from "../src/ui/components/sheet-motion";

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

const venmo = { service: "venmo", handle: "jason-z" };

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, browserName: string, receipt: object = dinner, paymentHandles: object[] = [venmo], host = "Jason", others: object[] = [{ id: "sam", name: "Sam" }]): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.18.${browserName === "webkit" ? 50 + workerIndex : workerIndex}.${creates}` },
    data: { split: { receipt, participants: [{ id: "jason", name: host }, ...others], paymentHandles } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function open(browser: Browser, link: string, browserName: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  // Synthetic pointers are not active pointers, so WebKit would refuse to capture them.
  if (browserName === "webkit") await page.addInitScript(() => Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} }));
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  await settled(page.getByTestId("split-sheet"));
  return page;
}

async function settled(target: Locator) {
  const top = async () => (await target.boundingBox())?.y;
  await expect.poll(async () => {
    const before = await top();
    await target.page().waitForTimeout(100);
    return before !== undefined && before === (await top());
  }, live).toBe(true);
}

type Point = { x: number; y: number };

async function drag(page: Page, from: Point, dy: number, ms: number, holdMs = 0) {
  const steps = Math.max(2, Math.round(ms / 16));
  const points = Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x, y: from.y + (dy * i) / steps }));
  if (page.context().browser()?.browserType().name() === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]] });
    for (const point of points.slice(1)) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(holdMs);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.evaluate(async ({ path, holdMs }) => {
    const target = document.elementFromPoint(path[0].x, path[0].y)!;
    const fire = (type: string, point: { x: number; y: number }) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: point.x, clientY: point.y }));
    fire("pointerdown", path[0]);
    for (const point of path.slice(1)) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      fire("pointermove", point);
    }
    await new Promise((resolve) => setTimeout(resolve, holdMs));
    fire("pointerup", path.at(-1)!);
  }, { path: points, holdMs });
}

async function center(target: Locator): Promise<Point> {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pickJason(page: Page) {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

test("a flick down on the pick sheet's rows closes it, and a drag that starts on a name does not pick it", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const jason = page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true });
  await drag(page, await center(jason), 60, 400);
  await settled(page.getByTestId("split-sheet"));
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toHaveCount(0);

  await drag(page, await center(jason), 260, 120);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0, live);
  await expect(page.getByText("Pick your name to check off what you had.")).toBeVisible(live);
});

// A touch landed 90 ms into a 300 ms glide; a loaded runner can let the glide finish first.
test("a still touch on the Item sheet mid-glide holds it where it is, and letting go finishes the glide", { tag: "@frame-timing" }, async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  await pickJason(page);
  const item = page.getByTestId("item-sheet");
  await page.getByRole("button", { name: /^Open Rice, / }).click();
  await page.waitForTimeout(90);
  const touch = await page.evaluate(async () => {
    const element = document.querySelector<HTMLElement>('[data-testid="item-sheet"]')!;
    const top = () => element.getBoundingClientRect().top;
    const atTouch = top();
    const fire = (type: string) =>
      element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: innerWidth / 2, clientY: atTouch + 14 }));
    fire("pointerdown");
    const held: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      held.push(top());
    }
    fire("pointerup");
    return { atTouch, held };
  });
  await settled(item);
  const rest = (await item.boundingBox())!.y;

  expect(touch.atTouch - rest).toBeGreaterThan(20);
  expect(Math.max(...touch.held) - Math.min(...touch.held)).toBeLessThanOrEqual(2);
  expect(Math.abs(touch.held[0] - touch.atTouch)).toBeLessThanOrEqual(2);
});

test("a price typed at the end or in the middle of the Item sheet's price field is what the field and the row show, and text that is not a price holds the sheet open on its problem", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "wings", name: "Wings", price: 1200 }], adjustments: [], subtotal: 1200, total: 1200 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt), browserName);
  await pickJason(page);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const price = sheet.getByRole("textbox", { name: "Price" });
  const caretAt = (at: number) => price.evaluate((input: HTMLInputElement, at) => input.setSelectionRange(at, at), at);
  const selected = () => price.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!));

  await page.getByRole("button", { name: /^Open Wings, \$12\.00/ }).click();
  await price.click();
  await expect.poll(selected).toBe("12.00");
  await page.keyboard.type("13");
  await expect(price).toHaveValue("13");
  await price.fill("12.00");
  await caretAt(5);
  await page.keyboard.type("13");
  await expect(price).toHaveValue("12.0013");
  const blurs = await price.evaluateHandle((input) => {
    const seen: string[] = [];
    input.addEventListener("blur", () => seen.push("blur"));
    return seen;
  });
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Add a price.");
  await expect(price).toHaveValue("12.0013");
  await expect(price).toBeFocused();
  expect(await blurs.jsonValue()).toEqual([]);

  await price.fill("13");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(price).not.toBeFocused();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByRole("button", { name: /^Open Wings, \$13\.00/ })).toBeVisible(live);

  await page.getByRole("button", { name: /^Open Wings, \$13\.00/ }).click();
  await expect(price).toHaveValue("13.00");
  await price.click();
  await expect.poll(selected).toBe("13.00");
  await caretAt(1);
  await page.keyboard.type("2");
  await expect(price).toHaveValue("123.00");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByRole("button", { name: /^Open Wings, \$123\.00/ })).toBeVisible(live);
});

test("text that is not an amount in a By amount field holds the Item sheet open on its problem, and a fixed amount saves", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "wings", name: "Wings", price: 1200 }], adjustments: [], subtotal: 1200, total: 1200 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt), browserName);
  await pickJason(page);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });

  await page.getByRole("button", { name: /^Open Wings, / }).click();
  for (const name of ["Jason, you", "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  const sams = sheet.getByRole("textbox", { name: "Sam's amount" });
  await expect(sams).toHaveValue("", live);
  await sheet.getByRole("textbox", { name: "Jason's amount" }).fill("8");

  await sams.fill("4.005");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Add an amount.");
  await expect(sams).toHaveValue("4.005");
  await expect(sams).toBeFocused();

  await sams.fill("4");
  await expect(sheet.getByRole("status")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await page.getByRole("button", { name: /^Open Wings, / }).click();
  await expect(sheet.getByRole("textbox", { name: "Sam's amount" })).toHaveValue("4.00", live);
  await expect(sheet.getByRole("textbox", { name: "Jason's amount" })).toHaveValue("8.00");
});

test("By amount says what is left to assign as amounts are typed, and Give the rest fills the one person at $0.00", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "gameplay", name: "Gameplay", price: 8775 }], adjustments: [], subtotal: 8775, total: 8775 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt), browserName);
  await pickJason(page);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  for (const name of ["Jason, you", "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  const status = sheet.getByTestId("amount-status");
  const jasons = sheet.getByRole("textbox", { name: "Jason's amount" });
  const sams = sheet.getByRole("textbox", { name: "Sam's amount" });
  const giveJason = sheet.getByRole("button", { name: "Give Jason the rest, $62.75" });

  await expect(status).toHaveText("$87.75 left to assign", live);
  await expect(sheet.locator('[data-icon="exclaim"]')).toHaveCount(0);
  await expect(sheet.getByText("Not saved")).toHaveCount(0);
  const muted = await status.evaluate((node) => getComputedStyle(node).color);
  for (const field of [jasons, sams]) {
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("placeholder", "0.00");
  }
  await expect(sheet.getByRole("button", { name: /^Give .* the rest/ })).toHaveCount(0);

  await sams.fill("25");
  await expect(status).toHaveText("$62.75 left to assign");
  expect(await status.evaluate((node) => getComputedStyle(node).color), "typing an amount turns the line to the warning ink").not.toBe(muted);
  await expect(sheet.locator('[data-icon="exclaim"]')).toHaveCount(1);
  await expect(giveJason).toBeVisible();
  await jasons.fill("70");
  await expect(status).toHaveText("$7.25 over the price");
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await jasons.fill("");
  await expect(status).toHaveText("$62.75 left to assign");
  await expect(jasons).toHaveAttribute("placeholder", "0.00");

  await giveJason.click();
  await expect(status).toHaveText("All $87.75 assigned");
  await expect(jasons).toHaveValue("62.75");
  await expect(sheet.getByRole("button", { name: /^Give .* the rest/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);

  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $87.75 assigned", live);
  await expect(sheet.getByRole("textbox", { name: "Jason's amount" })).toHaveValue("62.75");
  await expect(sheet.getByRole("textbox", { name: "Sam's amount" })).toHaveValue("25.00");
});

test("By amount that is blank or over the price saves nothing: the Item stays Evenly, the footer and History do not change, and Give the rest is offered when over", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "gameplay", name: "Gameplay", price: 8775 }], adjustments: [], subtotal: 8775, total: 8775 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt), browserName);
  await pickJason(page);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  for (const name of ["Jason, you", "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await expect(page.getByTestId("owe")).toHaveText("$43.88", live);
  const status = sheet.getByTestId("amount-status");

  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await expect(status).toHaveText("$87.75 left to assign", live);
  await expect(sheet.getByText("Not saved")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("25");
  await sheet.getByRole("textbox", { name: "Jason's amount" }).fill("70");
  await expect(status).toHaveText("$7.25 over the price");
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Give Jason the rest, $62.75" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await by(sheet, "Evenly");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);

  await expect(page.getByTestId("owe")).toHaveText("$43.88");
  await expect(page.getByRole("button", { name: /^Open Gameplay, / })).toHaveAccessibleName("Open Gameplay, $87.75, You, Sam, $43.88 yours");
  await fromMore(page, "History");
  const history = page.getByRole("list", { name: "History" }).getByRole("listitem");
  await expect(history).toHaveText(["Created the splitby Jason"]);
  await page.getByRole("dialog", { name: "History" }).getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("25");
  await sheet.getByRole("button", { name: "Give Jason the rest, $62.75" }).click();
  await expect(status).toHaveText("All $87.75 assigned");
  await expect(sheet.getByText("Not saved")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);

  await expect(page.getByTestId("owe")).toHaveText("$62.75", live);
  await fromMore(page, "History");
  await expect(history.first()).toHaveText("Gameplay split evenly → by amountby Jason · Just nowRevert", live);
});

test("a By amount edit held back while another phone takes Sam off the Item drops Sam's amount and saves once Jason's own add up", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "gameplay", name: "Gameplay", price: 8775 }], adjustments: [], subtotal: 8775, total: 8775 };
  const link = await createSplit(request, workerIndex, browserName, receipt);
  const page = await open(browser, link, browserName);
  await pickJason(page);
  const other = await open(browser, link, browserName);
  await other.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
  await expect(other.getByTestId("owe")).toBeVisible(live);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  for (const name of ["Jason, you", "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("25");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$62.75 left to assign");

  await other.getByRole("button", { name: "Gameplay, check for Sam" }).click();
  await expect(sheet.getByRole("textbox", { name: "Sam's amount" })).toHaveCount(0, live);
  await expect(sheet.getByTestId("amount-status")).toHaveText("$87.75 left to assign");
  await sheet.getByRole("textbox", { name: "Jason's amount" }).fill("87.75");
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $87.75 assigned");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByTestId("owe")).toHaveText("$87.75", live);
  await expect(other.getByTestId("owe")).toHaveText("$0.00", live);
});

const tenDollar = { items: [{ id: "pizza", name: "Pizza", price: 1000 }], adjustments: [], subtotal: 1000, total: 1000 };

async function openPizza(page: Page, names: string[]) {
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Pizza, / }).click();
  for (const name of names) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  return sheet;
}

async function joinAs(browser: Browser, link: string, browserName: string, name: string): Promise<Page> {
  const page = await open(browser, link, browserName);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

const by = (sheet: Locator, mode: string) => sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: mode, exact: true }).click();

test("a held amount for someone another phone then takes off the Item is not sent with the amounts that add up", async ({ browser, request, browserName }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, browserName, tenDollar, [venmo], "Jason", [{ id: "sam", name: "Sam" }, { id: "jo", name: "Jo" }]);
  const page = await open(browser, link, browserName);
  await pickJason(page);
  const jo = await joinAs(browser, link, browserName, "Jo");
  const sheet = await openPizza(page, ["Jason, you", "Sam", "Jo"]);
  await by(sheet, "By amount");
  await sheet.getByRole("textbox", { name: "Jo's amount" }).fill("3");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$7.00 left to assign");

  await jo.getByRole("button", { name: "Pizza, check for Jo" }).click();
  await expect(sheet.getByRole("textbox", { name: "Jo's amount" })).toHaveCount(0, live);
  await sheet.getByRole("textbox", { name: "Jason's amount" }).fill("6");
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("4");
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $10.00 assigned");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByTestId("owe")).toHaveText("$6.00", live);
  await expect(jo.getByTestId("owe")).toHaveText("$0.00", live);
});

test("typed amounts held while another phone changes the Item's mode are dropped, not applied in the new mode", async ({ browser, request, browserName }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, browserName, tenDollar);
  const page = await open(browser, link, browserName);
  await pickJason(page);
  const sam = await joinAs(browser, link, browserName, "Sam");
  const sheet = await openPizza(page, ["Jason, you", "Sam"]);
  await by(sheet, "By amount");
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("5");
  await sheet.getByRole("button", { name: "Give Jason the rest, $5.00" }).click();
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $10.00 assigned");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  const samSheet = sam.getByRole("dialog", { name: "Edit item" });
  await sam.getByRole("button", { name: /^Open Pizza, / }).click();
  await expect(samSheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true })).toHaveAttribute("aria-pressed", "true", live);

  await page.getByRole("button", { name: /^Open Pizza, / }).click();
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("0.5");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$4.50 left to assign");

  await by(sam.getByRole("dialog", { name: "Edit item" }), "By shares");
  await expect(sheet.getByRole("button", { name: "Fewer shares for Sam" })).toBeVisible(live);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByTestId("owe")).toHaveText("$5.00", live);
});

test("a price change on a By amount Item saves as before, and the extra counts as unclaimed; a price under the amounts keeps the sheet open on Not saved", async ({ browser, request, browserName }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, browserName, tenDollar);
  const page = await open(browser, link, browserName);
  await pickJason(page);
  const sheet = await openPizza(page, ["Jason, you", "Sam"]);
  await by(sheet, "By amount");
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("5");
  await sheet.getByRole("button", { name: "Give Jason the rest, $5.00" }).click();
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $10.00 assigned");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);

  await page.getByRole("button", { name: /^Open Pizza, / }).click();
  await sheet.getByRole("textbox", { name: "Price" }).fill("12");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByRole("button", { name: /^Open Pizza, \$12\.00/ })).toBeVisible(live);
  await expect(page.getByTestId("unclaimed")).toHaveText("$2.00", live);

  await page.getByRole("button", { name: /^Open Pizza, / }).click();
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("5");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$2.00 left to assign");
  await expect(sheet.getByText("Not saved")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);

  await page.getByRole("button", { name: /^Open Pizza, / }).click();
  await sheet.getByRole("textbox", { name: "Price" }).fill("8");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$2.00 over the price");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await expect(page.getByTestId("unclaimed")).toHaveText("$2.00");
  await sheet.getByRole("textbox", { name: "Price" }).fill("12");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByRole("button", { name: /^Open Pizza, \$12\.00/ })).toBeVisible();
  await expect(page.getByTestId("unclaimed")).toHaveText("$2.00");
});

test("a By amount edit that does not add up keeps the sheet open on Not saved through Close and Escape, and Evenly lets it go", async ({ browser, request, browserName }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, browserName, tenDollar);
  const page = await open(browser, link, browserName);
  await pickJason(page);
  const sheet = await openPizza(page, ["Jason, you", "Sam"]);
  await by(sheet, "By amount");
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("5");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await by(sheet, "Evenly");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(page.getByTestId("owe")).toHaveText("$5.00", live);
});

test("a held By amount edit that a price change on another phone makes exact saves by itself", async ({ browser, request, browserName }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, browserName, tenDollar);
  const page = await open(browser, link, browserName);
  await pickJason(page);
  const sam = await joinAs(browser, link, browserName, "Sam");
  const sheet = await openPizza(page, ["Jason, you", "Sam"]);
  await by(sheet, "By amount");
  await sheet.getByRole("textbox", { name: "Jason's amount" }).fill("5");
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("3");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$2.00 left to assign");
  await expect(sheet.getByText("Not saved")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByText("Not saved")).toBeVisible();

  await sam.getByRole("button", { name: /^Open Pizza, / }).click();
  await sam.getByRole("dialog", { name: "Edit item" }).getByRole("textbox", { name: "Price" }).fill("8");
  await sam.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $8.00 assigned", live);
  await expect(sheet.getByText("Not saved")).toHaveCount(0);
  await expect(sam.getByTestId("owe")).toHaveText("$3.00", live);
});

test("with a long name, Give the rest wraps under the status instead of truncating, inside the Item sheet", async ({ browser, request, browserName }, { workerIndex }) => {
  const host = "Bartholomew Alexandria-Montgomery";
  const receipt = { items: [{ id: "gameplay", name: "Gameplay", price: 8775 }], adjustments: [], subtotal: 8775, total: 8775 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt, [venmo], host), browserName);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: host, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  await settled(sheet);
  for (const name of [`${host}, you`, "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("25");
  const give = sheet.getByRole("button", { name: `Give ${host} the rest, $62.75` });
  const status = sheet.getByTestId("amount-status");
  await expect(give).toBeVisible();
  // One synchronous read of every box, so a sheet still settling cannot shift one box between two measurements.
  const lineUp = () =>
    sheet.evaluate((root, label) => {
      const box = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
      const button = box(`[aria-label="${label}"]`);
      const said = box('[data-testid="amount-status"]');
      return {
        insideSheet: button.right <= root.getBoundingClientRect().right + 1,
        clear: said.right <= button.left || said.bottom <= button.top,
      };
    }, `Give ${host} the rest, $62.75`);
  await expect.poll(async () => (await lineUp()).insideSheet).toBe(true);
  await expect.poll(async () => (await lineUp()).clear).toBe(true);
  expect(await give.evaluate((el) => [...el.querySelectorAll("*")].every((node) => node.scrollWidth <= node.clientWidth))).toBe(true);
  await expect(status).toHaveText("$62.75 left to assign");
  expect(await status.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

async function openRice(page: Page) {
  await pickJason(page);
  await page.getByRole("button", { name: /^Open Rice, / }).click();
  const item = page.getByTestId("item-sheet");
  await expect(item).toBeVisible(live);
  await settled(item);
  return item;
}

const grabOf = async (sheet: Locator) => ({ x: (await center(sheet)).x, y: (await sheet.boundingBox())!.y + 14 });

test("a pull up snaps to tall, and a short pull down returns the sheet to rest", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const item = await openRice(page);
  const viewport = page.viewportSize()!;
  const rest = (await item.boundingBox())!.y;
  expect(viewport.height - rest).toBeLessThan(viewport.height * 0.9);

  await drag(page, await grabOf(item), -160, 200, 150);
  await settled(item);
  expect(viewport.height - (await item.boundingBox())!.y).toBeGreaterThan(viewport.height * 0.9);
  await expect(item).toBeVisible();

  await drag(page, await grabOf(item), 70, 200, 150);
  await settled(item);
  expect(Math.abs((await item.boundingBox())!.y - rest)).toBeLessThan(2);
});

test("a pull past 110 px closes the sheet, and a pull of 80 px does not", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const item = await openRice(page);
  const rest = (await item.boundingBox())!.y;

  await drag(page, await grabOf(item), 80, 200, 150);
  await settled(item);
  expect(Math.abs((await item.boundingBox())!.y - rest)).toBeLessThan(2);

  await drag(page, await grabOf(item), 140, 200, 150);
  await expect(item).toHaveCount(0, live);
});

test("a long pull down from tall lands at rest and does not close the sheet", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const item = await openRice(page);
  const rest = (await item.boundingBox())!.y;

  await drag(page, await grabOf(item), -160, 200, 150);
  await settled(item);
  const tallTop = (await item.boundingBox())!.y;
  expect(tallTop).toBeLessThan(rest - snapAt);

  await drag(page, await grabOf(item), Math.round((rest - tallTop) * 0.9), 250, 150);
  await settled(item);
  await expect(item).toBeVisible();
  expect(Math.abs((await item.boundingBox())!.y - rest)).toBeLessThan(2);
});

test("the Edit item status tick draws once when it appears, not again as the text or the amounts change, and the warning pulses once per time it appears", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "gameplay", name: "Gameplay", price: 8775 }], adjustments: [], subtotal: 8775, total: 8775 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt), browserName);
  await pickJason(page);
  const started = await page.evaluateHandle(() => {
    const seen: string[] = [];
    document.addEventListener("animationstart", (event) => seen.push(event.animationName), true);
    return seen;
  });
  const count = async (name: string) => (await started.jsonValue()).filter((one) => one === name).length;
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  await expect(sheet.locator('[data-icon="exclaim"]')).toHaveCount(1, live);
  await expect.poll(() => count("ai-pulse")).toBe(1);

  await who.getByRole("button", { name: "Jason, you", exact: true }).click();
  await expect(sheet.locator('[data-icon="check"]')).toHaveCount(1, live);
  await expect.poll(() => count("ai-tick")).toBe(1);
  await who.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(sheet.getByText("2 people · $87.75")).toBeVisible();
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By amount", exact: true }).click();
  await expect(sheet.getByTestId("amount-status")).toHaveText("$87.75 left to assign", live);
  await expect(sheet.locator('[data-icon="exclaim"]')).toHaveCount(0);
  const jasonAmount = sheet.getByRole("textbox", { name: "Jason's amount" });
  await jasonAmount.fill("3");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$84.75 left to assign");
  await expect(sheet.locator('[data-icon="exclaim"]')).toHaveCount(1);
  await page.waitForTimeout(1200);
  const pulses = await count("ai-pulse");
  expect(pulses).toBeGreaterThan(1);
  await jasonAmount.fill("30");
  await expect(sheet.getByTestId("amount-status")).toHaveText("$57.75 left to assign");
  await page.waitForTimeout(1200);
  expect(await count("ai-tick")).toBe(1);
  expect(await count("ai-pulse")).toBe(pulses);

  await sheet.getByRole("textbox", { name: "Sam's amount" }).fill("57.75");
  await expect(sheet.getByTestId("amount-status")).toHaveText("All $87.75 assigned");
  await page.waitForTimeout(1200);
  expect(await count("ai-tick")).toBe(2);
  expect(await count("ai-pulse")).toBe(pulses);
});

test("Who had it puts You first and the others in participant order, and How to split lists the parts in that same order", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "gameplay", name: "Gameplay", price: 9000 }], adjustments: [], subtotal: 9000, total: 9000 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt, [venmo], "Jason", [{ id: "sam", name: "Sam" }, { id: "priya", name: "Priya" }]), browserName);
  await pickJason(page);
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const who = sheet.getByRole("group", { name: "Who had it" });
  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  await expect(who.getByRole("button")).toHaveText(["You", "Sam", "Priya"], live);
  for (const name of ["Jason, you", "Priya", "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await sheet.getByRole("group", { name: "How to split" }).getByRole("button", { name: "By shares", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /^More shares for / })).toHaveCount(3, live);
  const names = await sheet.getByRole("button", { name: /^More shares for / }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(names, "the parts follow the participants, though the claims were stored Jason, Priya, Sam").toEqual(["More shares for Jason", "More shares for Sam", "More shares for Priya"]);
});

test("the Price field reads 1,234.50 style plain two decimals once the typed price has saved", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const sheet = await openRice(page);
  const price = sheet.getByRole("textbox", { name: "Price" });
  await price.fill("1234.5");
  await expect(price).toHaveValue("1234.5");
  await sheet.getByRole("textbox", { name: "Item name" }).focus();
  await expect(price).toHaveValue("1234.50", live);
  await expect(page.getByRole("button", { name: /^Open Rice, \$1,234\.50/ })).toBeVisible(live);
});
