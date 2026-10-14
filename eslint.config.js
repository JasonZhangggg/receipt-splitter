const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { files: ["worker/**"], settings: { "import/core-modules": ["cloudflare:workers", "cloudflare:test"] } },
  { ignores: ["dist/", ".expo/", ".wrangler/", "test-results/", "playwright-report/", "public/ort/", "docs/design/", ".claude/worktrees/", ".claude/skills/poteto-mode/"] },
]);
