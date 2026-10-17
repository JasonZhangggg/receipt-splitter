import { readFileSync } from "node:fs";

import { expect, test, type APIRequestContext, type Browser, type Page, type Request } from "@playwright/test";

import { addNames } from "./files";
import { fromMore } from "./header";
import { mountHarness } from "./harness";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

const KB = 1024;
const live = { timeout: 30_000 };
const scanTimeout = { timeout: 60_000 };

let creates = 0;
const nextIp = (browserName: string, workerIndex: number) => `198.54.${browserName === "webkit" ? 100 + workerIndex : workerIndex}.${++creates}`;

test.beforeEach(async ({ context, browserName }, testInfo) => {
  const ip = nextIp(browserName, testInfo.workerIndex);
  await context.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }));
});

/** The JPEG's segment markers up to its first scan, as hex, read here rather than with the app's own cleaner. */
function segments(bytes: Uint8Array): string[] {
  const found: string[] = [];
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return ["not a JPEG"];
  for (let at = 2; at + 3 < bytes.length && bytes[at] === 0xff; at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3])) {
    found.push(bytes[at + 1].toString(16));
    if (bytes[at + 1] === 0xda) break;
  }
  return found;
}

const metadata = (bytes: Uint8Array) => segments(bytes).filter((marker) => !["e0", "db", "c4", "c0", "c2", "dd", "da"].includes(marker));

async function apiSplit(request: APIRequestContext, ip: string) {
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": ip },
    data: {
      split: {
        receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
        participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id, creatorSecret }: { id: string; creatorSecret: string } = await response.json();
  return { id, creatorSecret };
}

const putPhoto = (request: APIRequestContext, id: string, creatorSecret: string, body: Uint8Array) =>
  request.put(`/api/splits/${id}/photo`, { headers: { "content-type": "image/jpeg", authorization: `Bearer ${creatorSecret}` }, data: Buffer.from(body) });

async function scan(page: Page) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add the receipt" }).click();
  await (await chooser).setFiles("e2e/fixtures/topgolf-synthetic.png");
  await expect(page.getByTestId("receipt")).toBeVisible(scanTimeout);
}

async function scanAndCreate(page: Page) {
  await scan(page);
  await create(page);
}

async function create(page: Page) {
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addNames(page, "Jason");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

const isPut = (request: Request) => request.method() === "PUT" && request.url().endsWith("/photo");
const photoRow = (page: Page) => page.getByRole("button", { name: "Receipt", exact: true });
/** The Receipt link opens the full-screen viewer straight away. */
const viewPhoto = (page: Page) => photoRow(page).click();
const historyLink = (page: Page) => page.getByRole("button", { name: "History", exact: true });

/** Closes the pick sheet so the underlined links show, the Receipt link among them while the Split has a photo. */
async function openMore(page: Page) {
  const look = page.getByRole("button", { name: "Close, just look" });
  if (await look.isVisible()) await look.click();
  await expect(historyLink(page)).toBeVisible();
}

async function openAsGuest(browser: Browser, link: string) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  await page.getByRole("button", { name: "Close, just look" }).click();
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0);
  return page;
}

