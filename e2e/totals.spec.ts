import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";
import { fromMore } from "./header";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

let creates = 0;

/** Items $44.00 under a Subtotal misread as $49.00; the Total, $55.33, was read right. */
async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.58.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: {
          items: [
            { id: "burger", name: "Smash Burger", price: 1650 },
            { id: "salad", name: "Kale Caesar", price: 1400 },
            { id: "fries", name: "Truffle Fries", price: 900 },
            { id: "soda", name: "Mexican Coke", price: 450 },
          ],
          adjustments: [
            { id: "tax", kind: "tax", name: "Tax", amount: 333 },
            { id: "tip", kind: "tip", name: "Tip", amount: 800 },
          ],
          subtotal: 4900,
          total: 5533,
        },
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

async function open(browser: Browser, link: string, name: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  return page;
}

const note = "Items add up to $44.00, but the receipt's subtotal is $49.00.";

test("Use the items' sum fixes a misread Subtotal on both phones and leaves the Total", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const jason = await open(browser, link, "Jason");
  const sam = await open(browser, link, "Sam");
  await expect(jason.getByText(note)).toBeVisible();

  await jason.getByRole("button", { name: "Open Subtotal, $49.00" }).click();
  const sheet = jason.getByTestId("totals-sheet");
  await expect(sheet.getByText("Edit subtotal")).toBeVisible();
  await expect(sheet.getByText("The items add up to $44.00.")).toBeVisible();
  await sheet.getByRole("button", { name: "Use $44.00" }).click();
  await expect(sheet.getByRole("textbox", { name: "Subtotal" })).toHaveValue("44.00");
  await expect(sheet.getByRole("button", { name: "Use $44.00" })).toBeHidden();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toBeHidden();

  for (const page of [jason, sam]) {
    await expect(page.getByRole("button", { name: "Open Subtotal, $44.00" })).toBeVisible(live);
    await expect(page.getByText(note)).toBeHidden(live);
    await expect(page.getByTestId("total")).toHaveText("$55.33");
  }

  await fromMore(sam, "History");
  await expect(sam.getByText("Subtotal down $5.00")).toBeVisible(live);
});

test("a Total typed by hand saves for both phones, and an empty field closes without saving", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const jason = await open(browser, link, "Jason");
  const sam = await open(browser, link, "Sam");

  await jason.getByRole("button", { name: "Open Total, $55.33" }).click();
  const sheet = jason.getByTestId("totals-sheet");
  const field = sheet.getByRole("textbox", { name: "Total" });
  await field.fill("");
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(jason.getByTestId("total")).toHaveText("$55.33");

  await jason.getByRole("button", { name: "Open Total, $55.33" }).click();
  await field.fill("60");
  await field.press("Enter");
  await expect(field).toHaveValue("60.00");
  await expect(sam.getByTestId("total")).toHaveText("$60.00", live);
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(jason.getByRole("button", { name: "Open Total, $60.00" })).toBeVisible(live);
});
