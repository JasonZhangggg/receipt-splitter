import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";
import { PressTarget, type Action } from "./button";
import { Icon } from "./icon";

// React Native has no text-underline-offset, so the browser's own is set through the style object.
export const underline = { textDecorationLine: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px" } as TextStyle;
export const linkPress = { scale: 0.97, pressIn: 100 };

type Props = Action & { center?: boolean; ink?: boolean; label: string; name?: string; plus?: boolean; outsideScroll?: boolean; expanded?: boolean; popup?: "dialog" };

/** A quiet underlined action in the muted ink, or the strong ink with `ink`. With `href` it is a link that opens in a new tab. With `plus` the "+" leads it and only the words are underlined. */
export function TextLink({ center = false, ink = false, label, name, plus = false, outsideScroll, expanded, popup, ...action }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget {...action} name={name} outsideScroll={outsideScroll} expanded={expanded} popup={popup} style={(pressed) => [styles.target, center && styles.centered, pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View style={styles.face}>
          {plus ? <Icon name="plus" size={12} color={c.muted} /> : null}
          <Text numberOfLines={1} style={[type.caption, underline, { color: ink ? c.ink : c.muted, textDecorationColor: ink ? c.ink : c.muted }]}>{label}</Text>
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", flexShrink: 1, minWidth: 0 },
  centered: { alignSelf: "center" },
  face: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
});
