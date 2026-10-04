import { addLatency, blur, drag, fitsOneRow, itemShared, picked, runs, sample, simulateKeyboard, tap } from "./motion";
import { expect, test, type Locator, type Page } from "./without-ocr";

test.setTimeout(90_000);

const keyboard = 336;
const bundle = (page: Page) => page.locator('[data-testid^="bundle-"]');
const bundleHeader = (page: Page) => bundle(page).locator("[aria-expanded]");

async function openBundle(page: Page) {
  await tap(bundleHeader(page));
  await bundle(page).locator('[aria-expanded="true"]').waitFor();
  await page.waitForFunction(() => {
    const region = document.querySelector('[data-testid^="bundle-"]')!.lastElementChild as HTMLElement;
    return region.style.height === "" && region.style.opacity === "" && region.getAnimations().length === 0;
  });
}

const inView = (field: Locator) =>
  field.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const viewport = window.visualViewport!;
    const top = viewport.offsetTop;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { inside: box.top >= top && box.bottom <= top + viewport.height, uncovered: hit !== null && el.contains(hit) };
  });

test("on a 300 ms round trip, switching the split type never shows the old type again and builds the new rows once", { tag: "@frame-timing" }, async ({ page }) => {
  await addLatency(page, 300);
  await itemShared(page);
  await page.evaluate(() => {
    const added: string[] = [];
    Object.assign(window, { added });
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) if (node instanceof Element && node.querySelector('[aria-label="More shares for Jason"]')) added.push("rows");
    }).observe(document.body, { childList: true, subtree: true });
  });
  const modes = await sample<string | null>(page, `document.querySelector('[data-testid="item-sheet"] [role="group"][aria-label="Split"] [aria-pressed="true"]')?.getAttribute("aria-label") ?? null`);
  await tap(page.getByTestId("item-sheet").getByRole("button", { name: "By shares", exact: true }));
  await page.waitForTimeout(2000);
  expect(runs(await modes())).toEqual(["Evenly", "By shares"]);
  expect(await page.evaluate(() => (window as unknown as { added: string[] }).added)).toEqual(["rows"]);
});

const slowdown = 4;
type Kind = "even" | "shares" | "amount";
type Frame = { t: number; mode: string | null; copies: { kind: Kind; opacity: number }[] };

