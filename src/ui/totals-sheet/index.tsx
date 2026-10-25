import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_CENTS } from "../../core/money";
import type { Operation } from "../../core/operations";
import { money, plainAmount } from "../../core/currency";
import type { ParticipantId, Split } from "../../core/split";
import type { Answer } from "../../live/client";
import { MoneyField } from "../components/sheet-fields";
import { TextLink } from "../components/text-link";
import { adjustmentProblem, tidyAmount, type AdjustmentProblem } from "../adjustment-sheet/adjustment";
import type { CloseGuard } from "../adjustment-sheet";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { SheetHeader } from "../split-view/sheet-header";
import { readAmount } from "../item-sheet/new-item";
import { addsUpTo, totalsEdit, type TotalLine } from "./totals";

type Send = (op: Operation) => Promise<Answer>;

const saveAfter = 600;

type Props = {
  split: Split;
  line: TotalLine;
  me: ParticipantId | null;
  send: Send;
  onClose: () => void;
  guardRef: RefObject<CloseGuard | null>;
};

/** The Subtotal or the Total typed by hand, saved as it is typed like an Adjustment's sheet, with a tap to take what the rows above add up to. */
export function TotalsSheet({ split, line, me, send, onClose, guardRef }: Props) {
  const c = useColors();
  const { currency } = split;
  const [typed, setTyped] = useState<string | null>(null);
  const [problem, setProblem] = useState<AdjustmentProblem | null>(null);
  const splitRef = useRef(split);
  const flushRef = useRef<(text?: string) => void>(() => {});
  const lastSent = useRef("");
  const field = useRef<TextInput>(null);
  const shown = typed ?? plainAmount(split.receipt[line], currency);

  const flush = (text = typed) => {
    if (text === null) return;
    const answer = totalsEdit(splitRef.current, line, text, me);
    if (answer === null) return setProblem(null);
    if (!answer.ok) return setProblem(answer.problem === "amount" ? null : answer.problem);
    setProblem(null);
    const wire = JSON.stringify(answer.op);
    if (wire === lastSent.current) return;
    lastSent.current = wire;
    void send(answer.op).then((sent) => {
      if (!sent.ok) setProblem(adjustmentProblem(sent.rejection.reason));
    });
  };
  // An amount the Split refuses keeps the sheet open on its problem; an empty field just closes, leaving the line as it was.
  const holds = () => {
    if (typed === null) return false;
    const answer = totalsEdit(splitRef.current, line, typed, me);
    if (answer === null || answer.ok || answer.problem === "amount") return false;
    setProblem(answer.problem);
    return true;
  };
  useLayoutEffect(() => {
    splitRef.current = split;
    flushRef.current = flush;
    guardRef.current = holds;
  });
  useEffect(
    () => () => {
      guardRef.current = null;
    },
    [guardRef],
  );
  useEffect(() => {
    if (typed === null) return;
    const timer = setTimeout(() => flushRef.current(), saveAfter);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => () => flushRef.current(), []);

  const close = () => {
    if (!holds()) field.current?.blur();
    flush();
    onClose();
  };
  const tidy = () => setTyped((was) => (was === null || tidyAmount(was, currency) === was ? was : tidyAmount(was, currency)));
  const sum = addsUpTo(split.receipt, line);
  const reads = readAmount(shown, currency);
  const offer = reads !== sum && sum >= 0 && sum <= MAX_CENTS ? sum : null;
  return (
    <View style={styles.sheet}>
      <SheetHeader title={say.editTotals[line]} onClose={close} keepsFocus />
      <View style={styles.pair}>
        <View style={styles.notes}>
          {offer !== null ? (
            <>
              <Text style={[type.caption, { color: c.muted }]}>{say.addsUpTo[line](money(offer, currency))}</Text>
              <TextLink
                label={say.useAmount(money(offer, currency))}
                outsideScroll
                onPress={() => {
                  const text = plainAmount(offer, currency);
                  setTyped(text);
                  flush(text);
                }}
              />
            </>
          ) : null}
          <Text style={[type.caption, { color: c.muted }]}>{say.totalsHint[line]}</Text>
        </View>
        <MoneyField
          ref={field}
          label={line === "subtotal" ? say.subtotal : say.total}
          placeholder={say.pricePlaceholder}
          value={shown}
          onChangeText={setTyped}
          enterKeyHint="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => {
            tidy();
            flush();
          }}
          onBlur={tidy}
          selectTextOnFocus
        />
      </View>
      {problem ? (
        <Text role="status" style={[type.caption, { color: c.warn }]}>
          {problem === "overLimit" ? say.adjustmentProblem.overLimit(money(MAX_CENTS, currency)) : say.adjustmentProblem[problem]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 14 },
  // The field sits where a charge's amount sits on the receipt, with what the rows add up to beside it.
  pair: { flexDirection: "row", alignItems: "flex-start", gap: 20, marginTop: 4 },
  notes: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 2 },
});
