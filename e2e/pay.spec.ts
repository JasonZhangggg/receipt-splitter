import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";
import { fromMore, viewAs } from "./header";

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
  await expect(page.getByTestId("owe")).toBeVisible(live);
}

const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });
const owe = (page: Page) => page.getByTestId("owe");
const breakdown = (page: Page) => page.getByTestId("breakdown");
const note = (page: Page) => page.getByTestId("footer").getByTestId("share-note");

test("a guest's footer shows Your share and the Pay Jason pill, and the pay button waits in the Pay sheet it opens", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo]));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  const footer = sam.getByTestId("footer");
  await expect(footer.getByRole("button", { name: "Your share $14.20, Show what you owe" })).toBeVisible(live);
  await expect(footer.getByRole("link")).toHaveCount(0);
  await expect(footer.getByTestId("share-bar")).toHaveCount(0);

  await footer.getByRole("button", { name: "Pay Jason" }).click();
  await expect(breakdown(sam).getByRole("link", { name: "Pay Jason $14.20 on Venmo" })).toBeVisible(live);
});

test("a payer's Pay Jason pill is there but disabled until something is claimed, and the Host has none", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  await pick(sam, "Sam");
  const pill = sam.getByTestId("footer").getByRole("button", { name: "Pay Jason" });
  await expect(pill).toHaveAttribute("aria-disabled", "true", live);
  await expect(sam.getByTestId("owe")).toHaveText("$0.00");

  await circle(sam, "Pho", "Sam").click();
  await expect(sam.getByTestId("owe")).toHaveText("$14.20", live);
  await expect(pill).not.toHaveAttribute("aria-disabled", "true", live);

  const samAgain = await sam.context().newPage();
  await samAgain.goto(link);
  await expect(samAgain.getByTestId("owe")).toHaveText("$14.20", live);
  await expect(samAgain.getByTestId("footer").getByRole("button", { name: "Pay Jason" })).not.toHaveAttribute("aria-disabled", "true");
  await circle(samAgain, "Pho", "Sam").click();
  await expect(sam.getByTestId("owe")).toHaveText("$0.00", live);
  await expect(pill).toHaveAttribute("aria-disabled", "true", live);

  const jason = await open(browser, link);
  await pick(jason, "Jason");
  await expect(jason.getByTestId("footer").getByRole("button", { name: /^Pay / })).toHaveCount(0);
});

test("the Host's footer has, in Pay's place, a count of who has paid that opens Payments and reads All paid once everyone has", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const jason = await open(browser, link);
  await pick(jason, "Jason");
  const footer = jason.getByTestId("footer");
  await expect(footer.getByRole("button", { name: "Payments", exact: true })).toBeVisible(live);

  const sam = await open(browser, link);
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await expect(footer.getByRole("button", { name: "0 of 1 paid, Payments" })).toBeVisible(live);
  await expect(footer.getByTestId("share-note")).toHaveCount(0);
  await footer.getByRole("button", { name: "0 of 1 paid, Payments" }).click();
  await expect(jason.getByRole("dialog", { name: "Payments" }).getByText("Everyone pays Jason.")).toBeVisible(live);
  await jason.keyboard.press("Escape");

  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(footer.getByRole("button", { name: "All paid, Payments" })).toBeVisible(live);
});

