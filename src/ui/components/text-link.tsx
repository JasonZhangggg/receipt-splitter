import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";
import { PressTarget, type Press } from "./button";
import { Icon } from "./icon";

// React Native has no text-underline-offset, so the browser's own is set through the style object.
const underline = { textDecorationLine: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px" } as TextStyle;
const linkPress = { scale: 0.97, pressIn: 100 };

type Props = { center?: boolean; label: string; onPress: (press: Press) => void; name?: string; plus?: boolean; outsideScroll?: boolean; expanded?: boolean; popup?: "dialog" };

/** A quiet underlined action in the muted ink. With `plus` the "+" leads it and only the words are underlined. */
export function TextLink({ center = false, label, onPress, name, plus = false, outsideScroll, expanded, popup }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} onPress={onPress} outsideScroll={outsideScroll} expanded={expanded} popup={popup} style={(pressed) => [styles.target, center && styles.centered, pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View style={styles.face}>
          {plus ? <Icon name="plus" size={12} color={c.muted} /> : null}
          <Text style={[type.caption, underline, { color: c.muted, textDecorationColor: c.muted }]}>{label}</Text>
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  centered: { alignSelf: "center" },
  face: { flexDirection: "row", alignItems: "center", gap: 8 },
});
