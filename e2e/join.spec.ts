import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const linkTimeout = { timeout: 30_000 };

async function readyHome(page: Page, names: string[] = []) {
  await page.goto("/");
  await page.getByRole("button", { name: "Example" }).click();
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  for (const name of names) {
    await page.getByRole("button", { name: "Add a name" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.keyboard.press("Enter");
  }
}

async function createLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create split link" }).click();
  await expect(page.getByText("Link ready")).toBeVisible(linkTimeout);
  return `http://${await page.getByTestId("split-link").textContent()}`;
}

async function open(browser: Browser, link: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  return page;
}

const question = (page: Page) => page.getByRole("heading", { name: "Which one are you?" });
const rows = (page: Page) => page.getByRole("listitem");

test("a link made with two names asks a second browser which one they are, marks names picked elsewhere, and locks the Receipt", async ({ page, browser }) => {
  await readyHome(page, ["Sam", "Priya"]);
  const link = await createLink(page);

  expect(link).toMatch(/^http:\/\/localhost:\d+\/s\/[A-Za-z0-9_-]{22}$/);
  await expect(page.getByRole("textbox", { name: "Name of item 1" })).not.toBeEditable();
  await expect(page.getByRole("button", { name: "Add item" })).toHaveCount(0);

  const sam = await open(browser, link);
  await expect(question(sam)).toBeVisible();
  await expect(rows(sam)).toHaveText(["Me", "Sam", "Priya"]);
  await sam.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(sam.getByRole("button", { name: "Not Sam?" })).toBeVisible();

  const second = await open(browser, link);
  await expect(rows(second)).toHaveText(["Me", "SamPicked on another device", "Priya"]);
});

test("a link made with no names lets a browser join as someone else, the Host sees the name, and a reload remembers the choice", async ({ page, browser }) => {
  await readyHome(page);
  const link = await createLink(page);

  const context = await browser.newContext();
  const loaded: string[] = [];
  context.on("request", (request) => loaded.push(new URL(request.url()).pathname));
  const lee = await context.newPage();
  await lee.goto(link);
  await expect(rows(lee)).toHaveText(["Me"]);
  await lee.getByRole("button", { name: "Someone else" }).click();
  await lee.getByRole("textbox", { name: "Your name" }).fill("Lee");
  await lee.getByRole("button", { name: "Join" }).click();
  await expect(lee.getByRole("button", { name: "Not Lee?" })).toBeVisible();

  const people = page.getByRole("group", { name: "People at the table" });
  await expect(people.getByText("Lee", { exact: true })).toBeVisible();
  await expect(people.getByRole("button", { name: "Remove Lee" })).toHaveCount(0);

  await lee.reload();
  await expect(lee.getByRole("button", { name: "Not Lee?" })).toBeVisible();
  await expect(question(lee)).toHaveCount(0);
  await lee.getByRole("button", { name: "Not Lee?" }).click();
  await expect(rows(lee)).toHaveText(["Me", "Lee"]);

  expect(loaded.filter((path) => path.startsWith("/models/") || path.startsWith("/ort/"))).toEqual([]);
});

test("without a system share sheet the link has Copy alone", async ({ page }) => {
  await readyHome(page);
  await createLink(page);

  expect(await page.evaluate(() => typeof navigator.share)).toBe("undefined");
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
});

test("a Turnstile widget that cannot load shows one reason and enables Create split link again", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
  await readyHome(page);
  const action = page.getByRole("button", { name: "Create split link" });

  await action.click();

  await expect(page.getByText("Couldn't check this browser. Try again.")).toBeVisible(linkTimeout);
  await expect(action).not.toHaveAttribute("aria-disabled", "true");
});

test("Share hands the exact link to the system share sheet and Copy puts it on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(navigator, "share", { value: async (data: ShareData) => void shared.push(data) });
  });
  await readyHome(page);
  const link = await createLink(page);

  await page.getByRole("button", { name: "Share" }).click();
  expect(await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared)).toEqual([{ url: link }]);
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});

test("a failed Turnstile token shows one reason and enables Create split link again", async ({ page }) => {
  await readyHome(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/splits", async (route) => {
    await held;
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), turnstileToken: "" }) });
  });
  const action = page.getByRole("button", { name: /Create split link|Creating link/ });

  await action.click();
  await expect(action).toHaveText("Creating link");
  await expect(action).toHaveAttribute("aria-busy", "true");
  release();

  await expect(page.getByText("Couldn't check this browser. Try again.")).toBeVisible(linkTimeout);
  await expect(action).toHaveText("Create split link");
  await expect(action).not.toHaveAttribute("aria-disabled", "true");
  await page.unroute("**/api/splits");
  await action.click();
  await expect(page.getByText("Link ready")).toBeVisible(linkTimeout);
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

  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-zh");
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
