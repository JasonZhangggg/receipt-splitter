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

type WebOnly = Partial<
  Record<
    | "animationDuration"
    | "animationDelay"
    | "animationTimingFunction"
    | "animationFillMode"
    | "transitionProperty"
    | "transitionDuration"
    | "transitionTimingFunction",
    string
  >
>;

const webStyle = (style: WebOnly) => style as ViewStyle;

const shown = { opacity: 1, transform: "none" };

const keyframes = StyleSheet.create({
  rise: { animationKeyframes: [{ from: { opacity: 0, transform: "translateY(8px)" }, to: shown }] },
  unmask: { animationKeyframes: [{ from: { transform: "translateY(100%)" }, to: { transform: "none" } }] },
  fade: { animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }] },
} as unknown as Record<"rise" | "unmask" | "fade", ViewStyle>);

type Enter = { delay?: number; duration?: number; from?: "rise" | "unmask" };

export function enter(reduce: boolean, { delay = 0, duration = motion.enter, from = "rise" }: Enter = {}) {
  if (!web) return [];
  const timing = reduce
    ? { animationDuration: `${motion.reducedFade}ms`, animationTimingFunction: "ease" }
    : { animationDuration: `${duration}ms`, animationDelay: `${delay}ms`, animationTimingFunction: motion.easeOut };
  return [keyframes[reduce ? "fade" : from], webStyle({ ...timing, animationFillMode: "both" })];
}

export function pressTransition(pressed: boolean) {
  if (!web) return {};
  return webStyle({
    transitionProperty: "transform, opacity",
    transitionDuration: `${pressed ? motion.pressIn : motion.pressOut}ms`,
    transitionTimingFunction: motion.easeOut,
  });
}
