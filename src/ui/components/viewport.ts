import { useSyncExternalStore } from "react";

// The page's height is clientHeight. react-native-web's useWindowDimensions follows visualViewport, which shrinks with the keyboard,
// and on iOS 27 innerHeight shrinks by the distance iOS pans the page to reveal a focused field.
export type Viewport = { readonly layoutHeight: number; readonly visibleHeight: number; readonly keyboardInset: number };

let current: Viewport = { layoutHeight: 0, visibleHeight: 0, keyboardInset: 0 };

function read(): Viewport {
  const layoutHeight = document.documentElement.clientHeight;
  const visual = window.visualViewport;
  const visibleHeight = Math.round(visual?.height ?? layoutHeight);
  const keyboardInset = Math.max(0, Math.round(layoutHeight - visibleHeight - (visual?.offsetTop ?? 0)));
  if (layoutHeight !== current.layoutHeight || visibleHeight !== current.visibleHeight || keyboardInset !== current.keyboardInset) {
    current = { layoutHeight, visibleHeight, keyboardInset };
  }
  return current;
}

function subscribe(changed: () => void) {
  window.addEventListener("resize", changed);
  window.visualViewport?.addEventListener("resize", changed);
  window.visualViewport?.addEventListener("scroll", changed);
  return () => {
    window.removeEventListener("resize", changed);
    window.visualViewport?.removeEventListener("resize", changed);
    window.visualViewport?.removeEventListener("scroll", changed);
  };
}

/** The visible part of the page and the keyboard's cover over the page's bottom edge. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, read);
}

/** The page's height, which the keyboard leaves alone. */
export function useLayoutHeight(): number {
  return useSyncExternalStore(subscribe, () => read().layoutHeight);
}
