import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_CENTS } from "../../core/money";
import { MAX_ROW_NAME_LENGTH, type Operation } from "../../core/operations";
import { RECEIPT_LEVEL_KINDS, adjustmentId, randomId, type Adjustment, type AdjustmentId, type ParticipantId, type ReceiptLevelKind, type Split } from "../../core/split";
import type { Answer } from "../../live/client";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { fieldGroup } from "../document";
import { Segments } from "../item-sheet";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { adjustmentEdit, adjustmentProblem, deleteAdjustment, newAdjustment, takesOff, typedFrom, type AdjustmentProblem, type TypedAdjustment } from "./adjustment";

type Send = (op: Operation) => Promise<Answer>;

const saveAfter = 600;
const tabular = { fontVariant: ["tabular-nums" as const] };
const maxAmount = `$${(MAX_CENTS / 100).toLocaleString("en-US")}`;

const problemText = (problem: AdjustmentProblem) => (problem === "overLimit" ? say.adjustmentProblem.overLimit(maxAmount) : say.adjustmentProblem[problem]);

type EditProps = { split: Split; adjustmentId: AdjustmentId; me: ParticipantId | null; send: Send; onClose: () => void };

/** A tax, tip, fee or discount, saved as it is typed like an Item's sheet. A Bundle discount keeps its kind and its Items. */
export function AdjustmentSheet({ split, adjustmentId: id, me, send, onClose }: EditProps) {
  const reduce = useReducedMotion();
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
  useLayoutEffect(() => {
    splitRef.current = split;
    flushRef.current = flush;
  });
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
  const shown: TypedAdjustment = { ...typedFrom(row), ...typed };
  const close = () => {
    flush();
    onClose();
  };
  const remove = async () => {
    if (leaving) return;
    setLeaving(true);
    flushRef.current = () => {};
    const sent = await send(deleteAdjustment(me, id));
    if (sent.ok || !splitRef.current.receipt.adjustments.some((adjustment) => adjustment.id === id)) return onClose();
    setLeaving(false);
    setProblem(adjustmentProblem(sent.rejection.reason));
  };
  const off = takesOff(shown.kind);
  return (
    <View style={styles.sheet} pointerEvents={leaving ? "none" : "auto"}>
      <Topline title={off ? say.discount : say.charge} onClose={close} />
      <AdjustmentFields
        split={split}
        row={row}
        typed={shown}
        onChange={(next) => setTyped({ ...typed, ...next })}
        amountField={amountField}
        onNameDone={() => amountField.current?.focus()}
        onAmountDone={flush}
      />
      <ProblemLine problem={problem} />
      <PressTarget name={off ? say.deleteDiscount : say.deleteCharge} outsideScroll onPress={() => void remove()} style={(pressed) => pressStyle(pressed, reduce)}>
        {() => <DeleteFace label={off ? say.deleteDiscount : say.deleteCharge} />}
      </PressTarget>
    </View>
  );
}

type AddProps = { split: Split; me: ParticipantId | null; send: Send; onClose: () => void };

/** A missing tax, tip, fee or discount as a form: nothing reaches the Split until Add, so other phones never see it half typed. */
export function AddAdjustmentSheet({ split, me, send, onClose }: AddProps) {
  // Minted once, so a retry after a lost answer cannot add the line twice.
  const [id] = useState(() => adjustmentId(randomId(12)));
  const [typed, setTyped] = useState<TypedAdjustment & { readonly kind: ReceiptLevelKind }>(() => ({ kind: missingKind(split.receipt.adjustments), name: "", amount: "" }));
  const [problem, setProblem] = useState<AdjustmentProblem | null>(null);
  const [sending, setSending] = useState(false);
  const splitRef = useRef(split);
  useLayoutEffect(() => {
    splitRef.current = split;
  });
  const amountField = useRef<TextInput>(null);
  const has = (on: Split) => on.receipt.adjustments.some((row) => row.id === id);

  const add = async () => {
    if (sending) return;
    if (has(split)) return onClose();
    const answer = newAdjustment(split, typed, id, me);
    if (!answer.ok) {
      setProblem(answer.problem);
      if (answer.problem === "amount" || answer.problem === "overLimit") amountField.current?.focus();
      return;
    }
    setSending(true);
    const sent = await send(answer.op);
    if (sent.ok || has(splitRef.current)) return onClose();
    setSending(false);
    setProblem(adjustmentProblem(sent.rejection.reason));
  };

  const word = say.kinds[typed.kind];
  return (
    <View style={styles.sheet} pointerEvents={sending ? "none" : "auto"}>
      <Topline title={takesOff(typed.kind) ? say.newDiscount : say.newCharge} onClose={onClose} />
      <AdjustmentFields
        split={split}
        typed={typed}
        onChange={(next) => {
          setTyped({ ...typed, ...next, kind: next.kind ?? typed.kind });
          setProblem(null);
        }}
        amountField={amountField}
        onNameDone={() => amountField.current?.focus()}
        onAmountDone={() => void add()}
      />
      <View style={styles.action}>
        <Button label={say.addKind(word)} busy={sending} outsideScroll onPress={() => void add()} />
      </View>
      {/* Always laid out one line tall, so a problem appearing does not resize the sheet. */}
      <ProblemLine problem={problem} reserve />
    </View>
  );
}