test("the Pay sheet lists the viewer's Items under What you had and Adjustment parts under Your part of tax and tip, its total equals the footer share, and You on the rows is in the strong ink", async ({ browser, request }, { workerIndex }) => {
  const taxed = { ...menu, adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 400 }, { id: "tip", kind: "tip", name: "Tip", amount: 600 }], subtotal: 4420, total: 5420 };
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo], taxed));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await circle(sam, "Tea", "Sam").click();
  await expect(owe(sam)).toHaveText("$37.03", live);
  const color = (text: string, row: string) => sam.getByTestId(row).getByText(text, { exact: true }).evaluate((el) => getComputedStyle(el).color);
  expect([await color("You", "line-pho"), await color("Nobody yet", "line-wings")]).toEqual(["rgb(23, 23, 23)", "rgb(115, 115, 115)"]);
  await owe(sam).click();
  const sheet = breakdown(sam);
  await expect(sheet.getByText("Pho", { exact: true })).toBeVisible(live);
  await expect(sheet.getByText("2 items", { exact: true })).toBeVisible();
  const order = await sheet.evaluate((el) =>
    ["What you had", "Pho", "Your part of tax and tip", "Tax"].map((text) => [...el.querySelectorAll("div, h3")].find((node) => node.textContent === text && node.children.length === 0)!.getBoundingClientRect().top),
  );
  expect(order.every((y, i) => i === 0 || y > order[i - 1])).toBe(true);
  await expect(sheet.getByText("Tea", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Wings")).toHaveCount(0);
  await expect(sheet.getByText("Tax", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Tip", { exact: true })).toBeVisible();
  await expect(sheet.getByTestId("share")).toHaveText("$37.03");
  await expect(sheet.getByText("$14.20", { exact: true })).toBeVisible();
  await expect(sheet.getByText("$16.00", { exact: true })).toBeVisible();
});

test("I already paid marks the viewer paid and Undo reverts it", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo]));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(sam.getByRole("status").getByText("Marked $14.20 as paid")).toBeVisible(live);
  await expect(sam.getByTestId("breakdown")).toHaveCount(0, live);
  const footer = sam.getByTestId("footer");
  await expect(footer.getByRole("button", { name: "Paid" })).toHaveText("✓ Paid");

  await sam.getByRole("button", { name: "Undo" }).click();
  await expect(footer.getByRole("button", { name: "Pay Jason" })).toBeVisible(live);
  await footer.getByRole("button", { name: "Pay Jason" }).click();
  await expect(breakdown(sam).getByRole("button", { name: "I already paid" })).toBeVisible(live);
});

test("Undo after I paid the rest returns to the earlier payment instead of clearing it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);
  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(sam.getByTestId("footer").getByRole("button", { name: "Paid" })).toHaveText("✓ Paid", live);
  // The Undo bar comes with the server's answer, after the optimistic "✓ Paid", so wait for it to show before waiting for it to go.
  await expect(sam.getByRole("status").getByText("Marked $14.20 as paid")).toBeVisible(live);
  await expect(sam.getByRole("status").getByText("Marked $14.20 as paid")).toHaveCount(0, { timeout: 10_000 });

  await priya.getByRole("button", { name: /^Open Tea/ }).click();
  await priya.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam" }).click();
  await priya.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();
  await expect(note(sam)).toHaveText("Paid $14.20 · $16.00 still owed", live);

  await owe(sam).click();
  await expect(breakdown(sam).getByText("Paid", { exact: true })).toBeVisible();
  await expect(breakdown(sam).getByTestId("paid-so-far")).toHaveText("$14.20");
  await expect(breakdown(sam).getByText("Left to pay", { exact: true })).toBeVisible();
  await expect(breakdown(sam).getByTestId("left-to-pay")).toHaveText("$16.00");
  await breakdown(sam).getByRole("button", { name: "I paid the rest" }).click();
  await expect(sam.getByRole("status").getByText("Marked $16.00 as paid")).toBeVisible(live);
  await expect(sam.getByTestId("footer").getByRole("button", { name: "Paid" })).toHaveText("✓ Paid", live);

  await sam.getByRole("button", { name: "Undo" }).click();
  await expect(note(sam)).toHaveText("Paid $14.20 · $16.00 still owed", live);
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
  await expect(sam.getByTestId("footer").getByRole("button", { name: "Paid" })).toBeVisible(live);
  await sam.getByTestId("footer").getByRole("button", { name: "Paid" }).click();
  await expect(breakdown(sam).getByRole("button", { name: "Mark as not paid" })).toBeVisible(live);
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
  await expect(pill).toHaveText("ZZelle", live);
  await expect(breakdown(sam).getByRole("combobox")).toHaveCount(0);
  await expect(breakdown(sam).getByText("Zelle\u00a0jason@example.com", { exact: true })).toBeVisible();
  await expect(breakdown(sam).getByRole("button", { name: /^Copy \$/ })).toHaveCount(0);
  await pill.click();
  await expect(breakdown(sam).getByRole("button", { name: "Copied" })).toHaveText("Copied");
  expect(await sam.evaluate(() => navigator.clipboard.readText())).toBe("jason@example.com");
  await expect(pill).toHaveText("ZZelle");
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
  await expect(breakdown(sam).getByText("Venmo\u00a0@jason-z", { exact: true })).toBeVisible();
  const handles = () => breakdown(sam).evaluate((node) => node.textContent ?? "");
  expect(await handles()).toContain("Venmo\u00a0@jason-z");
  for (const other of ["Cash App\u00a0", "PayPal\u00a0", "Zelle\u00a0"]) expect(await handles()).not.toContain(other);
  await expect(breakdown(sam).getByText("·")).toHaveCount(0);

  await app.selectOption("cashApp");
  await expect(pills).toHaveAccessibleName("Pay Jason $14.20 on Cash App");
  await expect(pills).toHaveAttribute("href", "https://cash.app/$jasonz/14.20");
  await expect(breakdown(sam).getByText("Cash App\u00a0$jasonz", { exact: true })).toBeVisible();
  expect(await handles()).toContain("Cash App\u00a0$jasonz");
  expect(await handles()).not.toContain("Venmo\u00a0");
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

test("Priya's breakdown, before anyone pays, has no paid line under her share and no buttons", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, everyApp));
  await pick(sam, "Sam");
  await viewAs(sam, "Priya");
  await sam.getByRole("button", { name: /, Show Priya's breakdown$/ }).click();
  await expect(breakdown(sam).getByRole("heading", { name: "Priya's share" })).toBeVisible(live);
  await expect(note(sam)).toHaveCount(0);
  await expect(breakdown(sam).getByRole("link")).toHaveCount(0);
  await expect(breakdown(sam).getByRole("combobox")).toHaveCount(0);
  await expect(breakdown(sam).getByRole("button")).toHaveAccessibleName("Close");
});

