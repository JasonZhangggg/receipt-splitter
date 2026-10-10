import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId, Split } from "../../core/split";
import { computeShares } from "../../core/shares";
import { money } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { paymentStatus } from "./model";

type Props = { split: Split; me: ParticipantId | null; onClose: () => void };

/** Who has paid, for everyone in chip order. It reads the live Split, so another phone's payment lands here as it happens. */
export function PaymentsSheet({ split, me, onClose }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const { rows, summary } = paymentStatus(split, computeShares(split), me);
  return (
    <View style={styles.sheet}>
      <View style={styles.topline}>
        <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
          {say.payments}
        </Text>
        <PressTarget name={say.close} outsideScroll onPress={onClose} style={(pressed) => [styles.closeHit, pressStyle(pressed, reduce)]}>
          {() => (
            <View style={[styles.close, { backgroundColor: c.sheetIn }]}>
              <Icon name="x" size={16} color={c.ink} />
            </View>
          )}
        </PressTarget>
      </View>
      {summary ? (
        <Text testID="payments-summary" style={[type.secondary, { color: c.muted }]}>
          {summary}
        </Text>
      ) : null}
      <View role="list" aria-label={say.payments} style={styles.list}>
        {rows.map(({ id, name, share, words }) => (
          <View key={id} role="listitem" style={styles.row}>
            <View style={styles.body}>
              <View style={styles.who}>
                <Text numberOfLines={1} style={[type.button, styles.name, { color: c.ink }]}>
                  {name}
                </Text>
                {id === me ? <Icon name="person" size={13} color={c.ink} /> : null}
              </View>
              <Text style={[type.caption, { color: c.muted }]}>{words}</Text>
            </View>
            <Text style={[type.button, styles.amount, { color: c.ink }]}>{money(share)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: layout.pairGap },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, lineHeight: 22, marginTop: 2 },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  list: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  who: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1 },
  amount: { fontVariant: ["tabular-nums"], textAlign: "right" },
});