/** Slows every animation and every timer by the same factor, so a leaving layer's removal timer stays in step with its fade. */
async function slowed(page: Page) {
  await page.evaluate((factor) => {
    const wait = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => wait(handler, (ms ?? 0) * factor, ...args)) as typeof window.setTimeout;
    const frames: Frame[] = [];
    Object.assign(window, { frames });
    const tick = (t: number) => {
      for (const animation of document.getAnimations()) if (animation.playbackRate !== 1 / factor) animation.playbackRate = 1 / factor;
      const group = document.querySelector('[data-testid="item-sheet"] [role="group"][aria-label="Split"]');
      const copies = [...(group?.parentElement?.nextElementSibling?.children ?? [])].map((copy) => ({
        kind: copy.querySelector('[aria-label^="More shares"]') ? ("shares" as const) : copy.querySelector("input") ? ("amount" as const) : ("even" as const),
        opacity: Number(getComputedStyle(copy).opacity),
      }));
      frames.push({ t, mode: group?.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label") ?? null, copies });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, slowdown);
  return {
    reset: () => page.evaluate(() => ((window as unknown as { frames: unknown[] }).frames.length = 0)),
    read: () => page.evaluate(() => (window as unknown as { frames: Frame[] }).frames.slice()),
  };
}

const shown = (frame: Frame, kind: Kind) => Math.max(0, ...frame.copies.filter((copy) => copy.kind === kind).map((copy) => copy.opacity));

/** Rows of a kind that is not the final incoming rows must never show more than the frame before. 0.15 is one frame of the incoming fade's steep start at 4x slowdown, far below a pop to 1. */
const rises = (frames: Frame[]) => {
  const final = frames.at(-1)!.copies[0]?.kind;
  return frames.flatMap((frame, i) =>
    i === 0 ? [] : (["even", "shares", "amount"] as const).filter((kind) => kind !== final && shown(frame, kind) > shown(frames[i - 1], kind) + 0.15).map((kind) => ({ i, kind, before: shown(frames[i - 1], kind), after: shown(frame, kind) })),
  );
};
const doubled = (frames: Frame[]) => frames.filter((frame) => frame.copies.filter((copy) => copy.opacity > 0.02).length > 1);

const rowsOf = {
  "By shares": '[aria-label="More shares for Jason"]',
  "By amount": `input[aria-label="Jason's amount"]`,
};

async function switchTo(page: Page, mode: "Evenly" | keyof typeof rowsOf) {
  await page.getByTestId("item-sheet").getByRole("group", { name: "Split" }).getByRole("button", { name: mode, exact: true }).tap({ force: true });
}

test("at 4x slowdown, switching the split type fades the old rows out fully before the new rows fade in", { tag: "@frame-timing" }, async ({ page }) => {
  await itemShared(page);
  const watch = await slowed(page);
  for (const mode of ["By shares", "By amount"] as const) {
    await watch.reset();
    await switchTo(page, mode);
    await page.locator(rowsOf[mode]).first().waitFor();
    await page.waitForTimeout(2500);
    const frames = await watch.read();
    expect(frames.some(({ copies }) => copies.length === 2), `${mode}: the old rows were never painted`).toBe(true);
    expect(doubled(frames), `${mode}: frames showing both copies`).toEqual([]);
    expect(frames.at(-1)!.copies.map(({ opacity }) => opacity)).toEqual([1]);
  }
});

test("at 4x slowdown, By amount to Evenly fades out fully, fades in, and takes 270 ms", { tag: "@frame-timing" }, async ({ page }) => {
  await itemShared(page);
  const watch = await slowed(page);
  await switchTo(page, "By amount");
  await page.locator(rowsOf["By amount"]).first().waitFor();
  await page.waitForTimeout(2500);
  await watch.reset();
  await switchTo(page, "Evenly");
  await page.waitForTimeout(2500);
  const frames = await watch.read();
  const start = frames.find(({ mode }) => mode === "Evenly")!.t;
  const settled = frames.find((frame) => shown(frame, "even") >= 0.999 && frame.copies.length === 1)!.t;
  expect(doubled(frames), "frames showing both copies").toEqual([]);
  expect(rises(frames)).toEqual([]);
  expect(frames.at(-1)!.copies).toEqual([{ kind: "even", opacity: 1 }]);
  expect((settled - start) / slowdown).toBeGreaterThan(230);
  expect((settled - start) / slowdown).toBeLessThan(310);
});

for (const second of [60, 100, 180]) {
  // The windows differ by 160 to 320 ms of wall time, about one 150-330 ms Linux WebKit frame. There the tap, the playbackRate patch and the first sample each land a frame late, so the first swap has run its course before the second tap and rises() reads a whole fade as one step.
  test(`at 4x slowdown, a second split-type switch ${second} ms after the first never brings back rows the user did not see`, { tag: "@frame-timing" }, async ({ page }) => {
    await itemShared(page);
    const watch = await slowed(page);
    await watch.reset();
    await switchTo(page, "By shares");
    await page.waitForTimeout(second * slowdown);
    await switchTo(page, "By amount");
    await page.locator(rowsOf["By amount"]).first().waitFor();
    await page.waitForTimeout(2500);
    const frames = await watch.read();
    const gap = (frames.find(({ mode }) => mode === "By amount")!.t - frames.find(({ mode }) => mode === "By shares")!.t) / slowdown;
    expect(gap, "the second tap came inside the first swap").toBeLessThan(270);
    expect(rises(frames)).toEqual([]);
    expect(doubled(frames), "frames showing two copies").toEqual([]);
    expect(frames.at(-1)!.copies).toEqual([{ kind: "amount", opacity: 1 }]);
  });
}

test("a closing Bundle paints a smaller height every frame, never the open height again, and ends closed", async ({ page }) => {
  await picked(page);
  await openBundle(page);
  const open = await page.evaluate(() => {
    const region = document.querySelector('[data-testid^="bundle-"]')!.lastElementChild!;
    const painted: number[] = [];
    Object.assign(window, { painted });
    new ResizeObserver(([entry]) => painted.push(entry.contentRect.height)).observe(region);
    return region.getBoundingClientRect().height;
  });
  expect(open).toBeGreaterThan(100);
  await tap(bundleHeader(page));
  await page.waitForFunction(() => document.querySelector('[data-testid^="bundle-"]')!.lastElementChild!.childElementCount === 0);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const painted = await page.evaluate(() => (window as unknown as { painted: number[] }).painted);
  expect(painted.filter((height, i) => height > (painted[i - 1] ?? open) + 0.5)).toEqual([]);
  expect(painted.at(-1)).toBe(0);
});

test("under reduced motion, a closing Bundle's rows never return to full opacity once the fade starts", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await picked(page);
  await openBundle(page);
  const frames = await sample<{ rows: boolean; opacity: number }>(
    page,
    `(() => { const region = document.querySelector('[data-testid^="bundle-"]').lastElementChild; return { rows: region.childElementCount > 0, opacity: Number(getComputedStyle(region).opacity) }; })()`,
  );
  await tap(bundleHeader(page));
  await page.waitForTimeout(800);
  const seen = await frames();
  const fading = seen.findIndex(({ opacity }) => opacity < 1);
  expect(fading).toBeGreaterThan(-1);
  expect(seen.slice(fading).filter(({ rows, opacity }) => rows && opacity === 1)).toEqual([]);
  expect(seen.at(-1)).toEqual({ rows: false, opacity: expect.any(Number) });
});

// iOS pans the page to reveal the focused field, so a sheet that also moved for the keyboard would move twice.
test("the bar stays where it lies in the page while the keyboard opens and closes", async ({ page }) => {
  await simulateKeyboard(page, keyboard);
  await picked(page, fitsOneRow);
  const resting = Math.round((await page.getByTestId("split-sheet").boundingBox())!.y);
  const tops = await sample<number>(page, `Math.round(document.querySelector('[data-testid="split-sheet"]').getBoundingClientRect().top)`);
  await tap(page.getByTestId("split-sheet").getByRole("button", { name: "Add a person" }));
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => visualViewport!.offsetTop)).toBeGreaterThan(0);
  await blur(page);
  await page.waitForTimeout(800);
  expect(runs(await tops())).toEqual([resting]);
});

test("the item sheet stays where it lies in the page while the price field's keyboard opens and closes", async ({ page }) => {
  await simulateKeyboard(page, keyboard);
  await itemShared(page);
  const item = page.getByTestId("item-sheet");
  const resting = Math.round((await item.boundingBox())!.y);
  const tops = await sample<number>(page, `Math.round(document.querySelector('[data-testid="item-sheet"]').getBoundingClientRect().top)`);
  await tap(item.locator('input[aria-label="Price"]'));
  await page.waitForTimeout(800);
  await blur(page);
  await page.waitForTimeout(800);
  expect(runs(await tops())).toEqual([resting]);
});

test("with the keyboard up, the item sheet's price and name fields stay in view, uncovered", async ({ page }) => {
  await simulateKeyboard(page, keyboard);
  await itemShared(page);
  const item = page.getByTestId("item-sheet");
  await tap(item.locator('input[aria-label="Price"]'));
  await page.waitForTimeout(600);
  expect(await inView(item.locator('input[aria-label="Price"]'))).toEqual({ inside: true, uncovered: true });

  await blur(page);
  await page.waitForTimeout(600);
  await tap(item.getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Add a person" }));
  await page.waitForTimeout(600);
  expect(await inView(item.locator('input[aria-label="Name"]'))).toEqual({ inside: true, uncovered: true });
});

test("with the keyboard up, the name field added from the bar's plus stays in view, uncovered", async ({ page }) => {
  await simulateKeyboard(page, keyboard);
  await picked(page);
  await tap(page.getByTestId("split-sheet").getByRole("button", { name: "Add a person" }));
  await page.waitForTimeout(600);
  expect(await inView(page.getByTestId("split-sheet").locator('input[aria-label="Name"]'))).toEqual({ inside: true, uncovered: true });
});

test("swiping the bar open and flicking it shut never shows the bar and the breakdown together, and the chips never dim", async ({ page }) => {
  await picked(page);
  const sheet = page.getByTestId("split-sheet");
  const grab = async () => {
    const box = (await sheet.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + 14 };
  };
  const frames = await sample<{ chip: number; owe: boolean; breakdown: boolean }>(
    page,
    `(() => {
      const opacity = (el) => { let value = el ? 1 : 0; for (let node = el; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity); return value; };
      const layer = (id) => [...document.querySelectorAll('[data-testid="' + id + '"], [data-left-testid="' + id + '"]')].some((el) => opacity(el) > 0.01);
      const chip = document.querySelector('[data-testid="split-sheet"] [aria-label="Jason, you"]');
      return { chip: Math.round(opacity(chip) * 100) / 100, owe: layer("owe"), breakdown: layer("breakdown") };
    })()`,
  );
  await drag(page, await grab(), -200, 150);
  await page.getByTestId("breakdown").waitFor();
  await page.waitForTimeout(700);
  await drag(page, await grab(), 220, 100);
  await page.getByTestId("owe").waitFor();
  await page.waitForTimeout(700);
  const seen = await frames();
  expect(seen.filter(({ owe, breakdown }) => owe && breakdown)).toEqual([]);
  expect(seen.filter(({ chip }) => chip < 1)).toEqual([]);
});

test("the bar's name field has room around it for its focus ring inside every clipping box", async ({ page }) => {
  await picked(page);
  await tap(page.getByTestId("split-sheet").getByRole("button", { name: "Add a person" }));
  const field = page.getByTestId("split-sheet").locator('input[aria-label="Name"]');
  await field.waitFor();
  await page.waitForTimeout(400);
  const clipped = await field.evaluate((el) => {
    const ring = 3;
    const box = el.getBoundingClientRect();
    const sides: string[] = [];
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const clip = node.getBoundingClientRect();
      if (box.top - ring < clip.top) sides.push("top");
      if (box.left - ring < clip.left) sides.push("left");
      if (box.right + ring > clip.right) sides.push("right");
    }
    return sides;
  });
  expect(clipped).toEqual([]);
});

test("Back from a Split page paints home settled from its first frame: the hero, the Recent splits icon and the panel never move", async ({ page }, { workerIndex, repeatEachIndex }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await page.request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.53.${200 + workerIndex}.${repeatEachIndex + 1}` },
    data: {
      split: {
        receipt: { items: [{ id: "i1", name: "Pizza", price: 2000 }], adjustments: [], subtotal: 2000, total: 2000 },
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.goto("/");
  await page.evaluate((id) => {
    const now = Date.now();
    for (const [i, split] of [id, "PriyaJo000000000000003", "AnaBenCy00000000000001"].entries())
      localStorage.setItem(`receipt-splitter:split:${split}`, JSON.stringify({ recent: { names: ["Jason", "Sam"], total: 2000, added: now - i * 60_000, seen: now - i * 60_000 } }));
  }, id);
  await page.reload();
  await tap(page.getByRole("button", { name: "Recent splits" }));
  await tap(page.getByRole("dialog", { name: "Recent splits" }).getByRole("link").first());
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible({ timeout: 30_000 });

  const layouts = await sample<string | null>(
    page,
    `(() => {
      const hero = document.evaluate("//*[text()='Add receipt']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!hero || hero.getClientRects().length === 0) return null;
      const icon = document.querySelector('[role="button"][aria-label="Recent splits"]');
      const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);
      return JSON.stringify({ hero: top(hero), icon: top(icon), dialog: document.querySelector('[role="dialog"][aria-label="Recent splits"]') !== null, panel: top(document.querySelector("[data-sheet-surface]")) });
    })()`,
  );
  await page.goBack();
  await expect(page.getByRole("button", { name: "Recent splits" })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(runs((await layouts()).filter((layout) => layout !== null))).toHaveLength(1);
});
