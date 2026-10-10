import type { Page } from "@playwright/test";

/** The Split page header keeps Share; Payments, the receipt photo and History sit in its More menu. */
export const moreButton = (page: Page) => page.getByRole("button", { name: "More", exact: true });
export const moreMenu = (page: Page) => page.getByRole("dialog", { name: "More" });

export async function fromMore(page: Page, row: "Payments" | "History" | "Receipt photo") {
  await moreButton(page).click();
  await moreMenu(page).getByRole("button", { name: row, exact: true }).click();
}
