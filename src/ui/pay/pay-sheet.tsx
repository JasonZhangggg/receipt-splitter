import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { shareBreakdown } from "../../core/shares";
import type { Participant, ParticipantId, Split } from "../../core/split";
import { money } from "../../core/currency";
import { SectionHead } from "../components/section-head";
import { splitCopy as say } from "../split-copy";
import { SheetHeader } from "../split-view/sheet-header";
import { breakdownCharges, breakdownLines } from "../split-view/model";
import { tabular, type, useColors } from "../theme";
import { payState } from "./model";

type Props = {
  split: Split;
  person: Participant;
  viewer: ParticipantId | null;
  onClose: () => void;
  /** The wide layout's column: this row replaces the title and the section labels, and `beside` sits right of the amount, which then reads under its label. */
  head?: ReactNode;
  beside?: ReactNode;
};

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
export function PayBody({ split, person, viewer, onClose, head, beside }: Props) {
  const c = useColors();
  const breakdown = shareBreakdown(split, person.id);
  const { mine, share, state } = payFacts(split, person, viewer);
  const lines = breakdownLines(breakdown, split.receipt.items, person.id);
  const charges = [...breakdownCharges(split.receipt, breakdown), ...(breakdown.difference === 0 ? [] : [{ id: "difference", name: say.receiptDifference, portion: breakdown.difference }])];
  const title = payTitle(split, person, viewer);
  return (
    <View style={styles.body}>
      {head ?? (
        <>
          <SheetHeader title={title} onClose={onClose} />
          <View style={styles.label}>
            <SectionHead label={mine ? say.whatYouHad : say.whatTheyHad(person.name)} detail={lines.length > 0 ? say.itemCount(lines.length) : null} />
          </View>
        </>
      )}
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
              <Text style={[type.body, tabular, { color: c.ink }]}>{money(line.portion, split.currency)}</Text>
            </View>
          ))
        )}
      </View>
      {charges.length > 0 ? (
        <View style={head ? null : styles.charges}>
          {head ? null : (
            <View style={styles.label}>
              <SectionHead label={mine ? say.yourCharges : say.chargesOf(person.name)} />
            </View>
          )}
          {charges.map((row) => (
            <Row key={row.id} label={row.name} amount={money(row.portion, split.currency)} ink={c.muted} />
          ))}
        </View>
      ) : null}
      {head ? (
        // The head above carries the share in large type, so the column closes on the total at body size with the pay pill under it.
        <>
          <View style={[styles.total, { borderTopColor: c.hairline }]}>
            <Text numberOfLines={1} style={[type.body, styles.name, { color: c.ink }]}>
              {mine ? say.yourTotal : say.totalOf(person.name)}
            </Text>
            <Text testID="share" style={[type.body, tabular, { color: c.ink }]}>
              {money(share, split.currency)}
            </Text>
          </View>
          {beside ? <View style={styles.beside}>{beside}</View> : null}
        </>
      ) : (
        <View style={[styles.total, { borderTopColor: c.hairline }]}>
          <Text numberOfLines={1} style={[type.body, styles.name, { color: c.ink }]}>
            {mine ? say.yourTotal : say.totalOf(person.name)}
          </Text>
          <Text testID="share" style={[type.hero, tabular, styles.regular, { color: c.ink }]}>
            {money(share, split.currency)}
          </Text>
        </View>
      )}
      {state.kind === "short" ? (
        <View style={styles.rest}>
          <Row label={say.paid} amount={money(state.paid, split.currency)} ink={c.muted} testID="paid-so-far" />
          <Row label={say.leftToPay} amount={money(state.rest, split.currency)} ink={c.ink} testID="left-to-pay" />
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
export function payTitle(split: Split, person: Participant, viewer: ParticipantId | null) {
  const { host, mine, isHost } = payFacts(split, person, viewer);
  return mine ? (isHost ? say.yourShare : say.payHost(firstName(host.name))) : say.shareOf(person.name);
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const styles = StyleSheet.create({
  body: { gap: 4 },
  label: { marginTop: 12 },
  line: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minHeight: 48, paddingVertical: 8 },
  name: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 12 },
  charges: { marginTop: 8 },
  charge: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, gap: 12 },
  total: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  rest: { marginTop: 4 },
  regular: { fontWeight: "400" },
  beside: { alignItems: "flex-end", marginTop: 16 },
});
