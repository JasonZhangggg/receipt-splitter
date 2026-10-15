import { StyleSheet, Text, View } from "react-native";

import { shareBreakdown } from "../../core/shares";
import type { Participant, ParticipantId, Split } from "../../core/split";
import { money } from "../../draft";
import { splitCopy as say } from "../split-copy";
import { SheetHeader } from "../split-view/sheet-header";
import { breakdownCharges, breakdownLines } from "../split-view/model";
import { tabular, type, useColors } from "../theme";
import { payState } from "./model";

type Props = { split: Split; person: Participant; viewer: ParticipantId | null; onClose: () => void };

/** Who the sheet is for, which decides its title and whether it carries a pay bar. */
export function payFacts(split: Split, person: Participant, viewer: ParticipantId | null) {
  const [host] = split.participants;
  const mine = person.id === viewer;
  const isHost = person.id === host.id;
  const share = shareBreakdown(split, person.id).share;
  const state = payState(share, split.payments.find(({ participantId }) => participantId === person.id)?.amount ?? null);
  return { host, mine, isHost, share, state, hasBar: mine && !isHost && state.kind !== "nothing" };
}

/** The viewed person's Items with their part of each, their part of each Adjustment and their total. It reads the live Split, so another phone's edit lands here as it happens. */
export function PayBody({ split, person, viewer, onClose }: Props) {
  const c = useColors();
  const breakdown = shareBreakdown(split, person.id);
  const { mine, share } = payFacts(split, person, viewer);
  const lines = breakdownLines(breakdown, split.receipt.items, person.id);
  const charges = [...breakdownCharges(split.receipt, breakdown), ...(breakdown.difference === 0 ? [] : [{ id: "difference", name: say.receiptDifference, portion: breakdown.difference }])];
  const title = payTitle(split, person, viewer);
  return (
    <View style={styles.body}>
      <SheetHeader title={title} onClose={onClose} />
      <Text style={[type.body, { color: c.muted }]}>{mine ? say.payHint : say.payHintOf(person.name)}</Text>
      <View style={styles.items}>
        {lines.length === 0 ? (
          <Text style={[type.body, styles.empty, { color: c.muted }]}>{say.nothingChecked(mine ? null : person.name)}</Text>
        ) : (
          lines.map((line, index) => (
            <View key={line.id} style={[styles.line, index > 0 && { borderTopColor: c.hairline, borderTopWidth: 1 }]}>
              <View style={styles.name}>
                <Text style={[type.body, { color: c.ink }]}>
                  {line.quantity ? <Text style={[type.caption, tabular, { color: c.muted }]}>{`${line.quantity}  `}</Text> : null}
                  {line.name}
                </Text>
                {line.part ? <Text style={[type.caption, { color: c.muted }]}>{line.part}</Text> : null}
              </View>
              <Text style={[type.body, tabular, { color: c.ink }]}>{money(line.portion)}</Text>
            </View>
          ))
        )}
      </View>
      {charges.length > 0 ? (
        <View style={[styles.charges, { borderTopColor: c.hairline }]}>
          {charges.map((row) => (
            <View key={row.id} style={styles.charge}>
              <Text numberOfLines={1} style={[type.body, styles.name, { color: c.muted }]}>
                {row.name}
              </Text>
              <Text style={[type.body, tabular, { color: c.muted }]}>{money(row.portion)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.total, { borderTopColor: c.hairline }]}>
        <Text numberOfLines={1} style={[type.body, styles.name, { color: c.ink }]}>
          {mine ? say.yourTotal : say.totalOf(person.name)}
        </Text>
        <Text testID="share" style={[type.hero, tabular, styles.regular, { color: c.ink }]}>
          {money(share)}
        </Text>
      </View>
    </View>
  );
}

export function payTitle(split: Split, person: Participant, viewer: ParticipantId | null) {
  const { host, mine, isHost } = payFacts(split, person, viewer);
  return mine ? (isHost ? say.yourShare : say.payHost(firstName(host.name))) : say.shareOf(person.name);
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const styles = StyleSheet.create({
  body: { gap: 4 },
  items: { marginTop: 8 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 56, paddingVertical: 8 },
  name: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 12 },
  charges: { marginTop: 6, paddingTop: 6, borderTopWidth: 1 },
  charge: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, gap: 12 },
  total: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  regular: { fontWeight: "400" },
});
