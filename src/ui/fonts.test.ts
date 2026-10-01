import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { faces } from "./fonts.generated";

test.each([400, 500] as const)("the inlined %s face is the committed WOFF2 file", (weight) => {
  const file = readFileSync(new URL(`../../assets/fonts/plus-jakarta-sans-latin-${weight}-normal.woff2`, import.meta.url));
  expect(Buffer.from(faces[weight], "base64").equals(file)).toBe(true);
});
