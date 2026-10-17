import { expect, test, type APIRequestContext, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.setTimeout(90_000);

let tests = 0;

const question = (page: Page) => page.getByRole("heading", { name: "Which one are you?" });
const rows = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" }).getByRole("listitem");

async function apiSplit(request: APIRequestContext, ip: string): Promise<string> {
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": ip },
    data: {
      split: {
        receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

test("a friend's link opens its socket and hears the Split before the app's bundle has run, then the app takes that socket over", async ({ page, request }, { workerIndex }) => {
  const id = await apiSplit(request, `198.54.${workerIndex}.${(tests += 1)}`);
  let releaseBundle!: () => void;
  const held = new Promise<void>((resolve) => (releaseBundle = resolve));
  await page.route("**/_expo/static/js/**", async (route) => {
    await held;
    await route.continue();
  });
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));

  const early = page.waitForEvent("websocket", { timeout: 15_000 });
  void page.goto(`/s/${id}`, { waitUntil: "commit" });
  const socket = await early;
  expect(new URL(socket.url()).pathname).toBe(`/parties/split-server/${id}`);
  const hello = await socket.waitForEvent("framereceived", { timeout: 15_000 });
  expect(JSON.parse(String(hello.payload))).toMatchObject({ type: "state", ref: null, split: { id } });
  await expect(question(page)).toHaveCount(0);

  releaseBundle();
  await expect(question(page)).toBeVisible({ timeout: 30_000 });
  await expect(rows(page)).toHaveText(["Jason", "Sam"]);
  expect(sockets).toHaveLength(1);

  await page.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible();
  expect(sockets).toHaveLength(1);
});
