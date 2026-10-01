import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, type ViewStyle } from "react-native";

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
