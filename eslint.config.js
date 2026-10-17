const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "react-native", importNames: ["FlatList", "SectionList", "VirtualizedList", "CheckBox", "Switch"], message: "metro.config.js stubs this out of the web bundle. Remove it from the stub list first." }] },
      ],
    },
  },
  { files: ["worker/**"], settings: { "import/core-modules": ["cloudflare:workers", "cloudflare:test"] } },
  { ignores: ["dist/", ".expo/", ".wrangler/", "test-results/", "playwright-report/", "public/ort/", "docs/design/", ".claude/worktrees/", ".claude/skills/poteto-mode/"] },
]);
