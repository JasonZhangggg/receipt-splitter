import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ParticipantId, Split } from "../../core/split";
import { computeShares } from "../../core/shares";
import { money } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon, type IconName } from "../components/icon";
import { useLayoutHeight } from "../components/viewport";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import type { Colors } from "../colors";
import { layout, motion, type, useColors } from "../theme";
import { usePersonInks } from "../person-inks";
import { slices, ring } from "./donut-model";
import { DonutRing } from "./donut-ring";
import { paymentStatus, type PaymentRow } from "./model";
import { SheetHeader } from "../split-view/sheet-header";

type Props = { split: Split; me: ParticipantId | null; onClose: () => void; /** In a bottom sheet: the ring stays put and only the people scroll, out to the sheet's edge. */ sheet?: boolean };

/** Who has paid, for everyone in chip order. It reads the live Split, so another phone's payment lands here as it happens. */
export function PaymentsSheet({ split, me, onClose, sheet = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const shares = computeShares(split);
  const { rows, summary } = paymentStatus(split, shares, me);
  const inkOf = usePersonInks(split.participants.map(({ id }) => id));
  const insets = useSafeAreaInsets();
  const room = useLayoutHeight() - insets.top - 38 - sheetChrome - insets.bottom;
  const [fixed, setFixed] = useState(0);
  const [picked, setPicked] = useState<ParticipantId | null>(null);
  const pickedRow = rows.find(({ id }) => id === picked) ?? null;
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
      {summary ? (
        <Text testID="payments-summary" style={[type.body, { color: c.muted }]}>
          {summary}
        </Text>
      ) : null}
      {total > 0 ? (
        <View role="img" aria-label={label} style={styles.ring}>
          <DonutRing slices={slices(shares)} paint={(id) => inkOf(id).mark} track={c.hairline} picked={pickedRow?.id ?? null} />
          {pickedRow ? (
            <PressTarget name={say.ring.showTotal} outsideScroll onPress={() => setPicked(null)} style={() => [styles.center, styles.centerHit, !reduce && centerIn]}>
              {() => <Part name={pickedRow.id === me ? say.ring.yourPart : say.ring.partOf(pickedRow.name)} amount={money(pickedRow.share)} />}
            </PressTarget>
          ) : (
            <View aria-hidden style={[styles.center, !reduce && centerIn]}>
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
          )}
        </View>
      ) : null}
      </View>
      <ScrollView
        role="list"
        aria-label={say.payments}
        {...(sheet ? { dataSet: { sheetScroll: "" } } : {})}
        style={[styles.list, { marginRight: -edge }, contain, sheet && { maxHeight: Math.max(minList, room - fixed - layout.pairGap) }]}
        contentContainerStyle={[styles.listContent, { paddingRight: edge - rowPad }]}
      >
        {rows.map(({ id, name, share, state, words }) => {
          const on = id === picked;
          return (
            <View key={id} role="listitem" {...{ dataSet: { state } }}>
              <PressTarget
                name={`${name}${id === me ? `, ${say.you}` : ""}, ${words}, ${money(share)}`}
                toggled={on}
                outsideScroll={!sheet}
                onPress={() => setPicked(on ? null : id)}
                style={(pressed) => pressStyle(pressed, reduce)}
              >
                {() => (
                  <View style={[styles.row, rowFade, on && { backgroundColor: c.sheetIn }]}>
                    <View style={styles.body}>
                      <View style={styles.who}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: 3, backgroundColor: inkOf(id).mark }} />
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
                )}
              </PressTarget>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Part({ name, amount }: { name: string; amount: string }) {
  const c = useColors();
  return (
    <>
      <Text numberOfLines={1} style={[type.hero, styles.tabular, { color: c.ink }]}>
        {amount}
      </Text>
      <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
        {name}
      </Text>
    </>
  );
}

// The sheet's grab handle and bottom padding, which the content has to leave room for.
const sheetChrome = 29 + 30;
const rowPad = 12;
const rowEdge = 20;
const minList = 112;
const contain = webStyle({ overscrollBehavior: "contain" });
const rowFade = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: motion.easeOut });
/** The center arrives with the ring, and again whenever it swaps between the total and a person's part. */
const centerIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "scale(0.94)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: "220ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

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
  centerHit: { top: 28, right: 28, bottom: 28, left: 28, borderRadius: 80, paddingHorizontal: 0 },
  list: { marginLeft: -rowPad },
  listContent: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6, paddingHorizontal: rowPad, borderRadius: 16 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  who: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1 },
  // The "!" is a thin stroke in a square glyph box, so it would sit farther from the name than the check does.
  narrow: { marginHorizontal: -3 },
  amount: { fontVariant: ["tabular-nums"], textAlign: "right" },
});
