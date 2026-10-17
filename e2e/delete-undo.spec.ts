import { still } from "./motion";
import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

type Row = { id: string; name: string; price: number };
const meal: Row[] = [
  { id: "rice", name: "Rice", price: 800 },
  { id: "pitcher", name: "Pitcher", price: 1200 },
  { id: "fries", name: "Fries", price: 650 },
];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, items: Row[] = meal): Promise<string> {
  creates += 1;
  const subtotal = items.reduce((sum, { price }) => sum + price, 0);
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.56.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: { items, adjustments: [], subtotal, total: subtotal },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
          { id: "priya", name: "Priya" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function openAs(browser: Browser, link: string, name: string, before: (page: Page) => void = () => {}): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.setViewportSize(phone);
  before(page);
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "Edit item" });
const rows = (page: Page) => page.locator('[data-testid^="line-"]').evaluateAll((lines) => lines.map((line) => line.textContent ?? ""));
const undo = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });

test("Delete lowers the Total by the Item's price, and Undo puts the Item back at its row with who had it and the same Total", async ({ browser, request }, { workerIndex }) => {
  const sam = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  await sam.getByRole("button", { name: "Pitcher, check for Sam" }).click();
  await expect(sam.getByRole("button", { name: /^Open Pitcher, \$12\.00, You, \$12\.00 yours$/ })).toBeVisible(live);
  const before = await rows(sam);
  const total = await sam.getByTestId("total").textContent();
  expect(total).toBe("$26.50");

  await sam.getByRole("button", { name: /^Open Pitcher/ }).click();
  await sheet(sam).getByRole("button", { name: "Delete item" }).click();
  await expect(sheet(sam)).toHaveCount(0, live);
  await expect(sam.getByText("Deleted Pitcher")).toBeVisible(live);
  await expect(sam.getByRole("button", { name: /^Open Pitcher/ })).toHaveCount(0);
  await expect(sam.getByTestId("total")).toHaveText("$14.50");

  await undo(sam).click();
  await expect(sam.getByRole("button", { name: /^Open Pitcher, \$12\.00, You, \$12\.00 yours$/ })).toBeVisible(live);
  expect(await rows(sam)).toEqual(before);
  await expect(sam.getByTestId("total")).toHaveText(total ?? "");
  await expect(sam.getByText("Deleted Pitcher")).toHaveCount(0, live);
});

test("Undo after another phone edited a different Item keeps that edit and brings the deleted Item back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await openAs(browser, link, "Sam");
  const priya = await openAs(browser, link, "Priya");
  await sam.getByRole("button", { name: "Rice, check for Sam" }).click();
  await expect(priya.getByRole("button", { name: /^Open Rice, \$8\.00, Sam$/ })).toBeVisible(live);

  await sam.getByRole("button", { name: /^Open Rice/ }).click();
  await sheet(sam).getByRole("button", { name: "Delete item" }).click();
  await expect(sam.getByText("Deleted Rice")).toBeVisible(live);
  await expect(priya.getByRole("button", { name: /^Open Rice/ })).toHaveCount(0, live);

  await priya.getByRole("button", { name: /^Open Fries/ }).click();
  await sheet(priya).getByRole("textbox", { name: "Price", exact: true }).fill("7.50");
  await sheet(priya).getByRole("button", { name: "Close" }).click();
  await expect(sam.getByRole("button", { name: /^Open Fries, \$7\.50/ })).toBeVisible(live);

  await undo(sam).click();
  for (const [page, who] of [[sam, "You, $8.00 yours"], [priya, "Sam"]] as const) {
    await expect(page.getByRole("button", { name: `Open Rice, $8.00, ${who}`, exact: true })).toBeVisible(live);
    await expect(page.getByRole("button", { name: /^Open Fries, \$7\.50/ })).toBeVisible();
  }
  const order = (page: Page) => page.locator('[data-testid^="line-"]').evaluateAll((lines) => lines.map((line) => /Rice|Pitcher|Fries/.exec(line.textContent ?? "")?.[0]));
  expect(await order(sam)).toEqual(["Rice", "Pitcher", "Fries"]);
  expect(await order(priya)).toEqual(["Rice", "Pitcher", "Fries"]);
});

test("when another phone deletes the Item, an open Edit item sheet closes itself", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await openAs(browser, link, "Sam");
  const priya = await openAs(browser, link, "Priya");

  await sam.getByRole("button", { name: /^Open Rice/ }).click();
  await expect(sheet(sam)).toBeVisible();
  await priya.getByRole("button", { name: /^Open Rice/ }).click();
  await sheet(priya).getByRole("button", { name: "Delete item" }).click();

  await expect(sheet(sam)).toHaveCount(0, live);
  await expect(sam.getByRole("button", { name: /^Open Rice/ })).toHaveCount(0, live);
  await expect(sam.getByRole("status").getByText("Rice was removed on another phone.")).toBeVisible(live);
});

test("with one Item left the trash is disabled, a tap says why, and nothing is sent", async ({ browser, request }, { workerIndex }) => {
  const sent: string[] = [];
  const sam = await openAs(browser, await createSplit(request, workerIndex, [meal[0]]), "Sam", (page) =>
    page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => typeof payload === "string" && sent.push(payload))),
  );
  await sam.getByRole("button", { name: /^Open Rice/ }).click();
  const trash = sheet(sam).getByRole("button", { name: "Delete item" });
  await expect(trash).toHaveAttribute("aria-disabled", "true");
  await still(trash);
  await expect(trash).toBeInViewport();

  await trash.click({ force: true });
  await expect(sam.getByText("A split needs at least one item.")).toBeVisible();
  await expect(sheet(sam)).toBeVisible();
  expect(sent.filter((frame) => frame.includes('"delete"'))).toEqual([]);

  await sheet(sam).getByRole("button", { name: "Close" }).click();
  await expect(sheet(sam)).toHaveCount(0, live);
  const note = await sam.getByText("A split needs at least one item.").boundingBox();
  const footer = await sam.getByTestId("footer").boundingBox();
  expect((note?.y ?? 0) + (note?.height ?? 0)).toBeLessThanOrEqual(footer?.y ?? 0);
});
