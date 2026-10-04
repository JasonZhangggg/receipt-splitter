import { test as base, type Browser, type BrowserContext } from "@playwright/test";

export { expect, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

/** SLOW_RAF=200 delays every requestAnimationFrame callback by that many ms, the way a loaded Linux CI runner does (150-330 ms frames). */
const slowRafMs = Number(process.env.SLOW_RAF ?? 0);

function delayAnimationFrames(delay: number) {
  const nativeFrame = window.requestAnimationFrame.bind(window);
  const nativeTimeout = window.setTimeout.bind(window);
  const live = new Set<number>();
  let next = 1;
  window.requestAnimationFrame = (callback) => {
    const id = next++;
    live.add(id);
    nativeFrame(() =>
      nativeTimeout(() => {
        if (live.delete(id)) callback(performance.now());
      }, delay),
    );
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (id != null) live.delete(id);
  };
}

/**
 * Every home load prefetches about 13 MB of OCR models. Specs that never scan skip them,
 * because under CI load those downloads make local wrangler drop its worker mid-request.
 */
async function withoutOcrModels(context: BrowserContext): Promise<BrowserContext> {
  if (slowRafMs > 0) await context.addInitScript(delayAnimationFrames, slowRafMs);
  await context.route("**/models/**", (route) => route.abort());
  await context.route("**/ort/**", (route) => route.abort());
  return context;
}

/** Playwright keeps a context made from the worker's browser open until the worker exits, so each test closes the ones it made. */
const opened = new Set<BrowserContext>();

export async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await withoutOcrModels(await browser.newContext());
  opened.add(context);
  return context;
}

export const test = base.extend<{ closeOpened: void }>({
  context: async ({ context }, provide) => {
    await provide(await withoutOcrModels(context));
  },
  closeOpened: [
    // Playwright reads a fixture's dependencies from this pattern, and this one has none.
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      await provide();
      await Promise.all([...opened].map((context) => context.close()));
      opened.clear();
    },
    { auto: true },
  ],
});
