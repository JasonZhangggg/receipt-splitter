import { flushSync } from "react-dom";

import { flipped, pick } from "./appearance";
import { Button } from "./components/button";
import { copy } from "./home-copy";
import { useReducedMotion } from "./motion";
import { setAppearance, useScheme, useSystemScheme } from "./theme";

/** The glyph shows the scheme a tap goes to, as its name says. */
export function AppearanceToggle() {
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

  return <Button kind="icon" icon={next === "dark" ? "moon" : "sun"} name={copy.switchTo[next]} onPress={flip} />;
}
