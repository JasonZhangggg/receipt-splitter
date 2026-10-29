import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ParticipantId, Split } from "../../core/split";
import { computeShares, shareBreakdown } from "../../core/shares";
import { cents } from "../../core/money";
import { money } from "../../core/currency";
import { useCurrency } from "../currency";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { useLayoutHeight } from "../components/viewport";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { linkPress } from "../components/text-link";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { drawnBy, ring, ringMotion, slices } from "./donut-model";
import { DonutRing } from "./donut-ring";
import { billPaid, foldedRows, itemsLine, paymentStatus } from "./model";
import { peopleOrder } from "../split-view/model";
import { firstName } from "./pay-sheet";
import { SheetHeader } from "../split-view/sheet-header";

type Props = {
  split: Split;
  me: ParticipantId | null;
  onClose: () => void;
  /** In a bottom sheet: the ring stays put and only the people scroll, out to the sheet's edge. */
  sheet?: boolean;
  /** A tap on a person's check, from a phone with a name: record their Share as paid, or clear it. */
  onCheck?: (id: ParticipantId, paid: boolean, from: Press) => void;
};

/**
 * Who has paid, with everyone who still owes something at the top. The ring is everyone's Shares plus anything unclaimed: what has been paid, the Host's own
 * Share first, in black, what is still owed in gray, the unclaimed rest in light gray. A tap on a name breaks their piece out of the ring and shows their part in the middle;
 * a tap anywhere else puts it back. It reads the live Split, so another phone's payment lands here as it happens.
 */
