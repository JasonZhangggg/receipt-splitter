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

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, browserName: string): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.18.${browserName === "webkit" ? 50 + workerIndex : workerIndex}.${creates}` },
    data: { split: { receipt: dinner, participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }], paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
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
