import { expect, test } from "@playwright/test";

test("the page shell is ready before the bundle runs", async ({ page }) => {
  const html = await (await page.request.get("/")).text();
  expect(html).toContain('content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content"');
  expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
  expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');

  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe("manipulation");
});

test("a Home Screen install opens standalone with the receipt icon", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect({ name: manifest.name, display: manifest.display, start: manifest.start_url }).toEqual({ name: "SplitWith", display: "standalone", start: "/" });
  for (const src of [...manifest.icons.map((icon: { src: string }) => icon.src), "/apple-touch-icon.png"]) {
    const icon = await request.get(src);
    expect({ src, status: icon.status(), type: icon.headers()["content-type"] }).toEqual({ src, status: 200, type: "image/png" });
  }
});

test("the content-hashed bundle is cached for a year", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const entry = html.match(/src="(\/_expo\/static\/js\/web\/entry-[0-9a-f]+\.js)"/)![1];
  const response = await request.get(entry);
  expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});
