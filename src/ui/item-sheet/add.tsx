import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_CENTS } from "../../core/money";
import { MAX_ROW_NAME_LENGTH, type Operation } from "../../core/operations";
import { RECEIPT_LEVEL_KINDS, adjustmentId, itemId, randomId, type ParticipantId, type ReceiptLevelKind, type Split } from "../../core/split";
import type { Answer } from "../../live/client";
import { adjustmentProblem, newAdjustment, takesOff, tidyAmount, type AdjustmentProblem } from "../adjustment-sheet/adjustment";
import { Button } from "../components/button";
import { LabeledField, MoneyField, Options } from "../components/sheet-fields";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { SheetHeader } from "../split-view/sheet-header";
import { newItem, problemFor, type NewItemProblem } from "./new-item";

type Props = {
  split: Split;
  me: ParticipantId | null;
  send: (op: Operation) => Promise<Answer>;
  onClose: () => void;
};

type Kind = "item" | ReceiptLevelKind;
const kinds: readonly Kind[] = ["item", ...RECEIPT_LEVEL_KINDS];
const labels: Record<Kind, string> = { item: say.item, ...say.kinds };
const maxAmount = `$${(MAX_CENTS / 100).toLocaleString("en-US")}`;

function problemText(problem: NewItemProblem | AdjustmentProblem, item: boolean): string {
  if (problem === "overLimit") return item ? say.addProblem.overLimit(maxAmount) : say.adjustmentProblem.overLimit(maxAmount);
  return item ? say.addProblem[problem as Exclude<NewItemProblem, "overLimit">] : say.adjustmentProblem[problem as Exclude<AdjustmentProblem, "overLimit">];
}

/** A new Item, tax, tip, fee or discount as one form: nothing reaches the Split until Add, so other phones never see it half typed. */
export function AddSheet({ split, me, send, onClose }: Props) {
  const c = useColors();
  // Minted once, so a retry after a lost answer cannot add the line twice.
  const [ids] = useState(() => ({ item: itemId(randomId(12)), adjustment: adjustmentId(randomId(12)) }));
  const [kind, setKind] = useState<Kind>("item");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const splitRef = useRef(split);
  useLayoutEffect(() => {
    splitRef.current = split;
  });
  const nameField = useRef<TextInput>(null);
  const amountField = useRef<TextInput>(null);
  const isItem = kind === "item";
  const has = (on: Split) => (isItem ? on.receipt.items.some(({ id }) => id === ids.item) : on.receipt.adjustments.some(({ id }) => id === ids.adjustment));

  const add = async () => {
    if (sending) return;
    if (has(split)) return onClose();
    const answer = isItem ? newItem(split, { name, price: amount }, ids.item, me) : newAdjustment(split, { kind, name, amount }, ids.adjustment, me);
    if (!answer.ok) {
      setProblem(problemText(answer.problem, isItem));
      if (answer.problem === "name") nameField.current?.focus();
      if (answer.problem === "price" || answer.problem === "amount" || answer.problem === "overLimit") amountField.current?.focus();
      return;
    }
    setSending(true);
    const sent = await send(answer.op);
    if (sent.ok || has(splitRef.current)) return onClose();
    setSending(false);
    setProblem(problemText(isItem ? problemFor(sent.rejection.reason) : adjustmentProblem(sent.rejection.reason), isItem));
  };

  const word = labels[kind];
  const off = !isItem && takesOff(kind);
  return (
    <View style={styles.sheet} pointerEvents={sending ? "none" : "auto"}>
      <SheetHeader title={say.addMenu} onClose={onClose} />
      <Options
        options={kinds}
        labels={labels}
        name={say.kind}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setProblem(null);
        }}
      />
      <View style={styles.pair}>
        <LabeledField
          ref={nameField}
          label={say.adjustmentName}
          placeholder={isItem ? say.itemNamePlaceholder : word}
          value={name}
          maxLength={MAX_ROW_NAME_LENGTH}
          autoCapitalize="words"
          onChangeText={(next) => {
            setName(next);
            setProblem(null);
          }}
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => amountField.current?.focus()}
        />
        <MoneyField
          ref={amountField}
          label={isItem ? say.price : off ? say.amountOff : say.amount}
          unit={off ? "-$" : "$"}
          placeholder={say.pricePlaceholder}
          value={amount}
          onChangeText={(next) => {
            setAmount(next);
            setProblem(null);
          }}
          onBlur={() => setAmount(tidyAmount)}
          enterKeyHint="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void add()}
        />
      </View>
      <Text style={[type.caption, styles.hint, { color: c.muted }]}>{say.addHints[kind === "discount" ? "discount" : isItem ? "item" : "charge"]}</Text>
      <View style={styles.action}>
        <Text role="status" style={[type.caption, styles.problem, { color: c.warn }]}>
          {problem ?? ""}
        </Text>
        <View style={styles.pill}>
          <Button kind="compact" label={say.addKind(word)} busy={sending} outsideScroll onPress={() => void add()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 14 },
  pair: { flexDirection: "row", alignItems: "flex-end", gap: 20, marginTop: 4 },
  hint: { marginTop: -4 },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  problem: { flex: 1, minHeight: type.caption.lineHeight },
  pill: { flexShrink: 0 },
});
