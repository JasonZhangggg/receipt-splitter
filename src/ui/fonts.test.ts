import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { faces } from "./fonts.generated";

test.each([400, 500] as const)("the %s face URL serves a committed WOFF2 file named after its content", (weight) => {
  const url = faces[weight];
  expect(url).toMatch(new RegExp(`^/fonts/geist-${weight}-[0-9a-f]{10}\\.woff2$`));
  const file = readFileSync(new URL(`../../public${url}`, import.meta.url));
  expect(file.subarray(0, 4).toString("latin1")).toBe("wOF2");
  expect(createHash("sha256").update(file).digest("hex").slice(0, 10)).toBe(url.slice(-16, -6));
});