test("Sam pays $22.00, a Claim from Priya's browser drops his Share to $14.00, and both browsers say he paid $8.00 too much", async ({ browser, request }, { workerIndex }) => {
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
  await expect(sam.getByTestId("footer").getByRole("button", { name: "Paid" })).toBeVisible(live);
  await sam.getByTestId("footer").getByRole("button", { name: "Paid" }).click();
  await expect(breakdown(sam).getByRole("button", { name: "Mark as not paid" })).toBeVisible(live);
  await expect(note(sam)).toHaveCount(0);

  await priya.getByRole("button", { name: /^Open Tea/ }).click();
  await priya.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Sam" }).click();
  await priya.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Close" }).click();

  await expect(note(sam)).toHaveText("Paid $22.00 · $8.00 too much", live);
  await expect(breakdown(sam).getByTestId("share")).toHaveText("$14.00");
  await expect(breakdown(sam).getByRole("heading", { name: "Pay Jason" })).toBeVisible();

  await expect(priya.getByTestId("item-sheet")).toHaveCount(0, live);
  await viewAs(priya, "Sam");
  await priya.getByRole("button", { name: /, Show Sam's breakdown$/ }).click();
  await expect(note(priya)).toHaveText("Paid $22.00 · $8.00 too much", live);
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
  await expect(sam.getByTestId("owe")).toBeVisible(live);
  await expect(sam.getByRole("heading", { name: "Which one are you?" })).toHaveCount(0);
});

test("Priya checks herself off directly, but checking Sam off asks first, and History shows she did it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Pho", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  await fromMore(priya, "Payments");
  const ask = priya.getByRole("dialog", { name: "Mark Sam paid?" });
  await paymentsList(priya).getByRole("button", { name: "Mark Sam paid" }).click();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0, live);
  await expect(paymentRow(priya, "Sam")).toHaveAttribute("data-state", "unpaid");

  await paymentsList(priya).getByRole("button", { name: "Mark Sam paid" }).click();
  await ask.getByRole("button", { name: "Mark paid" }).click();
  await expect(paymentRow(priya, "Sam")).toHaveAttribute("data-state", "settled", live);
  await expect(sam.getByTestId("footer").getByRole("button", { name: "Paid" })).toBeVisible(live);

  await paymentsList(priya).getByRole("button", { name: "Mark Priya paid" }).click();
  await expect(priya.getByRole("dialog", { name: "Mark Priya paid?" })).toHaveCount(0);
  await expect(paymentRow(priya, "Priya")).toHaveAttribute("data-state", "settled", live);

  await priya.keyboard.press("Escape");
  await paymentsList(priya).waitFor({ state: "detached" });
  await fromMore(priya, "History");
  await expect(priya.getByRole("dialog", { name: "History" })).toContainText("Sam paid $14.20Priya", live);
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
  expect(before.replace(/- link "Pay Jason \$14\.20 on Venmo"[^\n]*/, "").replace("- text: V Venmo", "")).not.toMatch(/Venmo/);
});

