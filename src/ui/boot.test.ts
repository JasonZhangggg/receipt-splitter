import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { colors } from "./colors";
import { faces } from "./fonts.generated";

const html = readFileSync("public/index.html", "utf8");

test("the page preloads and declares the same Geist files the app was measured against", () => {
  const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1]);
  const declared = [...html.matchAll(/font-family: "Geist"; font-weight: (\d+);[^}]*url\("([^"]+)"\)/g)].map((m) => [Number(m[1]), m[2]]);
  expect(preloads).toEqual([faces[400], faces[500]]);
  expect(declared).toEqual([
    [400, faces[400]],
    [500, faces[500]],
  ]);
});

test("the loader draws in each scheme's ink", () => {
  const light = /\[data-boot\] #rs-boot \{[^}]*color: ([^;]+);/.exec(html)?.[1];
  const dark = /:root\[data-theme="dark"\] #rs-boot \{ color: ([^;]+); \}/.exec(html)?.[1];
  const darkSystem = /:root:not\(\[data-theme="light"\]\) #rs-boot \{ color: ([^;]+); \}/.exec(html)?.[1];
  expect([light, dark, darkSystem]).toEqual([colors.light.ink, colors.dark.ink, colors.dark.ink]);
});
