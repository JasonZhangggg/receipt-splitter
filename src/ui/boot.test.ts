import { readFileSync } from "node:fs";
import { PartySocket } from "partysocket";
import { expect, test } from "vitest";

import { isRoutableSplitId } from "../core/split";
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

test("the events the app dispatches are the ones the loader script listens for", () => {
  const dispatched = [...readFileSync("src/ui/document.ts", "utf8").matchAll(/new Event\("(splitwith:[a-z]+)"\)/g)].map((m) => m[1]);
  const listened = [...html.matchAll(/addEventListener\("(splitwith:[a-z]+)"/g)].map((m) => m[1]);
  expect(dispatched.sort()).toEqual(["splitwith:busy", "splitwith:idle", "splitwith:mounted"]);
  expect(listened.sort()).toEqual(dispatched);
});

test("the Split page borrows the one loader in index.html rather than drawing its own", () => {
  const split = readFileSync("app/s/[id].tsx", "utf8");
  expect(split).toContain("useBusyLoader(");
  expect(split).not.toMatch(/<Svg|<svg|stroke-dash/);
  expect(html.match(/id="rs-boot"/g)).toHaveLength(1);
});

test("the early socket opens for exactly the links the app calls routable, at the path PartySocket would use", () => {
  const pattern = /var found = \/(.+?)\/\.exec\(location\.pathname\)/.exec(html)?.[1];
  expect(pattern).toBeDefined();
  const early = new RegExp(pattern!);
  const room = (length: number) => "a1_-".repeat(10).slice(0, length);
  for (const path of [room(21), room(22), room(23), room(24), room(25), `${room(22)}/x`, "__proto__"]) {
    expect(early.test(`/s/${path}`)).toBe(path === room(22) || path === room(24));
    expect(early.test(`/s/${path}`)).toBe(isRoutableSplitId(path));
  }
  expect(html).toContain('"/parties/split-server/" + found[1]');
  const ours = new PartySocket({ host: "example.test", protocol: "wss", party: "split-server", room: room(24), startClosed: true });
  expect(new URL(ours._pkurl).pathname).toBe(`/parties/split-server/${room(24)}`);
});
