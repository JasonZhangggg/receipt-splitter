import { expect, type Page } from "@playwright/test";

export type AddChoice = "Item" | "Tax" | "Tip" | "Discount";

/** The receipt's one Add row. */
export const addRow = (page: Page) => page.getByTestId("receipt").getByRole("button", { name: "Add", exact: true });

/** Opens the Add menu and picks a kind from it; the form for that kind opens in its place. */
export async function openAdd(page: Page, choice: AddChoice) {
  await addRow(page).click();
  const menu = page.getByRole("dialog", { name: "Add to the receipt" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: choice, exact: true }).click();
}
