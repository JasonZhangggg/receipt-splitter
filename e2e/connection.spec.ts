import { openExample } from "./files";
import { expect, test, type APIRequestContext, type Page } from "./without-ocr";
import type { WebSocketRoute } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };
const offline = "Offline. Reconnecting\u2026";
const slow = "Slow network. Saving\u2026";
const failed = "Couldn't save that. Check your connection and try again.";

const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "tostones", name: "Tostones", price: 100 },
  ],
  adjustments: [],
  subtotal: 900,
  total: 900,
};

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.52.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: dinner,
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function openAs(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

const rice = (page: Page) => page.getByRole("button", { name: "Rice, check for Sam" });
const notice = (page: Page) => page.getByTestId("connection-notice");

/** What the notice shows (the words and three dots) and what a screen reader gets (the sentence once, with its ellipsis). */
async function expectNotice(page: Page, words: string, options: { timeout: number }) {
  await expect(notice(page).locator('[aria-hidden="true"]')).toHaveText(words.replace("\u2026", "..."), options);
  await expect(page.getByRole("status").filter({ hasText: words })).toMatchAriaSnapshot(`- status: ${words}`, options);
}

test("offline for more than 1.5 s shows the notice, and reconnecting clears it", async ({ page, context, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");

  await context.setOffline(true);
  await page.waitForTimeout(600);
  await expect(notice(page)).toHaveCount(0);
  await expectNotice(page, offline, live);

  await context.setOffline(false);
  await expect(notice(page)).toHaveCount(0, { timeout: 30_000 });
});

test("a claim tap while offline says the connection is down and leaves the dot unclaimed, and after reconnecting it works", async ({ page, context, request }, { workerIndex }) => {
  let socket: WebSocketRoute | null = null;
  await page.routeWebSocket(/split-server/, (client) => {
    socket = client;
    const server = client.connectToServer();
    client.onMessage((message) => server.send(message));
    server.onMessage((message) => client.send(message));
  });
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await context.setOffline(true);
  (socket as WebSocketRoute | null)?.close();
  await expectNotice(page, offline, live);

  await rice(page).click();
  await expect(page.getByText(failed)).toBeVisible({ timeout: 3000 });
  await expect(rice(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("owe")).toHaveText("$0.00");

  await context.setOffline(false);
  await expect(notice(page)).toHaveCount(0, { timeout: 30_000 });
  await rice(page).click();
  await expect(rice(page)).toHaveAttribute("aria-pressed", "true", live);
  await expect(page.getByTestId("owe")).toHaveText("$8.00", live);
});

test("an answer held for more than 3 s shows the slow message, which clears when it arrives", async ({ page, request }, { workerIndex }) => {
  let holding = false;
  await page.routeWebSocket(/split-server/, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      if (holding && String(message).includes('"op"')) setTimeout(() => server.send(message), 5000);
      else server.send(message);
    });
    server.onMessage((message) => client.send(message));
  });
  await openAs(page, await createSplit(request, workerIndex), "Sam");

  holding = true;
  await rice(page).click();
  await expectNotice(page, slow, { timeout: 6000 });
  await expect(rice(page)).toHaveAttribute("aria-pressed", "true", live);
  await expect(notice(page)).toHaveCount(0, live);
});

test("an answer held past 10 s after the server applied it ends on the saved values with no error", async ({ page, request }, { workerIndex }) => {
  let holding = false;
  await page.routeWebSocket(/split-server/, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (holding && String(message).includes('"ref":"r')) {
        holding = false;
        setTimeout(() => client.send(message), 20_000);
      } else client.send(message);
    });
  });
  await openAs(page, await createSplit(request, workerIndex), "Sam");

  holding = true;
  await rice(page).click();
  await expect(page.getByTestId("owe")).toHaveText("$8.00", { timeout: 30_000 });
  await expect(rice(page)).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1500);
  await expect(page.getByText(failed)).toHaveCount(0);

  await page.getByRole("button", { name: /^Open Tostones, / }).click();
  holding = true;
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  const name = sheet.getByRole("textbox", { name: "Item name", exact: true });
  await name.fill("Plantains");
  await name.press("Tab");
  await expect(name).toHaveValue("Plantains", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(sheet.getByText(failed)).toHaveCount(0);
  await expect(name).toHaveValue("Plantains");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /^Open Plantains, / })).toBeVisible(live);
});

