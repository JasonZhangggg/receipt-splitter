// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Icon, replayGate } from "./icon.web";

describe("icon replay", () => {
  it("a press sets the play state once and a hover then press does not restart it", () => {
    let now = 1000;
    const gate = replayGate(() => now);

    expect(gate("pointerdown")).toBe(true);

    now = 5000;
    expect(gate("pointerover")).toBe(true);
    now = 5300;
    expect(gate("pointerdown")).toBe(false);

    now = 5700;
    expect(gate("pointerdown")).toBe(true);
  });
});

describe("Icon on the web", () => {
  let host: HTMLElement;
  let root: Root;

  const mount = (name: "share" | "check") =>
    act(async () => {
      root.render(createElement("button", { type: "button" }, createElement(Icon, { name, size: 18, color: "#000" })));
    });
  const svg = () => host.querySelector("svg")!;
  const button = () => host.querySelector("button")!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.documentElement.removeAttribute("data-icons-live");
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a press on the button sets data-play on the svg and the motion ends on its own", async () => {
    await mount("share");
    expect(svg().hasAttribute("data-play")).toBe(false);

    button().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(svg().hasAttribute("data-play")).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(svg().hasAttribute("data-play")).toBe(false);
  });

  it("Enter on the focused button plays the motion", async () => {
    await mount("share");

    button().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(svg().hasAttribute("data-play")).toBe(true);
  });

  it("unmounting while the motion plays leaves no timer behind", async () => {
    await mount("share");
    button().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(svg().hasAttribute("data-play")).toBe(true);

    await act(async () => root.render(null));
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a check mounted before the first interaction stays still and one mounted after it appears", async () => {
    await mount("check");
    expect(svg().hasAttribute("data-appear")).toBe(false);

    document.documentElement.setAttribute("data-icons-live", "");
    await act(async () => root.render(null));
    await mount("check");
    expect(svg().hasAttribute("data-appear")).toBe(true);
  });
});
