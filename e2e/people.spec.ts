import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";
import { fromMore, peopleSheet, personRow, showPeople, viewAs } from "./header";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "sprite", name: "Sprite", price: 250 },
  ],
  adjustments: [],
  subtotal: 1050,
  total: 1050,
};

const dozen = ["Jason", "Sam", "Priya", "Alexandra Bartholomew", "Chen", "Dmitri", "Esperanza Fernandez", "Fatima", "Giovanni", "Hiroshi", "Ingrid", "Jean-Baptiste Emmanuel"];

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number, names = ["Jason", "Sam", "Priya"]): Promise<string> {
  creates += 1;
  const participants = names.map((name) => ({ id: name.toLowerCase().replace(/\W/g, ""), name }));
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${150 + workerIndex}.${creates}` },
    data: { split: { receipt: dinner, participants, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

async function open(from: Browser | Page, link: string, name: string): Promise<Page> {
  const page = "goto" in from ? from : await (await newContext(from)).newPage();
  await page.goto(link);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name, exact: true }).click();
  await expect(owe(page)).toBeVisible(live);
  return page;
}

/** Remove mode: the sheet's "Remove someone" link turns each row into a Remove button. */
async function removeMode(page: Page) {
  await peopleSheet(page).getByRole("button", { name: "Remove someone" }).click();
}

const menu = (page: Page, name: string) => page.getByRole("dialog", { name: `Options for ${name}` });
const owe = (page: Page) => page.getByTestId("owe");
const circle = (page: Page, item: string, name: string) => page.getByRole("button", { name: `${item}, check for ${name}` });

test("viewing as another person ticks under their name after one confirm", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const priya = await open(browser, link, "Priya");

  await showPeople(sam, "Sam");
  await expect(personRow(sam, "Priya")).toContainText("$0.00");
  await personRow(sam, "Priya").click();
  await expect(sam.getByTestId("viewing")).toHaveText("Viewing as Priya. Dots tick for them.Back to you");
  await expect(sam.getByTestId("footer")).toContainText("Priya's share");

  await circle(sam, "Rice", "Priya").click();
  await sam.getByRole("dialog", { name: "Check Rice for Priya?" }).getByRole("button", { name: "Check for Priya" }).click();
  await expect(circle(sam, "Rice", "Priya")).toHaveAttribute("aria-pressed", "true", live);
  await circle(sam, "Sprite", "Priya").click();
  await expect(circle(sam, "Sprite", "Priya")).toHaveAttribute("aria-pressed", "true", live);
  await expect(sam.getByRole("dialog", { name: /for Priya\?$/ })).toHaveCount(0);

  await expect(circle(priya, "Rice", "Priya")).toHaveAttribute("aria-pressed", "true", live);
  await expect(owe(priya)).toHaveText("$10.50", live);
  await expect(circle(priya, "Rice", "Sam")).toHaveCount(0);

  await sam.getByRole("button", { name: "Back to you" }).click();
  await expect(sam.getByTestId("viewing")).toHaveCount(0);
  await expect(sam.getByTestId("footer")).toContainText("Your share");
  await expect(owe(sam)).toHaveText("$0.00");
});

test("a sheet opened from the keyboard takes focus, so the next key does not reach the page behind it", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex), "Sam");
  await sam.getByRole("button", { name: "People", exact: true }).focus();
  await sam.keyboard.press("Enter");
  await expect(peopleSheet(sam)).toBeFocused();
});

test("twelve people with long names scroll in the sheet and no row spills out of it", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex, dozen), "Sam");
  await showPeople(sam, "Sam");
  const sheet = await peopleSheet(sam).boundingBox();
  expect(sheet).not.toBeNull();
  for (const name of dozen) {
    const row = personRow(sam, name === "Sam" ? "Sam, you" : name);
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(sheet?.x ?? 0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((sheet?.x ?? 0) + (sheet?.width ?? 0) + 1);
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});

test("the sheet adds a person, who shows with a $0.00 share, and refuses a name already there", async ({ browser, request }, { workerIndex }) => {
  const sam = await open(browser, await createSplit(request, workerIndex), "Sam");
  await showPeople(sam, "Sam");
  await peopleSheet(sam).getByRole("button", { name: "Add a person" }).click();
  await sam.getByRole("textbox", { name: "Name" }).fill("Lee");
  await sam.keyboard.press("Enter");
  await expect(personRow(sam, "Lee")).toContainText("$0.00", live);

  await peopleSheet(sam).getByRole("button", { name: "Add a person" }).click();
  await sam.getByRole("textbox", { name: "Name" }).fill("lee");
  await sam.keyboard.press("Enter");
  await expect(peopleSheet(sam).getByRole("alert")).toHaveText("That name is already here.");
});

test("Remove someone opens the person menu with what goes with them, the Host has no Remove, and Escape closes the menu before the sheet", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  await circle(sam, "Rice", "Sam").click();
  await showPeople(sam, "Sam");
  await removeMode(sam);

  await expect(peopleSheet(sam).getByRole("button", { name: "Remove Jason" })).toBeDisabled();
  await peopleSheet(sam).getByRole("button", { name: "Remove Sam" }).click();
  await expect(menu(sam, "Sam").getByText("Removing Sam unchecks 1 item.")).toBeVisible(live);

  await sam.keyboard.press("Escape");
  await expect(menu(sam, "Sam")).toHaveCount(0, live);
  await expect(peopleSheet(sam)).toBeVisible();
  await peopleSheet(sam).getByRole("button", { name: "Done" }).click();
  await expect(personRow(sam, "Priya")).toBeVisible();
});

test("removing a person who checked an Item gives the other claimer the whole Item, unpicks their phone, and History can revert it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const priya = await open(browser, link, "Priya");
  await circle(sam, "Rice", "Sam").click();
  await circle(priya, "Rice", "Priya").click();
  await expect(owe(sam)).toHaveText("$4.00", live);

  await showPeople(sam, "Sam");
  await removeMode(sam);
  await peopleSheet(sam).getByRole("button", { name: "Remove Priya" }).click();
  await expect(menu(sam, "Priya").getByText("Removing Priya unchecks 1 item.")).toBeVisible(live);
  await menu(sam, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(personRow(sam, "Priya")).toHaveCount(0, live);
  await sam.keyboard.press("Escape");
  await expect(peopleSheet(sam)).toHaveCount(0, live);
  await expect(owe(sam)).toHaveText("$8.00", live);
  await expect(priya.getByText("Pick your name to check off what you had.")).toBeVisible(live);
  await priya.getByRole("button", { name: "People", exact: true }).click();
  await expect(peopleSheet(priya)).toHaveCount(0);
  await expect(priya.getByRole("dialog", { name: "Which one are you?" })).toBeVisible(live);

  await fromMore(sam, "History");
  await expect(sam.getByText("Removed Priya from the split")).toBeVisible(live);
  await sam.getByRole("button", { name: /^Revert Removed Priya/ }).click();
  await expect(owe(sam)).toHaveText("$4.00", live);
  await sam.keyboard.press("Escape");
  await expect(sam.getByRole("dialog", { name: "History" })).toHaveCount(0, live);
  await showPeople(sam, "Sam");
  await expect(personRow(sam, "Priya")).toBeVisible(live);
});

test("the People sheet open on a phone closes when another phone removes that phone's person", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const priya = await open(browser, link, "Priya");
  await showPeople(priya, "Priya");

  await showPeople(sam, "Sam");
  await removeMode(sam);
  await peopleSheet(sam).getByRole("button", { name: "Remove Priya" }).click();
  await menu(sam, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(peopleSheet(priya)).toHaveCount(0, live);
  await expect(priya.getByText("Pick your name to check off what you had.")).toBeVisible(live);
});

test("a phone viewing a person goes back to its own view when another phone removes them, and the sheet drops their row", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const jason = await open(browser, link, "Jason");
  await viewAs(sam, "Priya");
  await expect(sam.getByTestId("viewing")).toBeVisible();
  await showPeople(sam, "Sam");

  await showPeople(jason, "Jason");
  await removeMode(jason);
  await peopleSheet(jason).getByRole("button", { name: "Remove Priya" }).click();
  await menu(jason, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(personRow(sam, "Priya")).toHaveCount(0, live);
  await sam.keyboard.press("Escape");
  await expect(sam.getByTestId("viewing")).toHaveCount(0, live);
  await expect(sam.getByTestId("footer")).toContainText("Your share");
});

test("a person menu open for someone another phone removes closes, and the next one still opens", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex, ["Jason", "Sam", "Priya", "Lee"]);
  const sam = await open(browser, link, "Sam");
  const jason = await open(browser, link, "Jason");

  await showPeople(sam, "Sam");
  await removeMode(sam);
  await showPeople(jason, "Jason");
  await removeMode(jason);
  await peopleSheet(sam).getByRole("button", { name: "Remove Priya" }).click();
  await expect(menu(sam, "Priya")).toBeVisible(live);
  await peopleSheet(jason).getByRole("button", { name: "Remove Priya" }).click();
  await menu(jason, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(menu(sam, "Priya")).toHaveCount(0, live);
  await peopleSheet(sam).getByRole("button", { name: "Remove Lee" }).click();
  await expect(menu(sam, "Lee").getByRole("button", { name: "Remove Lee" })).toBeVisible(live);
});

test("a removal the server refuses says so under the rows, and the person stays", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const context = await newContext(browser);
  const sam = await context.newPage();
  await sam.routeWebSocket(/\/parties\//, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => {
      const frame = JSON.parse(String(message));
      if (frame.op?.type === "removeParticipant") client.send(JSON.stringify({ type: "rejected", ref: frame.ref, rejection: { reason: "tooLarge" } }));
      else server.send(message);
    });
    server.onMessage((message) => client.send(message));
  });
  await sam.goto(link);
  await sam.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }).click();
  await expect(owe(sam)).toBeVisible(live);
  await showPeople(sam, "Sam");

  await removeMode(sam);
  await peopleSheet(sam).getByRole("button", { name: "Remove Priya" }).click();
  await menu(sam, "Priya").getByRole("button", { name: "Remove Priya" }).click();

  await expect(sam.getByText("Couldn't save that. Check it and try again.")).toBeVisible(live);
  await expect(peopleSheet(sam).getByRole("button", { name: "Remove Priya" })).toBeVisible();
});

test("Switch account to a name another phone holds asks there, takes the name, and tells the other phone to pick", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  const priya = await open(browser, link, "Priya");

  await showPeople(sam, "Sam");
  await peopleSheet(sam).getByRole("button", { name: "Switch account" }).click();
  await peopleSheet(sam).getByRole("button", { name: "Priya, picked on another phone" }).click();
  await expect(peopleSheet(sam).getByText("Picked on another phone.")).toBeVisible();
  await peopleSheet(sam).getByRole("listitem").getByRole("button", { name: "Cancel" }).click();
  await expect(peopleSheet(sam).getByText("Picked on another phone.")).toHaveCount(0);
  await peopleSheet(sam).getByRole("button", { name: "Priya, picked on another phone" }).click();
  await peopleSheet(sam).getByRole("button", { name: "That's me" }).click();

  await expect(peopleSheet(sam)).toHaveCount(0, live);
  await expect(circle(sam, "Rice", "Priya")).toBeVisible();
  await expect(sam.getByTestId("footer")).toContainText("Your share");
  await expect(priya.getByRole("status").filter({ hasText: "Priya was picked on another phone" })).toBeVisible(live);
  await expect(sam.getByRole("status").filter({ hasText: "picked on another phone" })).toHaveCount(0);

  const third = await (await newContext(browser)).newPage();
  await third.goto(link);
  const which = third.getByRole("dialog", { name: "Which one are you?" });
  await expect(which.getByRole("button", { name: "Sam", exact: true })).toBeVisible(live);
  await expect(which.getByRole("button", { name: "Priya, picked on another phone" })).toBeVisible();
  await expect(which.getByRole("button", { name: "Sam, picked on another phone" })).toHaveCount(0);
});

test("a name that another phone picks while the Switch account list is open asks instead of taking it", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link, "Sam");
  await showPeople(sam, "Sam");
  await peopleSheet(sam).getByRole("button", { name: "Switch account" }).click();

  await open(browser, link, "Priya");
  await expect(peopleSheet(sam).getByRole("button", { name: "Priya, picked on another phone" })).toBeVisible(live);
});
