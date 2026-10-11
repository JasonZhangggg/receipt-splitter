import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId, Split } from "../../core/split";
import { computeShares } from "../../core/shares";
import { money } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon, type IconName } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import type { Colors } from "../colors";
import { layout, type, useColors } from "../theme";
import { usePersonInks } from "../person-inks";
import { slices, ringMarkup, ring } from "./donut-model";
import { DonutRing } from "./donut-ring";
import { paymentStatus, type PaymentRow } from "./model";

type Props = { split: Split; me: ParticipantId | null; onClose: () => void };

/** Who has paid, for everyone in chip order. It reads the live Split, so another phone's payment lands here as it happens. */
export function PaymentsSheet({ split, me, onClose }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const shares = computeShares(split);
  const { rows, summary } = paymentStatus(split, shares, me);
  const inkOf = usePersonInks(split.participants.map(({ id }) => id));
  const total = split.receipt.total;
  const unclaimed = shares.unclaimed.total;
  const label = say.ring.label(
    money(total),
    rows.filter(({ share }) => share > 0).map(({ name, share }) => `${name} ${money(share)}`),
    unclaimed > 0 ? money(unclaimed) : null,
  );
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
        <Text testID="payments-summary" style={[type.body, { color: c.muted }]}>
          {summary}
        </Text>
      ) : null}
      {total > 0 ? (
        <View role="img" aria-label={label} style={styles.ring}>
          <DonutRing markup={ringMarkup(slices(shares), inkOf, c.hairline)} />
          <View aria-hidden style={styles.center}>
            <Text style={[type.hero, styles.tabular, { color: c.ink }]}>{money(total)}</Text>
            {unclaimed > 0 ? (
              <Text numberOfLines={1} style={[type.caption, styles.tabular, styles.caption, { color: c.muted }]}>
                {money(unclaimed)}
              </Text>
            ) : null}
            <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
              {unclaimed > 0 ? say.ring.unclaimed : say.ring.claimed}
            </Text>
          </View>
        </View>
      ) : null}
      <View role="list" aria-label={say.payments} style={styles.list}>
        {rows.map(({ id, name, share, state, words }) => (
          <View key={id} role="listitem" style={styles.row} {...{ dataSet: { state } }}>
            <View style={styles.body}>
              <View style={styles.who}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: 3, backgroundColor: inkOf(id) }} />
                <Text numberOfLines={1} style={[type.body, styles.name, { color: c.ink }]}>
                  {name}
                </Text>
                {id === me ? <Icon name="person" size={13} color={c.ink} /> : null}
                {marks[state] ? (
                  <View style={marks[state] === "exclaim" && styles.narrow}>
                    <Icon name={marks[state]} size={markSize} color={stateInk(c, state)} />
                  </View>
                ) : null}
              </View>
              <Text style={[type.caption, { color: stateInk(c, state) }]}>{words}</Text>
            </View>
            <Text style={[type.body, styles.amount, { color: c.ink }]}>{money(share)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const markSize = 14;
const stateInk = (c: Colors, state: PaymentRow["state"]) => (state === "settled" ? c.good : state === "short" || state === "over" ? c.warn : c.muted);
/** The glyph after the name: a check once paid in full, an x while unpaid, "!" when they paid and the share has moved. The Host and a $0 share get none. */
const marks: Record<PaymentRow["state"], IconName | null> = { settled: "check", unpaid: "x", short: "exclaim", over: "exclaim", nothing: null, host: null };

const styles = StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  caption: { textAlign: "center" },
  ring: { alignSelf: "center", width: ring.size, height: ring.size, marginVertical: 8 },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  sheet: { gap: layout.pairGap },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { marginTop: 2 },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  list: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  who: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1 },
  // The "!" is a thin stroke in a square glyph box, so it would sit farther from the name than the check does.
  narrow: { marginHorizontal: -3 },
  amount: { fontVariant: ["tabular-nums"], textAlign: "right" },
});
