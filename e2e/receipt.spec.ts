import { expect, newContext, test, type APIRequestContext, type Browser, type Page } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const live = { timeout: 15_000 };

const bucket = (run: 1 | 2, guinness: number, watermelon: number) => [
  { id: `ultra${run}`, name: "Michelob Ultra 16oz Aluminum Bottle", price: 629 },
  { id: `guinness${run}`, name: "Guinness Draught 14.9oz Can", price: 729 * guinness, quantity: guinness },
  { id: `pineapple${run}`, name: "High Noon Pineapple 12oz Can", price: 849 },
  { id: `watermelon${run}`, name: "High Noon Watermelon 12oz Can", price: 849 * watermelon, ...(watermelon > 1 ? { quantity: watermelon } : {}) },
];

const topgolf = {
  items: [{ id: "gameplay", name: "Gameplay", price: 8775 }, ...bucket(1, 3, 1), ...bucket(2, 2, 2)],
  adjustments: [
    { id: "bucket1", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -451, bundle: { name: "Beer Bucket", items: ["ultra1", "guinness1", "pineapple1", "watermelon1"] } },
    { id: "bucket2", kind: "bundleDiscount", name: "Beer Bucket Discount (10%)", amount: -463, bundle: { name: "Beer Bucket", items: ["ultra2", "guinness2", "pineapple2", "watermelon2"] } },
    { id: "tax", kind: "tax", name: "Tax", amount: 494 },
    { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
  ],
  subtotal: 17923,
  total: 20729,
};

let creates = 0;

async function createSplit(request: APIRequestContext, workerIndex: number): Promise<string> {
  creates += 1;
  const response = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.52.${100 + workerIndex}.${creates}` },
    data: {
      split: {
        receipt: topgolf,
        participants: [
          { id: "jason", name: "Jason" },
          { id: "sam", name: "Sam" },
          { id: "priya", name: "Priya" },
        ],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  return new URL(`/s/${id}`, response.url()).href;
}

const pickSheet = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" });

async function open(browser: Browser, link: string): Promise<Page> {
  const page = await (await newContext(browser)).newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return page;
}

async function pick(page: Page, name: string) {
  await pickSheet(page).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: `${name}, you`, exact: true })).toBeVisible(live);
}

const firstBucket = (page: Page) => page.getByRole("button", { name: /^Beer Bucket, / }).first();
const guinness = (page: Page) => page.getByRole("button", { name: /^Open 3x Guinness Draught 14\.9oz Can, \$21\.87, / });
const guinnessCircle = (page: Page, name: string) => page.getByRole("button", { name: `3x Guinness Draught 14.9oz Can, check for ${name}` });
const cans = (page: Page) => page.getByRole("button", { name: /^Open Guinness Draught 14\.9oz Can, \$7\.29, / });

test("a Beer Bucket opens and closes from the keyboard in place, says so through aria-expanded, and keeps focus on its header", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");

  await expect(page.getByRole("button", { name: "Beer Bucket, 6 items, 10% off, collapsed" })).toHaveCount(2);
  await firstBucket(page).focus();
  await page.keyboard.press("Enter");

  await expect(firstBucket(page)).toHaveAttribute("aria-expanded", "true");
  await expect(firstBucket(page)).toHaveAccessibleName("Beer Bucket, 6 items, 10% off, expanded");
  await expect(firstBucket(page)).toBeFocused();
  await expect(guinness(page)).toHaveCount(1);
  await expect(guinness(page)).toBeVisible();
  const region = await firstBucket(page).getAttribute("aria-controls");
  await expect(page.locator(`[id="${region}"]`).getByRole("button", { name: /^Open 3x Guinness/ })).toHaveCount(1);
  await expect(page.locator(`[id="${region}"]`).getByRole("list", { name: "Beer Bucket" })).toHaveCount(1);

  await page.keyboard.press("Space");
  await expect(firstBucket(page)).toHaveAttribute("aria-expanded", "false");
  await expect(firstBucket(page)).toBeFocused();
  await expect(guinness(page)).toHaveCount(0);
  await expect(page.locator(`[id="${region}"]`).getByRole("list")).toHaveCount(0);
});

// It samples the height on every animation frame, while the CSS transition runs on wall-clock time, so slow frames see too few steps.
test("a Beer Bucket grows open over several frames instead of jumping to its full height", { tag: "@frame-timing" }, async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  const region = await firstBucket(page).getAttribute("aria-controls");
  const heights = page.evaluate(
    (id) =>
      new Promise<number[]>((resolve) => {
        const box = document.getElementById(id ?? "");
        const seen: number[] = [];
        const sample = () => {
          seen.push(Math.round(box?.getBoundingClientRect().height ?? -1));
          if (seen.length < 90) requestAnimationFrame(sample);
          else resolve(seen);
        };
        requestAnimationFrame(sample);
      }),
    region,
  );
  await firstBucket(page).click();

  const seen = await heights;
  const full = seen.at(-1) ?? 0;
  expect(full).toBeGreaterThan(200);
  expect(seen.filter((height) => height > 0 && height < full * 0.9).length).toBeGreaterThan(2);
});

test("the Guinness line is one 3x row at 21.87, and its circle claims the whole line", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  await firstBucket(page).click();

  await expect(guinness(page)).toHaveCount(1);
  await expect(guinness(page).getByText("3x", { exact: true })).toBeVisible();
  await expect(cans(page)).toHaveCount(0);
  await guinnessCircle(page, "Sam").click();

  await expect(guinnessCircle(page, "Sam")).toHaveAttribute("aria-pressed", "true", live);
  await expect(page.getByRole("button", { name: "Open 3x Guinness Draught 14.9oz Can, $21.87, had by Sam" })).toHaveCount(1);
  await firstBucket(page).click();
  await expect(firstBucket(page)).toHaveAccessibleName("Beer Bucket, 6 items, 10% off, had by Sam, 3 unclaimed, collapsed");
  await expect(firstBucket(page).getByText("3 unclaimed", { exact: true })).toBeVisible();
});

test("the Item sheet shows the gray line under a row's name in its Detail field, and renaming the Item keeps that line", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pick(page, "Sam");
  const sheet = page.getByRole("dialog", { name: "Item" });
  const field = (name: string) => sheet.getByRole("textbox", { name, exact: true });

  await page.getByRole("button", { name: /^Open Gameplay, / }).click();
  await expect(field("Item name")).toHaveValue("Gameplay");
  await expect(field("Detail")).toHaveValue("");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);

  await firstBucket(page).click();
  const ultra = page.getByRole("button", { name: /^Open Michelob Ultra 16oz Aluminum Bottle, / });
  await expect(ultra.getByText("16oz Aluminum Bottle", { exact: true })).toBeVisible();
  await ultra.click();
  await expect(field("Item name")).toHaveValue("Michelob Ultra");
  await expect(field("Detail")).toHaveValue("16oz Aluminum Bottle");

  await field("Item name").fill("Michelob Ultra Lite");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0, live);
  const renamed = page.getByRole("button", { name: /^Open Michelob Ultra Lite, / });
  await expect(renamed.getByText("Michelob Ultra Lite", { exact: true })).toBeVisible(live);
  await expect(renamed.getByText("16oz Aluminum Bottle", { exact: true })).toBeVisible();
});

test("Split turns the 3x Guinness line into three rows at 7.29 with its claims for everyone, and Revert brings back the one 3x row", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await firstBucket(sam).click();
  await firstBucket(priya).click();
  await guinnessCircle(sam, "Sam").click();
  await expect(guinnessCircle(sam, "Sam")).toHaveAttribute("aria-pressed", "true", live);

  await guinness(sam).click();
  const sheet = sam.getByRole("dialog", { name: "Item" });
  await expect(sheet.getByText("In Beer Bucket. Its 10% off takes $2.19 off this line.")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("21.87");
  await expect(sheet.getByTestId("quantity")).toHaveText("3");
  await expect(sheet.getByText("each", { exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Split into 3" }).click();

  await expect(sheet).toHaveCount(0, live);
  await expect(cans(sam)).toHaveCount(3);
  await expect(sam.getByRole("button", { name: "Open Guinness Draught 14.9oz Can, $7.29, had by Sam" })).toHaveCount(3);
  await expect(guinness(sam)).toHaveCount(0);
  await expect(priya.getByRole("button", { name: "Open Guinness Draught 14.9oz Can, $7.29, had by Sam" })).toHaveCount(3, live);
  await expect(priya.locator(`[id="${await firstBucket(priya).getAttribute("aria-controls")}"]`).getByText("3x", { exact: true })).toHaveCount(0);
  await expect(firstBucket(priya)).toHaveAccessibleName("Beer Bucket, 6 items, 10% off, had by Sam, 3 unclaimed, expanded");

  await priya.getByRole("button", { name: "History" }).click();
  await priya.getByRole("button", { name: "Revert Split Guinness Draught 14.9oz Can into 3" }).click();
  await priya.getByRole("alertdialog", { name: "Revert Sam's change?" }).getByRole("button", { name: "Revert" }).click();
  await expect(priya.getByText("Reverted")).toBeVisible(live);
  await expect(sam.getByRole("button", { name: "Open 3x Guinness Draught 14.9oz Can, $21.87, had by Sam" })).toHaveCount(1, live);
  await expect(cans(sam)).toHaveCount(0);
});

test("no frame shows the 3x row beside the rows Split adds, or two 3x rows", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  await pick(sam, "Sam");
  await firstBucket(sam).click();
  await guinness(sam).click();
  const region = await firstBucket(sam).getAttribute("aria-controls");
  const frames = sam.evaluate(
    (id) =>
      new Promise<string[]>((resolve) => {
        const box = document.getElementById(id ?? "");
        const seen: string[] = [];
        const started = performance.now();
        const sample = () => {
          const rows = [...(box?.querySelectorAll('[role="listitem"]') ?? [])].map((row) => row.textContent ?? "").filter((text) => text.includes("Guinness"));
          seen.push(rows.map((text) => (text.includes("3x") ? "3x" : text.includes("7.29") ? "7.29" : "?")).join(" "));
          if (performance.now() - started < 4000) requestAnimationFrame(sample);
          else resolve(seen);
        };
        requestAnimationFrame(sample);
      }),
    region,
  );
  await sam.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Split into 3" }).click();

  const seen = [...new Set(await frames)];
  expect(seen).toEqual(["3x", "7.29 7.29 7.29"]);
});

type Op = { type: string; items?: { type: string }[] };

/** A page whose frames run `rafDelay` ms late; an Operation that `hold` matches waits for `release` before it reaches the server. */
async function slowFramesOpenHolding(browser: Browser, link: string, rafDelay: number, hold: (op: Op) => boolean = () => false) {
  const page = await (await newContext(browser)).newPage();
  await page.addInitScript((delay) => {
    const frame = window.requestAnimationFrame.bind(window);
    Object.assign(window, { sampleFrame: frame });
    if (delay > 0) window.requestAnimationFrame = (callback) => frame(() => setTimeout(() => frame(callback), delay));
  }, rafDelay);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.routeWebSocket(/\/parties\/split-server\//, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      const op = typeof message === "string" ? (JSON.parse(message) as { op?: Op }).op : undefined;
      if (op && hold(op)) void held.then(() => server.send(message));
      else server.send(message);
    });
  });
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  return { page, release };
}

async function slowFramesOpen(browser: Browser, link: string, rafDelay: number): Promise<Page> {
  return (await slowFramesOpenHolding(browser, link, rafDelay)).page;
}

const isSplit = (op: Op) => op.type === "editReceipt" && op.items?.[0]?.type === "split";
const isDelete = (op: Op) => op.type === "editReceipt" && op.items?.[0]?.type === "delete";

/** What the Item sheet shows on each frame until it is gone: its heading, the Price field, and every amount in its text. */
function sheetFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const frame = (window as unknown as { sampleFrame: typeof requestAnimationFrame }).sampleFrame;
        const seen: string[] = [];
        const started = performance.now();
        const sample = () => {
          const sheet = document.querySelector('[role="dialog"][aria-label="Item"]');
          if (sheet) {
            const heading = sheet.querySelector('[role="heading"]')?.textContent ?? "no heading";
            const price = (sheet.querySelector('input[aria-label="Price"]') as HTMLInputElement | null)?.value ?? "no price";
            const amounts = [...new Set((sheet.textContent ?? "").match(/\$\d+\.\d\d/g) ?? [])].join(" ");
            seen.push(`${heading} | ${price} | ${amounts}`);
          }
          if (performance.now() - started < 5000) frame(sample);
          else resolve(seen);
        };
        frame(sample);
      }),
  );
}

for (const rafDelay of [0, 200]) {
  test(`the Item sheet keeps showing the 3x line at 21.87 on every frame while Split closes it, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const sam = await slowFramesOpen(browser, await createSplit(request, workerIndex), rafDelay);
    await pick(sam, "Sam");
    await firstBucket(sam).click();
    await guinnessCircle(sam, "Sam").click();
    await expect(guinnessCircle(sam, "Sam")).toHaveAttribute("aria-pressed", "true", live);
    await guinness(sam).click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("21.87");
    const frames = sheetFrames(sam);

    await sheet.getByRole("button", { name: "Split into 3" }).click();

    await expect(sheet).toHaveCount(0, live);
    await expect(cans(sam)).toHaveCount(3);
    expect([...new Set(await frames)]).toEqual(["Item | 21.87 | $2.19 $21.87"]);
  });

  test(`the Item sheet keeps showing the deleted Item on every frame while Delete item closes it, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const sam = await slowFramesOpen(browser, await createSplit(request, workerIndex), rafDelay);
    await pick(sam, "Sam");
    await firstBucket(sam).click();
    await sam.getByRole("button", { name: /^Open Michelob Ultra 16oz Aluminum Bottle, / }).first().click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("6.29");
    const frames = sheetFrames(sam);

    await sheet.getByRole("button", { name: "Delete item" }).click();

    await expect(sheet).toHaveCount(0, live);
    expect([...new Set(await frames)]).toEqual(["Item | 6.29 | $0.63"]);
  });

  test(`a price typed just before Split shows with the Bundle note for that price on every frame while the Split waits on the server, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const { page: sam, release } = await slowFramesOpenHolding(browser, await createSplit(request, workerIndex), rafDelay, isSplit);
    await pick(sam, "Sam");
    await firstBucket(sam).click();
    await guinness(sam).click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    const price = sheet.getByRole("textbox", { name: "Price" });
    await expect(price).toHaveValue("21.87");
    await price.fill("24.00");
    const frames = sheetFrames(sam);

    await sheet.getByRole("button", { name: "Split into 3" }).click();
    await sam.waitForTimeout(1500);
    release();

    await expect(sheet).toHaveCount(0, live);
    await expect(sam.getByRole("button", { name: /^Open Guinness Draught 14\.9oz Can, \$8\.00, / })).toHaveCount(3, live);
    expect([...new Set(await frames)]).toEqual(["Item | 24.00 | $2.29"]);
  });

  test(`a claim from another device while Split waits on the server leaves the sheet on the tapped state, and the rows arrive with the claim, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const link = await createSplit(request, workerIndex);
    const { page: sam, release } = await slowFramesOpenHolding(browser, link, rafDelay, isSplit);
    const priya = await open(browser, link);
    await pick(sam, "Sam");
    await pick(priya, "Priya");
    await firstBucket(sam).click();
    await firstBucket(priya).click();
    await guinness(sam).click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("21.87");
    const frames = sheetFrames(sam);

    await sheet.getByRole("button", { name: "Split into 3" }).click();
    await guinnessCircle(priya, "Priya").click();
    await expect(sam.getByRole("button", { name: "Open 3x Guinness Draught 14.9oz Can, $21.87, had by Priya" })).toHaveCount(1, live);
    release();

    await expect(sheet).toHaveCount(0, live);
    await expect(sam.getByRole("button", { name: "Open Guinness Draught 14.9oz Can, $7.29, had by Priya" })).toHaveCount(3, live);
    expect([...new Set(await frames)]).toEqual(["Item | 21.87 | $2.19"]);
  });

  test(`a Split that loses a race to another device's Split leaves the sheet on the row as it is now, with its own price, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const link = await createSplit(request, workerIndex);
    const { page: sam, release } = await slowFramesOpenHolding(browser, link, rafDelay, isSplit);
    const priya = await open(browser, link);
    await pick(sam, "Sam");
    await pick(priya, "Priya");
    await firstBucket(sam).click();
    await firstBucket(priya).click();
    await guinness(sam).click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("21.87");
    const frames = sheetFrames(sam);

    await sheet.getByRole("button", { name: "Split into 3" }).click();
    await guinness(priya).click();
    await priya.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Split into 3" }).click();
    await expect(guinness(priya)).toHaveCount(0, live);
    release();

    await expect(sheet.getByText("Couldn't save that. Check it and try again.")).toBeVisible(live);
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("7.29");
    await expect(cans(sam)).toHaveCount(3, live);
    expect([...new Set(await frames)]).toEqual(["Item | 21.87 | $2.19", "Item | 7.29 | $0.73"]);
  });

  test(`a Delete item that loses a race to another device's Delete item closes the sheet on the tapped state, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const link = await createSplit(request, workerIndex);
    const { page: sam, release } = await slowFramesOpenHolding(browser, link, rafDelay, isDelete);
    const priya = await open(browser, link);
    await pick(sam, "Sam");
    await pick(priya, "Priya");
    await firstBucket(sam).click();
    await firstBucket(priya).click();
    await guinness(sam).click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("21.87");
    const frames = sheetFrames(sam);

    await sheet.getByRole("button", { name: "Delete item" }).click();
    await guinness(priya).click();
    await priya.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Delete item" }).click();
    await expect(guinness(priya)).toHaveCount(0, live);
    release();

    await expect(sheet).toHaveCount(0, live);
    await expect(guinness(sam)).toHaveCount(0);
    expect([...new Set(await frames)]).toEqual(["Item | 21.87 | $2.19"]);
  });

  test(`another device's Delete item closes an open Item sheet on the Item as it was, with frames ${rafDelay} ms late`, async ({ browser, request }, { workerIndex }) => {
    const link = await createSplit(request, workerIndex);
    const sam = await slowFramesOpen(browser, link, rafDelay);
    const priya = await open(browser, link);
    await pick(sam, "Sam");
    await pick(priya, "Priya");
    await firstBucket(sam).click();
    await firstBucket(priya).click();
    await guinness(sam).click();
    const sheet = sam.getByRole("dialog", { name: "Item" });
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("21.87");
    const frames = sheetFrames(sam);

    await guinness(priya).click();
    await priya.getByRole("dialog", { name: "Item" }).getByRole("button", { name: "Delete item" }).click();

    await expect(sheet).toHaveCount(0, live);
    await expect(guinness(sam)).toHaveCount(0);
    expect([...new Set(await frames)]).toEqual(["Item | 21.87 | $2.19"]);
  });
}

