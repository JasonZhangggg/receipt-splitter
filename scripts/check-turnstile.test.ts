import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-turnstile.mjs", import.meta.url));

function exitCode(env: Record<string, string>): number | null {
  return spawnSync(process.execPath, [script], { env: { NODE_ENV: "production", PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" }).status;
}

it("fails the build when the Turnstile site key is empty or a Cloudflare test key", () => {
  const keys = [undefined, "", "1x00000000000000000000AA", "2x00000000000000000000AB", "3x00000000000000000000FF", "0x4AAAAAAAstandInSiteKey"];
  const codes = keys.map((key) => exitCode(key === undefined ? {} : { EXPO_PUBLIC_TURNSTILE_SITE_KEY: key }));
  expect(codes).toEqual([1, 1, 1, 1, 1, 0]);
});

it("lets ALLOW_TEST_TURNSTILE=1 build with a test key or none", () => {
  expect([
    exitCode({ ALLOW_TEST_TURNSTILE: "1" }),
    exitCode({ ALLOW_TEST_TURNSTILE: "1", EXPO_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }),
    exitCode({ ALLOW_TEST_TURNSTILE: "true", EXPO_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }),
  ]).toEqual([0, 0, 1]);
});
