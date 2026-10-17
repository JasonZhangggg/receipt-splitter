import type { Page } from "@playwright/test";

export async function mountHarness(page: Page, harness: string) {
  const { build } = await import("esbuild");
  const bundle = await build({
    stdin: { contents: harness, loader: "tsx", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    jsx: "automatic",
    alias: { "react-native": "react-native-web" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js"],
    loader: { ".js": "jsx" },
    define: { "process.env.NODE_ENV": '"production"', __DEV__: "false", global: "globalThis" },
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
}
