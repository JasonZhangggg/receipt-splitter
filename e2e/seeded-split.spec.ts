import { addNames, openExample } from "./files";
import { closeLinkReady } from "./header";
import { expect, test, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.setTimeout(90_000);

let tests = 0;

const question = (page: Page) => page.getByRole("heading", { name: "Which one are you?" });
const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });

test("after Create the Host sees the Split at once with their name picked, before the socket has opened, and a tap in that gap goes out when the socket opens instead of failing", async ({ page, context }, { workerIndex }) => {
  const ip = `198.54.${workerIndex}.${(tests += 1)}`;
  await context.route("**/api/splits", (route) => route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }));
  // The page's sockets stay CONNECTING until the test lets them open, so anything on screen before then came from the Create response.
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    (window as unknown as { openSockets: () => void }).openSockets = open;
    // No private fields here: this function is serialized into the page, where the test compiler's helpers for them do not exist.
    const released = new WeakSet<WebSocket>();
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        const held: Event[] = [];
        const hold = (event: Event) => {
          if (released.has(this)) return;
          event.stopImmediatePropagation();
          held.push(event);
        };
        super.addEventListener("open", hold);
        super.addEventListener("message", hold);
        void gate.then(() => {
          released.add(this);
          for (const event of held) this.dispatchEvent(new (event.constructor as typeof Event)(event.type, event));
        });
      }
      override get readyState(): 0 | 1 | 2 | 3 {
        return released.has(this) ? super.readyState : 0;
      }
    };
  });

  await page.goto("/");
  await openExample(page);
  await page.getByRole("textbox", { name: "Venmo handle" }).fill("jason-z");
  await addNames(page, "Jason", "Sam", "Priya");
  await page.getByRole("button", { name: "Create link" }).click();
  await closeLinkReady(page);

  await expect(page.getByTestId("owe")).toBeVisible({ timeout: 30_000 });
  await expect(question(page)).toHaveCount(0);

  // Claiming is the first thing the Host does. The click returns after the handler has run, so the claim was sent while the socket was still CONNECTING,
  // and it waits for the open instead of failing. PartySocket gives up on a socket that has not opened after 4 s, so open it right away.
  await circle(page, "Sprite", "Jason").click();
  await page.evaluate(() => (window as unknown as { openSockets: () => void }).openSockets());
  await expect(circle(page, "Sprite", "Jason")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(page.getByText("Didn't save. You're offline.")).toHaveCount(0);
});
