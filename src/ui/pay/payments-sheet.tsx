import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ParticipantId, Split } from "../../core/split";
import { computeShares } from "../../core/shares";
import { money } from "../../core/currency";
import { useCurrency } from "../currency";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { SectionHead } from "../components/section-head";
import { useLayoutHeight } from "../components/viewport";
import { useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { checksLandBy, ring, ringMotion, slices } from "./donut-model";
import { DonutRing } from "./donut-ring";
import { foldedRows, hostCollected, paymentSections, paymentStatus, pickedRow } from "./model";
import { firstName } from "./pay-sheet";
import { SheetHeader } from "../split-view/sheet-header";

type Props = { split: Split; me: ParticipantId | null; onClose: () => void; /** In a bottom sheet: the ring stays put and only the people scroll, out to the sheet's edge. */ sheet?: boolean };

/** Who has paid, with everyone who still owes something at the top. It reads the live Split, so another phone's payment lands here as it happens. */
export function PaymentsSheet({ split, me, onClose, sheet = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const shares = computeShares(split);
  const { rows, summary, paid, owing } = paymentStatus(split, shares, me);
  const insets = useSafeAreaInsets();
  const room = useLayoutHeight() - insets.top - 38 - sheetChrome - insets.bottom;
  const [fixed, setFixed] = useState(0);
  const [tapped, setTapped] = useState<ParticipantId | null>(null);
  // Every Item is claimed and everyone who owes something has paid. The moment that happens the ring goes back to All paid, even if someone was tapped before.
  const settled = owing > 0 && paid === owing && shares.unclaimed.total === 0;
  const [wasSettled, setWasSettled] = useState(settled);
  // Whether All paid is still the one the sheet opened on, which waits for the ring to draw.
  const [opening, setOpening] = useState(settled);
  if (settled !== wasSettled) {
    setWasSettled(settled);
    setOpening(false);
    if (settled) setTapped(null);
  }
  const { shown, quiet } = foldedRows(rows, me);
  const picked = pickedRow(shown, tapped, me);
  const edge = sheet ? layout.gutter + insets.right : rowEdge;
  const total = split.receipt.total;
  const unclaimed = shares.unclaimed.total;
  const collected = hostCollected(rows, split.payments);
  const arcs = slices(shares, me);
  const checked = (id: ParticipantId) => rows.some((row) => row.id === id && (row.state === "settled" || row.state === "over" || row.state === "host"));
  const label = say.ring.label(
    money(total, split.currency),
    rows.filter(({ share }) => share > 0).map(({ name, share }) => `${name} ${money(share, split.currency)}`),
    unclaimed > 0 ? money(unclaimed, split.currency) : null,
  );
  return (
    <View style={styles.sheet}>
      <View style={styles.sheet} onLayout={(event) => setFixed(event.nativeEvent.layout.height)}>
        <SheetHeader title={say.payments} onClose={onClose} />
        {rows.length > 0 ? (
          <View style={styles.intro}>
            <Text style={[type.body, { color: c.ink }]}>{say.ring.everyonePays(firstName(rows[0].name))}</Text>
            {summary || unclaimed > 0 ? (
              <Text style={[type.caption, styles.tabular, { color: c.muted }]}>
                <Text testID="payments-summary">{summary}</Text>
                {summary ? <Text testID="payments-collected">{say.ring.collected(money(collected.paid, split.currency), money(collected.owed, split.currency))}</Text> : null}
                {unclaimed > 0 ? (summary ? say.ring.unclaimed : say.ring.unclaimedOnly)(money(unclaimed, split.currency)) : null}
              </Text>
            ) : null}
          </View>
        ) : null}
        {total > 0 ? (
          <View role="img" aria-label={label} style={styles.ring}>
            <DonutRing
              slices={arcs}
              paint={(id) => (id === picked.id ? c.ink : c.dot)}
              tick={(id) => (checked(id) ? (id === picked.id ? c.onAction : c.ink) : null)}
              track={c.hairline}
              onPick={setTapped}
            />
            <View aria-hidden pointerEvents="none" style={[styles.center, !reduce && centerIn]}>
              {settled && tapped === null ? null : (
                <View key="one" style={styles.face}>
                  <Part amount={picked.share} words={picked.id === me ? say.ring.yourPart : say.ring.partOf(firstName(picked.name))} total={total} />
                </View>
              )}
              {settled && tapped === null ? (
                <>
                  {opening || reduce ? null : (
                    <View key="leaving" style={[styles.face, partOut]}>
                      <Part amount={picked.share} words={say.ring.yourPart} total={total} />
                    </View>
                  )}
                  <AllPaid key="all" wait={reduce ? null : opening ? checksLandBy(arcs, checked) : allPaidAfterCheck} caption={say.ring.allPaid(money(total, split.currency))} />
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      <ScrollView
        testID="payments"
        {...(sheet ? { dataSet: { sheetScroll: "" } } : {})}
        style={[{ marginRight: -edge }, contain, sheet && { maxHeight: Math.max(minList, room - fixed - layout.pairGap) }]}
        contentContainerStyle={{ paddingRight: edge }}
      >
        {paymentSections(shown, split.payments, me).map(({ kind, rows: part, amount }) => (
          <View key={kind}>
            <View style={styles.heading}>
              <SectionHead label={say.section[kind]} detail={(kind === "owed" ? say.section.left : say.section.in)(money(amount, split.currency))} rule={false} />
            </View>
            <View role="list" aria-label={say.section[kind]}>
              {part.map(({ id, name, share, state, words }) => {
                const on = id === picked.id;
                return (
                  <View key={id} role="listitem" {...{ dataSet: { state } }}>
                    <PressTarget name={`${name}${id === me ? `, ${say.you}` : ""}, ${words}, ${money(share, split.currency)}`} toggled={on} outsideScroll={!sheet} onPress={() => setTapped(id)} style={() => null}>
                      {(pressed) => {
                        const ink = on || pressed ? c.ink : c.muted;
                        return (
                          <View style={[styles.row, { borderTopColor: c.hairline }]}>
                            <View style={styles.body}>
                              <View style={styles.who}>
                                <View style={[styles.dot, { backgroundColor: on ? c.ink : c.dot }, !reduce && fade]} />
                                <Text numberOfLines={1} style={[type.body, styles.name, { color: ink }, !reduce && fade]}>
                                  {name}
                                  {id === me ? <Text style={[type.caption, { color: c.muted }]}>{`\u2002${say.you}`}</Text> : null}
                                </Text>
                              </View>
                              <Text style={[type.caption, styles.sub, { color: state === "short" || state === "over" ? c.warn : c.muted }]}>{state === "settled" ? say.paid : words}</Text>
                            </View>
                            <Text style={[type.body, styles.amount, { color: ink }, !reduce && fade]}>{money(share, split.currency)}</Text>
                          </View>
                        );
                      }}
                    </PressTarget>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        {quiet.length > 0 ? (
          <Text testID="owes-nothing" style={[type.caption, styles.quiet, { color: c.muted, borderTopColor: c.hairline }]}>
            {say.ring.owesNothing(quiet.map(({ name }) => firstName(name)))}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The ring's center for one person: their part of the Total. Everyone's ring reads this way, the Host's included. */
function Part({ amount, words, total }: { amount: number; words: string; total: number }) {
  const currency = useCurrency();
  const c = useColors();
  return (
    <>
      <Text testID="ring-amount" style={[type.hero, styles.tabular, { color: c.ink }]}>{money(amount, currency)}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
        {words}
      </Text>
      <Text numberOfLines={1} style={[type.caption, styles.tabular, styles.caption, { color: c.muted }]}>
        {say.ring.of(money(total, currency))}
      </Text>
    </>
  );
}

/** The ring's center once everyone has paid: a green tick over "All paid". It rises in `wait` ms after it mounts, so it lands after the ring's checks; null shows it at once. */
function AllPaid({ wait, caption }: { wait: number | null; caption: string }) {
  const c = useColors();
  const [delay] = useState(wait);
  return (
    <View testID="all-paid" style={[styles.face, delay !== null && webAnimation({ ...allPaidIn, animationDelay: `${delay}ms` })]}>
      <Icon name="check" size={22} color={c.good} />
      <Text style={[type.hero, { color: c.ink }]}>{say.ring.allPaidTitle}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.tabular, styles.caption, { color: c.muted }]}>
        {caption}
      </Text>
    </View>
  );
}

/**
 * When the last payment lands live, your part lifts away as the last check pops in, and All paid eases in as the check settles, so the two overlap rather than
 * leaving the center empty.
 */
const allPaidAfterCheck = Math.round(ringMotion.checkIn * 0.6);
const partOut = webAnimation({
  animationKeyframes: [{ from: { opacity: 1, transform: "none" }, to: { opacity: 0, transform: "translateY(-6px) scale(0.98)" } }],
  animationDuration: "240ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "forwards",
});
const allPaidIn = {
  animationKeyframes: [{ from: { opacity: 0, transform: "translateY(8px) scale(0.96)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: "520ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
};

// The sheet's grab handle and bottom padding, which the content has to leave room for.
const sheetChrome = 29 + 30;
const rowEdge = 20;
const minList = 112;
const contain = webStyle({ overscrollBehavior: "contain" });
const fade = webStyle({ transitionProperty: "color, background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: motion.easeOut });
/** The total arrives after the first arcs have started drawing (they start 200 ms in, once the sheet has arrived), once, and does not replay when another person is picked. */
const centerIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: "280ms",
  animationDelay: "460ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

const styles = StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  intro: { gap: 2 },
  caption: { textAlign: "center" },
  ring: { alignSelf: "center", width: ring.size, height: ring.size, marginVertical: 8 },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  face: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  sheet: { gap: layout.pairGap },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: 1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flexShrink: 1 },
  sub: { paddingLeft: 22 },
  // The first row's own top rule sits under the heading.
  heading: { paddingTop: 22, paddingBottom: 12 },
  quiet: { paddingVertical: 14, borderTopWidth: 1 },
  amount: { fontVariant: ["tabular-nums"], textAlign: "right" },
});
