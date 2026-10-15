import { useEffect, useEffectEvent, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion } from "../motion";
import { easing, layout, motion, type, useColors } from "../theme";
import { underline } from "./text-link";
import { hideAfter } from "./hide-timer";

const visibleFor = 4000;
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
    if (message) return hideAfter(visibleFor, () => hide());
  }, [message]);

  const translateY = reduce ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const scale = reduce ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });

  return (
    <View role="status" aria-live="polite" pointerEvents="box-none" {...followsPanel} style={[styles.anchor, { bottom: 16 + (lift || insets.bottom) }]}>
      {shown ? (
        <Animated.View style={[styles.toast, { backgroundColor: c.ink, opacity: progress, transform: [{ translateY }, { scale }] }]}>
          <Text style={[type.caption, styles.message, { color: c.field }]}>{shown}</Text>
          {showing ? (
            <Pressable role="button" onPress={showing.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={[type.caption, underline, { color: c.field, textDecorationColor: c.field }]}>{showing.label}</Text>
            </Pressable>
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
  message: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
  action: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
});
