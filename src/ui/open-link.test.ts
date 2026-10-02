import { expect, test } from "vitest";
import { openWithFallback } from "./open-link";

function opener(failing: readonly string[]) {
  const tried: string[] = [];
  const open = async (url: string) => {
    tried.push(url);
    if (failing.includes(url)) throw new Error(`no app for ${url}`);
  };
  return { open, tried };
}

test("opens the app link when it works, and the web link only when the app link fails", async () => {
  const works = opener([]);
  const noApp = opener(["venmo://paycharge"]);

  expect(await openWithFallback(works.open, "venmo://paycharge", "https://venmo.com/ann")).toBe(true);
  expect(await openWithFallback(noApp.open, "venmo://paycharge", "https://venmo.com/ann")).toBe(true);
  expect([works.tried, noApp.tried]).toEqual([["venmo://paycharge"], ["venmo://paycharge", "https://venmo.com/ann"]]);
});

test("settles with false when both links fail or there is no web link", async () => {
  const neither = opener(["venmo://paycharge", "https://venmo.com/ann"]);

  expect(await openWithFallback(neither.open, "venmo://paycharge", "https://venmo.com/ann")).toBe(false);
  expect(await openWithFallback(neither.open, "venmo://paycharge")).toBe(false);
  expect(neither.tried).toEqual(["venmo://paycharge", "https://venmo.com/ann", "venmo://paycharge"]);
});

test("tries the web link when opening the app link throws before it returns a promise", async () => {
  const tried: string[] = [];
  const open = (url: string) => {
    tried.push(url);
    if (url.startsWith("venmo:")) throw new Error("Linking is not available");
    return Promise.resolve();
  };

  expect(await openWithFallback(open, "venmo://paycharge", "https://venmo.com/ann")).toBe(true);
  expect(tried).toEqual(["venmo://paycharge", "https://venmo.com/ann"]);
});
