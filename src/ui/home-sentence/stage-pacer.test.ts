import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { stagePacer } from "./stage-pacer";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => vi.useRealTimers());

function run() {
  const shown: string[] = [];
  return { shown, pacer: stagePacer<string>((stage) => shown.push(stage)) };
}

test("the first stage shows at once and the next waits out its 700 ms", () => {
  const { shown, pacer } = run();
  pacer.push("start");
  vi.advanceTimersByTime(100);
  pacer.push("text");
  expect(shown).toEqual(["start"]);
  vi.advanceTimersByTime(599);
  expect(shown).toEqual(["start"]);
  vi.advanceTimersByTime(1);
  expect(shown).toEqual(["start", "text"]);
});

test("a stage overtaken before it shows is skipped", () => {
  const { shown, pacer } = run();
  pacer.push("start");
  vi.advanceTimersByTime(100);
  pacer.push("text");
  vi.advanceTimersByTime(100);
  pacer.push("server");
  vi.advanceTimersByTime(2000);
  expect(shown).toEqual(["start", "server"]);
});

test("a stage that arrives after the minimum shows at once", () => {
  const { shown, pacer } = run();
  pacer.push("start");
  vi.advanceTimersByTime(900);
  pacer.push("text");
  expect(shown).toEqual(["start", "text"]);
});

test("the result waits for the word on screen and drops a stage that never showed", async () => {
  const { shown, pacer } = run();
  pacer.push("start");
  vi.advanceTimersByTime(50);
  pacer.push("text");
  let settled = false;
  void pacer.settle().then(() => (settled = true));
  await vi.advanceTimersByTimeAsync(649);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBe(true);
  expect(shown).toEqual(["start"]);
});

test("the result does not wait when the word has already had its time", async () => {
  const { pacer } = run();
  pacer.push("start");
  vi.advanceTimersByTime(800);
  let settled = false;
  void pacer.settle().then(() => (settled = true));
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(true);
});

test("a cancelled read shows nothing more", () => {
  const { shown, pacer } = run();
  pacer.push("start");
  pacer.push("text");
  pacer.cancel();
  vi.advanceTimersByTime(2000);
  expect(shown).toEqual(["start"]);
});
