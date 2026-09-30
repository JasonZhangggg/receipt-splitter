import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { hideAfter } from "./hide-timer";

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

function tab() {
  const page = Object.assign(new EventTarget(), { hidden: false });
  const show = (visible: boolean) => {
    page.hidden = !visible;
    page.dispatchEvent(new Event("visibilitychange"));
  };
  return { page, show };
}

test("hides after 4 s of visible time and holds while the tab is hidden", () => {
  const { page, show } = tab();
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), page);

  vi.advanceTimersByTime(1000);
  show(false);
  vi.advanceTimersByTime(10_000);
  show(true);
  vi.advanceTimersByTime(2999);
  expect(hiddenAt).toEqual([]);

  vi.advanceTimersByTime(1);
  expect(hiddenAt).toEqual([14_000]);
});

test("a toast shown in a hidden tab starts counting when the tab shows", () => {
  const { page, show } = tab();
  page.hidden = true;
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), page);

  vi.advanceTimersByTime(60_000);
  show(true);
  vi.advanceTimersByTime(4000);
  expect(hiddenAt).toEqual([64_000]);
});

test("cancel stops the timer and the visibility listener", () => {
  const { page, show } = tab();
  const hidden: string[] = [];
  const cancel = hideAfter(4000, () => hidden.push("cancelled"), page);
  hideAfter(4000, () => hidden.push("kept"), page);

  vi.advanceTimersByTime(1000);
  cancel();
  show(false);
  show(true);
  vi.advanceTimersByTime(10_000);
  expect(hidden).toEqual(["kept"]);
});
