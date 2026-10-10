import { useEffect, useEffectEvent, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion } from "../motion";
import { easing, motion, space, type, useColors } from "../theme";
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
  if (message && message !== shown) setShown(message);
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

  const translateY = reduce ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <View role="status" aria-live="polite" pointerEvents="box-none" {...followsPanel} style={[styles.anchor, { bottom: space.l + (lift || insets.bottom) }]}>
      {shown ? (
        <Animated.View style={[styles.toast, { backgroundColor: c.ink, opacity: progress, transform: [{ translateY }] }]}>
          <Text style={[type.caption, styles.message, { color: c.field }]}>{shown}</Text>
          {action ? (
            <Pressable role="button" onPress={action.onPress} style={styles.action}>
              <Text style={[type.caption, styles.actionLabel, { color: c.field }]}>{action.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", left: space.l, right: space.l, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.l,
    maxWidth: 480,
    minHeight: 48,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderRadius: 14,
  },
  message: { flexShrink: 1 },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.m,
    margin: -space.m,
  },
  actionLabel: { textDecorationLine: "underline" },
});
