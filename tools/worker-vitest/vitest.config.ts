import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: `${repo}/wrangler.jsonc` },
      miniflare: { bindings: { SPLIT_ID_SECRET: "worker-tests-only-split-id-secret-0000000000" } },
    }),
  ],
  test: { dir: `${repo}/worker`, include: ["**/*.test.ts"] },
});
