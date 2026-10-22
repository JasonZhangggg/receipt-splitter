import type { Locator } from "@playwright/test";

/** Picks how an Item splits from the Edit item sheet: the mode link opens the menu, and a tap on a way picks it and closes the menu. */
export async function chooseMode(sheet: Locator, mode: string) {
  await sheet.getByRole("button", { name: /^How to split: / }).click();
  const menu = sheet.page().getByRole("dialog", { name: "How to split" });
  await menu.getByRole("button", { name: mode, exact: true }).click();
  await menu.waitFor({ state: "detached" });
}
