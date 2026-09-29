import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion } from "../motion";
import { motion, space, type, useColors } from "../theme";

const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
const visibleFor = 4000;

type Props = {
  message: string | null;
  onHide: () => void;
  action?: { label: string; onPress: () => void };
  bottom?: number;
};

export function Toast({ message, onHide, action, bottom = 0 }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(message);
  if (message && message !== shown) setShown(message);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: message ? 1 : 0,
      duration: reduce ? motion.reducedFade : message ? motion.toastIn : motion.toastOut,
      easing: easeOut,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !message) setShown(null);
    });
    if (!message) return () => animation.stop();
    const timer = setTimeout(onHide, visibleFor);
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [message, reduce, progress, onHide]);

  if (!shown) return null;
  const translateY = reduce ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: bottom + space.l + insets.bottom }]}>
      <Animated.View
        role="status"
        aria-live="polite"
        style={[styles.toast, { backgroundColor: c.ink, opacity: progress, transform: [{ translateY }] }]}
      >
        <Text style={[type.small, styles.message, { color: c.paper }]}>{shown}</Text>
        {action ? (
          <Pressable role="button" onPress={action.onPress} hitSlop={8}>
            <Text style={[type.small, styles.action, { color: c.paper }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
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
  action: { textDecorationLine: "underline" },
});
