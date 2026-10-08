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
    | "transitionProperty"
    | "transitionDuration"
    | "transitionTimingFunction"
    | "animationDuration"
    | "animationDelay"
    | "animationTimingFunction"
    | "animationIterationCount"
    | "animationFillMode"
    | "maskImage"
    | "overflow"
    | "overflowX"
    | "overflowY"
    | "overscrollBehavior"
    | "overscrollBehaviorX"
    | "outlineOffset"
    | "touchAction"
    | "willChange"
    | "position"
    | "top"
    | "cursor",
    string
  >
>;

type Keyframes = { animationKeyframes: Record<string, Record<string, number | string>>[] };

export const webStyle = (style: WebOnly) => style as ViewStyle;

/** React Native Web drops animationKeyframes from inline styles, so a keyframe animation only runs once StyleSheet.create compiles it. */
export const webAnimation = (style: WebOnly & Keyframes) => StyleSheet.create({ animation: style as ViewStyle }).animation;

type PressFeel = { scale: number; pressIn: number };

export const pressFeel: Record<"button" | "slip", PressFeel> = {
  button: { scale: 0.96, pressIn: motion.pressIn },
  slip: { scale: 0.97, pressIn: motion.slipPressIn },
};

const dimmed = { opacity: 0.7 };

export function pressStyle(pressed: boolean, reduce: boolean, feel: PressFeel = pressFeel.button) {
  if (reduce) return pressed && dimmed;
  return [
    pressed && { transform: [{ scale: feel.scale }] },
    web &&
      webStyle({
        transitionProperty: "transform",
        transitionDuration: `${pressed ? feel.pressIn : motion.pressOut}ms`,
        transitionTimingFunction: motion.easeOut,
      }),
  ];
}
