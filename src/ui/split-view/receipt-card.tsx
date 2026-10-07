import { useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Shares } from "../../core/shares";
import { claimersOf } from "../../core/operations";
import type { Adjustment, AdjustmentId, ItemId, Participant, ParticipantId, Split, SplitItem } from "../../core/split";
import { groupedAmount, money } from "../../draft";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { Dot } from "./dot";
import { claimersOfItem, keepInPlace, lineTag, nameParts, quantityText, receiptRows, totalNote, claimedItems, type BundleRow, type Kept } from "./model";

type Props = {
  split: Split;
  shares: Shares;
  selected: Participant | null;
  me: ParticipantId | null;
  onCircle: (item: SplitItem) => void;
  onOpen: (item: SplitItem, press: Press) => void;
  onAdd: (press: Press) => void;
  onOpenAdjustment: (row: Adjustment, press: Press) => void;
  onAddAdjustment: (press: Press) => void;
  /** The line whose detail is open, or an add form, so its trigger reads as expanded. */
  showing: ItemId | AdjustmentId | "add" | "addAdjustment" | null;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
const dotSize = 16;
const tapSize = 44;
const tapBleed = 13;
const circleColumn = tapSize - tapBleed;
const columnGap = 3;
const nameStart = circleColumn + columnGap;
const priceGap = 10;
const dotCenter = dotSize / 2;
const bleed = 12;
const adjustmentsGap = 8;
const chevronSize = 16;
const chevronTip = chevronSize / 8;

export function ReceiptCard({ split, shares, selected, me, onCircle, onOpen, onAdd, onOpenAdjustment, onAddAdjustment, showing }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [opened, setOpened] = useState<ReadonlySet<AdjustmentId>>(new Set());
  const { items, adjustments, subtotal, total } = split.receipt;
  const { rows, charges } = useMemo(() => receiptRows(split.receipt), [split.receipt]);
  const [entering, settle] = useEntering([...items, ...adjustments].map(({ id }) => id));
  const started = items.some((item) => claimersOfItem(item).length > 0);
  const note = totalNote(split.receipt);
  const order = split.participants.map(({ id }) => id);
  const person = (id: ParticipantId) => split.participants.find((one) => one.id === id) ?? { id, name: "" };
  const people = (item: SplitItem) => claimersOfItem(item).map(person);
  const openAdjustment = (id: AdjustmentId, press: Press) => {
    const row = split.receipt.adjustments.find((adjustment) => adjustment.id === id);
    if (row) onOpenAdjustment(row, press);
  };
  const toggle = (id: AdjustmentId) => {
    settle();
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const line = (item: SplitItem, divided: boolean, inBundle: boolean) => (
    <Line
      item={item}
      order={order}
      claimers={claimersOf(item.split).map(person)}
      selected={selected}
      divided={divided}
      inBundle={inBundle}
      onCircle={() => onCircle(item)}
      onOpen={(press) => onOpen(item, press)}
      expanded={showing === item.id}
    />
  );

  return (
    <View testID="receipt" style={[styles.card, { backgroundColor: c.paper, boxShadow: c.cardLift }]}>
      {selected ? (
        <Text style={[type.caption, styles.hint, { color: c.muted }]}>{selected.id === me ? say.checkYours : say.checkTheirs(selected.name)}</Text>
      ) : null}
      <View aria-hidden style={styles.columns}>
        <Text style={[type.caption, styles.name, { color: c.muted }]}>{say.itemColumn}</Text>
        <Text style={[type.caption, { color: c.muted }]}>{say.priceColumn}</Text>
      </View>
      <View role="list" aria-label={say.item}>
        <KeptRows rows={rows} entering={entering}>
          {(row, divided) => {
            if (row.kind === "item") return line(row.item, divided, false);
            const { bundle } = row;
            return (
              <BundleGroup
                bundle={bundle}
                open={opened.has(bundle.id)}
                claimed={claimedItems(bundle, shares.unclaimed.itemIds)}
                claimers={[...new Map(bundle.items.flatMap(people).map((person) => [person.id, person])).values()]}
                selected={selected}
                divided={divided}
                onToggle={() => toggle(bundle.id)}
              >
                <KeptRows rows={bundle.items} entering={entering}>
                  {(item, divided) => line(item, divided, true)}
                </KeptRows>
                <PressTarget
                  name={say.openAdjustment(bundle.discount.label, money(bundle.discount.amount))}
                  popup="dialog"
                  expanded={showing === bundle.id}
                  onPress={(press) => openAdjustment(bundle.id, press)}
                  style={(pressed) => [styles.discount, { borderTopColor: c.hairline }, pressStyle(pressed, reduce)]}
                >
                  {() => (
                    <>
                      <Text numberOfLines={1} style={[type.secondary, styles.name, { color: c.muted }]}>
                        {bundle.discount.label}
                      </Text>
                      <Text style={[type.secondary, tabular, { color: c.muted }]}>{groupedAmount(bundle.discount.amount)}</Text>
                    </>
                  )}
                </PressTarget>
              </BundleGroup>
            );
          }}
        </KeptRows>
      </View>
      <AddRow divided={rows.length > 0} expanded={showing === "add"} onPress={onAdd} />
      {note ? (
        <Text role="status" style={[type.caption, styles.why, { color: c.muted }]}>
          {note}
        </Text>
      ) : null}
      <View style={[styles.adjustments, { borderTopColor: c.hairline }]}>
        <Row label={say.subtotal} amount={subtotal} />
        <KeptRows rows={charges} entering={entering}>
          {(row) => (
            <PressTarget
              name={say.openAdjustment(row.name, money(row.amount))}
              popup="dialog"
              expanded={showing === row.id}
              onPress={(press) => onOpenAdjustment(row, press)}
              style={(pressed) => [styles.row, styles.tapRow, pressStyle(pressed, reduce)]}
            >
              {() => <RowFace label={row.name} amount={row.amount} />}
            </PressTarget>
          )}
        </KeptRows>
        <PressTarget
          name={say.addAdjustment}
          popup="dialog"
          expanded={showing === "addAdjustment"}
          onPress={onAddAdjustment}
          style={(pressed) => [styles.row, styles.tapRow, styles.addCharge, pressStyle(pressed, reduce)]}
        >
          {() => (
            <>
              <Icon name="plus" size={14} color={c.muted} />
              <Text style={[type.secondary, { color: c.muted }]}>{say.addAdjustment}</Text>
            </>
          )}
        </PressTarget>
      </View>
      <View style={[styles.total, { borderTopColor: c.hairline }]}>
        <Text style={[type.button, { color: c.ink }]}>{say.total}</Text>
        <Text testID="total" style={[type.total, tabular, { color: c.ink }]}>
          {money(total)}
        </Text>
      </View>
      {started ? (
        <View style={styles.unclaimed}>
          <Text testID="unclaimed-count" numberOfLines={1} style={[type.secondary, tabular, styles.rowLabel, { color: c.muted }]}>
            {say.unclaimedTotal(shares.unclaimed.itemIds.length)}
          </Text>
          <Text testID="unclaimed" style={[type.secondary, tabular, styles.strong, { color: c.ink }]}>
            {money(shares.unclaimed.total)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type BundleProps = {
  bundle: BundleRow;
  open: boolean;
  claimed: number;
  claimers: readonly Participant[];
  selected: Participant | null;
  divided: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function inside(claimers: readonly Participant[], claimed: number): string {
  const had = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : "";
  return [had, claimed > 0 ? say.claimedItems(claimed) : ""].filter(Boolean).join(", ");
}

function BundleGroup({ bundle, open, claimed, claimers, selected, divided, onToggle, children }: BundleProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const region = useId();
  const showInside = !open && claimers.length > 0;
  // The line grows in when a claim brings it and collapses out when a claim removes it, so the rows under it glide; opening or closing the Bundle already moves them.
  const [was, setWas] = useState({ open, showInside });
  const [byClaim, setByClaim] = useState(false);
  if (was.open !== open || was.showInside !== showInside) {
    setWas({ open, showInside });
    setByClaim(was.open === open);
  }
  return (
    <View role="listitem" testID={`bundle-${bundle.id}`} style={divided && [styles.divided, { borderTopColor: c.hairline }]}>
      <PressTarget
        name={say.bundleLabel(bundle.name, bundle.summary, inside(claimers, claimed), open)}
        expanded={open}
        controls={region}
        onPress={onToggle}
        style={(pressed) => [styles.header, pressStyle(pressed, reduce)]}
      >
        {() => (
          <>
            <View style={[styles.chevron, { transform: [{ translateX: open ? 0 : -chevronTip }, { rotate: open ? "0deg" : "-90deg" }] }, !reduce && turn]}>
              <Icon name="chevron" size={chevronSize} color={c.muted} />
            </View>
            <View style={styles.headerLead}>
              <View style={styles.name}>
                <Text numberOfLines={1} style={[type.item, styles.strong, { color: c.ink }]}>
                  {bundle.name}
                </Text>
                <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                  {bundle.summary}
                </Text>
                <Presence present={showInside} animate={byClaim}>
                  <View style={styles.inside}>
                    <DotStack people={claimers} selected={selected} />
                    {claimed > 0 ? <Text style={[type.caption, tabular, { color: c.muted }]}>{say.claimedItems(claimed)}</Text> : null}
                  </View>
                </Presence>
              </View>
            </View>
            <Text style={[type.item, tabular, { color: c.ink }]}>{groupedAmount(bundle.net)}</Text>
          </>
        )}
      </PressTarget>
      <Collapse open={open} id={region} label={bundle.name}>
        <View aria-hidden style={[styles.rule, { backgroundColor: c.hairline }]} />
        {children}
      </Collapse>
    </View>
  );
}

const collapseFor = 250;

// A grid-template-rows transition from 0fr to 1fr reaches the content's own height with no measuring and no script per frame, and a second tap mid-flight retargets from where it is.
function Collapse({ open, id, label, children }: { open: boolean; id: string; label: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(open);
  const outer = useRef<View>(null);
  const first = useRef(true);
  if (open && !shown) setShown(true);

  useLayoutEffect(() => {
    const box = outer.current as unknown as HTMLElement | null;
    if (!box) return;
    if (first.current) {
      first.current = false;
      Object.assign(box.style, { display: "grid", gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? "" : "0" });
      return;
    }
    const ms = reduce ? motion.reducedFade : collapseFor;
    const ease = `${ms}ms ${motion.easeOut}`;
    box.style.transition = reduce ? `opacity ${ease}` : `grid-template-rows ${ease}, opacity ${ease}`;
    if (open && reduce) box.style.gridTemplateRows = "1fr";
    // Rows mounted in this commit take the closed state first, so the first painted frame is still closed.
    box.getBoundingClientRect();
    box.style.opacity = open ? "1" : "0";
    if (!reduce) box.style.gridTemplateRows = open ? "1fr" : "0fr";
    const done = setTimeout(() => {
      if (open) return void (box.style.opacity = "");
      box.style.gridTemplateRows = "0fr";
      setShown(false);
    }, ms);
    return () => clearTimeout(done);
  }, [open, reduce]);

  return (
    <View ref={outer} nativeID={id} style={styles.collapse}>
      {shown ? (
        <View role="list" aria-label={label} style={styles.collapsed}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Item ids the last receipt change added, such as the rows of a Split. A row reads it only when it mounts, and a Bundle that opens later mounts its rows as they are. */
function useEntering<Id extends string>(ids: readonly Id[]): readonly [ReadonlySet<Id>, () => void] {
  const key = ids.join(" ");
  const [seen, setSeen] = useState(() => ({ key, ids: new Set(ids) }));
  const [entering, setEntering] = useState<ReadonlySet<Id>>(() => new Set());
  if (seen.key !== key) {
    setSeen({ key, ids: new Set(ids) });
    setEntering(new Set(ids.filter((id) => !seen.ids.has(id))));
  }
  return [entering, () => setEntering(new Set())];
}

// The height starts at 0 in a layout effect, so no painted frame shows the new row at full height.
function Grow({ enter, children }: { enter: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<View>(null);
  const [mount] = useState({ enter, reduce });
  useLayoutEffect(() => {
    const el = box.current as unknown as HTMLElement | null;
    if (!mount.enter || typeof el?.animate !== "function") return;
    const height = `${el.getBoundingClientRect().height}px`;
    const frames = mount.reduce
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { height: "0px", opacity: 0, overflow: "hidden" },
          { height, opacity: 1, overflow: "hidden" },
        ];
    const opening = el.animate(frames, { duration: mount.reduce ? motion.reducedFade : motion.rowsIn, easing: motion.easeOut });
    // Held at its first frame until the frame that paints the row, so a slow commit cannot eat its start.
    opening.pause();
    const frame = requestAnimationFrame(() => opening.play());
    return () => {
      cancelAnimationFrame(frame);
      opening.cancel();
    };
  }, [mount]);
  return <View ref={box}>{children}</View>;
}

// Children grow in when they mount present with animate set, and collapse out over rowsOut when present turns false with animate set, so the rows under them glide. With animate unset they arrive and leave at once.
function Presence({ present, animate, children }: { present: boolean; animate: boolean; children: ReactNode }) {
  const [last, setLast] = useState(children);
  const [seen, setSeen] = useState(present);
  const [leaving, setLeaving] = useState(false);
  if (present && children !== last) setLast(children);
  if (seen !== present) {
    setSeen(present);
    setLeaving(!present && animate);
  } else if (leaving && !animate) setLeaving(false);
  if (present) return <Grow enter={animate}>{children}</Grow>;
  return leaving ? <Shrink onDone={() => setLeaving(false)}>{last}</Shrink> : null;
}

/** Each row in place. A row the list drops keeps showing what it last showed and collapses out where it stood, and a row the list adds grows in. A row is divided from the one above when a row still on the receipt sits above it. */
function KeptRows<Row extends { readonly id: string }>({ rows, entering, children }: { rows: readonly Row[]; entering: ReadonlySet<string>; children: (row: Row, divided: boolean) => ReactNode }) {
  const [last, setLast] = useState(rows);
  const [kept, setKept] = useState<readonly Kept<Row>[]>(() => rows.map((row) => ({ row, gone: false })));
  if (rows.length !== last.length || rows.some((row, at) => row !== last[at])) {
    setLast(rows);
    setKept(keepInPlace(kept, rows));
  }
  const forget = (id: string) => setKept((was) => was.filter(({ row, gone }) => !(gone && row.id === id)));
  return kept.map(({ row, gone }, at) => {
    const divided = kept.slice(0, at).some((above) => !above.gone);
    return gone ? (
      <Shrink key={row.id} onDone={() => forget(row.id)}>
        {children(row, divided)}
      </Shrink>
    ) : (
      <Grow key={row.id} enter={entering.has(row.id)}>
        {children(row, divided)}
      </Grow>
    );
  });
}

/** Collapses its children out over rowsOut, or fades them under reduced motion, so the rows under them glide up; then onDone. They are out of reach of taps, Tab and screen readers from the first frame. */
function Shrink({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<View>(null);
  const done = useEffectEvent(onDone);
  useLayoutEffect(() => {
    const el = box.current as unknown as HTMLElement | null;
    if (typeof el?.animate !== "function") return done();
    el.inert = true;
    const height = `${el.getBoundingClientRect().height}px`;
    const frames = reduce
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { height, opacity: 1, overflow: "hidden" },
          { height: "0px", opacity: 0, overflow: "hidden" },
        ];
    const going = el.animate(frames, { duration: reduce ? motion.reducedFade : motion.rowsOut, easing: motion.easeOut, fill: "forwards" });
    going.onfinish = () => done();
    return () => going.cancel();
  }, [reduce]);
  return (
    <View ref={box} aria-hidden pointerEvents="none">
      {children}
    </View>
  );
}

function DotStack({ people, selected }: { people: readonly Participant[]; selected: Participant | null }) {
  const c = useColors();
  return (
    <View style={styles.dots}>
      {people.map((person, index) => (
        <View key={person.id} style={index > 0 && styles.overlap}>
          <Dot name={person.name} size={dotSize} tone={person.id === selected?.id ? "me" : "dot"} ring={`0 0 0 2px ${c.paper}`} />
        </View>
      ))}
    </View>
  );
}

type LineProps = {
  item: SplitItem;
  order: readonly ParticipantId[];
  claimers: readonly Participant[];
  selected: Participant | null;
  divided: boolean;
  inBundle: boolean;
  onCircle: () => void;
  onOpen: (press: Press) => void;
  expanded: boolean;
};

function Line({ item, order, claimers, selected, divided, inBundle, onCircle, onOpen, expanded }: LineProps) {
  const cost = item.price;
  const c = useColors();
  const reduce = useReducedMotion();
  const tag = lineTag(item, order);
  const mine = selected !== null && claimers.some(({ id }) => id === selected.id);
  const ordered = [...claimers].sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id));
  const price = groupedAmount(cost);
  const [title, detail] = nameParts(item);
  const count = quantityText(item);
  const label = count ? `${count} ${item.name}` : item.name;
  const who = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : say.unclaimedLine;
  return (
    <View
      role="listitem"
      testID={`line-${item.id}`}
      style={[
        styles.line,
        divided && [styles.divided, { borderTopColor: c.hairline }],
        inBundle && { marginLeft: nameStart },
      ]}
    >
      <PressTarget
        name={selected ? say.claimFor(label, selected.name) : say.whoHad(label)}
        toggled={selected ? mine : undefined}
        onPress={onCircle}
        style={(pressed) => [styles.circle, pressStyle(pressed, reduce)]}
      >
        {() => (
          ordered.length === 0 ? (
            <View style={[styles.empty, { boxShadow: `inset 0 0 0 1.5px ${c.muted}`, opacity: 0.6 }]} />
          ) : (
            <DotStack people={ordered} selected={selected} />
          )
        )}
      </PressTarget>
      <PressTarget name={`${say.open(label)}, $${price}, ${who}`} popup="dialog" expanded={expanded} onPress={onOpen} style={() => styles.body}>
        {() => (
          <View style={styles.bodyRow}>
            <View style={styles.name}>
              <Text numberOfLines={2} style={[type.item, { color: c.ink }]}>
                {count ? <Text style={[type.caption, tabular, { color: c.muted }]}>{`${count}  `}</Text> : null}
                {title}
                {tag ? <Text style={[type.caption, { color: c.muted }]}>{`  ${tag}`}</Text> : null}
              </Text>
              {detail ? (
                <Text numberOfLines={2} style={[type.caption, { color: c.muted }]}>
                  {detail}
                </Text>
              ) : null}
            </View>
            <Text style={[type.item, tabular, { color: c.ink }]}>{price}</Text>
          </View>
        )}
      </PressTarget>
    </View>
  );
}

function AddRow({ divided, expanded, onPress }: { divided: boolean; expanded: boolean; onPress: (press: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={say.addItem} popup="dialog" expanded={expanded} onPress={onPress} style={(pressed) => [styles.line, styles.add, divided && [styles.divided, { borderTopColor: c.hairline }], pressStyle(pressed, reduce)]}>
      {() => (
        <>
          <View style={styles.addIcon}>
            <Icon name="plus" size={dotSize} color={c.muted} />
          </View>
          <Text style={[type.item, { color: c.muted }]}>{say.addItem}</Text>
        </>
      )}
    </PressTarget>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.row}>
      <RowFace label={label} amount={amount} />
    </View>
  );
}

function RowFace({ label, amount }: { label: string; amount: number }) {
  const c = useColors();
  return (
    <>
      <Text numberOfLines={1} style={[type.secondary, styles.rowLabel, { color: c.muted }]}>
        {label}
      </Text>
      <Text style={[type.secondary, tabular, styles.strong, { color: c.ink }]}>{money(amount)}</Text>
    </>
  );
}

const turn = webStyle({ transitionProperty: "transform", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  card: { paddingTop: 18, paddingLeft: 16, paddingRight: 17, paddingBottom: 20, borderRadius: layout.cardRadius },
  hint: { marginTop: 0, marginBottom: 6 },
  columns: { flexDirection: "row", alignItems: "center", gap: priceGap, paddingLeft: nameStart, minHeight: 24 },
  line: { flexDirection: "row", alignItems: "center", minHeight: layout.row, gap: columnGap },
  divided: { borderTopWidth: 1 },
  circle: { minWidth: tapSize, height: tapSize, marginLeft: -tapBleed, paddingLeft: tapBleed, justifyContent: "center" },
  dots: { flexDirection: "row", alignItems: "center" },
  overlap: { marginLeft: -6 },
  empty: { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
  body: { flex: 1, minWidth: 0, minHeight: layout.row, paddingVertical: 8, justifyContent: "center" },
  bodyRow: { flexDirection: "row", alignItems: "center", gap: priceGap },
  name: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: priceGap, minHeight: 60, paddingVertical: 8 },
  headerLead: { flex: 1, minWidth: 0, flexDirection: "row" },
  inside: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  chevron: { width: dotSize, height: dotSize, marginRight: nameStart - dotSize - priceGap, alignItems: "center", justifyContent: "center" },
  collapse: { overflow: "hidden", marginHorizontal: -bleed, paddingHorizontal: bleed },
  collapsed: { minHeight: 0 },
  rule: { position: "absolute", top: 0, bottom: 12, left: dotCenter, width: 1 },
  discount: { flexDirection: "row", alignItems: "center", gap: priceGap, minHeight: 44, borderTopWidth: 1, marginLeft: nameStart, paddingLeft: nameStart },
  // A full row that overlaps the gap above the Subtotal hairline, so "Add item" sits halfway between the two hairlines, as each Item does.
  add: { marginBottom: -adjustmentsGap },
  addIcon: { width: circleColumn, alignItems: "flex-start" },
  why: { marginTop: 8, marginBottom: 2 },
  adjustments: { marginTop: adjustmentsGap, paddingTop: 8, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.adjustmentRow, gap: 12 },
  // A 44 px tap target that still sits on the 34 px row pitch; the overlap goes to the later row.
  tapRow: { minHeight: tapSize, marginVertical: (layout.adjustmentRow - tapSize) / 2 },
  addCharge: { justifyContent: "flex-start", gap: 6 },
  rowLabel: { flexShrink: 1 },
  strong: { fontWeight: "500" },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 14, borderTopWidth: 1 },
  unclaimed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
});
