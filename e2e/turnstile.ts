import type { BrowserContext, Page } from "@playwright/test";

const SCRIPT = /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/;
export const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export async function stubTurnstile(target: Page | BrowserContext) {
  await target.route(SCRIPT, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(_box, options) { queueMicrotask(() => options.callback(${JSON.stringify(DUMMY_TOKEN)})); return "stub"; },
        remove() {},
      };`,
    }),
  );
}
