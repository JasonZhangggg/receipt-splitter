import { flushSync } from "react-dom";

import { flipped, pick } from "./appearance";
import { useReducedMotion } from "./motion";
import { motion, setAppearance, useScheme, useSystemScheme } from "./theme";

/** The circle that covers the viewport from `x, y`: its radius is the distance to the farthest corner. */
const coverRadius = (x: number, y: number) => Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

/** The scheme a flip goes to, and the flip itself. `from` is the control the person pressed; the new theme spreads from its center. */
export function useAppearanceFlip() {
  const scheme = useScheme();
  const system = useSystemScheme();
  const reduce = useReducedMotion();
  const next = flipped(scheme);

  const flip = (from?: Element) => {
    // The page must hold the new scheme when the transition takes its second snapshot, so React renders it synchronously.
    const swap = () => flushSync(() => setAppearance(pick(next, system)));
    if (reduce || typeof document.startViewTransition !== "function") return swap();
    // The control may leave the page as the scheme changes (a menu row), so its center is read now.
    const box = from?.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 : innerWidth / 2;
    const y = box ? box.top + box.height / 2 : innerHeight / 2;
    document.startViewTransition(swap).ready.then(
      () =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${coverRadius(x, y)}px at ${x}px ${y}px)`] },
          { duration: motion.themeReveal, easing: motion.easeDrawer, pseudoElement: "::view-transition-new(root)" },
        ),
      () => {},
    );
  };

  return { next, flip };
}
