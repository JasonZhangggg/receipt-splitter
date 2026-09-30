import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";

type Props = { label: string; onPress: () => void; outsideScroll?: boolean };

const noTouchPointer = Platform.OS === "web" && !matchMedia("(pointer: coarse)").matches;
const scrollViewPressDelay = 150;

export function Button({ label, onPress, outsideScroll = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [pointerCancelled, setPointerCancelled] = useState(false);
  const webProps = {
    dataSet: { pressable: "" },
    delayPressIn: outsideScroll || noTouchPointer ? 0 : scrollViewPressDelay,
    onKeyDown: () => setPointerCancelled(false),
  };
  return (
    <Pressable
      role="button"
      onPress={onPress}
      onPointerDown={() => setPointerCancelled(false)}
      onPointerCancel={() => setPointerCancelled(true)}
      {...webProps}
      style={({ pressed }) => [styles.solid, { backgroundColor: c.action }, pressStyle(pressed && !pointerCancelled, reduce)]}
    >
      <Text style={[type.button, { color: c.onAction }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: { height: 56, paddingHorizontal: 28, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
