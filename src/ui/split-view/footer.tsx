import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, tabular, type, useColors } from "../theme";

export type FooterPill = { readonly kind: "pay"; readonly host: string } | { readonly kind: "paid" } | { readonly kind: "ask" };

type Props = {
  label: string;
  amount: string;
  /** The person whose share this is when it is not this phone's own, for the button's name. */
  whose: string | null;
  line: string;
  /** The paid line that replaces `line` once there is one, with its ink. */
  note?: { readonly text: string; readonly ink: string } | null;
  pill: FooterPill | null;
  onOpen: (press: Press) => void;
  onHeight: (height: number) => void;
};

/** Fixed to the bottom of the page: whose share, the amount, how much of the receipt it covers, and the pill that opens the Pay sheet. */
export function SplitFooter({ label, amount, whose, line, note, pill, onOpen, onHeight }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="footer"
      onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}
      style={[styles.bar, { backgroundColor: c.field, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}
    >
      <View style={styles.row}>
        {pill?.kind === "ask" ? (
          <Text style={[type.caption, styles.ask, { color: c.muted }]}>{say.browse}</Text>
        ) : (
          <PressTarget name={`${label} ${amount}, ${say.showBreakdown(whose)}`} outsideScroll onPress={onOpen} style={(pressed) => [styles.share, pressStyle(pressed, reduce)]}>
            {() => (
              <>
                <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                  {label}
                </Text>
                <Text testID="owe" style={[type.hero, tabular, styles.amount, { color: c.ink }]}>
                  {amount}
                </Text>
                <Text testID={note ? "share-note" : undefined} numberOfLines={1} style={[type.caption, tabular, { color: note?.ink ?? c.muted }]}>
                  {note?.text ?? line}
                </Text>
              </>
            )}
          </PressTarget>
        )}
        {pill ? <Pill pill={pill} onPress={onOpen} /> : null}
      </View>
    </View>
  );
}

function Pill({ pill, onPress }: { pill: FooterPill; onPress: (press: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const paid = pill.kind === "paid";
  const text = pill.kind === "pay" ? say.payHost(pill.host) : pill.kind === "ask" ? say.question : say.paidMark;
  const ink = paid ? c.good : c.onAction;
  return (
    <PressTarget name={paid ? say.paid : text} outsideScroll onPress={onPress} style={(pressed) => [styles.pillHit, pressStyle(pressed, reduce)]}>
      {() => (
        <View style={[styles.pill, paid ? { boxShadow: `inset 0 0 0 1px ${c.hairline}` } : { backgroundColor: c.action }]}>
          <Text numberOfLines={1} style={[type.body, styles.pillText, { color: ink }]}>
            {text}
          </Text>
          {pill.kind === "pay" ? <Icon name="arrow" size={16} color={ink} /> : null}
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", borderTopWidth: 1, paddingTop: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", maxWidth: 480 },
  share: { flex: 1, minWidth: 0, minHeight: 64, justifyContent: "center" },
  amount: { fontWeight: "400" },
  ask: { flex: 1, minWidth: 0 },
  pillHit: { flexShrink: 0, maxWidth: "58%" },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, paddingHorizontal: 20, borderRadius: 24 },
  pillText: { flexShrink: 1 },
});
