import { useSyncExternalStore } from "react";

// The page's height is clientHeight. react-native-web's useWindowDimensions follows visualViewport, which shrinks with the keyboard,
// and on iOS 27 innerHeight shrinks by the distance iOS pans the page to reveal a focused field.
const read = () => document.documentElement.clientHeight;

function subscribe(changed: () => void) {
  window.addEventListener("resize", changed);
  return () => window.removeEventListener("resize", changed);
}

/** The page's height, which the keyboard leaves alone. */
export function useLayoutHeight(): number {
  return useSyncExternalStore(subscribe, read);
}

const readWidth = () => document.documentElement.clientWidth;

/** The page's width. A layout that switches on it does not re-render when the keyboard shrinks the visual viewport. */
export function useLayoutWidth(): number {
  return useSyncExternalStore(subscribe, readWidth);
}
