import { addSheet, openAdd } from "./add-menu";
import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";
import type { WebSocketRoute } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };
/** Long enough that anything shown before it is the page's own doing, short enough to wait out. */
const delayMs = 2500;
const early = { timeout: 1200 };

const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "tostones", name: "Tostones", price: 100 },
    { id: "sprite", name: "Sprite", price: 250 },
  ],
  adjustments: [],
  subtotal: 1150,
  total: 1150,
};

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.53.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: dinner,
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

/** What the test does to the wire. `hold` delays the server's answers to this phone's actions; `rewrite` changes a frame on its way to the server; `refuse` answers a frame itself and never sends it on. */
type Wire = {
  hold: boolean;
  rewrite?: (frame: { ref: string; op: Record<string, unknown> }) => { ref: string; op: Record<string, unknown> };
  refuse?: (frame: { ref: string; op: Record<string, unknown> }) => unknown;
  sent: { ref: string; op: Record<string, unknown> }[];
};

async function openAs(browser: Browser, link: string, name: string): Promise<{ page: Page; wire: Wire }> {
  const page = await (await newContext(browser)).newPage();
  const wire: Wire = { hold: false, sent: [] };
  await page.routeWebSocket(/split-server/, (client: WebSocketRoute) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      const frame = JSON.parse(String(message));
      if (frame.op) {
        wire.sent.push(frame);
        const reply = wire.refuse?.(frame);
        if (reply !== undefined) return client.send(JSON.stringify(reply));
        server.send(JSON.stringify(wire.rewrite ? wire.rewrite(frame) : frame));
      } else server.send(message);
    });
    server.onMessage((message) => {
      if (wire.hold && String(message).includes('"ref":"r')) setTimeout(() => client.send(message), delayMs);
      else client.send(message);
    });
  });
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("owe")).toBeVisible(live);
  wire.sent.length = 0;
  return { page, wire };
}

