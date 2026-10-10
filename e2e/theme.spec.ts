import { randomInt } from "node:crypto";
import { fromMenu, menuButton, menuPopover } from "./header";
import { expect, test, type Page } from "./without-ocr";

test.use({ colorScheme: "light", serviceWorkers: "block" });

const white = "rgb(255, 255, 255)";
const nearBlack = "rgb(18, 19, 21)";

const flipTo = (page: Page, mode: "Dark mode" | "Light mode") => fromMenu(page, mode);
/** The menu offers the mode a flip goes to, so the page is in the other one. */
async function offers(page: Page, mode: "Dark mode" | "Light mode") {
  await menuButton(page).click();
  await expect(menuPopover(page).getByRole("button", { name: mode, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuPopover(page)).toHaveCount(0);
}

const ground = (page: Page) =>
  page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    themeColors: [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => meta.content),
    stored: localStorage.getItem("receipt-splitter:appearance"),
  }));

async function home(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create split link" })).toBeVisible();
}

test("the Dark mode row turns home dark on a light device, status bar included", async ({ page }) => {
  await home(page);
  expect(await ground(page)).toEqual({ background: white, themeColors: ["#FFFFFF", "#121315"], stored: null });
  expect(await menuButton(page).boundingBox()).toMatchObject({ width: 44, height: 44 });
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  expect(await ground(page)).toEqual({ background: nearBlack, themeColors: ["#121315", "#121315"], stored: "dark" });
  await expect(page.getByRole("heading", { name: "Splitwith" })).toHaveCSS("color", "rgb(242, 242, 243)");
});

test("a reload keeps dark, and the page is dark before the app's script runs", async ({ page }) => {
  await home(page);
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  await page.addInitScript(() => {
    // readyState turns interactive once the HTML is parsed and before deferred scripts, so this is the page as first painted.
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      Object.assign(window, {
        parsed: {
          background: getComputedStyle(document.body).backgroundColor,
          themeColors: [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => meta.content),
          bundleRan: document.getElementById("rs-theme") !== null,
        },
      });
    });
  });
  await page.reload();
  await offers(page, "Light mode");
  expect(await page.evaluate(() => (window as unknown as { parsed: unknown }).parsed)).toEqual({ background: nearBlack, themeColors: ["#121315", "#121315"], bundleRan: false });
  expect(await ground(page)).toEqual({ background: nearBlack, themeColors: ["#121315", "#121315"], stored: "dark" });
});

test("a Split page opened after picking dark is dark", async ({ page, request }) => {
  const created = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${randomInt(200, 256)}.${randomInt(1, 255)}` },
    data: {
      split: {
        receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
        participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await home(page);
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  await page.goto(`/s/${id}`);
  const question = page.getByRole("heading", { name: "Which one are you?" });
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(question).toHaveCSS("color", "rgb(242, 242, 243)");
  expect(await ground(page)).toEqual({ background: nearBlack, themeColors: ["#121315", "#121315"], stored: "dark" });
});

test("flipping back to the device's own light forgets the pick and follows the device again", async ({ page }) => {
  await home(page);
  await flipTo(page, "Dark mode");
  await flipTo(page, "Light mode");
  await offers(page, "Dark mode");
  expect(await ground(page)).toEqual({ background: white, themeColors: ["#FFFFFF", "#121315"], stored: null });
  await page.emulateMedia({ colorScheme: "dark" });
  await offers(page, "Light mode");
  expect(await ground(page)).toEqual({ background: nearBlack, themeColors: ["#FFFFFF", "#121315"], stored: null });
});

test("on a dark device, picking light and back to dark forgets the pick", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await home(page);
  await flipTo(page, "Light mode");
  await offers(page, "Dark mode");
  expect(await ground(page)).toEqual({ background: white, themeColors: ["#FFFFFF", "#FFFFFF"], stored: "light" });
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  expect(await ground(page)).toEqual({ background: nearBlack, themeColors: ["#FFFFFF", "#121315"], stored: null });
});

test("the menu button stays put when Recent splits appears", async ({ page }) => {
  await home(page);
  const before = await menuButton(page).boundingBox();
  await page.evaluate(() =>
    localStorage.setItem("receipt-splitter:split:AnaBenCy00000000000001", JSON.stringify({ recent: { names: ["Ana", "Ben"], total: 990, added: Date.now(), seen: Date.now() } })),
  );
  await page.reload();
  expect(await menuButton(page).boundingBox()).toEqual(before);
  await menuButton(page).click();
  await expect(menuPopover(page).getByRole("button", { name: "History", exact: true })).toBeVisible();
});
