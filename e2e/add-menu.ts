import { expect, type Page } from "@playwright/test";

export type AddChoice = "Item" | "Tax" | "Tip" | "Fee" | "Discount";

/** The receipt's one Add link. */
export const addRow = (page: Page) => page.getByTestId("receipt").getByRole("button", { name: "Add item, tax, tip or discount", exact: true });

/** The one Add sheet. */
export const addSheet = (page: Page) => page.getByRole("dialog", { name: "Add to the receipt" });

/** Opens the Add sheet and picks a kind in it. */
export async function openAdd(page: Page, choice: AddChoice) {
  await addRow(page).click();
  const sheet = addSheet(page);
  await expect(sheet).toBeVisible();
  await sheet.getByRole("group", { name: "What to add" }).getByRole("button", { name: choice, exact: true }).click();
  await expect(sheet.getByRole("group", { name: "What to add" }).getByRole("button", { name: choice, exact: true })).toHaveAttribute("aria-pressed", "true");
}
