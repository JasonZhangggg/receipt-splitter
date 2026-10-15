import { useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Shares } from "../../core/shares";
import { claimersOf } from "../../core/operations";
import type { Adjustment, AdjustmentId, ItemId, Participant, ParticipantId, Split, SplitItem } from "../../core/split";
import { groupedAmount, money } from "../../draft";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { TextLink } from "../components/text-link";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors } from "../theme";
import { ClaimDot } from "./dot";
import { itemsHad, keepInPlace, lineView, nameParts, quantityText, receiptRows, totalNote, claimedItems, whoLine, type BundleRow, type Kept, type Viewing } from "./model";

type Props = {
  split: Split;
  shares: Shares;
  /** The person whose checks the dots show. */
  selected: Participant | null;
  me: ParticipantId | null;
  onCircle: (item: SplitItem, press: Press) => void;
  onOpen: (item: SplitItem, press: Press) => void;
  onAdd: (press: Press) => void;
  onOpenAdjustment: (row: Adjustment, press: Press) => void;
  /** The line whose detail is open, or an add form, so its trigger reads as expanded. */
  showing: ItemId | AdjustmentId | "add" | null;
};

// The dot's column is 26 px wide: the name starts where the charges and the Total start.
const nameStart = 26;
const columnGap = 14;
const dotTap = 44;
const dotBleed = 14;
const bleed = 12;
const chevronSize = 16;
const chevronTip = chevronSize / 8;
const nameLine = 25.6;
const noteLine = 22.4;
const chargeRow = 34;

