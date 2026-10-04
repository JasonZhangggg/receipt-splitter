import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const menu = {
  items: [
    { id: "pho", name: "Pho", price: 1420 },
    { id: "wings", name: "Wings", price: 1400 },
    { id: "tea", name: "Tea", price: 1600 },
  ],
  adjustments: [],
  subtotal: 4420,
  total: 4420,
};

const people = [
  { id: "jason", name: "Jason" },
  { id: "sam", name: "Sam" },
  { id: "priya", name: "Priya" },
];

const venmo = { service: "venmo", handle: "jason-z" };
const everyApp = [venmo, { service: "cashApp", handle: "jasonz" }, { service: "paypal", handle: "jasonzhang" }, { service: "zelle", handle: "jason@example.com" }];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, paymentHandles: readonly object[], receipt: object = menu): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${110 + workerIndex}.${creates}` },
    data: { split: { receipt, participants: people, paymentHandles } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function open(browser: Browser, link: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

async function pick(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });
const owe = (page: Page) => page.getByTestId("owe");
const breakdown = (page: Page) => page.getByTestId("breakdown");

test("a guest's collapsed bar shows Your share and no pay button, and the pay button waits in the breakdown it pulls up", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo]));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  const sheet = sam.getByTestId("split-sheet");
  const bar = sheet.getByRole("button", { name: "Your share $14.20, Show what you owe" });
  await expect(bar).toBeVisible(live);
  await expect(sheet.getByRole("link")).toHaveCount(0);
  await expect(sheet.getByTestId("split-link")).toHaveCount(0);

  await bar.click();
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $14.20 on Venmo" })).toBeVisible(live);
  await expect(sheet.getByTestId("split-link")).toHaveCount(0);
});

test("amounts of $1,000 and up show grouped by thousands on the receipt, the bar, the breakdown and the Zelle card, while pay links keep the plain amount", async ({ browser, request }, { workerIndex }) => {
  const banquet = {
    items: [
      { id: "omakase", name: "Omakase", price: 123_456 },
      { id: "tea", name: "Tea", price: 1_600 },
    ],
    adjustments: [],
    subtotal: 125_056,
    total: 125_056,
  };
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo, { service: "zelle", handle: "jason@example.com" }], banquet));
  await expect(sam.getByTestId("total")).toHaveText("$1,250.56");
  await pick(sam, "Sam");
  await circle(sam, "Omakase", "Sam").click();
  await expect(owe(sam)).toHaveText("$1,234.56", live);

  await owe(sam).click();
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $1,234.56 on Venmo" })).toHaveAttribute("href", "https://venmo.com/jason-z?txn=pay&amount=1234.56&note=Receipt%20split");
  await expect(breakdown(sam).getByTestId("zelle").getByText("$1,234.56", { exact: true })).toBeVisible();
  await expect(breakdown(sam).getByText("$1,234.56", { exact: true })).not.toHaveCount(0);
});

test("Sam's breakdown links each pay app at his $14.20 Share and shows the Zelle card, and Priya's shows Not paid with no buttons", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, everyApp);
  const sam = await open(browser, link);
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  await owe(sam).click();
  const pills = breakdown(sam).getByRole("link");
  await expect(pills).toHaveCount(3, live);
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $14.20 on Venmo" })).toHaveAttribute("href", "https://venmo.com/jason-z?txn=pay&amount=14.20&note=Receipt%20split");
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $14.20 on Cash App" })).toHaveAttribute("href", "https://cash.app/$jasonz/14.20");
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $14.20 on PayPal" })).toHaveAttribute("href", "https://paypal.me/jasonzhang/14.20USD");
  await expect(pills.first()).toHaveAttribute("target", "_blank");
  await expect(pills.first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(breakdown(sam).getByText("Venmo @jason-z · Cash App $jasonz · PayPal jasonzhang")).toBeVisible();
  const zelle = breakdown(sam).getByTestId("zelle");
  await expect(zelle.getByText("Pay Jason on Zelle")).toBeVisible();
  await expect(zelle.getByText("jason@example.com", { exact: true })).toBeVisible();
  await expect(zelle.getByText("$14.20", { exact: true })).toBeVisible();
  await expect(zelle.getByRole("button", { name: "Copy jason@example.com" })).toBeVisible();

  await sam.getByRole("button", { name: "Priya", exact: true }).click();
  await expect(breakdown(sam).getByText("Not paid", { exact: true })).toBeVisible(live);
  await expect(breakdown(sam).getByText("Priya owes")).toBeVisible();
  await expect(breakdown(sam).getByRole("link")).toHaveCount(0);
  await expect(breakdown(sam).getByRole("button")).toHaveCount(0);
});

test("Sam pays $22.00, a Claim from Priya's browser drops his Share to $14.00, and both browsers show what Jason owes back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Wings", "Sam").click();
  await circle(sam, "Tea", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await expect(owe(sam)).toHaveText("$22.00", live);

  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(breakdown(sam).getByRole("button", { name: "I haven't paid" })).toBeVisible(live);
  await expect(breakdown(sam).getByText("Paid", { exact: true })).toBeVisible(live);

  await priya.getByRole("button", { name: /^Open Tea/ }).click();
  await priya.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam" }).click();
  await priya.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Close" }).click();

  await expect(breakdown(sam).getByTestId("difference")).toHaveText("You paid $22.00. Jason owes you $8.00.", live);
  await expect(breakdown(sam).getByTestId("share")).toHaveText("$14.00");
  await expect(breakdown(sam).getByText("Your share")).toBeVisible();

  await expect(priya.getByTestId("item-sheet")).toHaveCount(0, live);
  await priya.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(breakdown(priya).getByTestId("difference")).toHaveText("Sam paid $22.00. Jason owes Sam $8.00.", live);
  await expect(breakdown(priya).getByText("Paid", { exact: true })).toBeVisible();
});

test("a name picked by a page that sent the browser's raw device id stays this phone's after the update, and no frame carries the raw id", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const splitId = new URL(link).pathname.split("/").pop()!;
  const { raw, frame } = await sam.evaluate(
    (room) =>
      new Promise<{ raw: string; frame: string }>((resolve) => {
        const raw = localStorage.getItem("receipt-splitter:device")!;
        const socket = new WebSocket(`ws://${location.host}/parties/split-server/${room}`);
        socket.addEventListener("message", ({ data }) => {
          const message = JSON.parse(data);
          if (message.type === "state" && message.ref === null) socket.send(JSON.stringify({ ref: "old", op: { by: "sam", type: "pick", participantId: "sam", device: raw, takeOver: false } }));
          if (message.ref === "old") {
            socket.close();
            localStorage.setItem(`receipt-splitter:split:${room}`, JSON.stringify({ me: "sam" }));
            resolve({ raw, frame: data });
          }
        });
      }),
    splitId,
  );
  expect([raw.length, frame.includes(raw), JSON.parse(frame).split.picks.length]).toEqual([16, false, 1]);

  await sam.reload();
  await expect(sam.getByRole("button", { name: "Sam, you", exact: true })).toBeVisible(live);
  await expect(sam.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0);
});

