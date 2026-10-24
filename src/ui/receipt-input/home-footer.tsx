import { useId } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { copy } from "../home-copy";
import { pressFeel, pressStyle, useReducedMotion, webStyle } from "../motion";
import { layout, motion, type, useColors } from "../theme";

const fade = webStyle({ transitionProperty: "opacity", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

type Props = {
  /** What stops Create, or a note about the receipt, or null. */
  reason: string | null;
  /** The reason is announced when it changes. Off while a read runs, because the sentence's step words are the live region then. */
  live: boolean;
  /** The reason is a problem (red) and not just what is still to do. */
  problem: boolean;
  /** Create is gray. A tap on it still acts, by taking the person to what is missing. */
  blocked: boolean;
  busy: boolean;
  onPress: () => void;
  onHeight?: (height: number) => void;
  width: number;
  /** The wide layout: Create and its reason sit under the sentence, the pill first, with no bar around them. */
  wide?: boolean;
};

/** The reason line at the left and the Create link pill at the right, fixed below the scrolling page, as on the Split page. Wide, the pill leads and the reason follows it, under the sentence. */
export function HomeFooter({ reason, live, problem, blocked, busy, onPress, onHeight, width, wide = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const reasonId = useId();
  const words = (
    <Text id={reasonId} role="status" aria-live={live ? "polite" : "off"} {...{ dataSet: { problem: String(problem) } }} style={[type.caption, styles.reason, { color: problem ? c.warn : c.muted }]}>
      {reason}
    </Text>
  );
  const create = (
    <PressTarget
      name={busy ? copy.creating : copy.action}
      describedBy={reason ? reasonId : undefined}
      busy={busy}
      disabled={busy}
      outsideScroll
      onPress={onPress}
      style={(pressed) => pressStyle(pressed, reduce, pressFeel.pill)}
    >
      {() => (
        <View style={[styles.pill, fade, { backgroundColor: c.action, opacity: blocked ? 0.28 : busy ? 0.6 : 1 }]}>
          <Text style={[type.title, { color: c.onAction }]}>{busy ? copy.creating : copy.action}</Text>
          {busy ? null : <Icon name="arrow" size={14} color={c.onAction} />}
        </View>
      )}
    </PressTarget>
  );
  if (wide)
    return (
      <View style={styles.inline}>
        {create}
        {words}
      </View>
    );
  return (
    <View
      onLayout={({ nativeEvent }: LayoutChangeEvent) => onHeight?.(nativeEvent.layout.height)}
      style={[styles.footer, { borderTopColor: c.hairline, paddingBottom: Math.max(24, insets.bottom + 8), paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}
    >
      <View style={[styles.column, { maxWidth: width }]}>
        {words}
        {create}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: "center", borderTopWidth: 1, paddingTop: 14 },
  column: { width: "100%", flexDirection: "row", alignItems: "center", gap: 16 },
  reason: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 44 },
  // Between the Split page's 44 px buttons and its 54 px Pay pill, so it carries the headline sentence.
  pill: { height: 50, paddingLeft: 24, paddingRight: 22, borderRadius: 25, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
