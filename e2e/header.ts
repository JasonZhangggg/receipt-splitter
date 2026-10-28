import { expect, type Page } from "@playwright/test";

/** The Split page's underlined links and its theme toggle, which replaced the header menu. */
export async function fromMore(page: Page, row: "Payments" | "History" | "Receipt photo" | "People" | "Dark mode" | "Light mode") {
  if (row === "People") return openPeople(page);
  await page.getByRole("button", { name: row === "Receipt photo" ? "Receipt" : row === "Dark mode" ? "Switch to dark mode" : row === "Light mode" ? "Switch to light mode" : row, exact: true }).click();
}

/** At 1024 px and wider the Split page has no sheets: People shows in the right column as a region, and is reached from the "What you had" menu. */
export const isWide = (page: Page) => page.viewportSize()!.width >= 1024;

const switcher = (page: Page) => page.getByRole("button", { name: /Choose whose share to show$/ });
const picker = (page: Page) => page.getByRole("dialog", { name: "Choose whose share to show" });

export const peopleSheet = (page: Page) => (isWide(page) ? page.getByRole("region", { name: "People" }) : page.getByRole("dialog", { name: "People" }));

async function openPeople(page: Page) {
  if (!isWide(page)) return page.getByRole("button", { name: "People", exact: true }).click();
  await switcher(page).click();
  await picker(page).getByRole("button", { name: "Edit people" }).click();
}

/** A person's row in the People sheet. This phone's own row reads "<name>, you". */
export const personRow = (page: Page, name: string) => peopleSheet(page).getByRole("button", { name, exact: true });

/** Opens the People sheet and waits for it to come to rest. */
export async function showPeople(page: Page, name: string) {
  await openPeople(page);
  await expect(personRow(page, `${name}, you`)).toBeVisible();
  await page.waitForTimeout(600);
}

/** The Split page's People sheet: pick whose side the list shows. The sheet closes on the tap. */
export async function viewAs(page: Page, name: string) {
  if (isWide(page)) {
    await switcher(page).click();
    const row = picker(page).getByRole("button", { name, exact: true });
    // The menu names this computer's own row "You".
    await ((await row.count()) ? row : picker(page).getByRole("button", { name: "You", exact: true })).click();
    await expect(picker(page)).toHaveCount(0);
    return;
  }
  await openPeople(page);
  await personRow(page, name).click();
  await expect(peopleSheet(page)).toHaveCount(0);
}

/** Opens the People sheet and reads this device's own name off its "This phone is" ("This computer is") line, then closes it. */
export async function youAre(page: Page, name: string) {
  await openPeople(page);
  await expect(peopleSheet(page).getByText(`This ${isWide(page) ? "computer" : "phone"} is ${name}.`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(peopleSheet(page)).toHaveCount(0);
}

/** Link ready, which greets the Host once Create link lands: a dialog on a phone, the column's region on a wide screen. */
export const linkReady = (page: Page) => (isWide(page) ? page.getByRole("region", { name: "Your link is ready" }) : page.getByRole("dialog", { name: "Your link is ready" }));

/** Closes Link ready, so a test that only made the Split carries on from the page. */
export async function closeLinkReady(page: Page) {
  await expect(linkReady(page)).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(linkReady(page)).toHaveCount(0);
}