test("a name pick the server recorded but answered late still takes the name", async ({ page, request }, { workerIndex }) => {
  let holding = true;
  await page.routeWebSocket(/split-server/, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (holding && String(message).includes('"ref":"r')) {
        holding = false;
        setTimeout(() => client.send(message), 20_000);
      } else client.send(message);
    });
  });
  await page.goto(await createSplit(request, workerIndex));
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Couldn't pick that name. Check your connection and try again.")).toHaveCount(0);
});

test("Create link while offline says it is the connection", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SplitWith" })).toBeVisible();
  await openExample(page);
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Jason");
  await page.getByRole("textbox", { name: "Your name", exact: true }).press("Enter");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByText("Check your connection and try again.")).toBeVisible(live);
  await expect(page).toHaveURL(/\/$/);
});

for (const width of [390, 320]) {
  test(`at ${width} px wide the offline notice clears the coffee cup on one line, and a sheet opened over it dims it`, async ({ page, context, request }, { workerIndex }) => {
    await page.setViewportSize({ width, height: 844 });
    await openAs(page, await createSplit(request, workerIndex), "Sam");
    await context.setOffline(true);
    await expectNotice(page, offline, live);
    await page.waitForTimeout(400);

    const line = (await notice(page).boundingBox())!;
    expect(line.height).toBeLessThan(28);
    const cup = (await page.getByRole("link", { name: "Buy me a coffee" }).boundingBox())!;
    expect(line.x + line.width).toBeLessThanOrEqual(cup.x + cup.width / 2 - 8);

    await page.getByRole("button", { name: "People", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "People" })).toBeVisible(live);
    await page.waitForTimeout(600);
    const covered = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y)[0]?.closest('[data-testid="connection-notice"]') === null, { x: line.x + line.width / 2, y: line.y + line.height / 2 });
    expect(covered).toBe(true);
  });
}

/** Holds each dot at one point of its loop, so the check reads a known frame instead of racing the clock. */
async function dotsAt(page: Page, time: number) {
  return notice(page).evaluate((root, at) => {
    const dots = [...root.querySelectorAll<HTMLElement>('[aria-hidden="true"] span')];
    const animations = document.getAnimations().filter((a) => a instanceof CSSAnimation && dots.includes((a.effect as KeyframeEffect).target as HTMLElement));
    animations.forEach((a) => {
      a.pause();
      a.currentTime = at + Number(a.effect?.getTiming().delay);
    });
    return {
      count: dots.length,
      animated: animations.length,
      timing: animations.map((a) => [a.effect?.getTiming().delay, a.effect?.getTiming().duration]),
      transforms: dots.map((d) => getComputedStyle(d).transform),
      opacities: dots.map((d) => getComputedStyle(d).opacity),
      bubble: { background: getComputedStyle(root).backgroundColor, border: getComputedStyle(root).borderTopWidth, padding: getComputedStyle(root).paddingTop },
    };
  }, time);
}

test("the notice is a bare line whose three dots bounce in turn", async ({ page, context, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await context.setOffline(true);
  await expectNotice(page, offline, live);

  const peak = await dotsAt(page, 300);
  expect(peak.bubble).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px", padding: "0px" });
  expect(peak.count).toBe(3);
  expect(peak.timing).toEqual([[0, 1200], [120, 1200], [240, 1200]]);
  expect(peak.transforms).toEqual(["matrix(1, 0, 0, 1, 0, -3)", "matrix(1, 0, 0, 1, 0, -3)", "matrix(1, 0, 0, 1, 0, -3)"]);
  expect(peak.opacities).toEqual(["1", "1", "1"]);
  expect((await dotsAt(page, 600)).transforms).toEqual(["matrix(1, 0, 0, 1, 0, 0)", "matrix(1, 0, 0, 1, 0, 0)", "matrix(1, 0, 0, 1, 0, 0)"]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the dots fade in turn and do not move", async ({ page, context, request }, { workerIndex }) => {
    await openAs(page, await createSplit(request, workerIndex), "Sam");
    await context.setOffline(true);
    await expectNotice(page, offline, live);

    const dim = await dotsAt(page, 300);
    expect(dim.animated).toBe(3);
    expect(dim.opacities).toEqual(["0.35", "0.35", "0.35"]);
    expect(dim.transforms).toEqual(["none", "none", "none"]);
  });
});
