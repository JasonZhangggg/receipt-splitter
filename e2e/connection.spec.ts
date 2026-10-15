import { openExample } from "./files";
import { expect, test, type APIRequestContext, type Page } from "./without-ocr";

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

test("offline for more than 1.5 s shows the notice, and reconnecting clears it", async ({ page, context, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");

  await context.setOffline(true);
  await page.waitForTimeout(600);
  await expect(notice(page)).toHaveCount(0);
  await expect(notice(page)).toHaveText(offline, live);

  await context.setOffline(false);
  await expect(notice(page)).toHaveCount(0, { timeout: 30_000 });
});

test("a claim tap while offline says the connection is down and leaves the dot unclaimed, and after reconnecting it works", async ({ page, context, request }, { workerIndex }) => {
  await openAs(page, await createSplit(request, workerIndex), "Sam");
  await context.setOffline(true);

  await rice(page).click();
  await expect(page.getByText(failed)).toBeVisible(live);
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
  await expect(notice(page)).toHaveText(slow, { timeout: 6000 });
  await expect(rice(page)).toHaveAttribute("aria-pressed", "true", live);
  await expect(notice(page)).toHaveCount(0, live);
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
