import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, type PointerEvent } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { motion, type, useColors } from "../theme";

type Props = { label: string; onPress: () => void; outsideScroll?: boolean };

type Look = "rest" | "waiting" | "pressed" | "tapped";

const scrollViewTouchDelay = 150;
const tapLook = motion.pressIn;

const timedLooks: Partial<Record<Look, { after: number; next: Look }>> = {
  waiting: { after: scrollViewTouchDelay, next: "pressed" },
  tapped: { after: tapLook, next: "rest" },
};

const pressKeys = new Set([" ", "Enter"]);

const primaryPress = ({ nativeEvent }: PointerEvent) => nativeEvent.isPrimary && nativeEvent.button === 0;

function usePressLook(outsideScroll: boolean) {
  const [look, setLook] = useState<Look>("rest");
  const tapUntil = useRef(0);
  useEffect(() => {
    const timed = timedLooks[look];
    if (!timed) return;
    const timer = setTimeout(() => setLook(timed.next), timed.after);
    return () => clearTimeout(timer);
  }, [look]);
  const rest = () => setLook("rest");
  return {
    pressed: look === "pressed" || look === "tapped",
    pressProps: {
      onPointerDown: (event: PointerEvent) => {
        if (!primaryPress(event)) return;
        const waits = event.nativeEvent.pointerType === "touch" && !outsideScroll;
        tapUntil.current = waits ? performance.now() + scrollViewTouchDelay + tapLook : 0;
        setLook(waits ? "waiting" : "pressed");
      },
      onPointerUp: () => {
        const tap = performance.now() < tapUntil.current;
        setLook((current) => (current !== "rest" && tap ? "tapped" : "rest"));
      },
      onPointerCancel: rest,
      onPointerLeave: () => setLook((current) => (current === "pressed" ? "rest" : current)),
      onPointerEnter: (event: PointerEvent) => {
        if (event.nativeEvent.pointerType !== "touch" && event.nativeEvent.buttons === 1) setLook("pressed");
      },
      onBlur: rest,
      onKeyDown: (event: { key: string }) => {
        if (pressKeys.has(event.key)) setLook("pressed");
      },
      onKeyUp: (event: { key: string }) => {
        if (pressKeys.has(event.key)) rest();
      },
    },
  };
}

export function Button({ label, onPress, outsideScroll = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const look = usePressLook(outsideScroll);
  const web = Platform.OS === "web";
  const webProps = web ? { dataSet: { pressable: "" }, ...look.pressProps } : {};
  return (
    <Pressable
      role="button"
      onPress={onPress}
      {...webProps}
      style={({ pressed }) => [styles.solid, { backgroundColor: c.action }, pressStyle(web ? look.pressed : pressed, reduce)]}
    >
      <Text style={[type.button, { color: c.onAction }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: { height: 56, paddingHorizontal: 28, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
