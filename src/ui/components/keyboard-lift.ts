import { useEffect, type RefObject } from "react";
import type { TextInput, View } from "react-native";

// iOS reports the keyboard's height late, so the rise starts with the height it expects, on the keyboard's own curve as recorded
// in the iOS 27 simulator: 350 ms on cubic-bezier(0.4, 0.3, 0.1, 1). It falls in 90 ms.
const motions = {
  rise: "transform 350ms cubic-bezier(0.4, 0.3, 0.1, 1)",
  correct: "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
  fall: "transform 90ms linear",
};
// A cold keyboard starts sliding 130 ms or more after focus. A warm one is reported sooner, about 20 ms into its slide.
const riseDelay = 130;
const reportLag = 20;
const settleMs = 120;
const noKeyboardAfter = 1500;
const iphoneKeyboard = 330;
const gap = 12;
const smallest = 50;

const stored = "keyboard";
// The keyboard height measured on this device's last open, or null until a keyboard has opened here.
let known: number | null = (() => {
  try {
    const value = Number(localStorage.getItem(stored));
    return value >= smallest ? value : null;
  } catch {
    return null;
  }
})();
// Only iOS WebKit (the one browser with `navigator.standalone`) reports late, so only there is a keyboard assumed before one is seen.
const lateReports = () => "standalone" in navigator && matchMedia("(pointer: coarse)").matches;
// The last focus opened no keyboard (a hardware keyboard, a desktop emulator), so the next one waits for iOS to report one.
let missed = false;

function remember(keyboard: number) {
  known = keyboard;
  try {
    localStorage.setItem(stored, String(keyboard));
  } catch {}
}

/** Focuses a home panel field without the scroll iOS would make to reveal it; the panel lift does that. */
export const focusInPlace = (field: TextInput | HTMLElement | null) => (field as HTMLElement | null)?.focus({ preventScroll: true });

const typing = (target: EventTarget | null): target is HTMLElement => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/**
 * Lifts `anchor` above the on-screen keyboard while a field inside it has focus, so the page behind never moves.
 * Elements marked `data-follows-panel` ride the same lift.
 */
export function useKeyboardLift(anchor: RefObject<View | null>, top: number, tucked: number, reduce: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = anchor.current as unknown as HTMLElement | null;
    if (!viewport || !el) return;
    let lifted = 0;
    // The keyboard height at the last settle of this focus. A warm iOS keyboard first reports itself without the URL pill above it,
    // so only the last report is remembered.
    let settled = 0;
    let settle = 0;
    let check = 0;
    let rising = 0;
    let frame = 0;
    let rise = (_slid: number) => {};
    const inside = (target: EventTarget | null): target is HTMLElement => typing(target) && el.contains(target);
    const keyboard = () => Math.max(0, Math.round(document.documentElement.clientHeight - viewport.height));
    const covered = () => Math.max(0, keyboard() - Math.round(viewport.offsetTop));
    // Create sits just above the keyboard unless that would push the panel's top off screen; the focused field always clears it.
    const liftFor = (height: number) => {
      const field = document.activeElement;
      const shift = el.getBoundingClientRect().top - el.offsetTop;
      const need = inside(field) ? field.getBoundingClientRect().bottom - shift + gap - (document.documentElement.clientHeight - height) : 0;
      return Math.round(Math.max(0, need, Math.min(height - tucked + gap, el.offsetTop - top - 8)));
    };
    // `slid` ms of the motion are already behind it, so it starts partway along its curve.
    const move = (to: number, motion: keyof typeof motions, slid = 0) => {
      if (to === lifted) return;
      lifted = to;
      for (const mover of [el, ...document.querySelectorAll<HTMLElement>("[data-follows-panel]")]) {
        // Under reduced motion the panel steps into place; its fill hides the keyboard sliding in behind it.
        mover.style.transition = reduce ? "none" : `${motions[motion]} ${-Math.round(slid)}ms`;
        mover.style.transform = to ? `translateY(${-to}px)` : "";
      }
    };
    // While a field has focus the panel only climbs: a lower step would show the keyboard's interim height as a dip.
    const raise = (to: number) => to > lifted && move(to, "correct");
    const cancelRise = () => {
      clearTimeout(rising);
      cancelAnimationFrame(frame);
      rise = () => {};
    };

    const focusin = ({ target }: FocusEvent) => {
      if (!inside(target)) return;
      if (lifted) return raise(liftFor(Math.max(covered(), known ?? 0)));
      cancelRise();
      settled = 0;
      const expected = known ?? (lateReports() ? iphoneKeyboard : null);
      rise = (slid) => {
        cancelRise();
        move(liftFor(Math.max(covered(), expected ?? 0)), "rise", slid);
      };
      // Safari stops drawing after focus until the keyboard moves, so the rise waits for a frame to start from its first point.
      // After a focus that opened no keyboard, it waits for iOS to report one instead.
      if (expected && !missed) rising = window.setTimeout(() => (frame = requestAnimationFrame(() => rise(0))), riseDelay);
      clearTimeout(check);
      check = window.setTimeout(() => {
        if (keyboard() >= smallest) return;
        missed = true;
        cancelRise();
        move(0, "fall");
      }, noKeyboardAfter);
    };
    // Focus moving to the next field leaves and enters within one task; only a focus that lands outside the panel lowers it.
    const focusout = () =>
      setTimeout(() => {
        if (inside(document.activeElement)) return;
        cancelRise();
        clearTimeout(settle);
        clearTimeout(check);
        if (settled) remember(settled);
        move(0, "fall");
      });
    const resize = () => {
      clearTimeout(settle);
      if (!inside(document.activeElement)) return covered() === 0 && move(0, "fall");
      if (keyboard() < smallest) return;
      missed = false;
      const reported = performance.now();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => rise(performance.now() - reported + reportLag));
      // iOS reports the keyboard in steps (its bar, then its keys), so the correction waits for the last one.
      settle = window.setTimeout(() => {
        settled = keyboard();
        raise(liftFor(covered()));
      }, settleMs);
    };
    // Once iOS knows the keyboard's height it scrolls the page to center a tapped field; focusing it ourselves keeps the page still.
    let start: Touch | null = null;
    const touchstart = (event: TouchEvent) => (start = event.touches.length === 1 ? event.touches[0]! : null);
    const touchend = (event: TouchEvent) => {
      const end = event.changedTouches[0];
      const { target } = event;
      if (!start || !end || !inside(target) || target === document.activeElement) return;
      if (Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY) > 10) return;
      event.preventDefault();
      focusInPlace(target);
    };

    // A panel that grows while a field has focus (a name added) re-fits above the keyboard.
    const grown = new ResizeObserver(() => lifted && inside(document.activeElement) && raise(liftFor(Math.max(covered(), known ?? 0))));
    grown.observe(el);

    el.addEventListener("touchstart", touchstart, { passive: true });
    el.addEventListener("touchend", touchend);
    document.addEventListener("focusin", focusin);
    document.addEventListener("focusout", focusout);
    viewport.addEventListener("resize", resize);
    return () => {
      clearTimeout(settle);
      clearTimeout(check);
      cancelRise();
      grown.disconnect();
      el.removeEventListener("touchstart", touchstart);
      el.removeEventListener("touchend", touchend);
      document.removeEventListener("focusin", focusin);
      document.removeEventListener("focusout", focusout);
      viewport.removeEventListener("resize", resize);
    };
  }, [anchor, top, tucked, reduce]);
}