test("the pill's visible label is only the app mark and the method, with the full sentence kept as its accessible name", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, everyApp, menu, [{ id: "jason", name: "Alexandra Papadopoulos" }, ...people.slice(1)]));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await owe(sam).click();
  const pill = breakdown(sam).getByRole("link", { name: "Pay Alexandra Papadopoulos $14.20 on Venmo" });
  await expect(pill).toHaveText("VVenmo", live);
  expect(await pill.evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(54, 1);
  const picker = breakdown(sam).getByRole("combobox", { name: "Pay with" });
  const box = await picker.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

const paymentsList = (page: Page) => page.getByTestId("payments");
const paymentRow = (page: Page, name: string) => paymentsList(page).getByRole("listitem").filter({ hasText: name });
/** The glyphs in a row: a check once that person has paid in full or more, and none before. */
const markOf = async (page: Page, name: string) => paymentRow(page, name).locator("[data-icon]").evaluateAll((all) => all.map((one) => one.getAttribute("data-icon")));

test("Payments on Priya's phone follows Sam: Not paid, Paid once he marks it, then still owed when his share grows, with each person's Items under their name", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Tea", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await expect(owe(sam)).toHaveText("$8.00", live);

  await fromMore(priya, "Payments");
  await expect(priya.getByTestId("payments-summary")).toHaveText("0 of 2 paid", live);
  // Jason paid the bill, so he lists like everyone else, with the paid, after everyone who still owes.
  await expect(paymentsList(priya).getByRole("listitem")).toHaveText([/^Priya/, /^Sam/, /^Jason/]);
  await expect(paymentsList(priya).getByRole("heading")).toHaveCount(0);
  await expect(priya.getByRole("dialog", { name: "Payments" }).getByText("Everyone pays Jason.")).toBeVisible();
  await expect(paymentRow(priya, "Sam")).toHaveText("Sam½ Tea$8.00Not paid");
  await expect(paymentRow(priya, "Priya")).toHaveText("Priya · you½ Tea$8.00Not paid");
  await expect(paymentRow(priya, "Jason")).toHaveText("Jason · gets paid$0.00Paid the bill");
  await expect(priya.getByTestId("nobody-yet")).toHaveText("Nobody yetPho, Wings$28.20Unclaimed");
  expect([await markOf(priya, "Sam"), await markOf(priya, "Priya")]).toEqual([[], []]);
  await expect(paymentRow(priya, "Sam")).toHaveAttribute("data-state", "unpaid");
  // Anyone with a name can check anyone off; checking someone else off asks first.
  await expect(paymentsList(priya).getByRole("button", { name: "Mark Priya paid" })).toBeVisible();
  await expect(paymentsList(priya).getByRole("button", { name: "Mark Sam paid" })).toBeVisible();

  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(paymentRow(priya, "Sam")).toHaveText("Sam½ Tea$8.00Paid", live);
  await expect(priya.getByTestId("payments-summary")).toHaveText("1 of 2 paid");
  await expect(paymentRow(priya, "Sam")).toHaveAttribute("data-state", "settled");
  await expect(paymentsList(priya).getByRole("listitem")).toHaveText([/^Priya/, /^Jason/, /^Sam/]);
  expect(await markOf(priya, "Sam")).toEqual(["check"]);

  await circle(sam, "Pho", "Sam").click();
  await expect(paymentRow(priya, "Sam")).toHaveText("SamPho, ½ Tea$22.20Paid $8.00 · $14.20 still owed", live);
  await expect(priya.getByTestId("payments-summary")).toHaveText("0 of 2 paid");
  expect(await markOf(priya, "Sam")).toEqual([]);
  await circle(sam, "Pho", "Sam").click();
  await expect(paymentRow(priya, "Sam")).toHaveText("Sam½ Tea$8.00Paid", live);

  await priya.getByRole("button", { name: "Close", exact: true }).click();
  await expect(paymentsList(priya)).toHaveCount(0, live);
  await circle(priya, "Tea", "Priya").click();
  await fromMore(priya, "Payments");
  await expect(paymentRow(priya, "Sam")).toHaveText("SamTea$16.00Paid $8.00 · $8.00 still owed", live);
  await expect(paymentRow(priya, "Sam")).toHaveAttribute("data-state", "short");
});

