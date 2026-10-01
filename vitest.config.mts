import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "ort-glue-without-source-map-comment",
      load(id) {
        if (!id.includes("/public/ort/") || !id.endsWith(".mjs")) return null;
        return readFileSync(id, "utf8").replace(/^\/\/# sourceMappingURL=.*$/m, "");
      },
    },
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "bench/**/*.test.ts"],
  },
});
