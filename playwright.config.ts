import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 8787);

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npm run build && npx wrangler dev --port ${port} --inspector-port ${port + 10000} --var TURNSTILE_SECRET_KEY:1x0000000000000000000000000000000AA`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