test("the People sheet rows show no check or exclamation mark and keep their plain names, however the payments stand", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Tea", "Sam").click();
  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect(sam.getByTestId("footer").getByRole("button", { name: "Paid" })).toBeVisible(live);
  await circle(priya, "Tea", "Priya").click();
  for (const page of [sam, priya]) {
    await page.getByRole("button", { name: "People", exact: true }).click();
    const rows = page.getByRole("dialog", { name: "People" });
    await expect(rows.locator('[data-icon="check"]')).toHaveCount(0);
    await expect(rows.locator('[data-icon="exclaim"]')).toHaveCount(0);
  }
});

test("Payments lists Sam as paid too much once Priya checks Tea too, and the muted you tag marks only the viewer's row", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Tea", "Sam").click();
  await expect(owe(sam)).toHaveText("$16.00", live);
  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await circle(priya, "Tea", "Priya").click();

  await fromMore(priya, "Payments");
  await expect(paymentRow(priya, "Sam")).toHaveText("Sam½ Tea$8.00Paid $16.00 · $8.00 too much", live);
  await expect(priya.getByTestId("payments-summary")).toHaveText("1 of 2 paid");
  await expect(paymentRow(priya, "Sam")).toHaveAttribute("data-state", "over");
  expect(await markOf(priya, "Sam")).toEqual(["check"]);
  await expect(paymentRow(priya, "Priya").getByText("· you", { exact: true })).toHaveCount(1);
  await expect(priya.getByRole("dialog", { name: "Payments" }).getByText("· you", { exact: true })).toHaveCount(1);
  await expect(priya.getByRole("dialog", { name: "Payments" }).locator('[data-icon="person"]')).toHaveCount(0);
  await expect(sam.getByTestId("owe")).toBeVisible(live);
});

test("Payments opens on what has been paid with nobody picked; a tap on a person breaks their arc out and shows their part, and a tap on them again or anywhere else puts it back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Tea", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await expect(owe(sam)).toHaveText("$8.00", live);

  await fromMore(priya, "Payments");
  const dialog = priya.getByRole("dialog", { name: "Payments" });
  const samRow = paymentsList(priya).getByRole("button", { name: /^Sam, / });
  const priyaRow = paymentsList(priya).getByRole("button", { name: /^Priya, you, / });
  // The picked arc sits 10 px out from the ring's radius of 79.
  const liftedArcs = () => dialog.locator("svg g circle").evaluateAll((all) => all.flatMap((one, index) => (one.getAttribute("r") === "89" ? [index] : [])));
  await expect(samRow).toHaveAttribute("aria-pressed", "false");
  await expect(priyaRow).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("paid", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("ring-amount")).toHaveText("$0.00");
  await expect(dialog.getByText("of $44.20", { exact: true })).toBeVisible();
  expect(await liftedArcs()).toEqual([]);

  await samRow.click();
  await expect(samRow).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText("Sam's part", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Not paid yet", { exact: true })).toBeVisible();
  await expect.poll(async () => (await liftedArcs()).length).toBe(1);
  const [his] = await liftedArcs();

  await priyaRow.click();
  await expect(priyaRow).toHaveAttribute("aria-pressed", "true");
  await expect(samRow).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("Your part", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const lifted = await liftedArcs();
    return lifted.length === 1 && lifted[0] !== his;
  }).toBe(true);

  await priyaRow.click();
  await expect(priyaRow).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("paid", { exact: true })).toBeVisible();
  await expect.poll(liftedArcs).toEqual([]);

  await samRow.click();
  await expect(dialog.getByText("Sam's part", { exact: true })).toBeVisible();
  await dialog.getByText("Everyone pays Jason.").click();
  await expect(samRow).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("paid", { exact: true })).toBeVisible();
  await expect.poll(liftedArcs).toEqual([]);
});

