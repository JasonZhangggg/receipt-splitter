import type { Page } from "@playwright/test";

/** The header's menu button, on Home and on the Split page. On the Split page it holds Payments, the receipt photo and History; on Home, History (once there are stored Splits) and the light/dark change. */
export const menuButton = (page: Page) => page.getByRole("button", { name: "Menu", exact: true });
export const menuPopover = (page: Page) => page.getByRole("dialog", { name: "Menu" });

export async function fromMenu(page: Page, row: "Payments" | "History" | "Receipt photo" | "Dark mode" | "Light mode") {
  await menuButton(page).click();
  await menuPopover(page).getByRole("button", { name: row, exact: true }).click();
}

export const moreButton = menuButton;
export const moreMenu = menuPopover;
export const fromMore = fromMenu;
