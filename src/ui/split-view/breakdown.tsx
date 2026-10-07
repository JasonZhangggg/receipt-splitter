import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { shareBreakdown } from "../../core/shares";
import type { Participant, ParticipantId, Split } from "../../core/split";
import { groupedAmount, money } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { glide, reducedFade } from "../components/sheet-motion";
import { Swap } from "../components/swap";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { differenceNote, payState } from "../pay/model";
import { PayBlock } from "../pay/pay-block";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import type { FoldTrack } from "./bottom-sheet";
import { breakdownCharges, breakdownLines } from "./model";

/** Folded, the phone's sheet shows only the share row under the chips. */
export const foldedRow = layout.row;

type Fold = { open: boolean; track: FoldTrack; onToggle: () => void };

type Props = {
  split: Split;
  person: Participant;
  viewer: ParticipantId | null;
  onPaid: (paid: boolean) => void;
  /** Room between the Breakdown and its surface's edge. The Item list scrolls out into it, so its scroll bar sits clear of the prices. */
  edge: number;
  /** On the phone the Breakdown folds into the bar: the share row moves up under the chips and the rest fades out, in step with the sheet. */
  fold?: Fold;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
// The share row sits this far under the last line above it when open.
const rowGap = 10;
// From the share amount's baseline box to the pay buttons.
const payGap = 20;
const amountSlack = (foldedRow - type.total.lineHeight) / 2;

export function Breakdown({ split, person, viewer, onPaid, edge, fold }: Props) {
  const c = useColors();
  const breakdown = shareBreakdown(split, person.id);
  const { items, difference, share } = breakdown;
  const adjustments = breakdownCharges(split.receipt, breakdown);
  const [host] = split.participants;
  const isHost = person.id === host.id;
  const mine = person.id === viewer;
  const state = payState(share, split.payments.find(({ participantId }) => participantId === person.id)?.amount ?? null);
  const paid = state.kind === "settled" || state.kind === "over" || state.kind === "short";
  // Your own row always says Your share, so the amount never swaps its words mid-glide. The Paid pill above the list shows the paid state.
  const label = mine
    ? say.yourShare
    : isHost || state.kind === "over" || state.kind === "short"
      ? say.shareOf(person.name)
      : state.kind === "settled"
        ? say.paidBy(person.name)
        : say.owes(person.name);
  const note = differenceNote(state, mine ? "payer" : viewer === host.id ? "host" : "other", person.name, host.name);
  const charges = [...adjustments, ...(difference === 0 ? [] : [{ id: "difference", name: say.receiptDifference, portion: difference }])];

  const above = (
    <>
      <View style={styles.head}>
        <Text style={[type.caption, { color: c.muted }]}>{say.items(items.length)}</Text>
        {isHost ? null : paid ? (
          <View style={[styles.status, { backgroundColor: c.action }]}>
            <Icon name="check" size={15} color={c.onAction} />
            <Text style={[type.caption, styles.strong, { color: c.onAction }]}>{say.paid}</Text>
          </View>
        ) : mine ? null : (
          <View style={[styles.status, { backgroundColor: c.sheetIn }]}>
            <Icon name="clock" size={15} color={c.ink} />
            <Text style={[type.caption, styles.strong, { color: c.ink }]}>{say.notPaid}</Text>
          </View>
        )}
      </View>
      <ItemList lines={breakdownLines(breakdown)} empty={say.nothingChecked(mine ? null : person.name)} edge={edge} holdsDrag={fold !== undefined}>
        {charges.length > 0 ? (
          <View style={styles.tail}>
            <View style={[styles.adjustments, { borderTopColor: c.hairline }]}>
              {charges.map((row) => (
                <View key={row.id} style={styles.row}>
                  <Text numberOfLines={1} style={[type.secondary, styles.rowLabel, { color: c.muted }]}>
                    {row.name}
                  </Text>
                  <Text style={[type.secondary, tabular, styles.strong, { color: c.ink }]}>{money(row.portion)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ItemList>
    </>
  );
  const below = (
    <>
      {note ? (
        <Text testID="difference" style={[type.secondary, fold ? styles.foldedNote : styles.note, { color: c.muted }]}>
          {note}
        </Text>
      ) : null}
      {mine && !isHost ? (
        <View style={{ marginTop: fold && !note ? payGap - amountSlack : payGap }}>
          <PayBlock split={split.id} host={host.name} handles={split.paymentHandles} state={state} onPaid={onPaid} />
        </View>
      ) : null}
    </>
  );

  const folded = mine ? say.yourShare : say.shareOf(person.name);
  if (fold) return <Folding fold={fold} person={person.id} whose={mine ? null : person.name} label={fold.open ? label : folded} share={share} above={above} below={below} />;
  return (
    <View testID="breakdown" style={styles.shrink}>
      {above}
      <View style={[styles.total, { borderTopColor: c.hairline }]}>
        <Text style={[type.button, { color: c.ink }]}>{label}</Text>
        <Text testID="share" style={[type.total, tabular, { color: c.ink }]}>
          {money(share)}
        </Text>
      </View>
      {below}
    </View>
  );
}

type FoldingProps = { fold: Fold; person: ParticipantId; whose: string | null; label: string; share: number; above: ReactNode; below: ReactNode };

/**
 * The share row is one element in both states. Folded it sits under the chips; open it sits under the list. It moves down the sheet while the sheet rises, so on screen it travels a short way into place,
 * and a cover under it hides the list until the row has passed. The list and the rule fade with the same progress and the pay block over its last tenth, so a drag can stop or turn back at any frame.
 */
function Folding({ fold, person, whose, label, share, above, below }: FoldingProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const { open, track, onToggle } = fold;
  const [listHeight, setListHeight] = useState(0);
  const parts = useRef<View>(null);
  const top = useRef<View>(null);
  const rest = useRef<View>(null);
  const mover = useRef<View>(null);
  const rule = useRef<View>(null);
  const chevron = useRef<View>(null);
  const travel = listHeight + rowGap;

  const apply = useEffectEvent((progress: number, ms: number, span: number) => {
    const el = (ref: RefObject<View | null>) => ref.current as unknown as HTMLElement | null;
    const timed = (property: string) => (ms > 0 ? `${property} ${ms}ms ${glide.easing}` : "none");
    const move = reduce ? "none" : timed("transform");
    const fade = reduce ? `opacity ${reducedFade}ms ${motion.easeOut}` : timed("opacity");
    const set = (node: HTMLElement | null, transition: string, property: "transform" | "opacity", value: string) => {
      if (!node) return;
      node.style.transition = transition;
      node.style[property] = value;
    };
    const row = el(mover);
    const from = row && travel > 0 && typeof DOMMatrixReadOnly !== "undefined" ? Math.max(0, Math.min(1, new DOMMatrixReadOnly(getComputedStyle(row).transform).m42 / travel)) : progress;
    set(row, move, "transform", `translateY(${progress * travel}px)`);
    // The arrow points where a release would take the sheet. It turns on the sheet's own glide rather than with the finger, since a short sheet would spin it half a turn in two frames.
    set(el(chevron), reduce ? "none" : `transform ${glide.ms}ms ${glide.easing}`, "transform", `rotate(${progress > 0.5 ? 0 : 180}deg)`);
    for (const ref of [top, rule]) set(el(ref), fade, "opacity", String(progress));
    // The pay block shows only over the last part of the way open, and while it shows it holds still on screen: the sheet's rise is undone by a lift, so the black button never sweeps through the sheet.
    const pay = el(rest);
    if (!pay) return;
    const lift = (at: number) => `translateY(${(Math.max(at, payFrom) - 1) * span}px)`;
    pay.getAnimations?.().forEach((animation) => animation.cancel());
    pay.style.transform = lift(progress);
    set(pay, reduce ? fade : "none", "opacity", String(payShows(progress)));
    if (reduce || ms === 0 || from === progress) return;
    // A keyframe sits where the glide's eased progress crosses payFrom, so the block matches payShows and lift at every frame.
    const crossing = (payFrom - from) / (progress - from);
    const kink = crossing > 0 && crossing < 1 ? [{ offset: crossing, opacity: 0, transform: lift(payFrom) }] : [];
    const frames = [{ offset: 0, opacity: payShows(from), transform: lift(from) }, ...kink, { offset: 1, opacity: payShows(progress), transform: lift(progress) }];
    pay.animate?.(frames, { duration: ms, easing: glide.easing });
  });
  useLayoutEffect(() => track.listen((progress, ms, span) => apply(progress, ms, span)), [track]);
  useLayoutEffect(() => apply(track.progress, 0, track.span), [travel, track]);

  useEffect(() => {
    const node = parts.current as unknown as HTMLElement | null;
    if (node) node.inert = !open;
  }, [open]);

  return (
    <View testID={open ? "breakdown" : undefined} style={styles.shrink}>
      <View ref={parts} aria-hidden={!open} style={styles.shrink}>
        <View ref={top} testID="breakdown-items" onLayout={(event) => setListHeight(event.nativeEvent.layout.height)} style={[styles.shrink, styles.hidden]}>
          <Swap view={person} style={styles.shrink}>
            {above}
          </Swap>
        </View>
        <View style={styles.spacer} />
        <View ref={rest} style={styles.hidden}>
          <Swap view={person}>{below}</Swap>
        </View>
      </View>
      <View pointerEvents="box-none" style={[styles.track, { height: travel + foldedRow + ringRoom }]}>
        <View ref={mover} pointerEvents="box-none">
          {/* The row shrinks while pressed, and a drag that opens or closes the sheet starts as a press, so a background that keeps its size hides the list at the row's sides. */}
          <View style={{ backgroundColor: c.sheet }}>
            <PressTarget name={`${label} ${money(share)}, ${open ? say.hideBreakdown(whose) : say.showBreakdown(whose)}`} expanded={open} outsideScroll onPress={onToggle} style={(pressed) => pressStyle(pressed, reduce)}>
              {() => (
                <View style={[styles.shareRow, { backgroundColor: c.sheet }]}>
                  <Swap view={person} style={styles.grow}>
                    <View style={styles.amounts}>
                      <Text style={[type.button, { color: c.ink }]}>{label}</Text>
                      <Text testID={open ? "share" : "owe"} style={[type.total, tabular, { color: c.ink }]}>
                        {money(share)}
                      </Text>
                    </View>
                  </Swap>
                  <View ref={chevron} testID="share-arrow" style={styles.chevron}>
                    <Icon name="chevron" size={18} color={c.muted} />
                  </View>
                </View>
              )}
            </PressTarget>
          </View>
          <View pointerEvents="none" style={{ height: travel, backgroundColor: c.sheet }} />
          <View ref={rule} style={[styles.rule, styles.hidden, { backgroundColor: c.hairline }]} />
        </View>
      </View>
    </View>
  );
}

/**
 * The Items, then `children` (the share's tax, tip, fees and discounts), scroll as one list. With no Items it holds `empty` in a row's height, so the folding sheet
 * travels as far as with one Item and a flick fades the list no faster than a one-Item list.
 */
function ItemList({ lines, empty, edge, holdsDrag, children }: { lines: ReturnType<typeof breakdownLines>; empty: string; edge: number; holdsDrag: boolean; children: ReactNode }) {
  const c = useColors();
  const box = useRef(0);
  const content = useRef(0);
  const [scrolls, setScrolls] = useState(false);
  const check = () => setScrolls(content.current > box.current + 0.5);
  return (
    <ScrollView
      {...(scrolls ? { dataSet: { sheetScroll: "" } } : {})}
      onLayout={(event) => {
        box.current = event.nativeEvent.layout.height;
        check();
      }}
      onContentSizeChange={(_, height) => {
        content.current = height;
        check();
      }}
      style={[styles.list, { marginRight: -edge }, contain, scrolls && edgeFade, holdsDrag && !scrolls && holdsGesture]}
      contentContainerStyle={{ paddingRight: edge }}
    >
      {lines.length === 0 ? (
        <View style={styles.line}>
          <Text style={[type.secondary, { color: c.muted }]}>{empty}</Text>
        </View>
      ) : null}
      {lines.map((line, index) => (
        <View key={line.id} style={[styles.line, index > 0 && [styles.divided, { borderTopColor: c.hairline }]]}>
          <Text numberOfLines={1} style={[type.item, styles.name, { color: c.ink }]}>
            {line.quantity ? <Text style={[type.caption, tabular, { color: c.muted }]}>{`${line.quantity}  `}</Text> : null}
            {line.name}
            {line.part ? <Text style={[type.caption, { color: c.muted }]}>{`  ${line.part}`}</Text> : null}
          </Text>
          <Text style={[type.item, tabular, { color: c.ink }]}>{groupedAmount(line.portion)}</Text>
        </View>
      ))}
      {children}
    </ScrollView>
  );
}

// The pay block shows over the last tenth of the way open.
const payFrom = 0.9;
const payShows = (progress: number) => Math.max(0, (progress - payFrom) / (1 - payFrom));

// A focused share row draws its ring this far outside itself, so its track leaves room for it.
const ringRoom = 4;
const contain = webStyle({ overscrollBehavior: "contain" });
// A row scrolled part way out fades at the list's ends instead of being cut through its text. At rest the fade covers only a row's padding.
const fadeEdge = 16;
const edgeFade = webStyle({ maskImage: `linear-gradient(transparent, black ${fadeEdge}px, black calc(100% - ${fadeEdge}px), transparent)` });
const holdsGesture = webStyle({ touchAction: "none" });

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  // The folded look before the first progress arrives, so the first frame never shows the open layout.
  hidden: { opacity: 0 },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 26, marginHorizontal: 2, marginBottom: 4 },
  status: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingLeft: 7, paddingRight: 10, borderRadius: 13 },
  strong: { fontWeight: "500" },
  list: { flexGrow: 0, flexShrink: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 },
  divided: { borderTopWidth: 1 },
  name: { flex: 1, minWidth: 0 },
  // The list ends on a short row, so this keeps its text clear of the edge fade once scrolled to the end.
  tail: { paddingBottom: 8 },
  adjustments: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, gap: 12 },
  rowLabel: { flexShrink: 1 },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: rowGap, paddingTop: 14, borderTopWidth: 1 },
  note: { marginTop: 6, marginHorizontal: 2 },
  foldedNote: { marginHorizontal: 2 },
  spacer: { height: rowGap + foldedRow },
  track: { position: "absolute", top: -ringRoom, left: -ringRoom, right: -ringRoom, paddingTop: ringRoom, paddingHorizontal: ringRoom, overflow: "hidden" },
  rule: { position: "absolute", top: 0, left: 0, right: 0, height: 1 },
  shareRow: { flexDirection: "row", alignItems: "center", height: foldedRow, paddingHorizontal: 2 },
  amounts: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  chevron: { marginLeft: 4, transform: [{ rotate: "180deg" }] },
});
