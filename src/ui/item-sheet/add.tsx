import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_CENTS } from "../../core/money";
import { MAX_ROW_NAME_LENGTH } from "../../core/operations";
import { RECEIPT_LEVEL_KINDS, adjustmentId, itemId, randomId, type ParticipantId, type ReceiptLevelKind, type Split } from "../../core/split";
import { money, plainAmount, symbolOf, type Currency } from "../../core/currency";
import type { Lay } from "../lay";
import { adjustmentProblem, newAdjustment, takesOff, tidyAmount, type AdjustmentProblem } from "../adjustment-sheet/adjustment";
import { Button } from "../components/button";
import { TextLink } from "../components/text-link";
import { LabeledField, MoneyField, Options } from "../components/sheet-fields";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { SheetHeader } from "../split-view/sheet-header";
import { newItem, problemFor, sharedCharges, shortfall, type NewItemProblem } from "./new-item";

type Props = {
  split: Split;
  me: ParticipantId | null;
  lay: Lay;
  onClose: () => void;
};

type Kind = "item" | ReceiptLevelKind;
const kinds: readonly Kind[] = ["item", ...RECEIPT_LEVEL_KINDS];
const labels: Record<Kind, string> = { item: say.item, ...say.kinds };
function problemText(problem: NewItemProblem | AdjustmentProblem, item: boolean, currency: Currency): string {
  const maxAmount = money(MAX_CENTS, currency);
  if (problem === "overLimit") return item ? say.addProblem.overLimit(maxAmount) : say.adjustmentProblem.overLimit(maxAmount);
  return item ? say.addProblem[problem as Exclude<NewItemProblem, "overLimit">] : say.adjustmentProblem[problem as Exclude<AdjustmentProblem, "overLimit">];
}

/** A new Item, tax, tip, fee or discount as one form: nothing reaches the Split until Add, so other phones never see it half typed. */
export function AddSheet({ split, me, lay, onClose }: Props) {
  const c = useColors();
  const { currency } = split;
  const sign = symbolOf(currency);
  // Minted once, so a retry after a lost answer cannot add the line twice.
  const [ids] = useState(() => ({ item: itemId(randomId(12)), adjustment: adjustmentId(randomId(12)) }));
  const [kind, setKind] = useState<Kind>("item");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const nameField = useRef<TextInput>(null);
  const amountField = useRef<TextInput>(null);
  const quantityField = useRef<TextInput>(null);
  const isItem = kind === "item";
  const has = (on: Split) => (isItem ? on.receipt.items.some(({ id }) => id === ids.item) : on.receipt.adjustments.some(({ id }) => id === ids.adjustment));

  const add = () => {
    if (sending) return;
    if (has(split)) return onClose();
    const answer = isItem ? newItem(split, { name, price: amount, quantity }, ids.item, me) : newAdjustment(split, { kind, name, amount }, ids.adjustment, me);
    if (!answer.ok) {
      setProblem(problemText(answer.problem, isItem, currency));
      if (answer.problem === "name") nameField.current?.focus();
      if (answer.problem === "price" || answer.problem === "amount" || answer.problem === "overLimit") amountField.current?.focus();
      if (answer.problem === "quantity") quantityField.current?.focus();
      return;
    }
    // The line is on the page the moment it is sent, so the sheet closes with it. A refusal takes the line off again and the bar says why, with Try again when the cause is the connection.
    // The ids were minted once, so Try again cannot add the line twice.
    const said = ({ rejection }: { readonly rejection: { readonly reason: Parameters<typeof problemFor>[0] } }) =>
      problemText(isItem ? problemFor(rejection.reason) : adjustmentProblem(rejection.reason), isItem, currency);
    if (!lay(answer.op, { said, retry: true })) return setProblem(problemText("offline", isItem, currency));
    setSending(true);
    onClose();
  };

  const missing = isItem ? shortfall(split) : null;
  const charges = isItem ? sharedCharges(split) : [];
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
          unit={off ? `-${sign}` : sign}
          placeholder={say.pricePlaceholder}
          value={amount}
          onChangeText={(next) => {
            setAmount(next);
            setProblem(null);
          }}
          onBlur={() => setAmount((was) => tidyAmount(was, currency))}
          enterKeyHint={isItem ? "next" : "done"}
          submitBehavior={isItem ? "submit" : "blurAndSubmit"}
          onSubmitEditing={() => (isItem ? quantityField.current?.focus() : add())}
        />
        {isItem ? (
          <MoneyField
            ref={quantityField}
            label={say.howMany}
            unit=""
            width={80}
            inputMode="numeric"
            placeholder="1"
            maxLength={2}
            value={quantity}
            onChangeText={(next) => {
              setQuantity(next);
              setProblem(null);
            }}
            enterKeyHint="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={add}
          />
        ) : null}
      </View>
      {missing !== null ? (
        <View style={styles.offer}>
          <Text style={[type.caption, { color: c.muted }]}>{say.shortfall(money(missing, currency))}</Text>
          <TextLink
            label={say.useAmount(money(missing, currency))}
            outsideScroll
            onPress={() => {
              setAmount(plainAmount(missing, currency));
              setProblem(null);
            }}
          />
        </View>
      ) : null}
      <Text style={[type.caption, styles.hint, { color: c.muted }]}>{say.addHints[kind === "discount" ? "discount" : isItem ? "item" : "charge"]}</Text>
      {charges.length > 0 ? <Text style={[type.caption, styles.hint, { color: c.muted }]}>{say.sharedCharges[charges.length === 2 ? "both" : charges[0]]}</Text> : null}
      <View style={styles.action}>
        <Text role="status" style={[type.caption, styles.problem, { color: c.warn }]}>
          {problem ?? ""}
        </Text>
        <View style={styles.pill}>
          <Button kind="compact" label={say.addKind(word)} busy={sending} outsideScroll onPress={add} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 14 },
  pair: { flexDirection: "row", alignItems: "flex-end", gap: 20, marginTop: 4 },
  hint: { marginTop: -4 },
  offer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, marginVertical: -12 },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  problem: { flex: 1, minHeight: type.caption.lineHeight },
  pill: { flexShrink: 0 },
});
