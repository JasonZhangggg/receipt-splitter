import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressFeel, pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, tabular, type, useColors } from "../theme";

export type FooterPill = { readonly kind: "pay"; readonly host: string } | { readonly kind: "paid" } | { readonly kind: "ask" };

type Props = {
  label: string;
  amount: string;
  /** The person whose share this is when it is not this phone's own, for the button's name. */
  whose: string | null;
  /** What sits across from the label: the items count, or a paid state in words with its ink. */
  aside: { readonly text: string; readonly ink: string; readonly paidState: boolean };
  pill: FooterPill | null;
  onOpen: (press: Press) => void;
  onHeight: (height: number) => void;
};

/** Fixed to the bottom of the page. The label and the items count share a muted line; under it the amount and the pill that opens the Pay sheet. */
export function SplitFooter({ label, amount, whose, aside, pill, onOpen, onHeight }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <View
      testID="footer"
      onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}
      style={[styles.bar, { backgroundColor: c.field, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}
    >
      <View style={styles.column}>
        {pill?.kind === "ask" ? null : (
          <View style={styles.top}>
            <Text numberOfLines={1} style={[type.caption, styles.label, { color: c.muted }]}>
              {label}
            </Text>
            <Text testID={aside.paidState ? "share-note" : undefined} numberOfLines={1} style={[type.caption, tabular, styles.aside, { color: aside.ink }]}>
              {aside.text}
            </Text>
          </View>
        )}
        <View style={styles.bottom}>
          {pill?.kind === "ask" ? (
            <Text style={[type.caption, styles.ask, { color: c.muted }]}>{say.browse}</Text>
          ) : (
            <PressTarget name={`${label} ${amount}, ${say.showBreakdown(whose)}`} outsideScroll onPress={onOpen} style={(pressed) => [styles.share, pressStyle(pressed, reduced)]}>
              {() => (
                <Text testID="owe" numberOfLines={1} style={[styles.amount, tabular, { color: c.ink }]}>
                  {amount}
                </Text>
              )}
            </PressTarget>
          )}
          {pill ? <Pill pill={pill} onPress={onOpen} /> : null}
        </View>
      </View>
    </View>
  );
}

function Pill({ pill, onPress }: { pill: FooterPill; onPress: (press: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const paid = pill.kind === "paid";
  const text = pill.kind === "pay" ? say.payHost(pill.host) : pill.kind === "ask" ? say.question : say.paidMark;
  const ink = paid ? c.ink : c.onAction;
  return (
    <PressTarget name={paid ? say.paid : text} outsideScroll onPress={onPress} style={(pressed) => [styles.pillHit, pressStyle(pressed, reduce, pressFeel.pill)]}>
      {() => (
        <View style={[styles.pill, paid ? { boxShadow: `inset 0 0 0 1px ${c.hairline}` } : { backgroundColor: c.action }]}>
          <Text numberOfLines={1} style={[type.body, styles.pillText, { color: ink }]}>
            {text}
          </Text>
          {pill.kind === "pay" ? <Icon name="arrow" size={14} color={ink} /> : null}
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", borderTopWidth: 1, paddingTop: 14 },
  column: { width: "100%", maxWidth: 480 },
  top: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  label: { flexShrink: 1 },
  aside: { flexShrink: 1, textAlign: "right" },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  ask: { flex: 1, minWidth: 0 },
  share: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" },
  amount: { fontFamily: type.hero.fontFamily, fontWeight: "500", fontSize: 32, lineHeight: 44, letterSpacing: -0.96 },
  pillHit: { flexShrink: 0, maxWidth: "58%" },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, paddingLeft: 20, paddingRight: 18, borderRadius: 22 },
  pillText: { flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: "500" },
});
