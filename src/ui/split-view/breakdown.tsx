import { StyleSheet, Text, View } from "react-native";

import { shareBreakdown } from "../../core/shares";
import type { Participant, ParticipantId, Split } from "../../core/split";
import { plainAmount } from "../../draft";
import { Icon } from "../components/icon";
import { differenceNote, payState } from "../pay/model";
import { PayBlock } from "../pay/pay-block";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { breakdownCharges, shareLabel } from "./model";

type Props = {
  split: Split;
  person: Participant;
  viewer: ParticipantId | null;
  onPaid: (paid: boolean) => void;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
const dollars = (amount: number) => `${amount < 0 ? "-" : ""}$${plainAmount(Math.abs(amount))}`;

export function Breakdown({ split, person, viewer, onPaid }: Props) {
  const c = useColors();
  const breakdown = shareBreakdown(split, person.id);
  const { items, difference, share } = breakdown;
  const adjustments = breakdownCharges(split.receipt, breakdown);
  const [host] = split.participants;
  const isHost = person.id === host.id;
  const mine = person.id === viewer;
  const state = payState(share, split.payments.find(({ participantId }) => participantId === person.id)?.amount ?? null);
  const paid = state.kind === "settled" || state.kind === "over" || state.kind === "short";
  const shareWord = mine ? say.yourShare : say.shareOf(person.name);
  const label =
    isHost || state.kind === "over" || state.kind === "short" ? shareWord : state.kind === "settled" ? (mine ? say.youPaid : say.paidBy(person.name)) : mine ? say.youOwe : say.owes(person.name);
  const note = differenceNote(state, mine ? "payer" : viewer === host.id ? "host" : "other", person.name, host.name);

  return (
    <View testID="breakdown" style={styles.box}>
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
      <View>
        {items.map((line, index) => {
          const part = shareLabel(line.fraction, plainAmount(line.price));
          return (
            <View key={line.id} style={[styles.line, index > 0 && [styles.divided, { borderTopColor: c.hairline }]]}>
              <Text numberOfLines={1} style={[type.body, styles.name, { color: c.ink }]}>
                {line.name}
                {part ? <Text style={[type.caption, { color: c.muted }]}>{`  ${part}`}</Text> : null}
              </Text>
              <Text style={[type.body, tabular, { color: c.ink }]}>{plainAmount(line.portion)}</Text>
            </View>
          );
        })}
      </View>
      {adjustments.length > 0 || difference !== 0 ? (
        <View style={[styles.adjustments, { borderTopColor: c.hairline }]}>
          {[...adjustments, ...(difference === 0 ? [] : [{ id: "difference", name: say.receiptDifference, portion: difference }])].map((row) => (
            <View key={row.id} style={styles.row}>
              <Text numberOfLines={1} style={[type.secondary, styles.rowLabel, { color: c.muted }]}>
                {row.name}
              </Text>
              <Text style={[type.secondary, tabular, styles.strong, { color: c.ink }]}>{dollars(row.portion)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.total, { borderTopColor: c.hairline }]}>
        <Text style={[type.button, { color: c.ink }]}>{label}</Text>
        <Text testID="share" style={[type.total, tabular, { color: c.ink }]}>
          {dollars(share)}
        </Text>
      </View>
      {note ? (
        <Text testID="difference" style={[type.secondary, styles.note, { color: c.muted }]}>
          {note}
        </Text>
      ) : null}
      {mine && !isHost ? <PayBlock host={host.name} handles={split.paymentHandles} state={state} onPaid={onPaid} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 0 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 26, marginHorizontal: 2 },
  status: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingLeft: 7, paddingRight: 10, borderRadius: 13 },
  strong: { fontWeight: "500" },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 },
  divided: { borderTopWidth: 1 },
  name: { flex: 1, minWidth: 0 },
  adjustments: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, gap: 12 },
  rowLabel: { flexShrink: 1 },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 14, borderTopWidth: 1 },
  note: { marginTop: 6, marginHorizontal: 2 },
});
