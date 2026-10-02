import { StyleSheet, Text, TextInput, View } from "react-native";

import { price } from "../../core/money";
import { totalOf, type DraftAction, type DraftReceipt } from "../../draft";
import { Button } from "../components/button";
import { Icon } from "../components/icon";
import { Tag } from "../components/tag";
import { editorCopy } from "../home-copy";
import { useReducedMotion, webAnimation } from "../motion";
import { layout, motion, type, useColors } from "../theme";
import { AmountInput } from "./amount-input";

type Props = { receipt: DraftReceipt; flagged: readonly string[]; dispatch: (action: DraftAction) => void; locked?: boolean };

const tabular = { fontVariant: ["tabular-nums" as const] };

const enter = (from: Record<string, string | number>, duration: number) =>
  webAnimation({
    animationKeyframes: [{ from, to: { opacity: 1, transform: "none" } }],
    animationDuration: `${duration}ms`,
    animationTimingFunction: motion.easeOut,
  });

const entrance = {
  risen: enter({ opacity: 0, transform: "translateY(8px)" }, motion.receiptIn),
  faded: enter({ opacity: 0 }, motion.reducedFade),
};

export function ReceiptEditor({ receipt, flagged, dispatch, locked = false }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const amountText = [type.input, tabular, styles.amount, { color: c.ink }];
  return (
    <View style={[styles.card, locked && styles.lockedCard, { backgroundColor: c.paper }, reduce ? entrance.faded : entrance.risen]}>
      <View role="list" aria-label={editorCopy.items}>
        {receipt.items.map((item, index) => {
          const flag = flagged.includes(item.id);
          const label = item.name.trim() || editorCopy.itemNumber(index + 1);
          const note = item.unreadPrice ? editorCopy.unreadPrice : item.discountExceededPrice ? editorCopy.discountExceededPrice : null;
          return (
            <View
              key={item.id}
              role="listitem"
              testID={`item-${item.id}`}
              {...{ dataSet: { flagged: flag ? "true" : "false" } }}
              style={[styles.item, index > 0 && !flag && !flagged.includes(receipt.items[index - 1].id) && [styles.divided, { borderTopColor: c.hairline }]]}
            >
              <View style={styles.itemLine}>
                <TextInput
                  aria-label={editorCopy.itemName(index + 1)}
                  value={item.name}
                  editable={!locked}
                  placeholder={editorCopy.namePlaceholder}
                  placeholderTextColor={c.muted}
                  enterKeyHint="next"
                  onChangeText={(name) => dispatch({ type: "editItem", id: item.id, name })}
                  style={[type.input, styles.name, { color: c.ink }]}
                />
                <AmountInput
                  amount={item.price}
                  label={editorCopy.priceOf(label, flag)}
                  editable={!locked}
                  onChange={(amount) => dispatch({ type: "editItem", id: item.id, price: price(amount) })}
                  style={[
                    type.input,
                    tabular,
                    styles.price,
                    { color: c.ink },
                    flag && [styles.flaggedPrice, { backgroundColor: c.inset, boxShadow: `inset 0 0 0 1.5px ${c.ink}` }],
                  ]}
                />
                {locked ? null : <Button kind="icon" icon="x" name={editorCopy.remove(label)} onPress={() => dispatch({ type: "removeItem", id: item.id })} />}
              </View>
              {note ? <Text style={[type.caption, styles.note, { color: c.muted }]}>{note}</Text> : null}
            </View>
          );
        })}
      </View>
      {locked ? null : (
        <View style={styles.addItem}>
          <Button kind="link" icon="plus" label={editorCopy.addItem} onPress={() => dispatch({ type: "addItem" })} />
        </View>
      )}

      <View style={[styles.lines, { borderTopColor: c.hairline }]}>
        {receipt.subtotal === null ? null : (
          <Line label={editorCopy.subtotal} locked={locked}>
            <AmountInput amount={receipt.subtotal} label={editorCopy.subtotal} prefix="$" editable={!locked} onChange={(amount) => dispatch({ type: "editSubtotal", amount })} style={amountText} />
          </Line>
        )}
        {receipt.adjustments.map((row) => (
          <Line key={row.id} label={row.name} locked={locked} flagged={flagged.includes(row.id)} onRemove={() => dispatch({ type: "removeAdjustment", id: row.id })}>
            <AmountInput
              amount={row.amount}
              label={row.name}
              prefix="$"
              editable={!locked}
              allowNegative
              onChange={(amount) => dispatch({ type: "editAdjustment", id: row.id, amount })}
              style={amountText}
            />
          </Line>
        ))}
        <Line label={editorCopy.tip} locked={locked} end={<Icon name="pencil" size={14} color={c.muted} />}>
          <AmountInput
            amount={receipt.tip}
            label={editorCopy.tip}
            prefix="$"
            editable={!locked}
            onChange={(amount) => dispatch({ type: "editTip", amount })}
            style={[amountText, !locked && [styles.tip, { textDecorationColor: c.muted }]]}
          />
        </Line>
      </View>

      <View style={[styles.total, { borderTopColor: c.hairline }]}>
        <Text style={[type.button, { color: c.ink }]}>{editorCopy.total}</Text>
        <AmountInput
          amount={totalOf(receipt)}
          label={editorCopy.total}
          prefix="$"
          editable={!locked}
          onChange={(amount) => dispatch({ type: "editTotal", amount })}
          style={[type.total, tabular, styles.totalInput, { color: c.ink }]}
        />
        {locked ? null : <View style={styles.noRemove} />}
      </View>
    </View>
  );
}

type LineProps = { label: string; locked: boolean; flagged?: boolean; onRemove?: () => void; end?: React.ReactNode; children: React.ReactNode };

function Line({ label, locked, flagged = false, onRemove, end, children }: LineProps) {
  const c = useColors();
  return (
    <View style={styles.line}>
      <Text numberOfLines={1} style={[type.secondary, styles.lineLabel, { color: c.muted }]}>
        {label}
      </Text>
      {flagged ? <Tag text={editorCopy.check} /> : null}
      {children}
      {locked ? null : onRemove ? <Button kind="icon" icon="x" name={editorCopy.remove(label)} onPress={onRemove} /> : <View style={styles.noRemove}>{end}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 10, paddingBottom: 20, paddingLeft: 20, paddingRight: 10, borderRadius: layout.cardRadius },
  lockedCard: { paddingRight: 10 },
  item: { minHeight: layout.row, justifyContent: "center" },
  divided: { borderTopWidth: 1 },
  itemLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10 },
  price: { width: 64, minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, textAlign: "right", borderRadius: 8 },
  flaggedPrice: { width: 72, fontWeight: "500" },
  note: { marginTop: -6, marginBottom: 8, marginRight: 50 },
  addItem: { flexDirection: "row", paddingVertical: 2 },
  lines: { marginTop: 4, paddingTop: 6, borderTopWidth: 1 },
  line: { flexDirection: "row", alignItems: "center", minHeight: 46, gap: 6 },
  lineLabel: { flex: 1, minWidth: 0 },
  amount: { width: 96, minHeight: 40, paddingRight: 8, textAlign: "right", fontWeight: "500" },
  noRemove: { width: 44, alignItems: "center" },
  tip: { textDecorationLine: "underline", textDecorationStyle: "dotted" },
  total: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 14, borderTopWidth: 1 },
  totalInput: { flex: 1, minWidth: 0, paddingRight: 8, textAlign: "right" },
});
