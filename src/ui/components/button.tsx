import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { pressTransition } from "../motion";
import { type, useColors } from "../theme";

const pressable = { dataSet: { pressable: "" } };

type Props = { label: string; onPress: () => void; style?: StyleProp<ViewStyle> };

export function Button({ label, onPress, style }: Props) {
  const c = useColors();
  return (
    <Pressable
      role="button"
      onPress={onPress}
      {...pressable}
      style={({ pressed }) => [
        styles.solid,
        { backgroundColor: c.action },
        pressTransition(pressed),
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[type.button, { color: c.onAction }]}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <Pressable
      role="button"
      onPress={onPress}
      hitSlop={10}
      {...pressable}
      style={({ pressed }) => [styles.text, pressTransition(pressed), pressed && styles.textPressed]}
    >
      <Text style={[type.small, styles.underline, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: { height: 56, paddingHorizontal: 28, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.96 }] },
  text: { alignSelf: "flex-start" },
  textPressed: { opacity: 0.6 },
  underline: { textDecorationLine: "underline" },
});