test("Delete item takes a Bundle Item off for everyone, and Revert brings it back", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const sam = await open(browser, link);
  const priya = await open(browser, link);
  await pick(sam, "Sam");
  await pick(priya, "Priya");
  await firstBucket(sam).click();
  await guinnessCircle(sam, "Sam").click();
  await expect(guinnessCircle(sam, "Sam")).toHaveAttribute("aria-pressed", "true", live);

  await sam.getByRole("button", { name: /^Open Michelob Ultra 16oz Aluminum Bottle, / }).first().click();
  const sheet = sam.getByRole("dialog", { name: "Item" });
  await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("6.29");
  await expect(sheet.getByRole("button", { name: /^Split into/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Delete item" }).click();
  await expect(sheet).toHaveCount(0, live);
  await expect(firstBucket(sam)).toHaveAccessibleName("Beer Bucket, 5 items, 10% off, had by Sam, 2 unclaimed, expanded");
  await expect(firstBucket(priya)).toHaveAccessibleName("Beer Bucket, 5 items, 10% off, had by Sam, 2 unclaimed, collapsed", live);

  await sam.getByRole("button", { name: "History" }).click();
  await sam.getByRole("button", { name: "Revert Removed Michelob Ultra 16oz Aluminum Bottle" }).click();
  await expect(sam.getByText("Reverted")).toBeVisible(live);
  await expect(firstBucket(priya)).toHaveAccessibleName("Beer Bucket, 6 items, 10% off, had by Sam, 3 unclaimed, collapsed", live);
});

test("a name already on the Split keeps the cursor in Add yourself after Enter, so the next keys fix it", async ({ browser, request }, { workerIndex }) => {
  const page = await open(browser, await createSplit(request, workerIndex));
  await pickSheet(page).getByRole("button", { name: "Not here? Add yourself" }).click();
  const field = page.getByRole("textbox", { name: "Your name" });
  await field.fill("Sam");
  await field.press("Enter");

  await expect(page.getByText("That name is already here.")).toBeVisible(live);
  await expect(field).toBeFocused();
  await page.keyboard.type(" K");
  await expect(field).toHaveValue("Sam K");
});

test("the pick sheet takes no taps while it leaves, so its Copy cannot fire after a name is picked", async ({ browser, request }, { workerIndex }) => {
  const link = await createSplit(request, workerIndex);
  const page = await (await newContext(browser)).newPage();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.routeWebSocket(/\/parties\/split-server\//, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (typeof message === "string" && JSON.parse(message).op?.type === "pick") void held.then(() => server.send(message));
      else server.send(message);
    });
  });
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible(live);
  const copy = pickSheet(page).getByRole("button", { name: "Copy" });
  await copy.click({ trial: true });

  await pickSheet(page).getByRole("button", { name: "Jason", exact: true }).click();
  await expect(copy.click({ trial: true, timeout: 1_000 })).rejects.toThrow(/pointer events/);
  release();
  await expect(page.getByRole("button", { name: "Jason, you", exact: true })).toBeVisible(live);
});

