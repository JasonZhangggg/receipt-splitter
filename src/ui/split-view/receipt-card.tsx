import { StyleSheet, Text, View } from "react-native";

import type { Shares } from "../../core/shares";
import type { Participant, ParticipantId, Split, SplitItem } from "../../core/split";
import { plainAmount } from "../../draft";
import { PressTarget } from "../components/button";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { Dot } from "./dot";
import { claimersOfItem, itemsOverSubtotal, lineTag } from "./model";

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

export function ReceiptCard({ split, shares, selected, me, onCircle, onOpen }: Props) {
  const c = useColors();
  const { items, adjustments, subtotal, total } = split.receipt;
  const started = items.some((item) => claimersOfItem(item).length > 0);
  const gap = itemsOverSubtotal(split.receipt);
  const nameOf = (id: ParticipantId) => split.participants.find((person) => person.id === id)?.name ?? "";

  return (
    <View testID="receipt" style={[styles.card, { backgroundColor: c.paper, filter: c.lift }]}>
      {selected ? (
        <Text style={[type.caption, styles.hint, { color: c.muted }]}>{selected.id === me ? say.checkYours : say.checkTheirs(selected.name)}</Text>
      ) : null}
      <View role="list" aria-label={say.item}>
        {items.map((item, index) => {
          const claimers = claimersOfItem(item);
          const open = started && shares.unclaimed.itemIds.includes(item.id);
          const previousOpen = index > 0 && started && shares.unclaimed.itemIds.includes(items[index - 1].id);
          return (
            <Line
              key={item.id}
              item={item}
              order={split.participants.map(({ id }) => id)}
              claimers={claimers.map((id) => ({ id, name: nameOf(id) }))}
              selected={selected}
              open={open}
              divided={index > 0 && !open && !previousOpen}
              onCircle={() => onCircle(item)}
              onOpen={() => onOpen(item)}
            />
          );
        })}
      </View>
      {gap !== 0 ? (
        <Text role="status" style={[type.caption, styles.why]}>
          <Text style={[styles.mark, { backgroundColor: c.flagWash, color: c.flag }]}>{say.mismatch(dollars(Math.abs(gap)), gap > 0)}</Text>
        </Text>
      ) : null}
      <View style={[styles.adjustments, { borderTopColor: c.hairline }]}>
        <Row label={say.subtotal} amount={subtotal} />
        {adjustments.map((row) => (
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

type LineProps = {
  item: SplitItem;
  order: readonly ParticipantId[];
  claimers: readonly Participant[];
  selected: Participant | null;
  open: boolean;
  divided: boolean;
  onCircle: () => void;
  onOpen: () => void;
};

function Line({ item, order, claimers, selected, open, divided, onCircle, onOpen }: LineProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const tag = lineTag(item, order);
  const mine = selected !== null && claimers.some(({ id }) => id === selected.id);
  const ordered = [...claimers].sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id));
  const price = plainAmount(item.price);
  const who = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : say.unclaimedLine;
  const ink = open ? c.flag : c.ink;
  return (
    <View
      role="listitem"
      testID={`line-${item.id}`}
      style={[styles.line, divided && [styles.divided, { borderTopColor: c.hairline }], open && [styles.open, { backgroundColor: c.flagWash }]]}
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
              <View style={[styles.empty, { boxShadow: `inset 0 0 0 1.5px ${open ? c.flag : c.muted}`, opacity: open ? 0.55 : 0.6 }]} />
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
      <PressTarget name={`${say.open(item.name)}, $${price}, ${who}`} onPress={onOpen} style={() => styles.body}>
        {() => (
          <View style={styles.bodyRow}>
            <Text numberOfLines={1} style={[type.body, styles.name, { color: ink }]}>
              {item.name}
              {tag ? <Text style={[type.caption, { color: open ? c.flag : c.muted }]}>{`  ${tag}`}</Text> : null}
            </Text>
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

const styles = StyleSheet.create({
  card: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20, borderRadius: layout.cardRadius },
  hint: { marginTop: 0, marginBottom: 6 },
  line: { flexDirection: "row", alignItems: "center", minHeight: layout.row, gap: 6 },
  divided: { borderTopWidth: 1 },
  open: { marginVertical: 4, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 14 },
  circle: { minWidth: 54, height: 44, marginLeft: -10, paddingLeft: 10, justifyContent: "center" },
  dots: { flexDirection: "row", alignItems: "center" },
  overlap: { marginLeft: -9 },
  empty: { width: 24, height: 24, borderRadius: 12 },
  body: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" },
  bodyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { flex: 1, minWidth: 0 },
  why: { marginTop: 8, marginBottom: 2 },
  mark: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  adjustments: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.adjustmentRow, gap: 12 },
  rowLabel: { flexShrink: 1 },
  strong: { fontWeight: "500" },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 14, borderTopWidth: 1 },
  unclaimed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
});
