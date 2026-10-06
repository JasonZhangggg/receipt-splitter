import { expect, newContext, test, type APIRequestContext, type Browser, type Locator, type Page } from "./without-ocr";

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
const zelle = { service: "zelle", handle: "jason@example.com" };
const everyApp = [venmo, { service: "cashApp", handle: "jasonz" }, { service: "paypal", handle: "jasonzhang" }, zelle];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, paymentHandles: readonly object[], receipt: object = menu, participants: readonly object[] = people): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${110 + workerIndex}.${creates}` },
    data: { split: { receipt, participants, paymentHandles } },
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

test("with no way to pay the Host, Sam's breakdown links no pay app and still lets him mark his $14.20 paid", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, []));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  await owe(sam).click();
  await expect(breakdown(sam).getByRole("button", { name: "I already paid" })).toBeVisible(live);
  await expect(breakdown(sam).getByRole("link")).toHaveCount(0);
  await expect(breakdown(sam).getByTestId("zelle")).toHaveCount(0);
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(breakdown(sam).getByRole("button", { name: "I haven't paid" })).toBeVisible(live);
  await expect(sam).toHaveURL(/\/s\//);
});

test("amounts of $1,000 and up show grouped by thousands on the receipt, the bar, the breakdown and Zelle's copy button, while pay links keep the plain amount", async ({ browser, request }, { workerIndex }) => {
  const banquet = {
    items: [
      { id: "omakase", name: "Omakase", price: 123_456 },
      { id: "tea", name: "Tea", price: 1_600 },
    ],
    adjustments: [],
    subtotal: 125_056,
    total: 125_056,
  };
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo, zelle], banquet));
  await expect(sam.getByTestId("total")).toHaveText("$1,250.56");
  await pick(sam, "Sam");
  await circle(sam, "Omakase", "Sam").click();
  await expect(owe(sam)).toHaveText("$1,234.56", live);

  await owe(sam).click();
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $1,234.56 on Venmo" })).toHaveAttribute("href", "https://venmo.com/jason-z?txn=pay&amount=1234.56&note=Receipt%20split");
  await breakdown(sam).getByRole("combobox", { name: "Pay with" }).selectOption("zelle");
  await expect(breakdown(sam).getByRole("button", { name: "Copy jason@example.com to pay Jason $1,234.56 on Zelle" })).toBeVisible();
  await expect(breakdown(sam).getByText("$1,234.56", { exact: true })).not.toHaveCount(0);
});

test("with Zelle the only way to pay, Sam's one pill copies the Zelle handle, shows Copied, and offers no app to switch to", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, [zelle]));
  await sam.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  await owe(sam).click();
  const pill = breakdown(sam).getByRole("button", { name: "Copy jason@example.com to pay Jason $14.20 on Zelle" });
  await expect(pill).toHaveText(/^Pay\s*Jason\s*\$14\.20 on\sZelle$/, live);
  await expect(breakdown(sam).getByRole("combobox")).toHaveCount(0);
  await expect(breakdown(sam).getByText("Zelle\u00a0jason@example.com", { exact: true })).toBeVisible();
  await expect(breakdown(sam).getByRole("button", { name: /^Copy \$/ })).toHaveCount(0);
  await pill.click();
  await expect(breakdown(sam).getByRole("button", { name: "Copied" })).toHaveText("Copied");
  expect(await sam.evaluate(() => navigator.clipboard.readText())).toBe("jason@example.com");
  await expect(pill).toHaveText(/^Pay\s*Jason\s*\$14\.20 on\sZelle$/);
});

test("Sam's one pay pill switches among Jason's four apps, links each at his $14.20 Share, copies the Zelle handle, and keeps his pick after a reload", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, everyApp);
  const sam = await open(browser, link);
  await sam.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  await owe(sam).click();
  const app = breakdown(sam).getByRole("combobox", { name: "Pay with" });
  await expect(app).toHaveValue("venmo", live);
  expect(await app.locator("option").allTextContents()).toEqual(["Venmo", "Cash App", "PayPal", "Zelle"]);
  const pills = breakdown(sam).getByRole("link");
  await expect(pills).toHaveCount(1);
  await expect(pills).toHaveAccessibleName("Pay Jason $14.20 on Venmo");
  await expect(pills).toHaveAttribute("href", "https://venmo.com/jason-z?txn=pay&amount=14.20&note=Receipt%20split");
  await expect(pills).toHaveAttribute("target", "_blank");
  await expect(pills).toHaveAttribute("rel", "noopener noreferrer");
  await expect(breakdown(sam).getByText("Venmo\u00a0@jason-z\u00a0· Cash App\u00a0$jasonz\u00a0· PayPal\u00a0jasonzhang\u00a0· Zelle\u00a0jason@example.com")).toBeVisible();

  await app.selectOption("cashApp");
  await expect(pills).toHaveAccessibleName("Pay Jason $14.20 on Cash App");
  await expect(pills).toHaveAttribute("href", "https://cash.app/$jasonz/14.20");
  await app.selectOption("paypal");
  await expect(pills).toHaveAccessibleName("Pay Jason $14.20 on PayPal");
  await expect(pills).toHaveAttribute("href", "https://paypal.me/jasonzhang/14.20USD");

  await app.selectOption("zelle");
  await expect(pills).toHaveCount(0);
  const copy = breakdown(sam).getByRole("button", { name: "Copy jason@example.com to pay Jason $14.20 on Zelle" });
  await copy.click();
  await expect(breakdown(sam).getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await sam.evaluate(() => navigator.clipboard.readText())).toBe("jason@example.com");
  await app.selectOption("venmo");
  await expect(pills).toHaveAccessibleName("Pay Jason $14.20 on Venmo");
  await expect(breakdown(sam).getByRole("button", { name: "Copied" })).toHaveCount(0);
  await app.selectOption("zelle");
  await expect(copy).toBeVisible();

  await sam.reload();
  await expect(owe(sam)).toHaveText("$14.20", live);
  await owe(sam).click();
  await expect(app).toHaveValue("zelle", live);
  await expect(copy).toBeVisible();
});

test("Priya's breakdown shows Not paid with no buttons", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, everyApp));
  await pick(sam, "Sam");
  await sam.getByRole("button", { name: "Priya", exact: true }).click();
  await expect(breakdown(sam).getByText("Not paid", { exact: true })).toBeVisible(live);
  await expect(breakdown(sam).getByText("Priya owes")).toBeVisible();
  await expect(breakdown(sam).getByRole("link")).toHaveCount(0);
  await expect(breakdown(sam).getByRole("combobox")).toHaveCount(0);
  await expect(breakdown(sam).getByRole("button")).toHaveAccessibleName("Priya owes $0.00, Hide Priya's breakdown");
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

const longHost = "Alexandra Papadopoulos";
const bigReceipt = { items: [{ id: "grill", name: "Grill", price: 123456 }], adjustments: [], subtotal: 123456, total: 123456 };

async function pillAt(browser: Browser, request: APIRequestContext, workerIndex: number, handles: readonly { service: string; handle: string }[], width: number) {
  const link = await createSplit(request, workerIndex, handles, bigReceipt, [{ id: "jason", name: longHost }, ...people.slice(1)]);
  const sam = await open(browser, link);
  await sam.setViewportSize({ width, height: 640 });
  await pick(sam, "Sam");
  await sam.getByRole("button", { name: "Grill, check for Sam" }).click();
  await expect(owe(sam)).toHaveText("$1,234.56", live);
  await owe(sam).click();
  const pill = breakdown(sam).getByRole("link", { name: `Pay ${longHost} $1,234.56 on Venmo` });
  await expect(pill).toBeVisible(live);
  return pill;
}

const readPill = (pill: Locator) =>
  pill.evaluate((el, host) => {
    const box = el.getBoundingClientRect();
    const texts = [...el.querySelectorAll("div, span")].filter((each) => each.children.length === 0 && each.textContent);
    const name = texts.find((each) => (each.textContent ?? "").startsWith(host));
    const clipped = (each: Element) => each.scrollWidth > each.clientWidth;
    const outside = (each: Element) => { const r = each.getBoundingClientRect(); return r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5; };
    return {
      height: box.height,
      rowsOfText: new Set(texts.map((each) => Math.round(each.getBoundingClientRect().top + each.getBoundingClientRect().height / 2))).size,
      wrapped: texts.filter((each) => each.getBoundingClientRect().height > 1.5 * parseFloat(getComputedStyle(each).lineHeight)).map((each) => each.textContent),
      nameClipped: name === undefined ? null : clipped(name),
      slack: box.width - 48 - (Math.max(...texts.map((each) => each.getBoundingClientRect().right)) - Math.min(...texts.map((each) => each.getBoundingClientRect().left))),
      nameWidth: name?.getBoundingClientRect().width ?? 0,
      othersClipped: texts.filter((each) => each !== name && (clipped(each) || outside(each))).map((each) => each.textContent),
      text: texts.map((each) => each.textContent ?? "").join(""),
      overflow: el.scrollHeight - el.clientHeight,
    };
  }, longHost);

for (const [ways, handles, app] of [["one way", [venmo], "Venmo"], ["four ways", everyApp, "Venmo"]] as const) {
  test(`at 320 px a Host named ${longHost} owed $1,234.56 keeps one 54 px line with ${ways} to pay, the name ellipsized and the amount and ${app} whole`, async ({ browser, request }, { workerIndex }) => {
    const read = await readPill(await pillAt(browser, request, workerIndex, handles, 320));
    expect(read.height).toBeCloseTo(54, 1);
    expect(read.overflow).toBeLessThanOrEqual(0);
    expect(read.rowsOfText).toBe(1);
    expect(read.wrapped).toEqual([]);
    expect(read.nameClipped).toBe(true);
    expect(read.othersClipped).toEqual([]);
    expect(read.text).toContain("Pay ");
    expect(read.text).toContain(" $1,234.56 on");
    expect(read.text).toContain(app);
  });
}

async function samPill(browser: Browser, request: APIRequestContext, workerIndex: number, width: number) {
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo], menu, [{ id: "jason", name: longHost }, ...people.slice(1)]));
  await sam.setViewportSize({ width, height: 640 });
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await owe(sam).click();
  const pill = breakdown(sam).getByRole("link", { name: `Pay ${longHost} $14.20 on Venmo` });
  await expect(pill).toBeVisible(live);
  return readPill(pill);
}

test(`at 393 px ${longHost} shrinks only by the room it lacks, with no fixed cap, on one 54 px line`, async ({ browser, request }, { workerIndex }) => {
  const read = await samPill(browser, request, workerIndex, 393);
  expect(read.height).toBeCloseTo(54, 1);
  expect(read.rowsOfText).toBe(1);
  expect(read.nameClipped).toBe(true);
  expect(read.nameWidth).toBeGreaterThan(112);
  expect(Math.abs(read.slack)).toBeLessThan(1);
  expect(read.othersClipped).toEqual([]);
});

// Linux CI fonts set the name a few px wider than macOS, so this width leaves room on both.
test(`at 480 px the full name ${longHost} shows without an ellipsis on one 54 px line`, async ({ browser, request }, { workerIndex }) => {
  const read = await samPill(browser, request, workerIndex, 480);
  expect(read.height).toBeCloseTo(54, 1);
  expect(read.rowsOfText).toBe(1);
  expect(read.nameClipped).toBe(false);
  expect(read.othersClipped).toEqual([]);
  expect(read.text).toBe(`Pay ${longHost} $14.20 on\u00a0Venmo`);
});

test("the picker overlay leaves no stray app name in the accessibility tree ahead of the Pay with combobox", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, everyApp));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await owe(sam).click();
  await expect(breakdown(sam).getByRole("combobox", { name: "Pay with" })).toBeVisible(live);
  const tree = await breakdown(sam).ariaSnapshot();
  const before = tree.slice(0, tree.indexOf('combobox "Pay with"'));
  expect(before).toContain("Pay Jason $14.20 on Venmo");
  expect(before.split("\n").filter((line) => /^\s*- text: Venmo$/.test(line))).toEqual([]);
  expect(before.replace(/- link "Pay Jason \$14\.20 on Venmo"[^\n]*/, "")).not.toMatch(/Venmo/);
});
