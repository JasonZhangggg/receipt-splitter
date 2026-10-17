import { expect, test, type Locator, type Page } from "@playwright/test";

import { mountHarness } from "./harness";

test.use({ viewport: { width: 390, height: 844 } });

const harness = `
  import { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { SafeAreaProvider } from "react-native-safe-area-context";
  import { Button } from "./src/ui/components/button";
  function Harness() {
    const [disabled, setDisabled] = useState(false);
    window.setDisabled = setDisabled;
    return (
      <>
        <Button label="Create split link" outsideScroll disabled={disabled} onPress={() => window.presses++} />
        <Button label="In a list" kind="soft" onPress={() => window.presses++} />
      </>
    );
  }
  window.presses = 0;
  createRoot(document.getElementById("root")).render(<SafeAreaProvider><Harness /></SafeAreaProvider>);
`;

type Harness = Window & { presses: number; setDisabled: (disabled: boolean) => void };

async function mount(page: Page) {
  await mountHarness(page, harness);
  const button = page.getByRole("button", { name: "Create split link" });
  await expect(button).toBeVisible();
  return button;
}

const drawn = (button: Locator) => button.evaluate((el) => getComputedStyle(el).transform !== "none" || getComputedStyle(el).opacity !== "1");
const presses = (page: Page) => page.evaluate(() => (window as unknown as Harness).presses);
const setDisabled = async (page: Page, button: Locator, disabled: boolean) => {
  await page.evaluate((value) => (window as unknown as Harness).setDisabled(value), disabled);
  await expect.poll(() => button.getAttribute("aria-disabled")).toBe(disabled ? "true" : null);
};

async function touchDown(button: Locator) {
  const box = (await button.boundingBox())!;
  const cdp = await button.page().context().newCDPSession(button.page());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  return () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("a mouse press shows the press, and the release activates once", async ({ page }) => {
  const button = await mount(page);
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => drawn(button)).toBe(true);
  expect(await presses(page)).toBe(0);
  await page.mouse.up();
  await expect.poll(() => drawn(button)).toBe(false);
  expect(await presses(page)).toBe(1);
});

test("a touch press shows the press", async ({ page }) => {
  const button = await mount(page);
  const release = await touchDown(button);
  await expect.poll(() => drawn(button)).toBe(true);
  await release();
  await expect.poll(() => presses(page)).toBe(1);
});

test("Enter and Space each activate the focused Button once", async ({ page }) => {
  const button = await mount(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => presses(page)).toBe(1);
  await page.keyboard.press(" ");
  await expect.poll(() => presses(page)).toBe(2);
});

test("a disabled Button neither presses nor activates, even when it turns disabled during a press", async ({ page }) => {
  const button = await mount(page);
  await setDisabled(page, button, true);
  await button.click({ force: true });
  const release = await touchDown(button);
  const drawnWhileDisabled = await drawn(button);
  await release();
  expect({ drawnWhileDisabled, presses: await presses(page) }).toEqual({ drawnWhileDisabled: false, presses: 0 });

  await setDisabled(page, button, false);
  await button.focus();
  await page.keyboard.down(" ");
  await expect.poll(() => drawn(button)).toBe(true);
  await setDisabled(page, button, true);
  await expect.poll(() => drawn(button)).toBe(false);
  await page.keyboard.up(" ");
  const touchRelease = await touchDown(button);
  await touchRelease();
  await setDisabled(page, button, false);
  expect({ drawnAfterEnable: await drawn(button), presses: await presses(page) }).toEqual({
    drawnAfterEnable: false,
    presses: 0,
  });
});

test("under reduced motion a press dims the Button and never scales it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const button = await mount(page);
  const release = await touchDown(button);
  await expect.poll(() => button.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(await button.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  await release();
});

test("a tap shorter than the press delay still paints the pressed look", async ({ page }) => {
  await mount(page);
  const row = page.getByRole("button", { name: "In a list" });
  const box = (await row.boundingBox())!;
  await row.evaluate((el) => {
    const seen: { transform: string }[] = [];
    (window as unknown as { seen: typeof seen }).seen = seen;
    const frame = () => {
      seen.push({ transform: getComputedStyle(el).transform });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const cdp = await page.context().newCDPSession(page);
  const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await page.waitForTimeout(80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => (window as unknown as { seen: { transform: string }[] }).seen);
  const framesPressed = seen.filter((frame) => frame.transform !== "none").length;
  expect(await presses(page)).toBe(1);
  expect(framesPressed).toBeGreaterThan(3);
  expect(seen.at(-1)!.transform).toBe("none");
});
