import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_CENTS } from "../../core/money";
import { money, symbolOf, type Currency } from "../../core/currency";
import { MAX_ROW_NAME_LENGTH, type Operation } from "../../core/operations";
import { RECEIPT_LEVEL_KINDS, type AdjustmentId, type ParticipantId, type Split } from "../../core/split";
import type { Answer } from "../../live/client";
import type { Lay } from "../lay";
import { Icon } from "../components/icon";
import { IconAction, LabeledField, MoneyField, Options } from "../components/sheet-fields";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { adjustmentEdit, adjustmentProblem, deleteAdjustment, switchKind, takesOff, tidyAmount, typedFrom, type AdjustmentProblem, type TypedAdjustment } from "./adjustment";
import { SheetHeader } from "../split-view/sheet-header";

type Send = (op: Operation) => Promise<Answer>;
/** Asked before the sheet closes; true keeps it open. */
export type CloseGuard = () => boolean;

const saveAfter = 600;

const problemText = (problem: AdjustmentProblem, currency: Currency) => (problem === "overLimit" ? say.adjustmentProblem.overLimit(money(MAX_CENTS, currency)) : say.adjustmentProblem[problem]);

type Props = {
  split: Split;
  adjustmentId: AdjustmentId;
  me: ParticipantId | null;
  send: Send;
  lay: Lay;
  onClose: () => void;
  /** The line is gone; `revision` is the one an Undo names. */
  onDeleted: (deleted: { readonly name: string; readonly revision: number }) => void;
  guardRef: RefObject<CloseGuard | null>;
};

/** A tax, tip, fee or discount, saved as it is typed like an Item's sheet. A Bundle discount keeps its kind and its Items. */
export function AdjustmentSheet({ split, adjustmentId: id, me, send, lay, onClose, onDeleted, guardRef }: Props) {
  const c = useColors();
  const live = split.receipt.adjustments.find((row) => row.id === id);
  // Another phone's delete takes the row away; the sheet closes on the row as it was.
  const [row, setRow] = useState(live);
  if (live && live !== row) setRow(live);
  // Only the fields typed here; the rest show the row as it is now, another phone's fixes included.
  const [typed, setTyped] = useState<Partial<TypedAdjustment>>({});
  const [problem, setProblem] = useState<AdjustmentProblem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const splitRef = useRef(split);
  const flushRef = useRef<() => void>(() => {});
  const lastSent = useRef("");
  const nameField = useRef<TextInput>(null);
  const amountField = useRef<TextInput>(null);

  const flush = () => {
    if (leaving) return;
    const answer = adjustmentEdit(splitRef.current, id, typed, me);
    if (answer === null) return setProblem(null);
    if (!answer.ok) return setProblem(answer.problem === "amount" ? null : answer.problem);
    setProblem(null);
    // Close and unmount both flush; the second would send the same edit before the first is back.
    const wire = JSON.stringify(answer.op);
    if (wire === lastSent.current) return;
    lastSent.current = wire;
    void send(answer.op).then((sent) => {
      if (!sent.ok) setProblem(adjustmentProblem(sent.rejection.reason));
    });
  };
  // An edit the Split refuses, such as a discount that takes the Total below zero, keeps the sheet open on its problem instead of being dropped.
  // Holding never moves focus. On iOS a focus() while the sheet is settling raises the keyboard over the field or leaves it half-focused.
  const holds = () => {
    if (leaving) return false;
    const answer = adjustmentEdit(splitRef.current, id, typed, me);
    if (answer === null || answer.ok) return false;
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
    if (Object.keys(typed).length === 0) return;
    const timer = setTimeout(() => flushRef.current(), saveAfter);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => () => flushRef.current(), []);
  const closeGone = useEffectEvent(onClose);
  useEffect(() => {
    if (!live && !leaving) closeGone();
  }, [live, leaving]);

  if (!row) return null;
  const shown: TypedAdjustment = { ...typedFrom(row, split.currency), ...typed };
  // Close never takes focus, so a held sheet keeps its field and the keyboard. A closing sheet blurs the field, so the keyboard drops as the sheet leaves.
  const close = () => {
    if (!holds()) for (const field of [nameField, amountField]) field.current?.blur();
    flush();
    onClose();
  };
  // The row leaves the page and the sheet closes at once. The Undo bar comes with the server's answer; a refusal puts the row back and says so in the bar.
  const remove = () => {
    if (leaving) return;
    const name = row.name;
    if (!lay(deleteAdjustment(me, id), { then: ({ revision }) => revision !== null && onDeleted({ name, revision }) })) return setProblem("offline");
    setLeaving(true);
    flushRef.current = () => {};
    onClose();
  };
  const off = takesOff(shown.kind);
  const bundle = row.kind === "bundleDiscount" ? row.bundle : null;
  const kind = shown.kind;
  const onChange = (next: Partial<TypedAdjustment> & { kind?: (typeof RECEIPT_LEVEL_KINDS)[number] }) => setTyped({ ...typed, ...next });
  return (
    <View style={styles.sheet} pointerEvents={leaving ? "none" : "auto"}>
      <SheetHeader
        title={say.editKind[kind]}
        onClose={close}
        keepsFocus
        action={<IconAction label={off ? say.deleteDiscount : say.deleteCharge} icon="trash" size={15} pressedInk="warn" onPress={remove} />}
      />
      {kind === "bundleDiscount" ? null : <Options options={RECEIPT_LEVEL_KINDS} labels={say.kinds} name={say.kindOfCharge} value={kind} onChange={(next) => onChange(switchKind(shown, next))} />}
      <View style={styles.pair}>
        <LabeledField
          ref={nameField}
          label={say.adjustmentName}
          placeholder={kind === "bundleDiscount" ? say.adjustmentName : say.kinds[kind]}
          value={shown.name}
          maxLength={MAX_ROW_NAME_LENGTH}
          autoCapitalize="words"
          onChangeText={(name) => onChange({ name })}
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => amountField.current?.focus()}
        />
        <MoneyField
          ref={amountField}
          label={off ? say.amountOff : say.amount}
          unit={off ? `-${symbolOf(split.currency)}` : symbolOf(split.currency)}
          placeholder={say.pricePlaceholder}
          value={shown.amount}
          onChangeText={(amount) => onChange({ amount })}
          enterKeyHint="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => {
            setTyped((was) => (was.amount === undefined || tidyAmount(was.amount, split.currency) === was.amount ? was : { ...was, amount: tidyAmount(was.amount, split.currency) }));
            flush();
          }}
          onBlur={() => setTyped((was) => (was.amount === undefined || tidyAmount(was.amount, split.currency) === was.amount ? was : { ...was, amount: tidyAmount(was.amount, split.currency) }))}
          selectTextOnFocus
        />
      </View>
      {bundle ? (
        <View style={styles.note}>
          <Icon name="bag" size={15} color={c.muted} />
          <Text style={[type.caption, styles.noteText, { color: c.muted }]}>
            {say.bundleDiscountNote(bundle.name, split.receipt.items.filter((item) => bundle.items.includes(item.id)).reduce((units, { quantity = 1 }) => units + quantity, 0))}
          </Text>
        </View>
      ) : null}
      {problem ? (
        <Text role="status" style={[type.caption, { color: c.warn }]}>
          {problemText(problem, split.currency)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 14 },
  pair: { flexDirection: "row", alignItems: "flex-end", gap: 20, marginTop: 4 },
  note: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteText: { flexShrink: 1 },
});
