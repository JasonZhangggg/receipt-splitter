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
    | "scrollPaddingInline"
    | "touchAction"
    | "maskImage"
    | "WebkitMaskImage"
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

const spring = "cubic-bezier(.34, 1.56, .64, 1)";

/** The motions of docs/design/b2/split.dc.html, ported from heroicons-animated. A replay sets data-play on the svg (icon.web.tsx); tick and warning play as they mount. Reduced motion drops every rule. */
export const iconCss = `
.ai { overflow: visible; }
.ai * { transform-box: fill-box; transform-origin: center; }
.ai-x path, .ai-minus path, .ai-check path { stroke-dasharray: 1 1; }
@media (prefers-reduced-motion: no-preference) {
  .ai-x[data-play] path, .ai-minus[data-play] path { animation: ai-draw 300ms ease-out both; }
  .ai-x[data-play] path + path { animation-delay: 110ms; }
  .ai-plus[data-play] { animation: ai-spin 460ms ${spring}; }
  .ai-trash[data-play] .lid { transform-origin: 90% 100%; animation: ai-lid 360ms ${spring} forwards; }
  .ai-trash[data-play] .body { animation: ai-sink 360ms ${spring} forwards; }
  .ai-undo[data-play] { animation: ai-rewind 560ms ${spring}; }
  .ai-undo[data-play] .head { transform-origin: left center; animation: ai-stretch 450ms ease-in-out; }
  .ai-tray[data-play] .arrow { animation: ai-lift 500ms ease-in-out; }
  .ai-users[data-play] .second { animation: ai-join 520ms ${spring} 60ms both; }
  .ai-pie[data-play] .slice { animation: ai-pop 640ms cubic-bezier(.4, 0, .2, 1); }
  .ai-arrow[data-play] .head { animation: ai-nudge 400ms ease-in-out; }
  .ai-arrow[data-play] .line { transform-origin: right; animation: ai-shrink 400ms ease-in-out; }
  .ai-cam[data-play] { animation: ai-press 300ms ease-in-out; }
  .ai-cam[data-play] .lens { animation: ai-lens 300ms ease-in-out; }
  .ai-sun[data-play] .ray { animation: ai-ray 300ms ease-out var(--d) both; }
  .ai-moon[data-play] path { animation: ai-wiggle 640ms ease-in-out 120ms; }
  .ai-check path { animation: ai-tick 400ms ease-out both; }
  .ai-alert .mark { animation: ai-pulse 800ms ease-in-out 2; }
}
@keyframes ai-draw { from { stroke-dashoffset: 1; opacity: 0; } 30% { opacity: 1; } to { stroke-dashoffset: 0; opacity: 1; } }
@keyframes ai-tick { from { stroke-dashoffset: 1; opacity: 0; transform: scale(.5); } 25% { opacity: 1; } to { stroke-dashoffset: 0; opacity: 1; transform: none; } }
@keyframes ai-spin { from { transform: none; } to { transform: rotate(180deg); } }
@keyframes ai-lid { to { transform: translateY(-1.5px) rotate(14deg); } }
@keyframes ai-sink { to { transform: translateY(1px); } }
@keyframes ai-rewind { 45% { transform: rotate(-55deg); } }
@keyframes ai-stretch { 50% { transform: translateX(-1.5px) scaleX(1.15); } }
@keyframes ai-lift { 40% { transform: translateY(-2px); } }
@keyframes ai-join { from { transform: translateX(-6px); opacity: 0; } 30% { opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ai-pop { 35% { transform: translate(1.6px, -1.6px); } 60% { transform: translate(1.1px, -1.1px); } }
@keyframes ai-nudge { 50% { transform: translateX(-3px); } }
@keyframes ai-shrink { 50% { transform: scaleX(.8); } }
@keyframes ai-press { 50% { transform: scale(.95); } }
@keyframes ai-lens { 50% { transform: scale(1.1); opacity: .6; } }
@keyframes ai-pulse { 50% { transform: scale(1.1); opacity: .4; } }
@keyframes ai-ray { from { opacity: 0; } }
@keyframes ai-wiggle { 20% { transform: rotate(-10deg); } 40% { transform: rotate(10deg); } 60% { transform: rotate(-5deg); } 80% { transform: rotate(5deg); } }
`;
