import { useEffect, useState, type RefObject } from "react";
import type { ScrollView, TextInput } from "react-native";

const gap = 16;
const settleMs = 120;

/** Focuses a field without the scroll iOS would make to reveal it; `useKeyboardRoom` does that. */
export const focusInPlace = (field: TextInput | HTMLElement | null) => (field as HTMLElement | null)?.focus({ preventScroll: true });

const isField = (target: Element | null): target is HTMLInputElement | HTMLSelectElement => target instanceof HTMLInputElement || target instanceof HTMLSelectElement;

/**
 * Keeps a focused field above the keyboard on a page that has no panel to lift. While the keyboard covers the bottom of the page the scroller
 * gets that much room below its content, so even the last field can scroll clear, and a field under the keyboard is scrolled into view.
 * Returns the room to add below the content.
 */
export function useKeyboardRoom(scroller: RefObject<ScrollView | null>): number {
  const [room, setRoom] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const covered = () => Math.max(0, Math.round(document.documentElement.clientHeight - viewport.offsetTop - viewport.height));
    const update = () => setRoom(covered());
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const reveal = () => {
      const field = document.activeElement;
      const node = scroller.current?.getScrollableNode() as HTMLElement | undefined;
      if (!viewport || !isField(field) || !node?.contains(field)) return;
      const box = field.getBoundingClientRect();
      const top = Math.max(viewport.offsetTop, node.getBoundingClientRect().top) + gap;
      const bottom = viewport.offsetTop + viewport.height - gap;
      node.scrollTop += box.bottom > bottom ? box.bottom - bottom : box.top < top ? box.top - top : 0;
    };
    // Focus lands before the keyboard does, so the field is checked again once the keyboard has settled.
    let settle = 0;
    const onFocus = () => {
      reveal();
      clearTimeout(settle);
      settle = window.setTimeout(reveal, settleMs);
    };
    reveal();
    // A name added while the keyboard is up can push the focused field down a line.
    const content = (scroller.current?.getScrollableNode() as HTMLElement | undefined)?.firstElementChild;
    const grown = new ResizeObserver(reveal);
    if (content) grown.observe(content);
    document.addEventListener("focusin", onFocus);
    return () => {
      grown.disconnect();
      clearTimeout(settle);
      document.removeEventListener("focusin", onFocus);
    };
  }, [room, scroller]);

  return room;
}