export function ReceiptCard({ split, shares, selected, me, onCircle, onOpen, onAdd, onOpenAdjustment, showing }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [opened, setOpened] = useState<ReadonlySet<AdjustmentId>>(new Set());
  const { items, adjustments, subtotal, total } = split.receipt;
  const { rows, charges } = useMemo(() => receiptRows(split.receipt), [split.receipt]);
  const [entering, settle] = useEntering([...items, ...adjustments].map(({ id }) => id));
  const started = items.some(({ split: item }) => claimersOf(item).length > 0);
  const note = totalNote(split.receipt);
  const viewing: Viewing = { people: split.participants, me, viewer: selected?.id ?? null };
  const person = (id: ParticipantId) => split.participants.find((one) => one.id === id) ?? { id, name: "" };
  const people = (item: SplitItem) => claimersOf(item.split).map(person);
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
  const line = (item: SplitItem, inBundle: boolean) => (
    <Line
      item={item}
      viewing={viewing}
      claimers={people(item)}
      selected={selected}
      inBundle={inBundle}
      onCircle={(press) => onCircle(item, press)}
      onOpen={(press) => onOpen(item, press)}
      expanded={showing === item.id}
    />
  );

  return (
    <View testID="receipt">
      <View style={styles.heading}>
        <Text role="heading" aria-level={2} style={[type.body, { color: c.ink }]}>
          {say.itemsHeading}
        </Text>
        {selected ? (
          <Text testID="items-count" style={[type.caption, tabular, { color: c.muted }]}>
            {say.itemsOf(itemsHad(items, selected.id), items.length, selected.id === me ? null : selected.name)}
          </Text>
        ) : null}
      </View>
      <View role="list" aria-label={say.item} style={[styles.list, { borderBottomColor: c.hairline }]}>
        <KeptRows rows={rows} entering={entering}>
          {(row) => {
            if (row.kind === "item") return line(row.item, false);
            const { bundle } = row;
            const claimers = [...new Map(bundle.items.flatMap(people).map((one) => [one.id, one])).values()];
            return (
              <BundleGroup
                bundle={bundle}
                open={opened.has(bundle.id)}
                claimed={claimedItems(bundle, shares.unclaimed.itemIds)}
                claimers={claimers}
                who={whoLine(claimers.map(({ id }) => id), viewing)}
                onToggle={() => toggle(bundle.id)}
              >
                <KeptRows rows={bundle.items} entering={entering}>
                  {(item) => line(item, true)}
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
                      <Text numberOfLines={1} style={[type.body, styles.name, { color: c.muted }]}>
                        {bundle.discount.label}
                      </Text>
                      <Text style={[type.body, tabular, { color: c.muted }]}>{money(bundle.discount.amount)}</Text>
                    </>
                  )}
                </PressTarget>
              </BundleGroup>
            );
          }}
        </KeptRows>
      </View>
      <View style={styles.charges}>
        {note ? (
          <Text role="status" style={[type.caption, styles.why, { color: c.muted }]}>
            {note}
          </Text>
        ) : null}
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
        <TextLink plus name={say.add} label={say.add} popup="dialog" expanded={showing === "add"} onPress={onAdd} />
      </View>
      <View style={[styles.total, { borderTopColor: c.hairline, borderBottomColor: c.hairline }]}>
        <Text style={[type.body, { color: c.ink }]}>{say.total}</Text>
        <Text testID="total" style={[type.body, tabular, { color: c.ink }]}>
          {money(total)}
        </Text>
      </View>
      {started ? (
        <View style={styles.unclaimed}>
          <Text testID="unclaimed-count" numberOfLines={1} style={[styles.chargeText, tabular, styles.rowLabel, { color: c.muted }]}>
            {say.unclaimedTotal(shares.unclaimed.itemIds.length)}
          </Text>
          <Text testID="unclaimed" style={[styles.chargeText, tabular, { color: c.ink }]}>
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
  who: string;
  onToggle: () => void;
  children: ReactNode;
};

function inside(claimers: readonly Participant[], claimed: number): string {
  const had = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : "";
  return [had, claimed > 0 ? say.claimedItems(claimed) : ""].filter(Boolean).join(", ");
}

function BundleGroup({ bundle, open, claimed, claimers, who, onToggle, children }: BundleProps) {
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
    <View role="listitem" testID={`bundle-${bundle.id}`}>
      <PressTarget
        name={say.bundleLabel(bundle.name, bundle.summary, inside(claimers, claimed), open)}
        expanded={open}
        controls={region}
        onPress={onToggle}
        style={(pressed) => [styles.header, { borderTopColor: c.hairline }, pressStyle(pressed, reduce)]}
      >
        {() => (
          <>
            <View style={styles.bundleTop}>
              <View style={[styles.chevron, { transform: [{ translateX: open ? 0 : -chevronTip }, { rotate: open ? "0deg" : "-90deg" }] }, !reduce && turn]}>
                <Icon name="chevron" size={chevronSize} color={c.muted} />
              </View>
              <View style={styles.name}>
                <Text numberOfLines={1} style={[type.body, styles.nameText, { color: c.ink }]}>
                  {bundle.name}
                </Text>
                <Text numberOfLines={1} style={[type.caption, styles.noteText, { color: c.muted }]}>
                  {bundle.summary}
                </Text>
              </View>
              <Text style={[type.body, styles.nameText, tabular, { color: c.ink }]}>{money(bundle.net)}</Text>
            </View>
            <Presence present={showInside} animate={byClaim}>
              <View style={styles.bundleWho}>
                <Text numberOfLines={2} style={[type.caption, styles.noteText, styles.name, { color: c.muted }]}>
                  {who}
                </Text>
                <Text style={[type.caption, tabular, styles.noteText, { color: c.muted }]}>{say.claimedItems(claimed)}</Text>
              </View>
            </Presence>
          </>
        )}
      </PressTarget>
      <Collapse open={open} id={region} label={bundle.name}>
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

/** Each row in place. A row the list drops keeps showing what it last showed and collapses out where it stood, and a row the list adds grows in. */
function KeptRows<Row extends { readonly id: string }>({ rows, entering, children }: { rows: readonly Row[]; entering: ReadonlySet<string>; children: (row: Row) => ReactNode }) {
  const [last, setLast] = useState(rows);
  const [kept, setKept] = useState<readonly Kept<Row>[]>(() => rows.map((row) => ({ row, gone: false })));
  if (rows.length !== last.length || rows.some((row, at) => row !== last[at])) {
    setLast(rows);
    setKept(keepInPlace(kept, rows));
  }
  const forget = (id: string) => setKept((was) => was.filter(({ row, gone }) => !(gone && row.id === id)));
  return kept.map(({ row, gone }) =>
    gone ? (
      <Shrink key={row.id} onDone={() => forget(row.id)}>
        {children(row)}
      </Shrink>
    ) : (
      <Grow key={row.id} enter={entering.has(row.id)}>
        {children(row)}
      </Grow>
    ),
  );
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

type LineProps = {
  item: SplitItem;
  viewing: Viewing;
  claimers: readonly Participant[];
  selected: Participant | null;
  inBundle: boolean;
  onCircle: (press: Press) => void;
  onOpen: (press: Press) => void;
  expanded: boolean;
};

/** A dot that claims the line, and the rest of the row, which opens it. The left column is the name, the detail and who had it; the right is the full price and what it comes to for the viewer or each person. */
function Line({ item, viewing, claimers, selected, inBundle, onCircle, onOpen, expanded }: LineProps) {
  const c = useColors();
  const mine = selected !== null && claimers.some(({ id }) => id === selected.id);
  const price = groupedAmount(item.price);
  const [title, detail] = nameParts(item);
  const count = quantityText(item);
  const label = count ? `${count} ${item.name}` : item.name;
  const had = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : say.unclaimedLine;
  const { who, split } = lineView(item, viewing);
  return (
    <View role="listitem" testID={`line-${item.id}`} style={[styles.line, { borderTopColor: c.hairline }, inBundle && { marginLeft: nameStart }]}>
      <PressTarget
        name={selected ? say.claimFor(label, selected.name) : say.whoHad(label)}
        toggled={selected ? mine : undefined}
        onPress={onCircle}
        style={() => styles.circle}
      >
        {(pressed) => <ClaimDot on={mine} pressed={pressed} />}
      </PressTarget>
      <PressTarget name={`${say.open(label)}, $${price}, ${had}`} popup="dialog" expanded={expanded} onPress={onOpen} style={(pressed) => [styles.body, fade, pressed && styles.held]}>
        {() => (
          <>
            <View style={styles.name}>
              <Text numberOfLines={2} style={[type.body, styles.nameText, { color: c.ink }]}>
                {count ? <Text style={[type.caption, tabular, { color: c.muted }]}>{`${count}  `}</Text> : null}
                {title}
              </Text>
              {detail ? (
                <Text numberOfLines={2} style={[type.caption, styles.noteText, { color: c.muted }]}>
                  {detail}
                </Text>
              ) : null}
              <Text numberOfLines={2} style={[type.caption, styles.noteText, { color: c.muted }]}>
                {who}
              </Text>
            </View>
            <View style={styles.figures}>
              <Text style={[type.body, styles.nameText, tabular, { color: c.ink }]}>{money(item.price)}</Text>
              {split ? (
                <Text numberOfLines={1} style={[type.caption, styles.noteText, tabular, { color: c.muted }]}>
                  {split}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </PressTarget>
    </View>
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
      <Text numberOfLines={1} style={[styles.chargeText, styles.rowLabel, { color: c.muted }]}>
        {label}
      </Text>
      <Text style={[styles.chargeText, tabular, { color: c.muted }]}>{money(amount)}</Text>
    </>
  );
}

const turn = webStyle({ transitionProperty: "transform", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });
const fade = webStyle({ transitionProperty: "opacity", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 32, marginBottom: 12 },
  list: { borderBottomWidth: 1 },
  line: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: 1 },
  // The dot is 12 px; its 44 px hit area bleeds past the gutter and 4 px under the row.
  circle: { width: dotTap, height: 50, marginLeft: -dotBleed, marginRight: -4, paddingLeft: dotBleed, paddingTop: 19 },
  body: { flex: 1, minWidth: 0, flexDirection: "row", columnGap, paddingVertical: 12 },
  held: { opacity: 0.55 },
  name: { flex: 1, minWidth: 0 },
  nameText: { lineHeight: nameLine },
  noteText: { lineHeight: noteLine },
  figures: { flexShrink: 0, alignItems: "flex-end" },
  header: { borderTopWidth: 1, paddingVertical: 12 },
  bundleTop: { flexDirection: "row", alignItems: "flex-start", columnGap },
  bundleWho: { flexDirection: "row", marginLeft: nameStart, columnGap },
  chevron: { width: nameStart - columnGap, height: nameLine, alignItems: "center", justifyContent: "center" },
  collapse: { overflow: "hidden", marginHorizontal: -bleed, paddingHorizontal: bleed },
  collapsed: { minHeight: 0 },
  discount: { flexDirection: "row", alignItems: "center", columnGap, minHeight: 44, marginLeft: nameStart, paddingLeft: nameStart, borderTopWidth: 1 },
  charges: { marginTop: 14, paddingLeft: nameStart },
  why: { marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: chargeRow, gap: 12 },
  // A 44 px tap target that still sits on the row pitch; the overlap goes to the later row.
  tapRow: { minHeight: dotTap, marginVertical: (chargeRow - dotTap) / 2 },
  chargeText: { fontFamily: type.body.fontFamily, fontSize: 15, lineHeight: 24, letterSpacing: -0.1 },
  rowLabel: { flexShrink: 1 },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 12, paddingBottom: 12, paddingLeft: nameStart, borderTopWidth: 1, borderBottomWidth: 1 },
  unclaimed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: nameStart, marginTop: 10 },
});
