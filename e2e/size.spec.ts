import { randomInt } from "node:crypto";
import { expect, test } from "./without-ocr";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

const budgetBytes = 429_000;

test("the first load of a Split link transfers under 429 KB", async ({ page, request }) => {
  const created = await request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.51.${randomInt(200, 256)}.${randomInt(1, 255)}` },
    data: {
      split: {
        receipt: { items: [{ id: "rice", name: "Rice", price: 800 }], adjustments: [], subtotal: 800, total: 800 },
        participants: [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }],
        paymentHandles: [{ service: "venmo", handle: "jason-z" }],
      },
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  const bodies: Promise<number>[] = [];
  page.on("requestfinished", (request) => bodies.push(request.sizes().then((sizes) => sizes.responseBodySize)));
  await page.goto(`/s/${id}`);
  await expect(page.getByRole("heading", { name: "Which one are you?" })).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  const transferred = (await Promise.all(bodies)).reduce((sum, size) => sum + size, 0);
  expect(transferred).toBeLessThan(budgetBytes);
});
