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
  const payer = mine && !isHost;
  return { host, mine, isHost, share, state, payer, hasBar: payer && state.kind !== "nothing" };
}

/** The viewed person's Items with their part of each, their part of each Adjustment and their total. It reads the live Split, so another phone's edit lands here as it happens. */
export function PayBody({ split, person, viewer, onClose }: Props) {
  const c = useColors();
  const breakdown = shareBreakdown(split, person.id);
  const { mine, share, state } = payFacts(split, person, viewer);
  const lines = breakdownLines(breakdown, split.receipt.items, person.id);
  const charges = [...breakdownCharges(split.receipt, breakdown), ...(breakdown.difference === 0 ? [] : [{ id: "difference", name: say.receiptDifference, portion: breakdown.difference }])];
  const title = payTitle(split, person, viewer);
  return (
    <View style={styles.body}>
      <SheetHeader title={title} onClose={onClose} />
      <Label text={mine ? say.whatYouHad : say.whatTheyHad(person.name)} count={lines.length > 0 ? say.itemCount(lines.length) : null} />
      <View>
        {lines.length === 0 ? (
          <Text style={[type.body, styles.empty, { color: c.muted }]}>{say.nothingChecked(mine ? null : person.name)}</Text>
        ) : (
          lines.map((line) => (
            <View key={line.id} style={styles.line}>
              <View style={styles.name}>
                <Text style={[type.body, { color: c.ink }]}>
                  {line.quantity ? <Text style={[type.caption, tabular, { color: c.muted }]}>{`${line.quantity}  `}</Text> : null}
                  {line.name}
                  {line.detail ? <Text style={{ color: c.muted }}>{` ${line.detail}`}</Text> : null}
                </Text>
                {line.part ? <Text style={[type.caption, { color: c.muted }]}>{line.part}</Text> : null}
              </View>
              <Text style={[type.body, tabular, { color: c.ink }]}>{money(line.portion)}</Text>
            </View>
          ))
        )}
      </View>
      {charges.length > 0 ? (
        <View style={styles.charges}>
          <Label text={mine ? say.yourCharges : say.chargesOf(person.name)} count={null} />
          {charges.map((row) => (
            <Row key={row.id} label={row.name} amount={money(row.portion)} ink={c.muted} />
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
      {state.kind === "short" ? (
        <View style={styles.rest}>
          <Row label={say.paid} amount={money(state.paid)} ink={c.muted} testID="paid-so-far" />
          <Row label={say.leftToPay} amount={money(state.rest)} ink={c.ink} testID="left-to-pay" />
        </View>
      ) : null}
    </View>
  );
}

/** A label and its amount on one line: a charge, or what was paid and what is left after a short payment. */
function Row({ label, amount, ink, testID }: { label: string; amount: string; ink: string; testID?: string }) {
  return (
    <View style={styles.charge}>
      <Text numberOfLines={1} style={[type.body, styles.name, { color: ink }]}>
        {label}
      </Text>
      <Text testID={testID} style={[type.body, tabular, { color: ink }]}>
        {amount}
      </Text>
    </View>
  );
}

/** A section's name in small muted type over a hairline, so the sheet reads where its Items and its charges begin. */
function Label({ text, count }: { text: string; count: string | null }) {
  const c = useColors();
  return (
    <View style={[styles.label, { borderBottomColor: c.hairline }]}>
      <Text style={[type.caption, styles.name, { color: c.muted }]}>{text}</Text>
      {count ? <Text style={[type.caption, tabular, { color: c.muted }]}>{count}</Text> : null}
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
  label: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 12, paddingBottom: 8, borderBottomWidth: 1 },
  line: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minHeight: 48, paddingVertical: 8 },
  name: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 12 },
  charges: { marginTop: 8 },
  charge: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, gap: 12 },
  total: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  rest: { marginTop: 4 },
  regular: { fontWeight: "400" },
});