/** The first of tax and tip the receipt lacks, since a reading most often misses one of those; a discount otherwise. */
function missingKind(rows: readonly Adjustment[]): ReceiptLevelKind {
  return (["tax", "tip"] as const).find((kind) => !rows.some((row) => row.kind === kind)) ?? "discount";
}

type FieldsProps = {
  split: Split;
  row?: Adjustment;
  typed: TypedAdjustment;
  onChange: (next: Partial<TypedAdjustment> & { kind?: ReceiptLevelKind }) => void;
  amountField: RefObject<TextInput | null>;
  onNameDone: () => void;
  onAmountDone: () => void;
};

function AdjustmentFields({ split, row, typed, onChange, amountField, onNameDone, onAmountDone }: FieldsProps) {
  const c = useColors();
  const bundle = row?.kind === "bundleDiscount" ? row.bundle : null;
  const kind = typed.kind;
  const adding = row === undefined;
  return (
    <>
      {kind === "bundleDiscount" ? null : <Segments options={RECEIPT_LEVEL_KINDS} labels={say.kinds} name={say.kind} value={kind} onChange={(next) => onChange({ kind: next })} />}
      <View {...fieldGroup} style={[styles.group, { backgroundColor: c.sheetIn }]}>
        <TextInput
          aria-label={say.adjustmentName}
          placeholder={kind === "bundleDiscount" ? say.adjustmentName : say.kinds[kind]}
          placeholderTextColor={c.muted}
          value={typed.name}
          maxLength={MAX_ROW_NAME_LENGTH}
          autoCapitalize="words"
          onChangeText={(name) => onChange({ name })}
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={onNameDone}
          style={[type.input, styles.field, styles.strong, { color: c.ink }]}
        />
        <View style={[styles.groupRule, { backgroundColor: c.hairline }]} />
        <View style={styles.row}>
          <Text style={[type.caption, styles.rowLabel, { color: c.muted }]}>{takesOff(kind) ? say.amountOff : say.amount}</Text>
          <Text style={[type.input, { color: c.ink }]}>{takesOff(kind) ? "−$" : "$"}</Text>
          <TextInput
            ref={amountField}
            aria-label={takesOff(kind) ? say.amountOff : say.amount}
            placeholder={say.pricePlaceholder}
            placeholderTextColor={c.muted}
            inputMode="decimal"
            value={typed.amount}
            onChangeText={(amount) => onChange({ amount })}
            enterKeyHint="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={onAmountDone}
            selectTextOnFocus={!adding}
            style={[type.input, tabular, styles.amountInput, styles.strong, { color: c.ink }]}
          />
        </View>
      </View>
      {bundle ? <Note>{say.bundleDiscountNote(bundle.name, split.receipt.items.filter((item) => bundle.items.includes(item.id)).reduce((units, { quantity = 1 }) => units + quantity, 0))}</Note> : null}
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.note}>
      <Icon name="bag" size={15} color={c.muted} />
      <Text style={[type.caption, styles.noteText, { color: c.muted }]}>{children}</Text>
    </View>
  );
}

function Topline({ title, onClose }: { title: string; onClose: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.topline}>
      <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
        {title}
      </Text>
      <PressTarget name={say.close} outsideScroll onPress={onClose} style={(pressed) => [styles.closeHit, pressStyle(pressed, reduce)]}>
        {() => (
          <View style={[styles.close, { backgroundColor: c.sheetIn }]}>
            <Icon name="x" size={16} color={c.ink} />
          </View>
        )}
      </PressTarget>
    </View>
  );
}

function ProblemLine({ problem, reserve = false }: { problem: AdjustmentProblem | null; reserve?: boolean }) {
  const c = useColors();
  if (!problem && !reserve) return null;
  return (
    <Text role="status" style={[type.small, styles.problem, reserve && { minHeight: type.small.lineHeight }, { color: c.muted }]}>
      {problem ? problemText(problem) : ""}
    </Text>
  );
}

function DeleteFace({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={[styles.wide, { backgroundColor: c.sheetIn }]}>
      <Icon name="trash" size={18} color={c.danger} />
      <Text style={[type.button, { color: c.danger }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, lineHeight: 22, marginTop: 2 },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  group: { borderRadius: layout.fieldRadius, overflow: "hidden" },
  groupRule: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  field: { minHeight: layout.field, paddingHorizontal: 16 },
  strong: { fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: layout.field, paddingLeft: 16, paddingRight: 6 },
  rowLabel: { marginRight: "auto" },
  amountInput: { width: 96, textAlign: "right", minHeight: 44, paddingRight: 10 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 2 },
  noteText: { flexShrink: 1 },
  action: { marginTop: 4 },
  problem: { alignSelf: "center", marginTop: -4 },
  wide: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: layout.field, borderRadius: layout.fieldRadius, marginTop: 4 },
});
