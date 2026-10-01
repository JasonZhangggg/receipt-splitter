import { test as base, type Browser, type BrowserContext } from "@playwright/test";

export { expect, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * Every home load prefetches about 13 MB of OCR models. Specs that never scan skip them,
 * because under CI load those downloads make local wrangler drop its worker mid-request.
 */
async function withoutOcrModels(context: BrowserContext): Promise<BrowserContext> {
  await context.route("**/models/**", (route) => route.abort());
  await context.route("**/ort/**", (route) => route.abort());
  return context;
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  return withoutOcrModels(await browser.newContext());
}

export const test = base.extend({
  context: async ({ context }, provide) => {
    await provide(await withoutOcrModels(context));
  },
});
