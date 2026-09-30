import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: `${repo}/wrangler.jsonc` } })],
  test: { dir: `${repo}/worker`, include: ["**/*.test.ts"] },
});
