import { expect, test, type Page } from "@playwright/test";

import { dropFile } from "./files";
import { mountHarness } from "./harness";

test.use({ viewport: { width: 390, height: 844 } });

type ToastWindow = Window & { hiddenAt: number[]; show: (message: string) => void; dropAction: () => void; actions: number };

async function mountToast(page: Page) {
  await mountHarness(
    page,
    `
    import { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { View } from "react-native";
    import { SafeAreaProvider } from "react-native-safe-area-context";
    import { Toast } from "./src/ui/components/toast";
    function Harness() {
      const [message, setMessage] = useState("Copied the link");
      const [action, setAction] = useState(true);
      window.show = setMessage;
      window.dropAction = () => setAction(false);
      const hide = () => { window.hiddenAt.push(Date.now()); setMessage(null); };
      return (
        <View style={{ height: 600 }}>
          <button id="opener">Opener</button>
          <Toast message={message} onHide={hide} action={action ? { label: "Undo", onPress: () => window.actions++ } : undefined} />
        </View>
      );
    }
    window.hiddenAt = [];
    window.actions = 0;
    createRoot(document.getElementById("root")).render(<SafeAreaProvider><Harness /></SafeAreaProvider>);
  `,
  );
  await expect(page.getByText("Copied the link")).toBeVisible();
}

const hiddenAt = (page: Page) => page.evaluate(() => (window as unknown as ToastWindow).hiddenAt);

test("the toast hides 4 s after it shows even when reduced motion changes on the way", async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  const setReducedMotion = async (reducedMotion: "reduce" | "no-preference") => {
    const changed = page.evaluate(
      () => new Promise((done) => matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", done, { once: true })),
    );
    await page.emulateMedia({ reducedMotion });
    await changed;
  };
  await mountToast(page);
  await page.clock.runFor(2000);
  await setReducedMotion("reduce");
  await page.clock.runFor(1000);
  await setReducedMotion("no-preference");
  await page.clock.runFor(5000);
  expect(await hiddenAt(page)).toEqual([5000]);
});

test("a new message restarts the 4 s timer", async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await mountToast(page);
  await page.clock.runFor(3000);
  await page.evaluate(() => (window as unknown as ToastWindow).show("Copied it again"));
  await expect(page.getByText("Copied it again")).toBeVisible();
  await page.clock.runFor(3000);
  expect(await hiddenAt(page)).toEqual([]);
  await page.clock.runFor(1500);
  expect(await hiddenAt(page)).toEqual([8000]);
});

test("the toast speaks through a polite live region, and its action is a 44 px target", async ({ page }) => {
  await mountToast(page);
  const region = page.getByRole("status");
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveText("Copied the linkUndo");
  const undo = page.getByRole("button", { name: "Undo" });
  const target = await undo.evaluate((el: HTMLElement) => ({ width: el.offsetWidth >= 44, height: el.offsetHeight }));
  expect(target).toEqual({ width: true, height: 44 });
  await undo.click();
  expect(await page.evaluate(() => (window as unknown as ToastWindow).actions)).toBe(1);
});

test("on the home page the toast sits above the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Add the receipt")).toBeVisible();
  await dropFile(page, { name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
  const toast = page.getByText("That file is not a photo.");
  await expect(toast).toBeVisible();
  const pillTop = (await page.getByRole("button", { name: "Create link" }).boundingBox())!.y;
  await expect.poll(async () => {
    const box = (await toast.boundingBox())!;
    return box.y + box.height <= pillTop;
  }).toBe(true);
});

test("focus inside the toast holds its 4 s count and leaving it resumes the count", async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await mountToast(page);
  await page.locator("#opener").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.clock.runFor(20_000);
  expect(await hiddenAt(page)).toEqual([]);
  await page.keyboard.press("Shift+Tab");
  await page.clock.runFor(3900);
  expect(await hiddenAt(page)).toEqual([]);
  await page.clock.runFor(200);
  expect(await hiddenAt(page)).toHaveLength(1);
});

test("a mouse resting on the toast holds its count until it moves away", async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await mountToast(page);
  await page.getByText("Copied the link").hover();
  await page.clock.runFor(20_000);
  expect(await hiddenAt(page)).toEqual([]);
  await page.mouse.move(5, 5);
  await page.clock.runFor(4100);
  expect(await hiddenAt(page)).toHaveLength(1);
});

test("a toast that leaves with focus on its Undo gives focus back to where it was", async ({ page }) => {
  await mountToast(page);
  await page.locator("#opener").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.evaluate(() => (window as unknown as ToastWindow).show(null as unknown as string));
  await expect(page.locator("#opener")).toBeFocused();
});

test("Undo is a pressable target that text selection skips, and its focus ring differs from the toast's color", async ({ page }) => {
  await mountToast(page);
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("data-pressable", "");
  expect(await undo.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await page.locator("#opener").focus();
  await page.keyboard.press("Tab");
  const ring = await undo.evaluate((el) => {
    const style = getComputedStyle(el.querySelector("[data-press-face]")!);
    return { outline: style.outlineColor, width: style.outlineWidth, toast: getComputedStyle(el.parentElement!).backgroundColor };
  });
  expect(ring.width).toBe("2px");
  expect(ring.outline).not.toBe(ring.toast);
});

test("a message that wraps keeps room inside the bar, and a one-line toast stays 48 px tall", async ({ page }) => {
  await mountToast(page);
  const room = (text: string) =>
    page.getByText(text).evaluate((el: HTMLElement) => {
      const bar = el.parentElement!.getBoundingClientRect();
      const words = document.createRange();
      words.selectNodeContents(el);
      const lines = [...words.getClientRects()];
      const ink = { top: Math.min(...lines.map((r) => r.top)), bottom: Math.max(...lines.map((r) => r.bottom)), right: Math.max(...lines.map((r) => r.right)) };
      return { height: Math.round(bar.height), lines: new Set(lines.map((r) => Math.round(r.top))).size, top: Math.round(ink.top - bar.top), bottom: Math.round(bar.bottom - ink.bottom), right: Math.round(bar.right - ink.right) };
    });
  await page.evaluate(() => (window as unknown as ToastWindow).dropAction());
  expect((await room("Copied the link")).height).toBe(48);
  const long = "No connection, so the receipt couldn't be read. Try again once you're back online.";
  await page.evaluate((text) => (window as unknown as ToastWindow).show(text), long);
  const wrapped = await room(long);
  expect(wrapped.lines).toBe(2);
  expect(wrapped.top).toBeGreaterThanOrEqual(12);
  expect(wrapped.bottom).toBeGreaterThanOrEqual(12);
  expect(wrapped.right).toBeGreaterThanOrEqual(20);
});
