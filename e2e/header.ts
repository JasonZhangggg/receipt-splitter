import { expect, type Page } from "@playwright/test";

/** The Split page's underlined links and its theme toggle, which replaced the header menu. */
export async function fromMore(page: Page, row: "Payments" | "History" | "Receipt photo" | "People" | "Dark mode" | "Light mode") {
  await page.getByRole("button", { name: row === "Receipt photo" ? "Receipt" : row === "Dark mode" ? "Switch to dark mode" : row === "Light mode" ? "Switch to light mode" : row, exact: true }).click();
}

export const peopleSheet = (page: Page) => page.getByRole("dialog", { name: "People" });

/** A person's row in the People sheet. This phone's own row reads "<name>, you". */
export const personRow = (page: Page, name: string) => peopleSheet(page).getByRole("button", { name, exact: true });

/** Opens the People sheet and waits for it to come to rest. */
export async function showPeople(page: Page, name: string) {
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(personRow(page, `${name}, you`)).toBeVisible();
  await page.waitForTimeout(600);
}

/** The Split page's People sheet: pick whose side the list shows. The sheet closes on the tap. */
export async function viewAs(page: Page, name: string) {
  await page.getByRole("button", { name: "People", exact: true }).click();
  await personRow(page, name).click();
  await expect(peopleSheet(page)).toHaveCount(0);
}

/** Opens the People sheet and reads this phone's own name off its "This phone is" line, then closes it. */
export async function youAre(page: Page, name: string) {
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(peopleSheet(page).getByText(`This phone is ${name}.`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(peopleSheet(page)).toHaveCount(0);
}