test("a recordPayment for Sam sent from Priya's phone is refused, and Sam stays Not paid", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  const splitId = new URL(link).pathname.split("/").pop();
  const answer = await priya.evaluate(
    (room) =>
      new Promise<unknown>((resolve) => {
        const device = localStorage.getItem("receipt-splitter:device");
        const socket = new WebSocket(`ws://${location.host}/parties/split-server/${room}`);
        let sent = false;
        socket.addEventListener("message", ({ data }) => {
          const message = JSON.parse(data);
          if (message.type === "state" && !sent) {
            sent = true;
            socket.send(JSON.stringify({ ref: "forged", op: { by: "sam", type: "recordPayment", participantId: "sam", device, amount: 1420 } }));
          }
          if (message.ref === "forged") {
            socket.close();
            resolve(message);
          }
        });
      }),
    splitId,
  );
  expect(answer).toEqual({ type: "rejected", ref: "forged", rejection: { reason: "payerOnly" } });

  await priya.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(breakdown(priya).getByText("Not paid", { exact: true })).toBeVisible(live);
  await expect(breakdown(priya).getByText("Sam owes")).toBeVisible();
  await sam.reload();
  await expect(owe(sam)).toHaveText("$14.20", live);
  await owe(sam).click();
  await expect(breakdown(sam).getByRole("button", { name: "I already paid" })).toBeVisible(live);
});
