import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion } from "../motion";
import { motion, space, type, useColors } from "../theme";

const drawer = Easing.bezier(0.32, 0.72, 0, 1);
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode };

export function Sheet({ open, onClose, title, children }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reduce ? motion.reducedFade : open ? motion.sheetIn : motion.sheetOut,
      easing: open ? drawer : easeOut,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, reduce, progress]);

  const translateY = reduce ? "0%" : progress.interpolate({ inputRange: [0, 1], outputRange: ["100%", "0%"] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: progress }]}>
          <Pressable style={styles.fill} onPress={onClose} focusable={false} aria-hidden />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            { backgroundColor: c.paper, paddingBottom: space.xl + insets.bottom },
            { opacity: reduce ? progress : 1, transform: [{ translateY }] },
          ]}
        >
          <Text role="heading" aria-level={2} style={[type.heading, { color: c.ink }]}>
            {title}
          </Text>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignSelf: "center",
    width: "100%",
    maxWidth: 560,
    marginHorizontal: "auto",
    gap: space.l,
    paddingTop: space.xl,
    paddingHorizontal: space.xl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});
