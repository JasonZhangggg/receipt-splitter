import { useEffect, type RefObject } from "react";
import type { View } from "react-native";

// iOS reports the keyboard's height only when its slide is nearly over, so the rise starts on focus with the height it expects,
// timed to the keyboard as recorded in the iOS 27 simulator: it starts about 130 ms after focus and settles in 240 ms; it falls in 90 ms.
const motions = {
  rise: "transform 240ms cubic-bezier(0, 0, 0, 1)",
  correct: "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
  fall: "transform 90ms linear",
};
const riseDelay = 130;
const settleMs = 120;
const noKeyboardAfter = 1500;
const iphoneKeyboard = 330;
const gap = 12;
const smallest = 50;

const stored = "keyboard";
let expected: number | null = (() => {
  try {
    const value = Number(localStorage.getItem(stored) ?? NaN);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
})();

function remember(keyboard: number) {
  expected = keyboard;
  try {
    localStorage.setItem(stored, String(keyboard));
  } catch {}
}

const typing = (target: EventTarget | null): target is HTMLElement => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/** Lifts `anchor` above the on-screen keyboard while a field inside it has focus, so the page behind never moves. */
export function useKeyboardLift(anchor: RefObject<View | null>, top: number, tucked: number) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = anchor.current as unknown as HTMLElement | null;
    if (!viewport || !el) return;
    let lifted = 0;
    let settle = 0;
    let check = 0;
    let rising = 0;
    let rise = () => {};
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
    const move = (to: number, motion: keyof typeof motions) => {
      if (to === lifted) return;
      lifted = to;
      el.style.transition = motions[motion];
      el.style.transform = to ? `translateY(${-to}px)` : "";
    };
    const cancelRise = () => {
      clearTimeout(rising);
      rise = () => {};
    };

    const focusin = ({ target }: FocusEvent) => {
      if (!inside(target)) return;
      const to = liftFor(Math.max(covered(), expected ?? (matchMedia("(pointer: coarse)").matches ? iphoneKeyboard : 0)));
      if (lifted) return move(to, "correct");
      cancelRise();
      rise = () => {
        cancelRise();
        move(to, "rise");
      };
      rising = window.setTimeout(rise, riseDelay);
      clearTimeout(check);
      check = window.setTimeout(() => {
        if (keyboard() >= smallest) return;
        remember(0);
        move(0, "fall");
      }, noKeyboardAfter);
    };
    // Focus moving to the next field leaves and enters within one task; only a focus that lands outside the panel lowers it.
    const focusout = () =>
      setTimeout(() => {
        if (inside(document.activeElement)) return;
        cancelRise();
        move(0, "fall");
      });
    const resize = () => {
      clearTimeout(settle);
      if (!inside(document.activeElement)) return covered() === 0 && move(0, "fall");
      rise();
      // iOS reports the keyboard in steps (its bar, then its keys), so the correction waits for the last one.
      settle = window.setTimeout(() => {
        if (keyboard() < smallest) return;
        remember(keyboard());
        move(liftFor(covered()), "correct");
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
      target.focus({ preventScroll: true });
    };

    // A panel that grows while a field has focus (a name added) re-fits above the keyboard.
    const grown = new ResizeObserver(() => lifted && inside(document.activeElement) && move(liftFor(Math.max(covered(), expected ?? 0)), "correct"));
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
  }, [anchor, top, tucked]);
}
