import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, type ViewStyle } from "react-native";

import { motion } from "./theme";

const web = Platform.OS === "web";
const reduceQuery = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => web && matchMedia(reduceQuery).matches);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => subscription.remove();
  }, []);
  return reduce;
}

type WebOnly = Partial<Record<"transitionProperty" | "transitionDuration" | "transitionTimingFunction", string>>;

const webStyle = (style: WebOnly) => style as ViewStyle;

const press = StyleSheet.create({
  scaled: { transform: [{ scale: 0.96 }] },
  dimmed: { opacity: 0.7 },
});

export function pressStyle(pressed: boolean, reduce: boolean) {
  if (reduce) return pressed && press.dimmed;
  return [
    pressed && press.scaled,
    web &&
      webStyle({
        transitionProperty: "transform",
        transitionDuration: `${pressed ? motion.pressIn : motion.pressOut}ms`,
        transitionTimingFunction: motion.easeOut,
      }),
  ];
}
