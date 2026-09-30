import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const extensionless = /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier);
    const candidate = extensionless && context.parentURL?.endsWith(".ts") ? new URL(`${specifier}.ts`, context.parentURL) : null;
    const resolved = nextResolve(candidate && existsSync(fileURLToPath(candidate)) ? candidate.href : specifier, context);
    return resolved.url.endsWith(".ts") ? { ...resolved, format: "module-typescript" } : resolved;
  },
});
