import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 8787);

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx wrangler dev --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
  },
});
