import { flushSync } from "react-dom";

import { flipped, pick } from "./appearance";
import { useReducedMotion } from "./motion";
import { setAppearance, useScheme, useSystemScheme } from "./theme";

/** The scheme a flip goes to, and the flip itself. */
export function useAppearanceFlip() {
  const scheme = useScheme();
  const system = useSystemScheme();
  const reduce = useReducedMotion();
  const next = flipped(scheme);

  const flip = () => {
    // The page must hold the new scheme when the transition takes its second snapshot, so React renders it synchronously.
    const swap = () => flushSync(() => setAppearance(pick(next, system)));
    if (reduce || typeof document.startViewTransition !== "function") swap();
    else document.startViewTransition(swap);
  };

  return { next, flip };
}
