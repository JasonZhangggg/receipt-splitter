import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Shares } from "../../core/shares";
import type { AdjustmentId, Participant, ParticipantId, Split, SplitItem } from "../../core/split";
import { plainAmount } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { animateSpring } from "../components/sheet-motion";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { Dot } from "./dot";
import { claimersOfItem, lineTag, nameParts, receiptRows, totalNote, unclaimedUnits, type BundleRow } from "./model";
import { sheetSpring } from "./spring-sheet";

type Props = {
  split: Split;
  shares: Shares;
  selected: Participant | null;
  me: ParticipantId | null;
  onCircle: (item: SplitItem) => void;
  onOpen: (item: SplitItem) => void;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
const dollars = (amount: number) => `${amount < 0 ? "-" : ""}$${plainAmount(Math.abs(amount))}`;
const circleColumn = 44;
const columnGap = 6;
const quantityWidth = 24;
const quantityGap = 12;
const childIndent = quantityWidth + quantityGap;

export function ReceiptCard({ split, shares, selected, me, onCircle, onOpen }: Props) {
  const c = useColors();
  const [opened, setOpened] = useState<ReadonlySet<AdjustmentId>>(new Set());
  const { items, subtotal, total } = split.receipt;
  const { rows, charges } = receiptRows(split.receipt);
  const started = items.some((item) => claimersOfItem(item).length > 0);
  const note = totalNote(split.receipt);
  const order = split.participants.map(({ id }) => id);
  const people = (item: SplitItem) => claimersOfItem(item).map((id) => split.participants.find((person) => person.id === id) ?? { id, name: "" });
  const flagged = (item: SplitItem) => started && shares.unclaimed.itemIds.includes(item.id);
  const toggle = (id: AdjustmentId) =>
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const line = (item: SplitItem, divided: boolean, inBundle: boolean) => (
    <Line
      key={item.id}
      item={item}
      order={order}
      claimers={people(item)}
      selected={selected}
      flagged={flagged(item)}
      divided={divided}
      inBundle={inBundle}
      onCircle={() => onCircle(item)}
      onOpen={() => onOpen(item)}
    />
  );

  return (
    <View testID="receipt" style={[styles.card, { backgroundColor: c.paper, filter: c.lift }]}>
      {selected ? (
        <Text style={[type.caption, styles.hint, { color: c.muted }]}>{selected.id === me ? say.checkYours : say.checkTheirs(selected.name)}</Text>
      ) : null}
      <View aria-hidden style={styles.columns}>
        <Text style={[type.caption, styles.quantity, { color: c.muted }]}>{say.quantityColumn}</Text>
        <Text style={[type.caption, styles.name, { color: c.muted }]}>{say.itemColumn}</Text>
        <Text style={[type.caption, { color: c.muted }]}>{say.priceColumn}</Text>
      </View>
      <View role="list" aria-label={say.item}>
        {rows.map((row, index) => {
          const previous = rows[index - 1];
          const divided = index > 0 && !(row.kind === "item" && flagged(row.item)) && !(previous?.kind === "item" && flagged(previous.item));
          if (row.kind === "item") return line(row.item, divided, false);
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
              {bundle.items.map((item, at) => line(item, !flagged(item) && !(at > 0 && flagged(bundle.items[at - 1])), true))}
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
          <Text testID="unclaimed" style={[type.secondary, tabular, styles.strong, styles.mark, { backgroundColor: c.flagWash, color: c.flag }]}>
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

function BundleGroup({ bundle, open, unclaimed, claimers, selected, divided, onToggle, children }: BundleProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const region = useId();
  return (
    <View role="listitem" testID={`bundle-${bundle.id}`} style={divided && [styles.divided, { borderTopColor: c.hairline }]}>
      <PressTarget
        name={say.bundleLabel(bundle.name, bundle.summary, open)}
        expanded={open}
        controls={region}
        onPress={onToggle}
        style={(pressed) => [styles.header, pressStyle(pressed, reduce)]}
      >
        {() => (
          <>
            <View style={styles.headerLead}>
              <Text style={[type.body, tabular, styles.quantity, { color: c.muted }]}>1</Text>
              <View style={styles.name}>
                <Text numberOfLines={1} style={[type.body, styles.strong, { color: c.ink }]}>
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
                    {unclaimed > 0 ? (
                      <Text style={[type.caption, tabular, styles.strong, styles.mark, { backgroundColor: c.flagWash, color: c.flag }]}>{say.unclaimedUnits(unclaimed)}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={[type.body, tabular, { color: c.ink }]}>{plainAmount(bundle.net)}</Text>
            <View style={[styles.chevron, { transform: [{ rotate: open ? "180deg" : "0deg" }] }, !reduce && turn]}>
              <Icon name="chevron" size={16} color={c.muted} />
            </View>
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

/** Springs its height open and closed from wherever it is, and cross-fades under reduced motion. Closed, its children are gone from the page. */
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
    const settled = () => {
      box.style.height = "";
      box.style.opacity = "";
      if (!open) setShown(false);
    };
    if (reduce) {
      box.style.height = "";
      const fade = box.animate?.([{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }], { duration: motion.reducedFade, easing: "ease", fill: "forwards" });
      if (!fade) return settled();
      fade.onfinish = () => {
        fade.cancel();
        settled();
      };
      stop.current = () => fade.cancel();
      return;
    }
    const from = box.getBoundingClientRect().height;
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
    <View ref={outer} nativeID={id} role="list" aria-label={label} style={styles.collapse}>
      {shown ? <View ref={inner}>{children}</View> : null}
    </View>
  );
}

type LineProps = {
  item: SplitItem;
  order: readonly ParticipantId[];
  claimers: readonly Participant[];
  selected: Participant | null;
  flagged: boolean;
  divided: boolean;
  inBundle: boolean;
  onCircle: () => void;
  onOpen: () => void;
};

function Line({ item, order, claimers, selected, flagged, divided, inBundle, onCircle, onOpen }: LineProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const tag = lineTag(item, order);
  const mine = selected !== null && claimers.some(({ id }) => id === selected.id);
  const ordered = [...claimers].sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id));
  const price = plainAmount(item.price);
  const quantity = item.split.units.length;
  const [title, detail] = nameParts(item.name);
  const who = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : say.unclaimedLine;
  const ink = flagged ? c.flag : c.ink;
  return (
    <View
      role="listitem"
      testID={`line-${item.id}`}
      style={[
        styles.line,
        divided && !inBundle && [styles.divided, { borderTopColor: c.hairline }],
        flagged && [styles.flagged, { backgroundColor: c.flagWash }],
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
              <View style={[styles.empty, { boxShadow: `inset 0 0 0 1.5px ${flagged ? c.flag : c.muted}`, opacity: flagged ? 0.55 : 0.6 }]} />
            ) : (
              ordered.map((person, index) => (
                <View key={person.id} style={index > 0 && styles.overlap}>
                  <Dot name={person.name} tone={person.id === selected?.id ? "me" : "dot"} ring={`0 0 0 2px ${c.paper}`} />
                </View>
              ))
            )}
          </View>
        )}
      </PressTarget>
      <PressTarget
        name={`${say.open(item.name)}, ${quantity > 1 ? `${say.quantityOf(quantity)}, ` : ""}$${price}, ${who}`}
        onPress={onOpen}
        style={() => [styles.body, inBundle && styles.child, inBundle && divided && !flagged && [styles.divided, { borderTopColor: c.hairline }]]}
      >
        {() => (
          <View style={styles.bodyRow}>
            <Text style={[type.body, tabular, styles.quantity, { color: flagged ? c.flag : c.muted }]}>{quantity}</Text>
            <View style={styles.name}>
              <Text numberOfLines={2} style={[type.body, { color: ink }]}>
                {title}
                {tag ? <Text style={[type.caption, { color: flagged ? c.flag : c.muted }]}>{`  ${tag}`}</Text> : null}
              </Text>
              {detail ? (
                <Text numberOfLines={1} style={[type.caption, { color: flagged ? c.flag : c.muted }]}>
                  {detail}
                </Text>
              ) : null}
            </View>
            <Text style={[type.body, tabular, { color: ink }]}>{price}</Text>
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
  card: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20, borderRadius: layout.cardRadius },
  hint: { marginTop: 0, marginBottom: 6 },
  columns: { flexDirection: "row", alignItems: "center", gap: quantityGap, paddingLeft: circleColumn + columnGap, minHeight: 24 },
  line: { flexDirection: "row", alignItems: "center", minHeight: layout.row, gap: columnGap },
  divided: { borderTopWidth: 1 },
  flagged: { marginVertical: 4, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 14 },
  circle: { minWidth: 54, height: 44, marginLeft: -10, paddingLeft: 10, justifyContent: "center" },
  dots: { flexDirection: "row", alignItems: "center" },
  overlap: { marginLeft: -9 },
  empty: { width: 24, height: 24, borderRadius: 12 },
  body: { flex: 1, minWidth: 0, minHeight: layout.row, justifyContent: "center" },
  child: { marginLeft: childIndent },
  bodyRow: { flexDirection: "row", alignItems: "center", gap: quantityGap },
  quantity: { width: quantityWidth },
  name: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: quantityGap, minHeight: 60, paddingVertical: 8, paddingLeft: circleColumn + columnGap },
  headerLead: { flex: 1, minWidth: 0, flexDirection: "row", gap: quantityGap },
  inside: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  chevron: { width: 16, marginLeft: -4 },
  collapse: { overflow: "hidden", marginHorizontal: -12, paddingHorizontal: 12 },
  rule: { position: "absolute", top: 0, bottom: 12, left: circleColumn + columnGap + 4, width: 1 },
  discount: { flexDirection: "row", alignItems: "center", gap: quantityGap, minHeight: 44, borderTopWidth: 1, marginLeft: circleColumn + columnGap + childIndent, paddingLeft: quantityWidth + quantityGap },
  why: { marginTop: 8, marginBottom: 2 },
  mark: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  adjustments: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.adjustmentRow, gap: 12 },
  rowLabel: { flexShrink: 1 },
  strong: { fontWeight: "500" },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 14, borderTopWidth: 1 },
  unclaimed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
});