test("an Undo bar over an open sheet rides the sheet's bottom lift, not the footer's", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, [venmo]));
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  const bar = sam.getByText("Marked $14.20 as paid");
  await expect(bar).toBeVisible(live);
  await sam.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(sam.getByRole("dialog", { name: "Payments" })).toBeVisible(live);
  await expect(bar).toBeVisible();
  await sam.waitForTimeout(500);
  const box = (await sam.getByRole("status").filter({ has: bar }).boundingBox())!;
  expect(844 - (box.y + box.height)).toBeLessThan(40);
});

test("Payments folds everyone who owes $0.00 into one muted line, in light and dark", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  await pick(sam, "Sam");
  await circle(sam, "Pho", "Sam").click();
  await expect(owe(sam)).toHaveText("$14.20", live);

  await fromMore(sam, "Payments");
  await expect(paymentsList(sam).getByRole("listitem")).toHaveText([/^Sam/, /^Jason/]);
  await expect(paymentRow(sam, "Priya")).toHaveCount(0);
  const line = sam.getByTestId("owes-nothing");
  await expect(line).toHaveText("Priya owes nothing.");
  const ink = (scheme: "light" | "dark") => sam.emulateMedia({ colorScheme: scheme }).then(() => line.evaluate((node) => getComputedStyle(node).color));
  expect(await ink("light")).toBe("rgb(115, 115, 115)");
  await expect.poll(() => ink("dark")).toBe("rgb(153, 153, 153)");
});

test("the Host's ring counts their own share as paid with what friends paid back, and the Host checks Priya off, which History keeps under the Host's name", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  const jason = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await pick(jason, "Jason");
  await circle(sam, "Pho", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await circle(jason, "Wings", "Jason").click();
  await expect(owe(sam)).toHaveText("$14.20", live);
  await expect(owe(priya)).toHaveText("$16.00", live);

  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await fromMore(jason, "Payments");
  const dialog = jason.getByRole("dialog", { name: "Payments" });
  // Jason paid his own $14.00 with the bill, so it counts as paid next to Sam's $14.20, out of everyone's $44.20.
  await expect(dialog.getByTestId("payments-collected")).toHaveText(" · $28.20 of $44.20 in", live);
  await expect(dialog.getByTestId("ring-amount")).toHaveText("$28.20");
  await expect(dialog.getByText("of $44.20", { exact: true })).toBeVisible();
  // His arc leads the paid sweep in black, then Sam's, then Priya's still owed in gray.
  const arcInks = () => dialog.locator("svg g circle").evaluateAll((all) => all.map((one) => getComputedStyle(one).stroke));
  await expect.poll(arcInks, live).toEqual(["rgb(23, 23, 23)", "rgb(23, 23, 23)", "rgb(184, 184, 184)"]);
  await expect(paymentRow(jason, "Jason")).toHaveText("Jason · you · gets paidWings$14.00Paid the bill");
  // Nobody can check the Host off: a tap on his check leaves it filled and shakes his "gets paid".
  const payerCheck = paymentsList(jason).getByRole("button", { name: "Jason paid the bill and gets paid" });
  await expect(payerCheck).toHaveAttribute("aria-disabled", "true");
  // The check is aria-disabled, which Playwright's click refuses, so it is pressed from the keyboard the way a screen reader would.
  await payerCheck.focus();
  await jason.keyboard.press("Enter");
  await expect.poll(() => jason.getByTestId("gets-paid").evaluate((node) => getComputedStyle(node).animationName)).not.toBe("none");
  expect(await markOf(jason, "Jason")).toEqual(["check"]);
  await expect(paymentsList(jason).getByRole("button", { name: /^Mark Jason/ })).toHaveCount(0);
  await paymentsList(jason).getByRole("button", { name: /^Jason, you, / }).click();
  await expect(dialog.getByText("Your part", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("ring-amount")).toHaveText("$14.00");
  await expect(dialog.getByText("Paid the bill", { exact: true }).first()).toBeVisible();
  await paymentsList(jason).getByRole("button", { name: /^Jason, you, / }).click();
  await expect(paymentsList(jason).getByRole("button", { name: /^Jason, you, / })).toHaveAttribute("aria-pressed", "false");

  await paymentsList(jason).getByRole("button", { name: "Mark Priya paid" }).click();
  await expect(paymentRow(jason, "Priya")).toHaveAttribute("data-state", "settled", live);
  await expect(dialog.getByTestId("all-paid")).toHaveText("All paid$44.20 settled", live);
  await expect(paymentRow(priya, "Priya")).toHaveCount(0);
  await expect(priya.getByTestId("footer").getByRole("button", { name: "Paid" })).toBeVisible(live);

  await jason.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, live);
  await fromMore(jason, "History");
  await expect(jason.getByRole("dialog", { name: "History" })).toContainText("Priya paid $16.00Jason", live);

  await paymentsList(jason).waitFor({ state: "detached" });
  await fromMore(priya, "Payments");
  await expect(paymentsList(priya).getByRole("button", { name: "Mark Sam not paid" })).toBeVisible(live);
  await expect(paymentsList(priya).getByRole("button", { name: "Mark Priya not paid" })).toBeVisible();
});

