import { StyleSheet, Text } from "react-native";

import { type, useColors } from "../theme";

export function Tag({ text }: { text: string }) {
  const c = useColors();
  return <Text style={[type.caption, styles.tag, { color: c.muted, borderColor: c.hairline }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, borderWidth: 1, fontSize: 11.5, lineHeight: 15 },
});
