import { expect, type Page } from "@playwright/test";

/** The header's menu button, on Home and on the Split page. On the Split page it holds Payments, the receipt photo and History; on Home, History (once there are stored Splits) and the light/dark change. */
export const menuButton = (page: Page) => page.getByRole("button", { name: "Menu", exact: true });
export const menuPopover = (page: Page) => page.getByRole("dialog", { name: "Menu" });

export async function fromMenu(page: Page, row: "Payments" | "History" | "Receipt photo" | "Dark mode" | "Light mode") {
  await menuButton(page).click();
  await menuPopover(page).getByRole("button", { name: row, exact: true }).click();
}

/** The Split page's underlined links and its theme toggle, which replaced the header menu. */
export async function fromMore(page: Page, row: "Payments" | "History" | "Receipt photo" | "People" | "Dark mode" | "Light mode") {
  await page.getByRole("button", { name: row === "Receipt photo" ? "Receipt" : row === "Dark mode" ? "Switch to dark mode" : row === "Light mode" ? "Switch to light mode" : row, exact: true }).click();
}

/** The Split page's People sheet: pick whose side the list shows. */
export async function viewAs(page: Page, name: string) {
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("group", { name: "People" }).getByRole("button", { name, exact: true }).click();
}

/** Opens the People sheet and reads the phone's own name off its "you" chip, then closes it. */
export async function youAre(page: Page, name: string) {
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByRole("group", { name: "People" }).getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "People" })).toHaveCount(0);
}
