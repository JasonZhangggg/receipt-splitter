import { useEffect, useEffectEvent, useLayoutEffect, useState, type RefObject } from "react";
import { AccessibilityInfo, Platform, StyleSheet, type View, type ViewStyle } from "react-native";

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
    | "scrollPaddingInline"
    | "touchAction"
    | "maskImage"
    | "WebkitMaskImage"
    | "willChange"
    | "display"
    | "clip"
    | "clipPath"
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

export const pressFeel: Record<"button" | "slip" | "pill", PressFeel> = {
  button: { scale: 0.96, pressIn: motion.pressIn },
  slip: { scale: 0.97, pressIn: motion.slipPressIn },
  pill: { scale: 0.97, pressIn: motion.pillPressIn },
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

type Rise = { y: number; scale: number };

/** The look a bar rests in while it is away, and the transform that gets it there. */
export const awayStyle = (rise: Rise, reduce: boolean): ViewStyle => (reduce ? { opacity: 0 } : { opacity: 0, transform: [{ translateY: rise.y }, { scale: rise.scale }] });

/**
 * Fades a bar in or out on the compositor with the Web Animations API, so a busy JS thread does not stall it. The bar's own style rests in the
 * target look and the animation runs toward it, starting from wherever a running one had got to, so a message that lands mid-exit does not jump.
 * `onAway` runs once an exit has finished, which is when the bar can unmount.
 */
export function useFade(ref: RefObject<View | null>, show: boolean, rise: Rise, reduce: boolean, onAway: () => void) {
  const away = useEffectEvent(onAway);
  useLayoutEffect(() => {
    const element = ref.current as unknown as HTMLElement | null;
    if (!element?.animate) {
      if (!show) away();
      return;
    }
    const gone = reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${rise.y}px) scale(${rise.scale})` };
    const here = reduce ? { opacity: 1 } : { opacity: 1, transform: "none" };
    const running = element.getAnimations();
    const { opacity, transform } = getComputedStyle(element);
    running.forEach((animation) => animation.cancel());
    const from = running.length ? { opacity, transform } : show ? gone : here;
    const duration = reduce ? motion.reducedFade : show ? motion.toastIn : motion.toastOut;
    const fade = element.animate([from, show ? here : gone], { duration, easing: motion.easeOut });
    fade.onfinish = () => {
      if (!show) away();
    };
  }, [ref, show, reduce, rise.y, rise.scale]);
}
