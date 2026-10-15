import { useId } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { layout, motion, type, useColors } from "../theme";

const pillPress = { scale: 0.97, pressIn: 160 };
const fade = webStyle({ transitionProperty: "opacity", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

type Props = {
  /** What stops Create, or a note about the receipt, or null. */
  reason: string | null;
  /** The reason is a problem (red) and not just what is still to do. */
  problem: boolean;
  /** Create is gray. A tap on it still acts, by taking the person to what is missing. */
  blocked: boolean;
  busy: boolean;
  onPress: () => void;
  onHeight: (height: number) => void;
  width: number;
};

/** The reason line and the Create pill, fixed below the scrolling page. */
export function HomeFooter({ reason, problem, blocked, busy, onPress, onHeight, width }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const reasonId = useId();
  return (
    <View
      onLayout={({ nativeEvent }: LayoutChangeEvent) => onHeight(nativeEvent.layout.height)}
      style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom + 8), paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}
    >
      <View style={[styles.column, { maxWidth: width, borderTopColor: c.hairline }]}>
        <Text id={reasonId} role="status" style={[type.caption, { color: problem ? c.warn : c.muted }, reason ? styles.reason : null]}>
          {reason}
        </Text>
        <PressTarget
          name={busy ? copy.creating : copy.action}
          describedBy={reason ? reasonId : undefined}
          busy={busy}
          disabled={busy}
          outsideScroll
          onPress={onPress}
          style={(pressed) => pressStyle(pressed, reduce, pillPress)}
        >
          {() => (
            <View style={[styles.pill, fade, { backgroundColor: c.action, opacity: blocked ? 0.35 : busy ? 0.6 : 1 }]}>
              <Text style={[type.title, { color: c.onAction }]}>{busy ? copy.creating : copy.action}</Text>
              {busy ? null : <Icon name="arrow" size={14} color={c.onAction} />}
            </View>
          )}
        </PressTarget>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: "center" },
  column: { width: "100%", borderTopWidth: 1, paddingTop: 14 },
  reason: { marginBottom: 12 },
  pill: { height: 44, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