const secondBundleTops = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const header = [...document.querySelectorAll<HTMLElement>('[data-testid^="bundle-"]')][1];
        const seen: number[] = [];
        const started = performance.now();
        const sample = () => {
          seen.push(Math.round(header.getBoundingClientRect().top * 10) / 10);
          if (performance.now() - started < 1500) requestAnimationFrame(sample);
          else resolve(seen);
        };
        requestAnimationFrame(sample);
      }),
  );

test("a collapsed Bundle's unclaimed line grows in on the first claim and collapses out on the last, so the rows under it glide", { tag: "@frame-timing" }, async ({ page, request }, { workerIndex }) => {
  await page.goto(await createSplit(request, workerIndex));
  await pick(page, "Sam");
  const second = page.getByRole("button", { name: /^Beer Bucket, / }).nth(1);
  await expect(second).toBeVisible(live);
  const claim = page.getByRole("button", { name: "Gameplay, check for Sam" });

  const down = secondBundleTops(page);
  await claim.click();
  const grown = [...new Set(await down)];
  expect(grown.length).toBeGreaterThan(3);
  expect(grown.at(-1)! - grown[0]).toBeGreaterThan(10);

  const up = secondBundleTops(page);
  await claim.click();
  const shrunk = [...new Set(await up)];
  expect(shrunk.length).toBeGreaterThan(2);
  expect(shrunk[0] - shrunk.at(-1)!).toBeGreaterThan(10);
});
