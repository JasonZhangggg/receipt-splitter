import { useSyncExternalStore } from "react";

// react-native-web's useWindowDimensions follows visualViewport, so its height drops with the keyboard while the page bottom stays put.
export type Viewport = { readonly layoutHeight: number; readonly visibleHeight: number; readonly keyboardInset: number };

let current: Viewport = { layoutHeight: 0, visibleHeight: 0, keyboardInset: 0 };

function read(): Viewport {
  const layoutHeight = window.innerHeight;
  const visibleHeight = Math.round(window.visualViewport?.height ?? layoutHeight);
  const keyboardInset = Math.max(0, Math.round(layoutHeight - visibleHeight - (window.visualViewport?.offsetTop ?? 0)));
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

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, read);
}
