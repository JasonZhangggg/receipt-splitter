import { expect, test, type Page } from "@playwright/test";

import { dropFile } from "./files";
import { mountHarness } from "./harness";

test.use({ viewport: { width: 390, height: 844 } });

type ToastWindow = Window & { hiddenAt: number[]; show: (message: string) => void; actions: number };

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
      window.show = setMessage;
      const hide = () => { window.hiddenAt.push(Date.now()); setMessage(null); };
      return (
        <View style={{ height: 600 }}>
          <Toast message={message} onHide={hide} action={{ label: "Undo", onPress: () => window.actions++ }} />
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
  const pillTop = (await page.getByRole("button", { name: "Create split link" }).boundingBox())!.y;
  await expect.poll(async () => {
    const box = (await toast.boundingBox())!;
    return box.y + box.height <= pillTop;
  }).toBe(true);
});