test.describe("on Chromium", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "The scan and the second browser run on one engine; the WebKit encoder has its own case below.");

  test("the Host's photo goes up once after create, View receipt opens it on a second browser, and home is fresh", async ({ page, browser }) => {
    test.setTimeout(150_000);
    const puts: Request[] = [];
    page.on("request", (request) => isPut(request) && puts.push(request));
    const created = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/splits"));

    await scanAndCreate(page);
    const { creatorSecret } = await (await created).json();
    await openMore(page);
    await expect(photoRow(page)).toBeVisible({ timeout: 2_000 });
    const body = new Uint8Array(puts[0].postDataBuffer()!);
    expect({ puts: puts.length, authorization: puts[0].headers().authorization, type: puts[0].headers()["content-type"] }).toEqual({
      puts: 1,
      authorization: `Bearer ${creatorSecret}`,
      type: "image/jpeg",
    });
    expect({ underCap: body.length <= 150 * KB, metadata: metadata(body) }).toEqual({ underCap: true, metadata: [] });

    const guest = await openAsGuest(browser, page.url());
    await viewPhoto(guest);
    const shown = guest.getByRole("img", { name: "Receipt photo" });
    await expect(shown).toBeVisible();
    const served = await guest.request.get(new URL(page.url()).pathname.replace(/^\/s\//, "/api/splits/") + "/photo");
    expect(Buffer.compare(await served.body(), Buffer.from(body))).toBe(0);
    await guest.getByRole("button", { name: "Close photo" }).click();
    await expect(shown).toHaveCount(0);
    await guest.context().close();

    await page.getByRole("button", { name: "Split a receipt" }).click();
    await expect(page.getByRole("button", { name: "Add the receipt" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("a scan kept across a visit to Recent splits and Back still sends its photo after Create", async ({ page, request, browserName }, testInfo) => {
    test.setTimeout(150_000);
    const earlier = await apiSplit(request, nextIp(browserName, testInfo.workerIndex));
    await page.goto(`/s/${earlier.id}`);
    await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
    const puts: Request[] = [];
    page.on("request", (request) => isPut(request) && puts.push(request));

    await scan(page);
    await page.getByRole("region", { name: "Recent splits" }).getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/s/${earlier.id}$`));
    await page.goBack();
    await expect(page.getByTestId("receipt")).toBeVisible();
    await create(page);

    await openMore(page);
    await expect(photoRow(page)).toBeVisible({ timeout: 2_000 });
    expect(puts.map((put) => new URL(put.url()).pathname)).toEqual([new URL(page.url()).pathname.replace(/^\/s\//, "/api/splits/") + "/photo"]);
  });

  test("a failed upload is tried once more and then left, and the More menu holds no Receipt photo", async ({ page }) => {
    test.setTimeout(150_000);
    let puts = 0;
    await page.route("**/api/splits/*/photo", (route) => {
      puts += 1;
      return route.fulfill({ status: 503 });
    });

    await scanAndCreate(page);
    await expect.poll(() => puts, live).toBe(2);
    await page.waitForTimeout(1_500);
    expect(puts).toBe(2);
    await openMore(page);
    await expect(photoRow(page)).toHaveCount(0);
  });

  test("the open More menu shows Receipt photo only while the Split has a photo", async ({ browser, request, browserName }, testInfo) => {
    const { id, creatorSecret } = await apiSplit(request, nextIp(browserName, testInfo.workerIndex));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guest = await context.newPage();
    const states: Record<string, unknown>[] = [];
    const clients: { send: (message: string) => void }[] = [];
    await guest.routeWebSocket(/\/parties\//, (client) => {
      const server = client.connectToServer();
      client.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        const frame = JSON.parse(String(message));
        if (frame.type === "state") states.push(frame);
        client.send(message);
      });
      clients.push(client);
    });
    await guest.goto(`/s/${id}`);
    await expect(guest.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
    await openMore(guest);
    await expect(photoRow(guest)).toHaveCount(0);

    expect((await putPhoto(request, id, creatorSecret, new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]))).status()).toBe(204);
    await expect(photoRow(guest)).toBeVisible(live);

    clients.at(-1)!.send(JSON.stringify({ ...states.at(-1), ref: null, photo: false }));
    await expect(photoRow(guest)).toHaveCount(0);
    await expect(historyLink(guest)).toBeVisible();
    await context.close();
  });

  test("when the photo goes away while the viewer is open the viewer closes, stays closed if a photo comes back, and Escape still closes a sheet", async ({ browser, request, browserName }, testInfo) => {
    const { id, creatorSecret } = await apiSplit(request, nextIp(browserName, testInfo.workerIndex));
    expect((await putPhoto(request, id, creatorSecret, new Uint8Array(readFileSync("e2e/fixtures/srd-1040-no-sprite.jpg")))).status()).toBe(204);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guest = await context.newPage();
    const states: Record<string, unknown>[] = [];
    const clients: { send: (message: string) => void }[] = [];
    await guest.routeWebSocket(/\/parties\//, (client) => {
      const server = client.connectToServer();
      client.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        const frame = JSON.parse(String(message));
        if (frame.type === "state") states.push(frame);
        client.send(message);
      });
      clients.push(client);
    });
    await guest.goto(`/s/${id}`);
    await expect(guest.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
    await openMore(guest);
    await viewPhoto(guest);
    await expect(guest.getByRole("button", { name: "Close photo" })).toBeVisible();

    const frame = states.at(-1)!;
    clients.at(-1)!.send(JSON.stringify({ ...frame, ref: null, photo: false }));
    await expect(guest.getByRole("button", { name: "Close photo" })).toHaveCount(0, live);
    clients.at(-1)!.send(JSON.stringify({ ...frame, ref: null, photo: true }));
    await expect(photoRow(guest)).toBeVisible(live);
    await expect(guest.getByRole("button", { name: "Close photo" })).toHaveCount(0);

    await historyLink(guest).click();
    await expect(guest.getByRole("dialog", { name: "History" })).toBeVisible();
    await guest.keyboard.press("Escape");
    await expect(guest.getByRole("dialog", { name: "History" })).toHaveCount(0, live);
    await context.close();
  });
});

test("the canvas JPEG of a 12 MP photo and of an EXIF-rotated one fits 150 KB, carries no metadata, reads upright, and the Worker stores it", async ({ page, request, browserName }, testInfo) => {
  await mountHarness(
    page,
    `import { receiptCopyOf } from "./src/ui/receipt-input/photo.web";
    const toBase64 = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    async function twelveMegapixels() {
      const canvas = Object.assign(document.createElement("canvas"), { width: 4000, height: 3000 });
      const context = canvas.getContext("2d");
      context.fillStyle = "#f4f1ea";
      context.fillRect(0, 0, 4000, 3000);
      context.fillStyle = "#222";
      context.font = "64px monospace";
      for (let line = 0; line < 40; line += 1) context.fillText("CHICKEN FRIED RICE      7.99   " + line, 200, 120 + line * 70);
      return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    }
    window.copyOf = async (base64) => {
      const photo = base64 ? new Blob([Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))], { type: "image/jpeg" }) : await twelveMegapixels();
      const copy = await receiptCopyOf(photo, []);
      if (!copy) return null;
      const bitmap = await createImageBitmap(copy);
      return { base64: toBase64(new Uint8Array(await copy.arrayBuffer())), width: bitmap.width, height: bitmap.height };
    };`,
  );
  const copyOf = (base64: string | null) =>
    page.evaluate((input) => (window as unknown as { copyOf: (b: string | null) => Promise<{ base64: string; width: number; height: number } | null> }).copyOf(input), base64);

  const rotated = await copyOf(readFileSync("e2e/fixtures/srd-1040-exif-rotated.jpg").toString("base64"));
  const large = await copyOf(null);
  const results = [rotated, large].map((copy) => {
    const bytes = Buffer.from(copy!.base64, "base64");
    return { bytes, look: { underCap: bytes.length <= 150 * KB, metadata: metadata(bytes), portrait: copy!.height > copy!.width, longEdge: Math.max(copy!.width, copy!.height) } };
  });
  expect(results.map(({ look }) => look)).toEqual([
    { underCap: true, metadata: [], portrait: true, longEdge: 1000 },
    { underCap: true, metadata: [], portrait: false, longEdge: 1280 },
  ]);

  const { id, creatorSecret } = await apiSplit(request, nextIp(browserName, testInfo.workerIndex));
  const stored = [];
  for (const { bytes } of results) stored.push((await putPhoto(request, id, creatorSecret, bytes)).status());
  expect(stored).toEqual([204, 204]);
});

for (const width of [390, 1440]) {
  test(`at ${width} px the History link and the Receipt link open the History sheet and the photo viewer, and each hands focus back to its link`, async ({ page, request, browserName }, testInfo) => {
    const { id, creatorSecret } = await apiSplit(request, nextIp(browserName, testInfo.workerIndex));
    expect((await putPhoto(request, id, creatorSecret, new Uint8Array(readFileSync("e2e/fixtures/srd-1040-no-sprite.jpg")))).status()).toBe(204);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/s/${id}`);
    await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
    await page.getByRole("button", { name: "Close, just look" }).click();
    const history = page.getByRole("dialog", { name: "History" });
    const shown = page.getByRole("img", { name: "Receipt photo" });

    await fromMore(page, "History");
    await expect(history).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0, live);
    await expect(historyLink(page), "History hands focus back").toBeFocused();

    await fromMore(page, "Receipt photo");
    await expect(shown, "Receipt opens the photo with no sheet first").toBeVisible();
    await expect(page.getByRole("dialog"), "the only dialog is the viewer").toHaveCount(1);
    await expect(page.getByRole("button", { name: "Close photo" }), "the viewer holds focus before Escape").toBeFocused();
    await page.keyboard.press("Escape");
    await expect(shown).toHaveCount(0, live);
    await expect(photoRow(page), "the viewer hands focus back").toBeFocused();

  });
}

test("on a wide screen a double click zooms the receipt photo at the pointer, a drag pans it, a ctrl-wheel pinch zooms further and a second double click puts it back", async ({ page, request, browserName }, testInfo) => {
  const { id, creatorSecret } = await apiSplit(request, nextIp(browserName, testInfo.workerIndex));
  expect((await putPhoto(request, id, creatorSecret, new Uint8Array(readFileSync("e2e/fixtures/srd-1040-no-sprite.jpg")))).status()).toBe(204);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/s/${id}`);
  await page.getByRole("button", { name: "Close, just look" }).click();
  await fromMore(page, "Receipt photo");
  const shown = page.getByRole("img", { name: "Receipt photo" });
  await expect(shown).toBeVisible();
  await page.waitForTimeout(600);
  const frame = (await shown.boundingBox())!;
  const widthNow = async () => Math.round((await shown.boundingBox())!.width);
  const settledWidth = async () => {
    let last = -1;
    await expect.poll(async () => ((await widthNow()) === last ? true : ((last = await widthNow()), false))).toBe(true);
    return widthNow();
  };

  const aim = { x: frame.x + frame.width * 0.25, y: frame.y + frame.height * 0.25 };
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.dblclick(aim.x, aim.y);
  expect(await settledWidth()).toBe(Math.round(frame.width * 2.5));
  const zoomed = (await shown.boundingBox())!;
  expect(Math.abs(aim.x - zoomed.x - (aim.x - frame.x) * 2.5), "the point under the pointer stays under it").toBeLessThan(2);

  await page.mouse.move(frame.x + 200, frame.y + 200);
  await page.mouse.down();
  await page.mouse.move(frame.x + 120, frame.y + 150, { steps: 4 });
  await page.mouse.up();
  const panned = (await shown.boundingBox())!;
  expect(Math.round(panned.x - zoomed.x), "the drag moved the photo 80 px left").toBe(-80);
  expect(Math.round(panned.y - zoomed.y)).toBe(-50);

  // Mobile WebKit has no mouse.wheel, so the pinch arrives as the ctrl-wheel event a trackpad sends.
  await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)!;
    target.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, { x: frame.x + 120, y: frame.y + 150 });
  expect(await settledWidth()).toBeGreaterThan(Math.round(frame.width * 2.5) + 20);

  await page.mouse.dblclick(frame.x + 200, frame.y + 200);
  expect(await settledWidth()).toBe(Math.round(frame.width));
  expect(Math.round((await shown.boundingBox())!.x)).toBe(Math.round(frame.x));
  await expect(page.getByRole("dialog")).toHaveCount(1);
});