export function PaymentsSheet({ split, me, onClose, sheet = false, onCheck }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const shares = computeShares(split);
  const { rows, summary, paid, owing } = paymentStatus(split, shares, me);
  const insets = useSafeAreaInsets();
  const room = useLayoutHeight() - insets.top - 38 - sheetChrome - insets.bottom;
  const [fixed, setFixed] = useState(0);
  const [tapped, setTapped] = useState<ParticipantId | null>(null);
  // How many times the Host's check has been tapped. Nobody can check the Host off, so each tap shakes their "gets paid" instead.
  const [refused, setRefused] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  // The list's height under All. A narrower filter keeps it, so the sheet does not jump shorter as the tabs change.
  const [allHeight, setAllHeight] = useState(0);
  // Every Item is claimed and everyone who owes something has paid. The moment that happens the ring closes into All paid, even if someone was tapped before.
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
  // Someone removed while picked lets go of the pick.
  const picked = shown.find(({ id }) => id === tapped) ?? null;
  const edge = sheet ? layout.gutter + insets.right : rowEdge;
  const total = split.receipt.total;
  const unclaimed = shares.unclaimed.total;
  const collected = billPaid(rows, split.payments);
  // The Host paid their own Share with the bill, so it counts as paid like a friend's checked one.
  const checked = (id: ParticipantId) => rows.some((row) => row.id === id && (row.isHost || row.state === "settled" || row.state === "over"));
  const arcs = slices({ shares: shares.shares, unclaimed: shares.unclaimed }, checked);
  const ringTotal = collected.owed + unclaimed;
  const label = say.ring.label(
    money(total, split.currency),
    rows.filter(({ share }) => share > 0).map(({ name, share }) => `${name} ${money(share, split.currency)}`),
    unclaimed > 0 ? money(unclaimed, split.currency) : null,
  );
  // Rows keep the People order whatever is checked, so a payment never moves one; the tabs narrow them to who has or has not paid.
  const ordered = peopleOrder(shown, (row) => row, me, rows.find(({ isHost }) => isHost)?.id ?? null);
  const counts: Record<Filter, number> = { all: ordered.length, unpaid: ordered.filter(({ id }) => !checked(id)).length, paid: ordered.filter(({ id }) => checked(id)).length };
  const listed = ordered.filter(({ id }) => filter === "all" || (filter === "paid") === checked(id));
  const leftOver = split.receipt.items.filter(({ id }) => shares.unclaimed.itemIds.includes(id)).map(({ name }) => name);
  // A tap anywhere but a person's row or the ring puts the picked piece back. The ring answers its own taps, gaps and hole included.
  const outer = useRef<View>(null);
  useEffect(() => {
    const element = outer.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !element) return;
    const letGo = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-keeps-pick]")) return;
      setTapped(null);
    };
    element.addEventListener("click", letGo);
    return () => element.removeEventListener("click", letGo);
  }, []);
  const toggle = (id: ParticipantId) => setTapped((now) => (now === id ? null : id));
  return (
    <View ref={outer} style={styles.sheet}>
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
        {ringTotal > 0 ? (
          <View role="img" aria-label={label} style={styles.ring} {...{ dataSet: { keepsPick: "" } }}>
            <DonutRing slices={arcs} paint={(id) => (checked(id) ? c.ink : c.ringOwed)} lifted={picked?.id ?? null} closed={settled && picked === null} rested={c.hairline} onPick={(id) => (id === null ? setTapped(null) : toggle(id))} />
            <View aria-hidden pointerEvents="none" style={[styles.center, !reduce && centerIn]}>
              {picked ? (
                <View key={`part-${picked.id}`} style={[styles.face, !reduce && faceIn]}>
                  <Part amount={picked.share} words={picked.id === me ? say.ring.yourPart : say.ring.partOf(firstName(picked.name))} status={picked.isHost ? say.status.paidTheBill : checked(picked.id) ? say.ring.paid : say.ring.notPaid} />
                </View>
              ) : settled ? (
                <>
                  {opening || reduce ? null : (
                    <View key="leaving" style={[styles.face, partOut]}>
                      <PaidBack paid={collected.paid} of={ringTotal} />
                    </View>
                  )}
                  <AllPaid key="all" wait={reduce ? null : opening ? drawnBy(arcs) : allPaidAfterPay} caption={say.ring.allPaid(money(total, split.currency))} />
                </>
              ) : (
                <View key="back" style={[styles.face, !reduce && tapped === null && faceIn]}>
                  <PaidBack paid={collected.paid} of={ringTotal} />
                </View>
              )}
            </View>
          </View>
        ) : null}
        {rows.length > 0 ? <Tabs filter={filter} counts={counts} onPick={setFilter} /> : null}
      </View>
      <ScrollView
        testID="payments"
        {...(sheet ? { dataSet: { sheetScroll: "" } } : {})}
        style={[{ marginRight: -edge }, contain, sheet && { maxHeight: Math.max(minList, room - fixed - layout.pairGap) }]}
        contentContainerStyle={{ paddingRight: edge, minHeight: filter === "all" ? 0 : allHeight }}
        onContentSizeChange={(_, height) => {
          if (filter === "all") setAllHeight(height);
        }}
      >
        <View role="list" aria-label={say.payments}>
          {listed.map(({ id, name, share, state, words, isHost }) => {
            const on = id === picked?.id;
            const done = checked(id);
            const line = (pressed: boolean) => {
              const ink = picked === null || on || pressed ? c.ink : c.muted;
              return (
                <View style={styles.line}>
                  <View style={styles.body}>
                    <Text numberOfLines={1} style={[type.body, { color: ink }, !reduce && fade]}>
                      {name}
                      {id === me ? <Text style={[type.caption, { color: c.muted }]}>{say.tags([say.you])}</Text> : null}
                      {isHost ? (
                        <Text key={refused} testID="gets-paid" style={[type.caption, styles.shakes, { color: c.muted }, refused > 0 && (reduce ? dimOnce : shake)]}>
                          {say.tags([say.getsPaid])}
                        </Text>
                      ) : null}
                    </Text>
                    <Text testID="row-items" numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                      {itemsLine(shareBreakdown(split, id).items)}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={[type.body, styles.amount, { color: ink }, !reduce && fade]}>{money(share, split.currency)}</Text>
                    <Text style={[type.caption, styles.amount, { color: state === "short" || state === "over" ? c.warn : c.muted }]}>{state === "settled" ? say.paid : words}</Text>
                  </View>
                </View>
              );
            };
            return (
              <View key={id} role="listitem" style={[styles.row, { borderTopColor: c.hairline }]} {...{ dataSet: { state, keepsPick: "" } }}>
                {isHost ? (
                  <Check paid name={name} fixed disabled={false} onPress={() => setRefused((count) => count + 1)} />
                ) : (
                  <Check paid={done} name={name} disabled={me === null || !onCheck} onPress={(from) => onCheck?.(id, !done, from)} />
                )}
                <PressTarget name={`${name}${id === me ? `, ${say.you}` : ""}, ${words}, ${money(share, split.currency)}`} toggled={on} outsideScroll={!sheet} onPress={() => toggle(id)} style={() => styles.press}>
                  {line}
                </PressTarget>
              </View>
            );
          })}
        </View>
        {listed.length === 0 ? <Text style={[type.body, styles.empty, { color: c.muted, borderTopColor: c.hairline }]}>{say.ring.everyonePaid}</Text> : null}
        {unclaimed > 0 && filter === "all" ? (
          <View testID="nobody-yet" style={[styles.row, { borderTopColor: c.hairline }]}>
            <View style={styles.lead}>
              <View style={[styles.circle, styles.dashed, { borderColor: c.ringOwed }]} />
            </View>
            <View style={styles.line}>
              <View style={styles.body}>
                <Text numberOfLines={1} style={[type.body, { color: c.muted }]}>{say.ring.nobodyYet}</Text>
                <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>{leftOver.join(", ")}</Text>
              </View>
              <View style={styles.right}>
                <Text style={[type.body, styles.amount, { color: c.muted }]}>{money(unclaimed, split.currency)}</Text>
                <Text style={[type.caption, styles.amount, { color: c.muted }]}>{say.ring.unclaimedWord}</Text>
              </View>
            </View>
          </View>
        ) : null}
        {quiet.length > 0 && filter === "all" ? (
          <Text testID="owes-nothing" style={[type.caption, styles.quiet, { color: c.muted, borderTopColor: c.hairline }]}>
            {say.ring.owesNothing(quiet.map(({ name }) => firstName(name)))}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

type Filter = keyof typeof say.ring.filters;
const filters = Object.keys(say.ring.filters) as Filter[];

/** All, Not paid and Paid over the list, each with its count: the current one in ink over a short rule, the way the wide layout filters Items. */
function Tabs({ filter, counts, onPick }: { filter: Filter; counts: Record<Filter, number>; onPick: (filter: Filter) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View role="group" aria-label={say.ring.filtersLabel} style={styles.tabs} {...{ dataSet: { keepsPick: "" } }}>
      {filters.map((one) => {
        const on = one === filter;
        return (
          <PressTarget key={one} name={`${say.ring.filters[one]}, ${counts[one]}`} toggled={on} onPress={() => onPick(one)} style={(pressed) => [styles.tab, pressStyle(pressed, reduce, linkPress)]}>
            {(_, hovered) => (
              <View>
                <Text numberOfLines={1} style={[type.body, styles.tabular, !reduce && inkFade, { color: on || hovered ? c.ink : c.muted }]}>
                  {`${say.ring.filters[one]} `}
                  <Text style={{ color: c.muted }}>{counts[one]}</Text>
                </Text>
                <View style={[styles.rule, { backgroundColor: on ? c.ink : "transparent" }]} />
              </View>
            )}
          </PressTarget>
        );
      })}
    </View>
  );
}

/**
 * A person's paid mark: a filled circle with a tick once they have paid, an empty one before. Where this phone may check them off, it is the button that does it.
 * The Host's is `fixed`: always filled, and a tap only answers that it cannot change.
 */
function Check({ paid, name, disabled, fixed = false, onPress }: { paid: boolean; name: string; disabled: boolean; fixed?: boolean; onPress: (from: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const mark = (pressed: boolean) => (
    <View style={[styles.circle, paid ? { backgroundColor: c.ink, borderColor: c.ink } : { borderColor: c.ringOwed }, !reduce && checkFade, pressed && !reduce && styles.pressedCheck]}>
      {paid ? <Icon name="check" size={14} color={c.sheet} /> : null}
    </View>
  );
  if (disabled) return <View style={styles.lead} aria-hidden>{mark(false)}</View>;
  return (
    <PressTarget name={fixed ? say.ring.payerCheck(name) : paid ? say.ring.markUnpaid(name) : say.ring.markPaid(name)} toggled={paid} softDisabled={fixed} onPress={onPress} style={() => styles.lead}>
      {(pressed) => mark(pressed)}
    </PressTarget>
  );
}

/** The ring's center when nobody is picked: what has been paid, the Host's own Share included, out of everyone's Shares plus anything unclaimed. */
function PaidBack({ paid, of }: { paid: number; of: number }) {
  const currency = useCurrency();
  const c = useColors();
  return (
    <>
      <Text testID="ring-amount" style={[type.hero, styles.tabular, { color: c.ink }]}>{money(cents(paid), currency)}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
        {say.ring.paidSoFar}
      </Text>
      <Text numberOfLines={1} style={[type.caption, styles.tabular, styles.caption, { color: c.muted }]}>
        {say.ring.of(money(cents(of), currency))}
      </Text>
    </>
  );
}

/** The ring's center for a picked person: their part, and whether they have paid. */
function Part({ amount, words, status }: { amount: number; words: string; status: string }) {
  const currency = useCurrency();
  const c = useColors();
  return (
    <>
      <Text testID="ring-amount" style={[type.hero, styles.tabular, { color: c.ink }]}>{money(cents(amount), currency)}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
        {words}
      </Text>
      <Text numberOfLines={1} style={[type.caption, styles.caption, { color: c.muted }]}>
        {status}
      </Text>
    </>
  );
}

/** The ring's center once everyone has paid: "All paid" over the Total settled. It rises in `wait` ms after it mounts, so it lands after the ring has drawn; null shows it at once. */
function AllPaid({ wait, caption }: { wait: number | null; caption: string }) {
  const c = useColors();
  const [delay] = useState(wait);
  return (
    <View testID="all-paid" style={[styles.face, delay !== null && webAnimation({ ...allPaidIn, animationDelay: `${delay}ms` })]}>
      <Text style={[type.hero, { color: c.ink }]}>{say.ring.allPaidTitle}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.tabular, styles.caption, { color: c.muted }]}>
        {caption}
      </Text>
    </View>
  );
}

/**
 * When the last payment lands live, your part lifts away as the last arc turns black and slides into the sweep, and All paid eases in as it settles, so the two
 * overlap rather than leaving the center empty.
 */
const allPaidAfterPay = Math.round(ringMotion.settle * 0.6);
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
/** The center for a picked person, or back to what has been paid, crossfades as the piece moves out or back in. */
const faceIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "translateY(4px) scale(0.98)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: `${ringMotion.settle}ms`,
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});
/** A tap on the Host's check shakes "gets paid" side to side, the way a field refuses a wrong entry; under reduced motion it only dims for a beat. */
const shake = webAnimation({
  animationKeyframes: [{ "0%": { transform: "none" }, "20%": { transform: "translateX(-4px)" }, "40%": { transform: "translateX(4px)" }, "60%": { transform: "translateX(-3px)" }, "80%": { transform: "translateX(2px)" }, "100%": { transform: "none" } }],
  animationDuration: "320ms",
  animationTimingFunction: motion.easeInOut,
});
const dimOnce = webAnimation({
  animationKeyframes: [{ "0%": { opacity: 1 }, "50%": { opacity: 0.4 }, "100%": { opacity: 1 } }],
  animationDuration: `${motion.reducedFade * 2}ms`,
  animationTimingFunction: motion.easeOut,
});
const inkFade = webStyle({ transitionProperty: "color", transitionDuration: "150ms", transitionTimingFunction: "ease" });
const checkFade = webStyle({ transitionProperty: "background-color, border-color, transform", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: motion.easeOut });
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
  ring: { alignSelf: "center", width: ring.size, height: ring.size, marginVertical: ring.lift },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  face: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  sheet: { gap: layout.pairGap },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: 1 },
  // The check sits in the middle of its row's two lines, not level with the name.
  lead: { width: 24, height: 24, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dashed: { borderStyle: "dashed" },
  pressedCheck: { transform: [{ scale: 0.88 }] },
  // A transform needs a box, so the shaking tag is its own inline block inside the name's line.
  shakes: webStyle({ display: "inline-block" }),
  press: { flex: 1, minWidth: 0 },
  line: { flex: 1, minWidth: 0, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  quiet: { paddingVertical: 14, borderTopWidth: 1 },
  empty: { paddingVertical: 16, borderTopWidth: 1 },
  tabs: { flexDirection: "row", columnGap: 24, marginBottom: -layout.pairGap },
  tab: { minHeight: 44, justifyContent: "flex-end" },
  rule: { height: 1.5, marginTop: 8 },
  amount: { fontVariant: ["tabular-nums"], textAlign: "right" },
});
