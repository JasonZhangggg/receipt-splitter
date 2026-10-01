import { Linking, StyleSheet, Text, View } from "react-native";

import { shareBreakdown } from "../../core/shares";
import type { Participant, PaymentHandle, Split } from "../../core/split";
import { plainAmount } from "../../draft";
import { Button } from "../components/button";
import { Icon } from "../components/icon";
import { paymentApps } from "../home-copy";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { shareLabel } from "./model";

type Props = {
  split: Split;
  person: Participant;
  mine: boolean;
  onPaid: (paid: boolean) => void;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
const dollars = (amount: number) => `${amount < 0 ? "-" : ""}$${plainAmount(Math.abs(amount))}`;

function payUrl({ service, handle }: PaymentHandle, amount: number): string | null {
  const value = plainAmount(amount);
  if (service === "venmo") return `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${value}`;
  if (service === "cashApp") return `https://cash.app/$${encodeURIComponent(handle)}/${value}`;
  if (service === "paypal") return `https://paypal.me/${encodeURIComponent(handle)}/${value}USD`;
  return null;
}

export function Breakdown({ split, person, mine, onPaid }: Props) {
  const c = useColors();
  const { items, adjustments, difference, share } = shareBreakdown(split, person.id);
  const [host] = split.participants;
  const isHost = person.id === host.id;
  const paid = split.payments.find(({ participantId }) => participantId === person.id);
  const handle = split.paymentHandles[0];
  const url = payUrl(handle, share);
  const label = isHost ? (mine ? say.yourShare : say.shareOf(person.name)) : mine ? (paid ? say.youPaid : say.youOwe) : paid ? say.paidBy(person.name) : say.owes(person.name);

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
          const item = split.receipt.items.find(({ id }) => id === line.id);
          const part = shareLabel(line.fraction, item?.split.units.length ?? 1, plainAmount(line.price));
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
          {dollars(paid ? paid.amount : share)}
        </Text>
      </View>
      {mine && !isHost ? (
        <View style={styles.actions}>
          {!paid && url ? (
            <Button label={say.payOn(host.name, dollars(share), paymentApps[handle.service].name)} onPress={() => void Linking.openURL(url)} outsideScroll />
          ) : null}
          <View style={styles.center}>
            <Button kind="link" label={paid ? say.undoPaid : say.alreadyPaid} onPress={() => onPaid(!paid)} outsideScroll />
          </View>
        </View>
      ) : null}
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
  actions: { marginTop: 14, gap: 4 },
  center: { alignItems: "center" },
});
