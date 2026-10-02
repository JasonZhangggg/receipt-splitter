import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 8787);

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    // The Split page's sheet is where iOS Safari has differed; the rest of the suite stays on one engine to keep CI short.
    { name: "mobile-safari", use: { ...devices["iPhone 15"] }, testMatch: ["sheet.spec.ts", "claim.spec.ts"] },
  ],
  webServer: {
    command: `npm run build && npx wrangler dev --port ${port} --inspector-port ${port + 10000}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
