import { Pressable, StyleSheet, Text } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";

const webProps = { dataSet: { pressable: "" }, delayPressIn: 0 };

export function Button({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <Pressable
      role="button"
      onPress={onPress}
      {...webProps}
      style={({ pressed }) => [styles.solid, { backgroundColor: c.action }, pressStyle(pressed, reduce)]}
    >
      <Text style={[type.button, { color: c.onAction }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: { height: 56, paddingHorizontal: 28, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
