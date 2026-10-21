import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";
import { PressTarget, type Press } from "./button";
import { Icon } from "./icon";

// React Native has no text-underline-offset, so the browser's own is set through the style object.
export const underline = { textDecorationLine: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px" } as TextStyle;
export const linkPress = { scale: 0.97, pressIn: 100 };

type Props = { center?: boolean; ink?: boolean; /** Body size, for a link that leads to a page of its own. */ body?: boolean; label: string; onPress: (press: Press) => void; name?: string; plus?: boolean; outsideScroll?: boolean; expanded?: boolean; popup?: "dialog"; busy?: boolean };

/** A quiet underlined action in the muted ink, or the strong ink with `ink`, at caption size or `body` size. With `plus` the "+" leads it and only the words are underlined. */
export function TextLink({ center = false, ink = false, body = false, label, onPress, name, plus = false, outsideScroll, expanded, popup, busy = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} onPress={onPress} outsideScroll={outsideScroll} expanded={expanded} popup={popup} busy={busy} disabled={busy} style={(pressed) => [styles.target, center && styles.centered, busy && styles.waiting, pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View style={styles.face}>
          {plus ? <Icon name="plus" size={12} color={c.muted} /> : null}
          <Text numberOfLines={1} style={[body ? type.body : type.caption, underline, { color: ink ? c.ink : c.muted, textDecorationColor: ink ? c.ink : c.muted }]}>{label}</Text>
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", flexShrink: 1, minWidth: 0 },
  centered: { alignSelf: "center" },
  waiting: { opacity: 0.5 },
  face: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
});