const circle = (page: Page, item: string, name = "Sam") => page.getByRole("button", { name: `${item}, check for ${name}` });
const owe = (page: Page) => page.getByTestId("owe");
const itemSheet = (page: Page) => page.getByRole("dialog", { name: "Edit item" });
const line = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^Open ${name},`) });
const savedFailed = "Couldn't save that. Check it and try again.";
const notSaved = "Couldn't save that.";

test("a claim dot and the footer Share change the moment of the tap, and a fast second tap unclaims", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const { page: sam, wire } = await openAs(browser, link, "Sam");
  wire.hold = true;

  await circle(sam, "Rice").click();
  await expect(circle(sam, "Rice")).toHaveAttribute("aria-pressed", "true", early);
  await expect(owe(sam)).toHaveText("$8.00", early);

  await circle(sam, "Rice").click();
  await expect(circle(sam, "Rice")).toHaveAttribute("aria-pressed", "false", early);
  await expect(owe(sam)).toHaveText("$0.00", early);
  expect(wire.sent.map(({ op }) => op.type)).toEqual(["claim", "unclaim"]);

  // The answers arrive late and change nothing the person sees.
  await sam.waitForTimeout(delayMs + 1500);
  await expect(circle(sam, "Rice")).toHaveAttribute("aria-pressed", "false");
  await expect(owe(sam)).toHaveText("$0.00");

  // The server agrees: after a reload nobody has the rice.
  wire.hold = false;
  await sam.reload();
  await expect(circle(sam, "Rice")).toHaveAttribute("aria-pressed", "false", live);
  await expect(owe(sam)).toHaveText("$0.00");
});

test("the Who had it dots in Edit item change at once too", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  await line(sam, "Rice").click();
  wire.hold = true;
  const who = itemSheet(sam).getByRole("group", { name: "Who had it" });
  await who.getByRole("button", { name: "Priya" }).click();
  await expect(who.getByRole("button", { name: "Priya" })).toHaveAttribute("aria-pressed", "true", early);
  await who.getByRole("button", { name: "Priya" }).click();
  await expect(who.getByRole("button", { name: "Priya" })).toHaveAttribute("aria-pressed", "false", early);
  expect(wire.sent.map(({ op }) => op.type)).toEqual(["claim", "unclaim"]);
});

test("a claim the server refuses goes back off the line and the bar says it didn't save", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  wire.hold = true;
  wire.rewrite = (frame) => ({ ...frame, op: { ...frame.op, itemId: "nothing-here" } });

  await circle(sam, "Rice").click();
  await expect(circle(sam, "Rice")).toHaveAttribute("aria-pressed", "true", early);
  await expect(owe(sam)).toHaveText("$8.00", early);

  await expect(sam.getByText(savedFailed)).toBeVisible(live);
  await expect(circle(sam, "Rice")).toHaveAttribute("aria-pressed", "false");
  await expect(owe(sam)).toHaveText("$0.00");
});

test("Delete closes the sheet and takes the line off at once; the Undo bar comes with the answer", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  await line(sam, "Sprite").click();
  wire.hold = true;
  await itemSheet(sam).getByRole("button", { name: "Delete item" }).click();

  await expect(itemSheet(sam)).toHaveCount(0, early);
  await expect(line(sam, "Sprite")).toHaveCount(0);
  await expect(sam.getByTestId("total")).toHaveText("$9.00");
  await expect(sam.getByText("Deleted Sprite")).toHaveCount(0);

  await expect(sam.getByText("Deleted Sprite")).toBeVisible(live);
  await sam.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(line(sam, "Sprite")).toBeVisible(early);
  await expect(sam.getByTestId("total")).toHaveText("$11.50", early);
});

test("a Delete the server refuses puts the line back and says so in the bar", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  await line(sam, "Sprite").click();
  wire.hold = true;
  wire.rewrite = (frame) => ({ ...frame, op: { ...frame.op, items: [{ type: "delete", itemId: "nothing-here" }] } });
  await itemSheet(sam).getByRole("button", { name: "Delete item" }).click();

  await expect(itemSheet(sam)).toHaveCount(0, early);
  await expect(line(sam, "Sprite")).toHaveCount(0);
  await expect(sam.getByText(savedFailed)).toBeVisible(live);
  await expect(line(sam, "Sprite")).toBeVisible();
  await expect(sam.getByTestId("total")).toHaveText("$11.50");
});

test("Add closes the sheet and shows the line at once, and a lost answer offers Try again, which adds it once", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  await openAdd(sam, "Item");
  const sheet = addSheet(sam);
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill("Nachos");
  await sheet.getByRole("textbox", { name: "Price", exact: true }).fill("9");
  wire.hold = true;
  await sheet.getByRole("button", { name: "Add item" }).click();

  await expect(addSheet(sam)).toHaveCount(0, early);
  await expect(line(sam, "Nachos")).toBeVisible(early);
  await expect(sam.getByTestId("total")).toHaveText("$20.50", early);
  await sam.waitForTimeout(delayMs + 500);
  await expect(line(sam, "Nachos")).toBeVisible();
  await expect(sam.getByTestId("total")).toHaveText("$20.50");

  // A second add whose answer is a rate limit that never reached the server.
  await openAdd(sam, "Item");
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill("Wings");
  await sheet.getByRole("textbox", { name: "Price", exact: true }).fill("5");
  wire.hold = false;
  let refused = false;
  wire.refuse = (frame) => {
    if (refused) return undefined;
    refused = true;
    return { type: "rejected", ref: frame.ref, rejection: { reason: "rateLimited", retryAfterMs: 1000 } };
  };
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(addSheet(sam)).toHaveCount(0, early);
  await expect(sam.getByText(notSaved, { exact: true })).toBeVisible(live);
  await expect(line(sam, "Wings")).toHaveCount(0);
  await sam.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(line(sam, "Wings")).toBeVisible(early);
  await expect(sam.getByTestId("total")).toHaveText("$25.50", live);

  const tries = wire.sent.filter(({ op }) => JSON.stringify(op).includes("Wings"));
  expect(tries).toHaveLength(2);
  expect(JSON.stringify(tries[0].op)).toEqual(JSON.stringify(tries[1].op));
  await sam.reload();
  await expect(line(sam, "Wings")).toHaveCount(1, live);
  await expect(line(sam, "Nachos")).toHaveCount(1);
  await expect(sam.getByTestId("total")).toHaveText("$25.50");
});

test("I already paid closes the sheet at once and shows Paid; it waits for a claim still in flight and pays that Share", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  const footer = sam.getByTestId("footer");
  wire.hold = true;

  // The claim has not been answered when the sheet opens, but its Share already counts.
  await circle(sam, "Rice").click();
  await expect(owe(sam)).toHaveText("$8.00", early);
  await footer.getByRole("button", { name: "Pay Jason" }).click();
  const pay = sam.getByTestId("breakdown");
  await pay.getByRole("button", { name: "I already paid" }).click();
  await expect(pay.getByRole("button", { name: "I already paid" })).toHaveAttribute("aria-busy", "true", early);
  await expect(pay).toBeVisible();

  // Once the claim is answered the payment goes out, for that Share, and the sheet closes with it showing.
  await expect(pay).toHaveCount(0, live);
  await expect(footer.getByRole("button", { name: "Paid" })).toHaveText("✓ Paid", early);
  expect(wire.sent.map(({ op }) => op.type)).toEqual(["claim", "recordPayment"]);
  expect(wire.sent[1].op).toMatchObject({ type: "recordPayment", participantId: "sam", amount: 800 });

  // The payment itself is still in flight, so a tap on "Mark as not paid" waits as well, and the button says so.
  await sam.getByRole("button", { name: "Paid" }).click();
  await pay.getByRole("button", { name: "Mark as not paid" }).click();
  await expect(pay.getByRole("button", { name: "Mark as not paid" })).toHaveAttribute("aria-busy", "true", early);

  // Once the payment is answered the clear goes out, and the open sheet shows it before its own answer.
  await expect(pay.getByRole("button", { name: "I already paid" })).toBeVisible(live);
  expect(wire.sent.map(({ op }) => op.type)).toEqual(["claim", "recordPayment", "clearPayment"]);
  await expect(sam.getByText("Marked $8.00 as paid")).toBeVisible(early);
  await expect(footer.getByRole("button", { name: "Paid" })).toHaveCount(0);
});

test("I already paid waits for a claim that is then refused, records nothing, and says the new Share", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  const footer = sam.getByTestId("footer");
  wire.hold = true;
  wire.rewrite = (frame) => (frame.op.itemId === "rice" ? { ...frame, op: { ...frame.op, itemId: "nothing-here" } } : frame);

  await circle(sam, "Tostones").click();
  await circle(sam, "Rice").click();
  await expect(owe(sam)).toHaveText("$9.00", early);
  await footer.getByRole("button", { name: "Pay Jason" }).click();
  const pay = sam.getByTestId("breakdown");
  await pay.getByRole("button", { name: "I already paid" }).click();
  await expect(pay.getByRole("button", { name: "I already paid" })).toHaveAttribute("aria-busy", "true", early);

  // The Rice claim is refused, so the Share the person agreed to ($9.00) is gone. Nothing is recorded; the sheet stays open and says what it is now.
  await expect(pay.getByText("Your share is now $1.00")).toBeVisible(live);
  // That line is the only message: the refusal that settled during the wait raises no bar over the sheet.
  await expect(sam.getByText(notSaved)).toHaveCount(0);
  await sam.waitForTimeout(800);
  await expect(sam.getByText(notSaved)).toHaveCount(0);
  await expect(owe(sam)).toHaveText("$1.00");
  await expect(pay.getByRole("button", { name: "I already paid" })).not.toHaveAttribute("aria-busy", "true");
  expect(wire.sent.map(({ op }) => op.type)).toEqual(["claim", "claim"]);
  await sam.screenshot({ path: ".verify/shot-share-now.png" });

  // A second tap records the Share on the page now.
  wire.hold = false;
  await pay.getByRole("button", { name: "I already paid" }).click();
  await expect(pay).toHaveCount(0, live);
  expect(wire.sent.map(({ op }) => op.type)).toEqual(["claim", "claim", "recordPayment"]);
  expect(wire.sent[2].op).toMatchObject({ type: "recordPayment", participantId: "sam", amount: 100 });
});

test("with nothing in flight, I already paid closes the sheet before the server answers, and Undo follows the answer", async ({ browser, request }, { workerIndex }) => {
  const { page: sam, wire } = await openAs(browser, await createSplit(request, workerIndex), "Sam");
  const footer = sam.getByTestId("footer");
  await circle(sam, "Rice").click();
  await expect(owe(sam)).toHaveText("$8.00", live);
  await footer.getByRole("button", { name: "Pay Jason" }).click();
  const pay = sam.getByTestId("breakdown");
  await expect(pay.getByRole("button", { name: "I already paid" })).toBeVisible(live);
  wire.hold = true;
  await pay.getByRole("button", { name: "I already paid" }).click();

  await expect(pay).toHaveCount(0, early);
  await expect(footer.getByRole("button", { name: "Paid" })).toHaveText("✓ Paid", early);
  await expect(sam.getByText("Marked $8.00 as paid")).toHaveCount(0);
  await expect(sam.getByText("Marked $8.00 as paid")).toBeVisible(live);
});
