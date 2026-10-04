import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 8787);
// Signs the Split ids this local server mints (ADR 0009). Production has its own Worker secret.
const splitIdSecret = "local-only-split-id-secret-never-in-production";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}` },
  // `npm run e2e` runs @frame-timing tests in a second pass on one worker, since beside parallel workers a frame gap measures the machine.
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    // The Split page's sheet is where iOS Safari has differed; the rest of the suite stays on one engine to keep CI short.
    // On the Linux CI runner WebKit frames gap 150-330 ms where Chromium's pass, so frame timing there measures the runner; motion.mjs judges WebKit timing on macOS before each UI PR.
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 15"] },
      testMatch: ["sheet.spec.ts", "add-item.spec.ts", "claim.spec.ts", "motion.spec.ts", "flash.spec.ts", "photo.spec.ts"],
      grepInvert: process.platform === "linux" ? /@frame-timing/ : undefined,
    },
  ],
  webServer: {
    command: `npm run build && npx wrangler dev --port ${port} --inspector-port ${port + 10000} --var SPLIT_ID_SECRET:${splitIdSecret}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
