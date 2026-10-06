import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";

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

const longDinner = {
  items: Array.from({ length: 20 }, (_, i) => ({ id: `dish${i}`, name: `Dish ${i + 1}`, price: 300 + i * 85 })),
  adjustments: [],
  subtotal: 22150,
  total: 22150,
};

// The Topgolf receipt's shape: nine lines, two bucket discounts, tax and tip.
const topgolf = {
  items: [
    { id: "gameplay", name: "Gameplay", price: 8775 },
    { id: "ultra1", name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
    { id: "guinness1", name: "Guinness Draught 14.9oz Can", price: 2187, quantity: 3 },
    { id: "pineapple1", name: "High Noon Pineapple 12oz Can", price: 849 },
    { id: "watermelon1", name: "High Noon Watermelon 12oz Can", price: 849 },
    { id: "ultra2", name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
    { id: "guinness2", name: "Guinness Draught 14.9oz Can", price: 1458, quantity: 2 },
    { id: "pineapple2", name: "High Noon Pineapple 12oz Can", price: 849 },
    { id: "watermelon2", name: "High Noon Watermelon 12oz Can", price: 1698, quantity: 2 },
  ],
  adjustments: [
    { id: "bucket1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["ultra1", "guinness1", "pineapple1", "watermelon1"] } },
    { id: "bucket2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: { name: "Beer Bucket", items: ["ultra2", "guinness2", "pineapple2", "watermelon2"] } },
    { id: "tax", kind: "tax", name: "Tax", amount: 494 },
    { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
  ],
  subtotal: 17923,
  total: 20729,
};

const venmo = { service: "venmo", handle: "jason-z" };
const cashApp = { service: "cashApp", handle: "jasonz" };

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, browserName: string, receipt: object = dinner, paymentHandles: object[] = [venmo]): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.18.${browserName === "webkit" ? 50 + workerIndex : workerIndex}.${creates}` },
    data: { split: { receipt, participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }], paymentHandles } },
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
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible(live);
  await settled(page.getByTestId("split-sheet"));
}

async function framesDuring(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const frames: { top: number; asking: boolean; shown: number }[] = [];
    Object.assign(window, { sheetFrames: frames });
    const sample = () => {
      const sheet = document.querySelector('[data-testid="split-sheet"]')!;
      const owe = sheet.querySelector('[data-testid="owe"], [data-testid="breakdown"]');
      let shown = owe ? 1 : 0;
      for (let el = owe; el && el !== sheet; el = el.parentElement) shown *= Number(getComputedStyle(el).opacity);
      frames.push({ top: Math.round(sheet.getBoundingClientRect().top), asking: [...sheet.querySelectorAll('[role="heading"]')].some((h) => h.textContent === "Which one are you?"), shown });
      if (frames.length < 60) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await act();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sheetFrames: unknown[] }).sheetFrames.length), live).toBe(60);
  return page.evaluate(() => (window as unknown as { sheetFrames: { top: number; asking: boolean; shown: number }[] }).sheetFrames);
}

test("after a pick, the share line shows on every frame the sheet lowers, never hidden behind a fade-in pause", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const frames = await framesDuring(page, () => page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click());
  const lowering = frames.filter((frame) => !frame.asking);
  expect(lowering.length).toBeGreaterThan(0);
  expect(lowering.filter((frame) => frame.shown < 0.5).length).toBeLessThanOrEqual(3);
});

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

test("a drag that stops and holds before letting go reads as still, so a sheet held at 40% springs back instead of closing", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  const sheet = page.getByTestId("split-sheet");
  const rest = (await sheet.boundingBox())!.y;
  const visible = page.viewportSize()!.height - rest;
  const dy = Math.round(visible * 0.4);
  await drag(page, { x: (await center(sheet)).x, y: rest + 14 }, dy, dy, 200);
  await settled(sheet);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible();
  expect(Math.abs((await sheet.boundingBox())!.y - rest)).toBeLessThan(2);
});

test("a swipe up on the share bar opens your breakdown, a swipe down closes it, and a tap on a chip still works", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  await pickJason(page);
  const sheet = page.getByTestId("split-sheet");
  const grab = async () => ({ x: (await center(sheet)).x, y: (await sheet.boundingBox())!.y + 14 });

  await drag(page, await grab(), -180, 150);
  await expect(page.getByTestId("breakdown")).toBeVisible(live);
  await settled(sheet);

  await drag(page, await grab(), 200, 150);
  await expect(page.getByTestId("breakdown")).toHaveCount(0, live);
  await expect(page.getByTestId("owe")).toBeVisible();
  await settled(sheet);

  await page.getByRole("button", { name: "Jason, you", exact: true }).click();
  await expect(page.getByTestId("breakdown")).toBeVisible(live);
});

test("a finger that catches the sheet mid-glide moves it from where it is, with no jump", { tag: "@frame-timing" }, async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName), browserName);
  await pickJason(page);
  const sheet = page.getByTestId("split-sheet");
  const rest = (await sheet.boundingBox())!.y;
  await page.getByRole("button", { name: "Jason, you", exact: true }).click();
  await page.waitForTimeout(90);
  const caught = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="split-sheet"]')!;
    const before = element.getBoundingClientRect().top;
    const x = innerWidth / 2;
    const y = before + 14;
    const fire = (type: string, at: number) =>
      element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: x, clientY: at }));
    Element.prototype.setPointerCapture = () => {};
    fire("pointerdown", y);
    fire("pointermove", y + 12);
    return { before, after: element.getBoundingClientRect().top };
  });
  expect(caught.before).toBeLessThan(rest - 5);
  expect(Math.abs(caught.after - caught.before)).toBeLessThan(16);
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

test("scrolled to the end, the receipt's totals stop just above the folded sheet, after the breakdown opens and closes, another person is shown, and the screen gets shorter", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName, longDinner), browserName);
  await pickJason(page);
  for (let dish = 1; dish <= 12; dish += 1) await page.getByRole("button", { name: `Dish ${dish}, check for Jason` }).click();
  await expect(page.getByTestId("owe")).toHaveText("$92.10", live);
  const sheet = page.getByTestId("split-sheet");
  await settled(sheet);
  const gapAtEnd = () =>
    page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="receipt"]')!;
      let scroller = card.parentElement!;
      while (scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement!;
      scroller.scrollTop = scroller.scrollHeight;
      return new Promise<number>((resolve) =>
        requestAnimationFrame(() => resolve(document.querySelector('[data-testid="split-sheet"]')!.getBoundingClientRect().top - card.getBoundingClientRect().bottom)),
      );
    });

  const before = await gapAtEnd();
  expect(before).toBeCloseTo(16, 0);

  await page.getByRole("button", { name: /^Your share .*, Show what you owe$/ }).click();
  await expect(page.getByTestId("breakdown")).toBeVisible(live);
  await settled(sheet);
  await page.getByRole("button", { name: /^Your share .*, Hide what you owe$/ }).click();
  await expect(page.getByTestId("breakdown")).toHaveCount(0, live);
  await settled(sheet);
  expect(await gapAtEnd()).toBeCloseTo(16, 0);

  await page.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(page.getByRole("button", { name: /, Hide Sam's breakdown$/ })).toBeVisible(live);
  await page.getByRole("button", { name: /, Hide Sam's breakdown$/ }).click();
  await expect(page.getByTestId("breakdown")).toHaveCount(0, live);
  await settled(sheet);
  expect(await gapAtEnd()).toBeCloseTo(16, 0);

  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 });
  await settled(sheet);
  expect(await gapAtEnd()).toBeCloseTo(16, 0);
});

async function openLongBreakdown(page: Page) {
  await pickJason(page);
  for (let dish = 1; dish <= 16; dish += 1) await page.getByRole("button", { name: `Dish ${dish}, check for Jason` }).click();
  await expect(page.getByTestId("owe")).toHaveText("$150.00", live);
  await settled(page.getByTestId("split-sheet"));
  await page.getByRole("button", { name: /^Your share .*, Show what you owe$/ }).click();
  await expect(page.getByTestId("breakdown")).toBeVisible(live);
  await settled(page.getByTestId("split-sheet"));
}

test("a drag that stretches the open breakdown above its rest keeps the sheet under its bottom edge, never the page", async ({ browser, request, browserName }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex, browserName, longDinner), browserName);
  await openLongBreakdown(page);
  const sheet = page.getByTestId("split-sheet");
  const rest = (await sheet.boundingBox())!.y;
  const stretched = await page.evaluate(async (rest) => {
    const surface = document.querySelector('[data-testid="split-sheet"]')!;
    const grab = surface.querySelector("[data-sheet-grab]")!;
    const x = innerWidth / 2;
    const fire = (type: string, y: number) =>
      grab.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }));
    const from = rest + 14;
    fire("pointerdown", from);
    for (let dy = 10; dy <= 200; dy += 10) fire("pointermove", from - dy);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const lift = rest - surface.getBoundingClientRect().top;
    const atBottom = document.elementFromPoint(x, innerHeight - 2);
    fire("pointerup", from - 200);
    return { lift, coveredBySheet: surface.contains(atBottom) };
  }, rest);
  expect(stretched.lift).toBeGreaterThan(20);
  expect(stretched.coveredBySheet).toBe(true);
  await settled(sheet);
  expect(Math.abs((await sheet.boundingBox())!.y - rest)).toBeLessThan(2);
});

test("the first swipe on the open breakdown's Item list scrolls the list, and the sheet and the page hold still", async ({ browser, request, browserName }, { workerIndex }) => {
  test.skip(browserName !== "chromium", "only Chromium's CDP touches drive native scrolling");
  const page = await open(browser, await createSplit(request, workerIndex, browserName, longDinner), browserName);
  await openLongBreakdown(page);
  const sheet = page.getByTestId("split-sheet");
  const rest = (await sheet.boundingBox())!.y;
  const list = page.locator('[data-testid="breakdown-items"] [data-sheet-scroll]');
  await expect(list).toHaveCount(1);
  const pageTop = () => page.evaluate(() => document.querySelector('[data-testid="receipt"]')!.getBoundingClientRect().top);
  const before = await pageTop();
  await drag(page, await center(list), -120, 200);
  await expect.poll(() => list.evaluate((element) => element.scrollTop), live).toBeGreaterThan(40);
  await settled(sheet);
  expect(Math.abs((await sheet.boundingBox())!.y - rest)).toBeLessThan(2);
  expect(await pageTop()).toBe(before);
});

// Three Item rows (46 px each) is the least that still reads as a list rather than a peephole.
const roomyList = 3 * 46;

const zelle = { service: "zelle", handle: "jason@example.com" };
const paypal = { service: "paypal", handle: "jasonzhang" };

for (const { count, handles } of [
  { count: "two", handles: [venmo, cashApp] },
  { count: "three", handles: [venmo, cashApp, zelle] },
  { count: "four", handles: [venmo, cashApp, paypal, zelle] },
]) {
  test(`with ${count} ways to pay on a 667 pt phone, the breakdown's Items, discounts, tax and tip scroll in one region at least three rows tall`, async ({ browser, request, browserName }, { workerIndex }) => {
    test.skip(browserName !== "chromium", "only Chromium's CDP touches drive native scrolling");
    const page = await open(browser, await createSplit(request, workerIndex, browserName, topgolf, handles), browserName);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
    await settled(page.getByTestId("split-sheet"));
    const shut = page.getByRole("button", { name: /^Beer Bucket, .*collapsed$/ });
    while (await shut.count()) await shut.first().click();
    for (const name of ["Gameplay", "Guinness Draught 14.9oz Can", "Michelob Ultra 16oz Aluminum Bottle"]) {
      for (const line of await page.getByRole("button", { name: `${name}, check for Sam` }).all()) await line.click();
    }
    for (const name of ["High Noon Pineapple 12oz Can", "High Noon Watermelon 12oz Can"]) await page.getByRole("button", { name: `${name}, check for Sam` }).first().click();
    await expect(page.getByTestId("owe")).not.toHaveText("$0.00", live);
    await settled(page.getByTestId("split-sheet"));
    await page.getByRole("button", { name: /^Your share .*, Show what you owe$/ }).click();
    await expect(page.getByTestId("breakdown")).toBeVisible(live);
    await settled(page.getByTestId("split-sheet"));

    const breakdown = page.getByTestId("breakdown");
    await expect(breakdown.getByRole("link", { name: /^Pay Jason \$[\d.]+ on Venmo$/ })).toBeVisible();
    await expect(breakdown.getByRole("link", { name: /^Pay Jason \$[\d.]+ on Cash App$/ })).toBeVisible();
    const list = page.locator('[data-testid="breakdown-items"] [data-sheet-scroll]');
    await expect(list).toHaveCount(1);
    expect(await list.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(roomyList);
    for (const row of ["Beer Bucket Discount (10%)", "Tax", "Tip"]) await expect(list.getByText(row, { exact: true }).first()).toBeAttached();

    const shown = () =>
      list.getByText("Tip", { exact: true }).evaluate((label) => {
        const scroller = label.closest("[data-sheet-scroll]")!.getBoundingClientRect();
        const row = label.getBoundingClientRect();
        return row.top >= scroller.top && row.bottom <= scroller.bottom;
      });
    expect(await shown()).toBe(false);
    for (let swipe = 0; swipe < 6 && !(await shown()); swipe += 1) await drag(page, await center(list), -150, 200);
    expect(await shown()).toBe(true);
  });
}

test("a price typed at the end or in the middle of the Item sheet's price field is what the field and the row show, and text that is not a price holds the sheet open on its problem", async ({ browser, request, browserName }, { workerIndex }) => {
  const receipt = { items: [{ id: "wings", name: "Wings", price: 1200 }], adjustments: [], subtotal: 1200, total: 1200 };
  const page = await open(browser, await createSplit(request, workerIndex, browserName, receipt), browserName);
  await pickJason(page);
  const sheet = page.getByRole("dialog", { name: "Item" });
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
  const sheet = page.getByRole("dialog", { name: "Item" });
  const who = sheet.getByRole("group", { name: "Who had it" });

  await page.getByRole("button", { name: /^Open Wings, / }).click();
  for (const name of ["Jason", "Sam"]) {
    await who.getByRole("button", { name, exact: true }).click();
    await expect(who.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", live);
  }
  await sheet.getByRole("group", { name: "Split" }).getByRole("button", { name: "By amount", exact: true }).click();
  const sams = sheet.getByRole("textbox", { name: "Sam's amount" });
  await expect(sams).toHaveValue("0.00", live);
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
