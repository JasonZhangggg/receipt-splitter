import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useReducedMotion, webStyle } from "../motion";
import { motion, useColors } from "../theme";

type Props = {
  anchor: HTMLElement;
  label: string;
  closing: boolean;
  /** Opened from the keyboard, so it shows at once with no entrance. */
  instant: boolean;
  onClose: () => void;
  onGone: () => void;
  children: ReactNode;
};

/** Where the surface sits in the layer. It hangs below the anchor, or above it when only there is room. */
type Placement = { readonly left: number; readonly width: number; readonly maxHeight: number } & (
  | { readonly side: "below"; readonly top: number }
  | { readonly side: "above"; readonly bottom: number }
);

const width = 380;
const gap = 6;
// The surface's right edge overhangs the anchor's, as in round 3's desktop frames.
const overhang = 14;
const margin = 16;
const leaveFor = 150;

/** Calls `onEscape` on Escape from the first commit while `active`, before any focus has settled. */
export function useEscape(active: boolean, onEscape: () => void) {
  const escape = useEffectEvent(onEscape);
  useLayoutEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && escape();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}

export function Popover({ anchor, label, closing, instant, onClose, onGone, children }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const layer = useRef<View>(null);
  const surface = useRef<View>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const leave = useEffectEvent(onGone);
  const close = useEffectEvent(onClose);
  useEscape(!closing, onClose);

  // Placed before the first paint from the surface's natural height, so no frame shows it in the wrong place.
  useLayoutEffect(() => {
    const box = layer.current as unknown as HTMLElement;
    const natural = (surface.current as unknown as HTMLElement).getBoundingClientRect().height;
    const frame = box.getBoundingClientRect();
    const line = anchor.getBoundingClientRect();
    const top = line.bottom - frame.top + gap;
    const bottom = frame.bottom - line.top + gap;
    const below = frame.height - top - margin;
    const above = frame.height - bottom - margin;
    const across = Math.min(width, frame.width - 2 * margin);
    const left = Math.max(margin, Math.min(line.right - frame.left + overhang, frame.width - margin) - across);
    setPlacement(natural <= below || below >= above ? { side: "below", top, left, width: across, maxHeight: below } : { side: "above", bottom, left, width: across, maxHeight: above });
  }, [anchor]);

  const enter = useEffectEvent(() => {
    const element = surface.current as unknown as HTMLElement;
    // Focus moves in, so Tab and Escape start from the popover.
    element.tabIndex = -1;
    element.style.outline = "none";
    element.focus({ preventScroll: true });
    if (instant) return;
    // The first frame already holds the start state, so the open popover never flashes before it grows.
    const from = reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" };
    element.animate?.([from, { opacity: 1, transform: "scale(1)" }], { duration: motion.controlIn, easing: motion.easeOut, fill: "backwards" });
  });
  useLayoutEffect(() => {
    if (placement) enter();
  }, [placement]);

  useLayoutEffect(() => {
    if (!closing) return;
    const element = surface.current as unknown as HTMLElement | null;
    if (!element?.animate) return leave();
    // A close that lands mid-entrance leaves from where the popover is, not from fully shown.
    const { opacity, transform } = getComputedStyle(element);
    element.getAnimations().forEach((running) => running.cancel());
    const to = reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.98)" };
    const fade = element.animate([{ opacity, transform }, to], { duration: leaveFor, easing: motion.easeOut, fill: "forwards" });
    fade.onfinish = () => leave();
    return () => fade.cancel();
  }, [closing, reduce]);

  // Only a width change moves the anchor sideways; a height change can be a tablet's keyboard over a field in the popover.
  useEffect(() => {
    const opened = document.documentElement.clientWidth;
    const onResize = () => document.documentElement.clientWidth !== opened && close();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const where = placement
    ? { ...(placement.side === "below" ? { top: placement.top } : { bottom: placement.bottom }), left: placement.left, width: placement.width, maxHeight: placement.maxHeight }
    : { top: 0, left: 0, width, opacity: 0 };
  return (
    <View ref={layer} style={styles.fill}>
      <View style={styles.fill} onPointerDown={onClose} />
      <View
        ref={surface}
        role="dialog"
        aria-label={label}
        style={[styles.surface, where, { transformOrigin: placement?.side === "above" ? "bottom right" : "top right", backgroundColor: c.sheet, boxShadow: c.popShadow }]}
      >
        <ScrollView style={contain} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const contain = webStyle({ overscrollBehavior: "contain" });

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  surface: { position: "absolute", borderRadius: 20, overflow: "hidden" },
  content: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20 },
});
