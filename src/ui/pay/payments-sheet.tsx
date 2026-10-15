import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ParticipantId, Split } from "../../core/split";
import { computeShares } from "../../core/shares";
import { money } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { useLayoutHeight } from "../components/viewport";
import { useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import type { Colors } from "../colors";
import { layout, motion, type, useColors } from "../theme";
import { slices, ring } from "./donut-model";
import { DonutRing } from "./donut-ring";
import { paymentStatus, pickedRow, viewerFirst, type PaymentRow } from "./model";
import { firstName } from "./pay-sheet";
import { SheetHeader } from "../split-view/sheet-header";

type Props = { split: Split; me: ParticipantId | null; onClose: () => void; /** In a bottom sheet: the ring stays put and only the people scroll, out to the sheet's edge. */ sheet?: boolean };

/** Who has paid, for everyone in chip order. It reads the live Split, so another phone's payment lands here as it happens. */
export function PaymentsSheet({ split, me, onClose, sheet = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const shares = computeShares(split);
  const { rows, summary } = paymentStatus(split, shares, me);
  const insets = useSafeAreaInsets();
  const room = useLayoutHeight() - insets.top - 38 - sheetChrome - insets.bottom;
  const [fixed, setFixed] = useState(0);
  const [tapped, setTapped] = useState<ParticipantId | null>(null);
  const picked = pickedRow(rows, tapped, me);
  const edge = sheet ? layout.gutter + insets.right : rowEdge;
  const total = split.receipt.total;
  const unclaimed = shares.unclaimed.total;
  const label = say.ring.label(
    money(total),
    rows.filter(({ share }) => share > 0).map(({ name, share }) => `${name} ${money(share)}`),
    unclaimed > 0 ? money(unclaimed) : null,
  );
  return (
    <View style={styles.sheet}>
      <View style={styles.sheet} onLayout={(event) => setFixed(event.nativeEvent.layout.height)}>
        <SheetHeader title={say.payments} onClose={onClose} />
        {rows.length > 0 ? (
          <Text style={[type.body, { color: c.muted }]}>
            {say.ring.everyonePays(firstName(rows[0].name))}
            {summary ? " " : null}
            <Text testID="payments-summary">{summary}</Text>
            {unclaimed > 0 ? say.ring.unclaimed(money(unclaimed)) : null}
          </Text>
        ) : null}
        {total > 0 ? (
          <View role="img" aria-label={label} style={styles.ring}>
            <DonutRing slices={slices(shares)} paint={(id) => (id === picked.id ? c.ink : c.dot)} track={c.hairline} />
            <View aria-hidden style={[styles.center, !reduce && centerIn]}>
              <Text style={[type.hero, styles.tabular, { color: c.ink }]}>{money(picked.share)}</Text>
              <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
                {picked.id === me ? say.ring.yourPart : say.ring.partOf(firstName(picked.name))}
              </Text>
              <Text numberOfLines={1} style={[type.caption, styles.tabular, styles.caption, { color: c.muted }]}>
                {say.ring.of(money(total))}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      <ScrollView
        role="list"
        aria-label={say.payments}
        {...(sheet ? { dataSet: { sheetScroll: "" } } : {})}
        style={[{ marginRight: -edge }, contain, sheet && { maxHeight: Math.max(minList, room - fixed - layout.pairGap) }]}
        contentContainerStyle={{ paddingRight: edge }}
      >
        {viewerFirst(rows, me).map(({ id, name, share, state, words }) => {
          const on = id === picked.id;
          return (
            <View key={id} role="listitem" {...{ dataSet: { state } }}>
              <PressTarget name={`${name}${id === me ? `, ${say.you}` : ""}, ${words}, ${money(share)}`} toggled={on} outsideScroll={!sheet} onPress={() => setTapped(id)} style={() => null}>
                {(pressed) => {
                  const ink = on || pressed ? c.ink : c.muted;
                  return (
                    <View style={[styles.row, { borderTopColor: c.hairline }]}>
                      <View style={styles.body}>
                        <View style={styles.who}>
                          <View style={[styles.dot, { backgroundColor: on ? c.ink : c.dot }, !reduce && fade]} />
                          <Text numberOfLines={1} style={[type.body, styles.name, { color: ink }, !reduce && fade]}>
                            {name}
                          </Text>
                          {id === me ? <Icon name="person" size={13} color={ink} /> : null}
                        </View>
                        <View style={styles.sub}>
                          {state === "settled" ? <Icon name="check" size={13} color={c.good} /> : null}
                          <Text style={[type.caption, { color: stateInk(c, state) }]}>{state === "settled" ? say.paid : words}</Text>
                        </View>
                      </View>
                      <Text style={[type.body, styles.amount, { color: ink }, !reduce && fade]}>{money(share)}</Text>
                    </View>
                  );
                }}
              </PressTarget>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// The sheet's grab handle and bottom padding, which the content has to leave room for.
const sheetChrome = 29 + 30;
const rowEdge = 20;
const minList = 112;
const contain = webStyle({ overscrollBehavior: "contain" });
const fade = webStyle({ transitionProperty: "color, background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: motion.easeOut });
/** The total arrives after the first arcs have started drawing, once, and does not replay when another person is picked. */
const centerIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: "280ms",
  animationDelay: "260ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

/** Green marks "Paid" in this sheet only. A share that moved after the payment is a problem, so red. */
const stateInk = (c: Colors, state: PaymentRow["state"]) => (state === "settled" ? c.good : state === "short" || state === "over" ? c.warn : c.muted);

const styles = StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  caption: { textAlign: "center" },
  ring: { alignSelf: "center", width: ring.size, height: ring.size, marginVertical: 8 },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  sheet: { gap: layout.pairGap },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: 1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flexShrink: 1 },
  sub: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 22 },
  amount: { fontVariant: ["tabular-nums"], textAlign: "right" },
});
