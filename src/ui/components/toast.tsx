import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { easing, layout, motion, type, useColors } from "../theme";
import { PressTarget } from "./button";
import { underline } from "./text-link";
import { hideAfter } from "./hide-timer";

const visibleFor = 4000;
// The toast is ink-colored, so its focus ring is drawn in the field color.
const ring = (color: string) => webStyle({ "--focus": color } as never);
// The toast sits above the home panel, so it rides the panel's keyboard lift.
const followsPanel = { dataSet: { followsPanel: "" } };

type Props = {
  message: string | null;
  onHide: () => void;
  action?: { label: string; onPress: () => void };
  lift?: number;
};

export function Toast({ message, onHide, action, lift = 0 }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(message);
  // While the bar fades out its Undo stays, so the bar does not change shape on the way out.
  const [shownAction, setShownAction] = useState(action);
  if (message && message !== shown) {
    setShown(message);
    setShownAction(action);
  }
  const showing = message ? action : shownAction;
  const hide = useEffectEvent(onHide);
  const bar = useRef<View>(null);
  // Where focus was before it moved into the toast, so it can go back when the toast leaves.
  const before = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: message ? 1 : 0,
      duration: reduce ? motion.reducedFade : message ? motion.toastIn : motion.toastOut,
      easing: easing.easeOut,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !message) setShown(null);
    });
    return () => animation.stop();
  }, [message, reduce, progress]);

  useEffect(() => {
    if (message) return hideAfter(visibleFor, () => hide(), undefined, (bar.current as unknown as HTMLElement | null) ?? undefined);
  }, [message]);

  useEffect(() => {
    const element = bar.current as unknown as HTMLElement | null;
    if (!element) return;
    const onFocusIn = (event: FocusEvent) => {
      const from = event.relatedTarget as HTMLElement | null;
      if (from && !element.contains(from)) before.current = from;
    };
    element.addEventListener("focusin", onFocusIn);
    return () => element.removeEventListener("focusin", onFocusIn);
  }, [shown]);

  // A toast that leaves with focus inside it hands focus back to where it came from, not to the top of the page.
  useEffect(() => {
    if (message) return;
    const element = bar.current as unknown as HTMLElement | null;
    const back = before.current;
    before.current = null;
    if (element?.contains(document.activeElement) && back?.isConnected && !back.closest("[inert]")) back.focus({ preventScroll: true });
  }, [message]);

  const translateY = reduce ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const scale = reduce ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });

  return (
    <View role="status" aria-live="polite" pointerEvents="box-none" {...followsPanel} style={[styles.anchor, { bottom: 16 + (lift || insets.bottom) }]}>
      {shown ? (
        <Animated.View ref={bar} style={[styles.toast, !showing && styles.bare, ring(c.field), { backgroundColor: c.ink, opacity: progress, transform: [{ translateY }, { scale }] }]}>
          <Text style={[type.caption, styles.message, { color: c.field }]}>{shown}</Text>
          {showing ? (
            <PressTarget onPress={showing.onPress} outsideScroll style={(pressed) => [styles.action, pressStyle(pressed, reduce)]}>
              {() => (
                <View {...{ dataSet: { pressFace: "" } }} style={styles.face}>
                  <Text style={[type.caption, underline, { color: c.field, textDecorationColor: c.field }]}>{showing.label}</Text>
                </View>
              )}
            </PressTarget>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", left: layout.gutter, right: layout.gutter, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    maxWidth: 480,
    minHeight: 48,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: 24,
  },
  // With no action at the end, the text keeps the same room on the right as on the left.
  bare: { paddingRight: 20 },
  // The padding is on the text, not the bar, so a one-line toast stays 48 tall while a wrapped one clears its rounded ends.
  message: { flexShrink: 1, paddingVertical: 10 },
  action: { minWidth: 44, minHeight: 44 },
  face: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 22 },
});
