import { randomInt } from "node:crypto";
import { menuButton, menuPopover } from "./header";
import { expect, test, type Page } from "./without-ocr";

test.use({ colorScheme: "light", serviceWorkers: "block" });

/** Which side of mid-gray a CSS color falls on, so a test follows the theme without pinning its palette. */
const toneScript = `(color) => {
  const paint = document.createElement("canvas").getContext("2d");
  paint.fillStyle = color;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(paint.fillStyle.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? "dark" : "light";
}`;

/** Home's sun/moon button is named for the mode a press goes to, so the page is in the other one. */
const toggle = (page: Page, mode: "Dark mode" | "Light mode") => page.getByRole("button", { name: `Switch to ${mode.toLowerCase()}`, exact: true });
const flipTo = (page: Page, mode: "Dark mode" | "Light mode") => toggle(page, mode).click();
const offers = (page: Page, mode: "Dark mode" | "Light mode") => expect(toggle(page, mode)).toBeVisible();

const ground = (page: Page) =>
  page.evaluate((script) => {
    const tone = eval(script) as (color: string) => string;
    return {
      background: tone(getComputedStyle(document.body).backgroundColor),
      themeColors: [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => tone(meta.content)),
      stored: localStorage.getItem("receipt-splitter:appearance"),
    };
  }, toneScript);

async function home(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create split link" })).toBeVisible();
}

test("the Dark mode row turns home dark on a light device, status bar included", async ({ page }) => {
  await home(page);
  expect(await ground(page)).toEqual({ background: "light", themeColors: ["light", "dark"], stored: null });
  expect(await toggle(page, "Dark mode").boundingBox()).toMatchObject({ width: 44, height: 44 });
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  expect(await ground(page)).toEqual({ background: "dark", themeColors: ["dark", "dark"], stored: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("a reload keeps dark, and the page is dark before the app's script runs", async ({ page }) => {
  await home(page);
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  await page.addInitScript((script) => {
    const tone = eval(script) as (color: string) => string;
    // readyState turns interactive once the HTML is parsed and before deferred scripts, so this is the page as first painted.
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      Object.assign(window, {
        parsed: {
          background: tone(getComputedStyle(document.body).backgroundColor),
          themeColors: [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => tone(meta.content)),
          bundleRan: document.getElementById("rs-theme") !== null,
        },
      });
    });
  }, toneScript);
  await page.reload();
  await offers(page, "Light mode");
  expect(await page.evaluate(() => (window as unknown as { parsed: unknown }).parsed)).toEqual({ background: "dark", themeColors: ["dark", "dark"], bundleRan: false });
  expect(await ground(page)).toEqual({ background: "dark", themeColors: ["dark", "dark"], stored: "dark" });
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
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await ground(page)).toEqual({ background: "dark", themeColors: ["dark", "dark"], stored: "dark" });
});

test("flipping back to the device's own light forgets the pick and follows the device again", async ({ page }) => {
  await home(page);
  await flipTo(page, "Dark mode");
  await flipTo(page, "Light mode");
  await offers(page, "Dark mode");
  expect(await ground(page)).toEqual({ background: "light", themeColors: ["light", "dark"], stored: null });
  await page.emulateMedia({ colorScheme: "dark" });
  await offers(page, "Light mode");
  expect(await ground(page)).toEqual({ background: "dark", themeColors: ["light", "dark"], stored: null });
});

test("on a dark device, picking light and back to dark forgets the pick", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await home(page);
  await flipTo(page, "Light mode");
  await offers(page, "Dark mode");
  expect(await ground(page)).toEqual({ background: "light", themeColors: ["light", "light"], stored: "light" });
  await flipTo(page, "Dark mode");
  await offers(page, "Light mode");
  expect(await ground(page)).toEqual({ background: "dark", themeColors: ["light", "dark"], stored: null });
});

test("the theme toggle stays put when the Recent splits link appears", async ({ page }) => {
  await home(page);
  const before = await toggle(page, "Dark mode").boundingBox();
  await page.evaluate(() =>
    localStorage.setItem("receipt-splitter:split:AnaBenCy00000000000001", JSON.stringify({ recent: { names: ["Ana", "Ben"], total: 990, added: Date.now(), seen: Date.now() } })),
  );
  await page.reload();
  expect(await toggle(page, "Dark mode").boundingBox()).toEqual(before);
  await expect(page.getByRole("button", { name: "Recent splits", exact: true })).toBeVisible();
});

const countTransitions = () => {
  const start = document.startViewTransition?.bind(document);
  Object.assign(window, { transitions: 0 });
  if (!start) return;
  document.startViewTransition = (...args: Parameters<typeof start>) => {
    Object.assign(window, { transitions: (window as unknown as { transitions: number }).transitions + 1 });
    return start(...args);
  };
};
const transitions = (page: Page) => page.evaluate(() => (window as unknown as { transitions: number }).transitions);

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a flip under reduced motion swaps the theme in one frame", async ({ page }) => {
    await page.addInitScript(countTransitions);
    await home(page);
    const row = toggle(page, "Dark mode");
    const background = await row.evaluate((el, script) => {
      const tone = eval(script) as (color: string) => string;
      (el as HTMLElement).click();
      return new Promise<string>((done) => requestAnimationFrame(() => done(tone(getComputedStyle(document.body).backgroundColor))));
    }, toneScript);
    expect(background).toBe("dark");
    expect(await transitions(page)).toBe(0);
  });
});

test("a flip reveals the new theme as a 600 ms circle on the new snapshot", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "Playwright's WebKit does not script View Transition pseudo-element animations.");
  await home(page);
  const row = toggle(page, "Dark mode");
  const center = await row.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
  });
  const reveal = await row.evaluate(
    (el) =>
      new Promise<{ duration: unknown; easing: string; clipPath: unknown[] }>((done) => {
        (el as HTMLElement).click();
        const poll = () => {
          const found = document.getAnimations().find((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === "::view-transition-new(root)");
          if (!found) return requestAnimationFrame(poll);
          const effect = found.effect as KeyframeEffect;
          done({ duration: effect.getTiming().duration, easing: effect.getTiming().easing as string, clipPath: effect.getKeyframes().map((frame) => frame.clipPath) });
        };
        poll();
      }),
  );
  expect(reveal.duration).toBe(600);
  expect(reveal.easing).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
  const [, x, y] = /^circle\(0px at ([\d.]+)px ([\d.]+)px\)$/.exec(String(reveal.clipPath[0]))!;
  expect(Math.max(Math.abs(Number(x) - center[0]), Math.abs(Number(y) - center[1]))).toBeLessThanOrEqual(1);
  expect(reveal.clipPath[1]).toMatch(/^circle\([\d.]+px at [\d.]+px [\d.]+px\)$/);
});
