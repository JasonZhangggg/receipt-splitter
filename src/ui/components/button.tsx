import { Pressable, StyleSheet, Text } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";

type Props = { label: string; onPress: () => void; outsideScroll?: boolean };

export function Button({ label, onPress, outsideScroll = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const webProps = { dataSet: { pressable: "" }, delayPressIn: outsideScroll ? 0 : undefined };
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