test("a tap on the ring's arc picks that person like their row, a tap on it again lets go, and a tap on the hole puts the ring back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Pho", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await expect(owe(priya)).toHaveText("$16.00", live);
  await expect(owe(sam)).toHaveText("$14.20", live);

  await fromMore(priya, "Payments");
  const dialog = priya.getByRole("dialog", { name: "Payments" });
  const samRow = paymentsList(priya).getByRole("button", { name: /^Sam, / });
  const priyaRow = paymentsList(priya).getByRole("button", { name: /^Priya, you, / });
  await priya.waitForTimeout(1200);
  const svg = dialog.locator('svg[width="168"]');
  expect(await svg.getAttribute("aria-hidden")).toBe("true");
  // Nobody has paid, so the arcs keep chip order: Sam's runs from 12 o'clock over 14.20 of the 44.20 owed or unclaimed, Priya's over the next 16.00; taps land on the band's middle (radius 79 of 168).
  const tapAt = async (turn: number, radius: number) => {
    const box = (await svg.boundingBox())!;
    const angle = 2 * Math.PI * turn;
    await priya.mouse.click(box.x + box.width / 2 + radius * Math.sin(angle), box.y + box.height / 2 - radius * Math.cos(angle));
  };
  await tapAt(1420 / 2 / 4420, 79);
  await expect(samRow).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText("Sam's part", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("ring-amount")).toHaveText("$14.20");

  await tapAt(0.1, 0);
  await expect(samRow).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("paid", { exact: true })).toBeVisible();
  await tapAt((1420 + 1600 / 2) / 4420, 79);
  await expect(priyaRow).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText("Your part", { exact: true })).toBeVisible();
  await priya.waitForTimeout(400);
  await tapAt((1420 + 1600 / 2) / 4420, 89);
  await expect(priyaRow).toHaveAttribute("aria-pressed", "false");
});

test("Payments turns each paid arc black at the start of the ring, and says All paid once the last person pays while it is open", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, [venmo]);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await circle(sam, "Pho", "Sam").click();
  await circle(sam, "Wings", "Sam").click();
  await circle(priya, "Tea", "Priya").click();
  await expect(owe(sam)).toHaveText("$28.20", live);
  await expect(owe(priya)).toHaveText("$16.00", live);
  await owe(priya).click();
  await breakdown(priya).getByRole("button", { name: "I already paid" }).click();
  await expect(priya.getByRole("status").getByText("Marked $16.00 as paid")).toBeVisible(live);

  await fromMore(priya, "Payments");
  const dialog = priya.getByRole("dialog", { name: "Payments" });
  const ink = "rgb(23, 23, 23)";
  const arcInks = () => dialog.locator("svg g circle").evaluateAll((all) => all.map((one) => getComputedStyle(one).stroke));
  // Priya has paid, so her arc leads the sweep from 12 o'clock in black and Sam's follows in gray.
  await expect.poll(arcInks, live).toEqual([ink, "rgb(184, 184, 184)"]);
  await expect(dialog.getByTestId("all-paid")).toHaveCount(0);
  await expect(dialog.getByText("paid", { exact: true })).toBeVisible();

  await owe(sam).click();
  await breakdown(sam).getByRole("button", { name: "I already paid" }).click();
  await expect.poll(arcInks, live).toEqual([ink, ink]);
  await expect(dialog.getByTestId("all-paid")).toHaveText("All paid$44.20 settled");

  await paymentsList(priya).getByRole("button", { name: /^Sam, / }).click();
  await expect(dialog.getByTestId("all-paid")).toHaveCount(0);
  await expect(dialog.getByTestId("ring-amount")).toHaveText("$28.20");
});
