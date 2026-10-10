import { openExample } from "./files";
import { expect, newContext, test, type Browser, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.setTimeout(90_000);

let tests = 0;

test.beforeEach(async ({ context }, testInfo) => {
  tests += 1;
  const ip = `198.52.${testInfo.workerIndex}.${tests}`;
  await context.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }));
});

const linkTimeout = { timeout: 30_000 };

async function readyHome(page: Page, names: string[] = []) {
  await page.goto("/");
  await openExample(page);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  for (const [index, name] of ["Jason", ...names].entries()) {
    await page.getByRole("button", { name: index === 0 ? "Add name" : "Add a name" }).click();
    await page.getByRole("textbox", { name: index === 0 ? "Your name" : "Name", exact: true }).fill(name);
    await page.keyboard.press("Enter");
  }
}

async function createLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create split link" }).click();
  await expect(page.getByText("Link ready.")).toBeVisible(linkTimeout);
  return page.url();
}

async function open(browser: Browser, link: string) {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  return page;
}

const question = (page: Page) => page.getByRole("heading", { name: "Which one are you?" });
const rows = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" }).getByRole("listitem");

test("a name already in the draft is refused with a note, and editing it clears the note", async ({ page }) => {
  await readyHome(page, ["Sam"]);
  const people = page.getByRole("group", { name: "People at the table" });

  await page.getByRole("button", { name: "Add a name" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("sam ");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That name is already here.");
  await expect(people.getByText("Sam", { exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "Add a name" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sami");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(people.getByText("Sami", { exact: true })).toHaveCount(1);
});

test("a name that draws nothing adds no chip and no note, and removing the chip a note is about clears the note", async ({ page }) => {
  await readyHome(page, ["Sam"]);
  const people = page.getByRole("group", { name: "People at the table" });
  const add = async (name: string) => {
    await page.getByRole("button", { name: "Add a name" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.keyboard.press("Enter");
  };

  await add("\u200B");
  await expect(people.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await add("sam");
  await expect(page.getByRole("alert")).toHaveText("That name is already here.");
  await people.getByRole("button", { name: "Remove Sam" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(people.getByRole("button", { name: /^Remove / })).toHaveCount(1);
});

test("Create split link takes the Host to the tall pick sheet, and a second browser sees the Host's name as picked", async ({ page, browser }) => {
  await readyHome(page, ["Sam", "Priya"]);
  const link = await createLink(page);

  expect(link).toMatch(/^http:\/\/localhost:\d+\/s\/[A-Za-z0-9_-]{24}$/);
  await expect(rows(page)).toHaveText(["JJason", "SSam", "PPriya"]);
  await page.getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible();

  const sam = await open(browser, link);
  await expect(sam.getByText("Jason invited you to split $28.04")).toBeVisible();
  await expect(rows(sam)).toHaveText(["JJasonPicked", "SSam", "PPriya"]);
});

test("after the Host picks on a link not yet shared, the bar shows Your share with no link row, and Sam's breakdown has none either", async ({ page }) => {
  await readyHome(page, ["Sam"]);
  await createLink(page);
  await page.getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible();

  const sheet = page.getByTestId("split-sheet");
  await expect(sheet.getByRole("button", { name: "Your share $0.00, Show what you owe" })).toBeVisible();
  await expect(sheet.getByTestId("split-link")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Copy" })).toHaveCount(0);

  const samChip = page.getByRole("button", { name: "Sam", exact: true });
  await expect(samChip).toHaveCount(1);
  await samChip.click();
  await sheet.getByRole("button", { name: /, Show Sam's breakdown$/ }).click();
  await expect(sheet.getByTestId("breakdown").getByText("Sam's share")).toBeVisible();
  await expect(sheet.getByTestId("split-link")).toHaveCount(0);
});

test("a browser not on the list adds itself, the Host's home opens fresh with only the Venmo handle kept, and a reload remembers the pick", async ({ page, browser }) => {
  await readyHome(page);
  const link = await createLink(page);

  const context = await newContext(browser);
  const loaded: string[] = [];
  context.on("request", (request) => loaded.push(new URL(request.url()).pathname));
  const lee = await context.newPage();
  await lee.goto(link);
  await expect(rows(lee)).toHaveText(["JJason"]);
  await lee.getByRole("button", { name: "Not here? Add yourself" }).click();
  await lee.getByRole("textbox", { name: "Your name" }).fill("Lee");
  await lee.getByRole("button", { name: "Join as Lee" }).click();
  await expect(lee.getByRole("button", { name: "Lee, you", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("button", { name: "Add receipt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("jason-z");
  const people = page.getByRole("group", { name: "People at the table" });
  await expect(people.getByText("Jason", { exact: true })).toHaveCount(0);
  await expect(people.getByText("Lee", { exact: true })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add receipt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("jason-z");

  await lee.reload();
  await expect(lee.getByRole("button", { name: "Lee, you", exact: true })).toBeVisible();
  await expect(question(lee)).toHaveCount(0);

  expect(loaded.filter((path) => path.startsWith("/models/") || path.startsWith("/ort/"))).toEqual([]);
});

test("the wordmark on the Split page opens a fresh home that keeps the Venmo handle, and the Split stays on this device", async ({ page }) => {
  await readyHome(page);
  const link = await createLink(page);
  await page.getByRole("button", { name: "Jason", exact: true }).click();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Split a receipt" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Add receipt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("jason-z");
  await expect(page.getByRole("group", { name: "People at the table" }).getByText("Jason", { exact: true })).toHaveCount(0);

  await page.goto(link);
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible(linkTimeout);
  await expect(question(page)).toHaveCount(0);
});

test("a reload of home clears the receipt and the names, and the kept Venmo handle creates the next link", async ({ page }) => {
  await readyHome(page, ["Sam"]);
  const people = page.getByRole("group", { name: "People at the table" });
  await expect(page.getByTestId("receipt")).toBeVisible();
  await expect(people.getByText("Sam", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Add receipt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Venmo handle" })).toHaveValue("jason-z");
  await expect(page.getByTestId("receipt")).toHaveCount(0);
  await expect(people.getByText("Jason", { exact: true })).toHaveCount(0);
  await expect(people.getByText("Sam", { exact: true })).toHaveCount(0);

  await openExample(page);
  await page.getByRole("button", { name: "Add name" }).click();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Jason");
  await page.keyboard.press("Enter");
  const sent = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/splits");
  await createLink(page);
  expect((await sent).postDataJSON().split.paymentHandles).toEqual([{ service: "venmo", handle: "jason-z" }]);
});

test("without a system share sheet the pick sheet's link has Copy alone", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await readyHome(page);
  await createLink(page);
  await expect(question(page)).toBeVisible();

  expect(await page.evaluate(() => typeof navigator.share)).toBe("undefined");
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
});

test("Copy on the pick sheet puts the exact link on the clipboard, and after a pick Share in the header hands it to the system share sheet", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(navigator, "share", { value: async (data: ShareData) => void shared.push(data) });
  });
  await readyHome(page);
  const link = await createLink(page);
  await expect(question(page)).toBeVisible();

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(page.getByRole("button", { name: "Copied" })).toHaveCount(0);

  await page.getByRole("button", { name: "Jason", exact: true }).click();
  await expect(question(page)).toBeHidden();
  await page.getByRole("button", { name: "Share link" }).click();
  expect(await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared)).toEqual([{ url: link }]);
});

test("a receipt replaced while the link is being created stays on home and finishes reading", async ({ page }) => {
  await readyHome(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/splits", async (route) => {
    await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Create split link" }).click();
  await expect(page.getByRole("button", { name: "Creating link" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Replace receipt" }).click();
  await (await chooser).setFiles("e2e/fixtures/srd-1040-no-sprite.jpg");
  release();

  await expect(page.getByText("Link ready.")).toBeVisible(linkTimeout);
  await page.goBack();
  await expect(page.getByText("0 items")).toBeVisible(linkTimeout);
  await expect(page.getByText("Reading receipt")).toHaveCount(0);
});

test("a refused create shows one reason and enables Create split link again", async ({ page }) => {
  await readyHome(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/splits", async (route) => {
    await held;
    await route.fallback({ postData: JSON.stringify({ ...route.request().postDataJSON(), note: "" }) });
  });
  const action = page.getByRole("button", { name: /Create split link|Creating link/ });

  await action.click();
  await expect(action).toHaveText("Creating link");
  await expect(action).toHaveAttribute("aria-busy", "true");
  release();

  await expect(page.getByText("Couldn't create the link. Try again.")).toBeVisible(linkTimeout);
  await expect(action).toHaveText("Create split link");
  await expect(action).not.toHaveAttribute("aria-disabled", "true");
  await page.unroute("**/api/splits");
  await action.click();
  await expect(page.getByText("Link ready.")).toBeVisible(linkTimeout);
});

test("only the browser that made the link can change the Venmo handle", async ({ page, browser }) => {
  await readyHome(page);
  const link = await createLink(page);
  const id = link.split("/s/")[1];
  const other = await open(browser, link);
  await expect(question(other)).toBeVisible();

  const answers = await other.evaluate(async (id) => {
    const socket = new WebSocket(`ws://${location.host}/parties/split-server/${id}`);
    const messages: { type: string; ref?: string; rejection?: { reason: string }; split?: { paymentHandles: unknown } }[] = [];
    const next = (test: (message: (typeof messages)[number]) => boolean) =>
      new Promise<(typeof messages)[number]>((resolve) => {
        const check = () => {
          const found = messages.find(test);
          if (found) resolve(found);
          else setTimeout(check, 50);
        };
        check();
      });
    socket.onmessage = ({ data }) => messages.push(JSON.parse(data));
    await next((message) => message.type === "state");
    socket.send(JSON.stringify({ ref: "steal", op: { type: "setPaymentHandles", by: null, handles: [{ service: "venmo", handle: "thief-x" }] } }));
    const refused = await next((message) => message.ref === "steal");
    (window as unknown as { nextHandles: () => Promise<unknown> }).nextHandles = () =>
      next((message) => message.type === "state" && JSON.stringify(message.split?.paymentHandles) !== '[{"service":"venmo","handle":"jason-z"}]').then((message) => message.split?.paymentHandles);
    return refused;
  }, id);
  expect(answers).toEqual({ type: "rejected", ref: "steal", rejection: { reason: "creatorRequired" } });

  const accepted = await page.evaluate(async (id) => {
    const { creatorSecret } = JSON.parse(localStorage.getItem(`receipt-splitter:split:${id}`) ?? "{}");
    const socket = new WebSocket(`ws://${location.host}/parties/split-server/${id}`);
    let sent = false;
    return new Promise<unknown>((resolve) => {
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "state" && !sent) {
          sent = true;
          socket.send(JSON.stringify({ ref: "mine", creatorSecret, op: { type: "setPaymentHandles", by: null, handles: [{ service: "venmo", handle: "jason-zh" }] } }));
        }
        if (message.ref === "mine") resolve(message.type);
      };
    });
  }, id);
  expect(accepted).not.toBe("rejected");
  expect(await other.evaluate(() => (window as unknown as { nextHandles: () => Promise<unknown> }).nextHandles())).toEqual([{ service: "venmo", handle: "jason-zh" }]);
});

test("an unknown or malformed Split link says the split has expired", async ({ page }) => {
  for (const path of ["/s/abc", "/s/q7Xv0Lr9_aZ-3mKpAbCdEf"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "This split has expired" })).toBeVisible();
  }
});

test("a Split whose socket closes with 4500 says it can't be opened, and stops reconnecting", async ({ page }) => {
  await page.clock.install();
  let code = 4000;
  await page.routeWebSocket(/\/parties\/split-server\//, (socket) => socket.close({ code, reason: "closed" }));
  // After routeWebSocket, which swaps in its own WebSocket, so this counts the sockets the page opens through the route.
  await page.addInitScript(() => {
    const Native = WebSocket;
    Object.assign(window, { sockets: 0 });
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        (window as unknown as { sockets: number }).sockets += 1;
      }
    };
  });
  const sockets = () => page.evaluate(() => (window as unknown as { sockets: number }).sockets);
  const tick = async () => {
    await page.clock.runFor(50);
    return sockets();
  };

  await page.goto("/s/q7Xv0Lr9_aZ-3mKpAbCdEf");
  await expect.poll(tick).toBe(1);
  await page.clock.runFor(10_000);
  expect(await sockets()).toBeGreaterThan(1);

  code = 4500;
  await page.reload();
  await expect.poll(tick).toBe(1);
  await expect(page.getByRole("heading", { name: "This split can't be opened" })).toBeVisible();
  await page.clock.runFor(60_000);
  expect(await sockets()).toBe(1);
});
