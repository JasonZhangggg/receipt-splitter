import { Pressable, StyleSheet, Text } from "react-native";

import { pressTransition } from "../motion";
import { type, useColors } from "../theme";

const pressable = { dataSet: { pressable: "" } };

export function Button({ label, onPress }: { label: string; onPress: () => void }) {
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
      ]}
    >
      <Text style={[type.button, { color: c.onAction }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: { height: 56, paddingHorizontal: 28, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.96 }] },
});
