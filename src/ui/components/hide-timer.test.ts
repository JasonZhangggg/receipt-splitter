import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { hideAfter } from "./hide-timer";

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

function fakeTab() {
  const tab = Object.assign(new EventTarget(), { hidden: false });
  const show = (visible: boolean) => {
    tab.hidden = !visible;
    tab.dispatchEvent(new Event("visibilitychange"));
  };
  return { tab, show };
}

test("hides after 4 s of visible time and holds while the tab is hidden", () => {
  const { tab, show } = fakeTab();
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), tab);

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
  const { tab, show } = fakeTab();
  tab.hidden = true;
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), tab);

  vi.advanceTimersByTime(60_000);
  show(true);
  vi.advanceTimersByTime(4000);
  expect(hiddenAt).toEqual([64_000]);
});

test("cancel stops the timer and the visibility listener", () => {
  const { tab, show } = fakeTab();
  const hidden: string[] = [];
  const cancel = hideAfter(4000, () => hidden.push("cancelled"), tab);
  hideAfter(4000, () => hidden.push("kept"), tab);

  vi.advanceTimersByTime(1000);
  cancel();
  show(false);
  show(true);
  vi.advanceTimersByTime(10_000);
  expect(hidden).toEqual(["kept"]);
});

function fakeToast() {
  const toast = new EventTarget();
  const send = (type: string, pointerType?: string) => toast.dispatchEvent(Object.assign(new Event(type), { pointerType }));
  return { toast, send };
}

test("a mouse over the toast holds the count and leaving resumes with what was left", () => {
  const { tab } = fakeTab();
  const { toast, send } = fakeToast();
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), tab, toast);

  vi.advanceTimersByTime(1000);
  send("pointerenter", "mouse");
  vi.advanceTimersByTime(30_000);
  expect(hiddenAt).toEqual([]);
  send("pointerleave", "mouse");
  vi.advanceTimersByTime(2999);
  expect(hiddenAt).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(hiddenAt).toEqual([34_000]);
});

test("focus inside the toast holds the count until it leaves", () => {
  const { tab } = fakeTab();
  const { toast, send } = fakeToast();
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), tab, toast);

  vi.advanceTimersByTime(3000);
  send("focusin");
  vi.advanceTimersByTime(60_000);
  expect(hiddenAt).toEqual([]);
  send("focusout");
  vi.advanceTimersByTime(1000);
  expect(hiddenAt).toEqual([64_000]);
});

test("a touch on the toast leaves the 4 s count alone", () => {
  const { tab } = fakeTab();
  const { toast, send } = fakeToast();
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), tab, toast);

  vi.advanceTimersByTime(1000);
  send("pointerenter", "touch");
  vi.advanceTimersByTime(3000);
  expect(hiddenAt).toEqual([4000]);
});

test("a hidden tab and a held mouse both have to let go before the count resumes", () => {
  const { tab, show } = fakeTab();
  const { toast, send } = fakeToast();
  const hiddenAt: number[] = [];
  hideAfter(4000, () => hiddenAt.push(Date.now()), tab, toast);

  send("pointerenter", "mouse");
  show(false);
  show(true);
  vi.advanceTimersByTime(10_000);
  expect(hiddenAt).toEqual([]);
  send("pointerleave", "mouse");
  vi.advanceTimersByTime(4000);
  expect(hiddenAt).toEqual([14_000]);
});
