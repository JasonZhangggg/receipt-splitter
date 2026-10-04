import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Shares } from "../../core/shares";
import { claimersOf } from "../../core/operations";
import type { AdjustmentId, Participant, ParticipantId, Split, SplitItem } from "../../core/split";
import { plainAmount } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { animateSpring } from "../components/sheet-motion";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { Dot } from "./dot";
import { claimersOfItem, lineTag, nameParts, receiptRows, totalNote, unclaimedUnits, type BundleRow, type UnitRow } from "./model";

const sheetSpring = { response: 0.35, damping: 1 };

type Props = {
  split: Split;
  shares: Shares;
  selected: Participant | null;
  me: ParticipantId | null;
  onCircle: (item: SplitItem, unit: number) => void;
  onOpen: (item: SplitItem, unit: number) => void;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
const dollars = (amount: number) => `${amount < 0 ? "-" : ""}$${plainAmount(Math.abs(amount))}`;
const dotSize = 16;
// One step under type.body on the same leading ratio, so the receipt reads denser without going under 14 px.
const itemType = { ...type.body, fontSize: 14, lineHeight: 20.5 };
const tapSize = 44;
const tapBleed = 13;
const circleColumn = tapSize - tapBleed;
const columnGap = 3;
const nameStart = circleColumn + columnGap;
const priceGap = 10;
const dotCenter = dotSize / 2;
const bleed = 12;
const chevronSize = 16;
const chevronTip = chevronSize / 8;

export function ReceiptCard({ split, shares, selected, me, onCircle, onOpen }: Props) {
  const c = useColors();
  const [opened, setOpened] = useState<ReadonlySet<AdjustmentId>>(new Set());
  const { items, subtotal, total } = split.receipt;
  const { rows, charges } = receiptRows(split.receipt);
  const started = items.some((item) => claimersOfItem(item).length > 0);
  const note = totalNote(split.receipt);
  const order = split.participants.map(({ id }) => id);
  const person = (id: ParticipantId) => split.participants.find((one) => one.id === id) ?? { id, name: "" };
  const people = (item: SplitItem) => claimersOfItem(item).map(person);
  const toggle = (id: AdjustmentId) =>
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const line = (row: UnitRow, divided: boolean, inBundle: boolean) => (
    <Line
      key={`${row.item.id}-${row.unit}`}
      row={row}
      order={order}
      claimers={claimersOf(row.item.split, row.unit).map(person)}
      selected={selected}
      divided={divided}
      inBundle={inBundle}
      onCircle={() => onCircle(row.item, row.unit)}
      onOpen={() => onOpen(row.item, row.unit)}
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
        {rows.map((row, index) => {
          if (row.kind === "unit") return line(row, index > 0, false);
          const { bundle } = row;
          return (
            <BundleGroup
              key={bundle.id}
              bundle={bundle}
              open={opened.has(bundle.id)}
              unclaimed={started ? unclaimedUnits(bundle) : 0}
              claimers={[...new Map(bundle.items.flatMap(people).map((person) => [person.id, person])).values()]}
              selected={selected}
              divided={index > 0}
              onToggle={() => toggle(bundle.id)}
            >
              {bundle.units.map((unit, at) => line(unit, at > 0, true))}
              <View style={[styles.discount, { borderTopColor: c.hairline }]}>
                <Text numberOfLines={1} style={[type.secondary, styles.name, { color: c.muted }]}>
                  {bundle.discount.label}
                </Text>
                <Text style={[type.secondary, tabular, { color: c.muted }]}>{plainAmount(bundle.discount.amount)}</Text>
              </View>
            </BundleGroup>
          );
        })}
      </View>
      {note ? (
        <Text role="status" style={[type.caption, styles.why, { color: c.muted }]}>
          {note}
        </Text>
      ) : null}
      <View style={[styles.adjustments, { borderTopColor: c.hairline }]}>
        <Row label={say.subtotal} amount={subtotal} />
        {charges.map((row) => (
          <Row key={row.id} label={row.name} amount={row.amount} />
        ))}
      </View>
      <View style={[styles.total, { borderTopColor: c.hairline }]}>
        <Text style={[type.button, { color: c.ink }]}>{say.total}</Text>
        <Text testID="total" style={[type.total, tabular, { color: c.ink }]}>
          {dollars(total)}
        </Text>
      </View>
      {started ? (
        <View style={styles.unclaimed}>
          <Text style={[type.secondary, { color: c.muted }]}>{say.unclaimed}</Text>
          <Text testID="unclaimed" style={[type.secondary, tabular, styles.strong, { color: c.ink }]}>
            {dollars(shares.unclaimed.total)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type BundleProps = {
  bundle: BundleRow;
  open: boolean;
  unclaimed: number;
  claimers: readonly Participant[];
  selected: Participant | null;
  divided: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function inside(claimers: readonly Participant[], unclaimed: number): string {
  const had = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : "";
  return [had, unclaimed > 0 ? say.unclaimedUnits(unclaimed) : ""].filter(Boolean).join(", ");
}

function BundleGroup({ bundle, open, unclaimed, claimers, selected, divided, onToggle, children }: BundleProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const region = useId();
  return (
    <View role="listitem" testID={`bundle-${bundle.id}`} style={divided && [styles.divided, { borderTopColor: c.hairline }]}>
      <PressTarget
        name={say.bundleLabel(bundle.name, bundle.summary, inside(claimers, unclaimed), open)}
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
                <Text numberOfLines={1} style={[itemType, styles.strong, { color: c.ink }]}>
                  {bundle.name}
                </Text>
                <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                  {bundle.summary}
                </Text>
                {!open && (claimers.length > 0 || unclaimed > 0) ? (
                  <View style={styles.inside}>
                    {claimers.map((person) => (
                      <Dot key={person.id} name={person.name} size={20} tone={person.id === selected?.id ? "me" : "dot"} />
                    ))}
                    {unclaimed > 0 ? <Text style={[type.caption, tabular, { color: c.muted }]}>{say.unclaimedUnits(unclaimed)}</Text> : null}
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={[itemType, tabular, { color: c.ink }]}>{plainAmount(bundle.net)}</Text>
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

function Collapse({ open, id, label, children }: { open: boolean; id: string; label: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(open);
  const outer = useRef<View>(null);
  const inner = useRef<View>(null);
  const stop = useRef<() => void>(() => {});
  const first = useRef(true);
  if (open && !shown) setShown(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const box = outer.current as unknown as HTMLElement | null;
    const content = inner.current as unknown as HTMLElement | null;
    if (!box || !content) return;
    stop.current();
    const to = open ? content.getBoundingClientRect().height : 0;
    const clearOpenStyles = () => {
      box.style.height = "";
      box.style.opacity = "";
    };
    const unmountWhileHidden = () => setShown(false);
    const settled = open ? clearOpenStyles : unmountWhileHidden;
    if (reduce) {
      box.style.height = "";
      const fade = box.animate([{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }], { duration: motion.reducedFade, easing: "ease", fill: "forwards" });
      fade.onfinish = open
        ? () => {
            fade.cancel();
            clearOpenStyles();
          }
        : unmountWhileHidden;
      stop.current = () => fade.cancel();
      return;
    }
    const from = open && !box.style.height ? 0 : box.getBoundingClientRect().height;
    box.style.height = `${from}px`;
    const height = Math.max(to, 1);
    stop.current = animateSpring(
      from,
      to,
      0,
      (value) => {
        box.style.height = `${Math.max(0, value)}px`;
        box.style.opacity = String(Math.min(1, Math.max(0, value / height)));
      },
      settled,
      sheetSpring,
    );
  }, [open, reduce]);
  useLayoutEffect(() => () => stop.current(), []);

  return (
    <View ref={outer} nativeID={id} style={styles.collapse}>
      {shown ? (
        <View ref={inner} role="list" aria-label={label}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

type LineProps = {
  row: UnitRow;
  order: readonly ParticipantId[];
  claimers: readonly Participant[];
  selected: Participant | null;
  divided: boolean;
  inBundle: boolean;
  onCircle: () => void;
  onOpen: () => void;
};

function Line({ row: { item, unit, price: cost }, order, claimers, selected, divided, inBundle, onCircle, onOpen }: LineProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const tag = lineTag(item, unit, order);
  const mine = selected !== null && claimers.some(({ id }) => id === selected.id);
  const ordered = [...claimers].sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id));
  const price = plainAmount(cost);
  const [title, detail] = nameParts(item);
  const who = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : say.unclaimedLine;
  return (
    <View
      role="listitem"
      testID={`line-${item.id}-${unit}`}
      style={[
        styles.line,
        divided && [styles.divided, { borderTopColor: c.hairline }],
        inBundle && { marginLeft: nameStart },
      ]}
    >
      <PressTarget
        name={selected ? say.claimFor(item.name, selected.name) : say.whoHad(item.name)}
        toggled={selected ? mine : undefined}
        onPress={onCircle}
        style={(pressed) => [styles.circle, pressStyle(pressed, reduce)]}
      >
        {() => (
          <View style={styles.dots}>
            {ordered.length === 0 ? (
              <View style={[styles.empty, { boxShadow: `inset 0 0 0 1.5px ${c.muted}`, opacity: 0.6 }]} />
            ) : (
              ordered.map((person, index) => (
                <View key={person.id} style={index > 0 && styles.overlap}>
                  <Dot name={person.name} size={dotSize} tone={person.id === selected?.id ? "me" : "dot"} ring={`0 0 0 2px ${c.paper}`} />
                </View>
              ))
            )}
          </View>
        )}
      </PressTarget>
      <PressTarget name={`${say.open(item.name)}, $${price}, ${who}`} onPress={onOpen} style={() => styles.body}>
        {() => (
          <View style={styles.bodyRow}>
            <View style={styles.name}>
              <Text numberOfLines={2} style={[itemType, { color: c.ink }]}>
                {title}
                {tag ? <Text style={[type.caption, { color: c.muted }]}>{`  ${tag}`}</Text> : null}
              </Text>
              {detail ? (
                <Text numberOfLines={2} style={[type.caption, { color: c.muted }]}>
                  {detail}
                </Text>
              ) : null}
            </View>
            <Text style={[itemType, tabular, { color: c.ink }]}>{price}</Text>
          </View>
        )}
      </PressTarget>
    </View>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[type.secondary, styles.rowLabel, { color: c.muted }]}>
        {label}
      </Text>
      <Text style={[type.secondary, tabular, styles.strong, { color: c.ink }]}>{dollars(amount)}</Text>
    </View>
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
  rule: { position: "absolute", top: 0, bottom: 12, left: dotCenter, width: 1 },
  discount: { flexDirection: "row", alignItems: "center", gap: priceGap, minHeight: 44, borderTopWidth: 1, marginLeft: nameStart, paddingLeft: nameStart },
  why: { marginTop: 8, marginBottom: 2 },
  adjustments: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.adjustmentRow, gap: 12 },
  rowLabel: { flexShrink: 1 },
  strong: { fontWeight: "500" },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 14, borderTopWidth: 1 },
  unclaimed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
});
