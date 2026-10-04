import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_CENTS } from "../../core/money";
import { MAX_DETAIL_LENGTH, MAX_QUANTITY, MAX_ROW_NAME_LENGTH, type Operation } from "../../core/operations";
import { itemId, randomId, type ParticipantId, type Split } from "../../core/split";
import type { Answer } from "../../live/client";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { Stepper } from "./index";
import { newItem, problemFor, type NewItem, type NewItemProblem } from "./new-item";

type Props = {
  split: Split;
  me: ParticipantId | null;
  send: (op: Operation) => Promise<Answer>;
  onClose: () => void;
};

const tabular = { fontVariant: ["tabular-nums" as const] };
const empty: NewItem = { name: "", detail: "", price: "", quantity: 1, who: [] };

/** A new Item as a form: nothing reaches the Split until Add item, so other phones never see it half typed. */
export function AddItemSheet({ split, me, send, onClose }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  // Minted once, so a retry after a lost answer cannot add the Item twice.
  const [id] = useState(() => itemId(randomId(12)));
  const [typed, setTyped] = useState<NewItem>(empty);
  const [problem, setProblem] = useState<NewItemProblem | null>(null);
  const [sending, setSending] = useState(false);
  const splitRef = useRef(split);
  useLayoutEffect(() => {
    splitRef.current = split;
  });
  const nameField = useRef<TextInput>(null);
  const detailField = useRef<TextInput>(null);
  const priceField = useRef<TextInput>(null);
  const change = (next: Partial<NewItem>) => {
    setTyped((was) => ({ ...was, ...next }));
    setProblem(null);
  };

  const add = async () => {
    if (sending) return;
    if (split.receipt.items.some((item) => item.id === id)) return onClose();
    const answer = newItem(split, typed, id, me);
    if (!answer.ok) {
      setProblem(answer.problem);
      if (answer.problem === "name") nameField.current?.focus();
      if (answer.problem === "price" || answer.problem === "overLimit") priceField.current?.focus();
      return;
    }
    setSending(true);
    const sent = await send(answer.op);
    if (sent.ok || splitRef.current.receipt.items.some((item) => item.id === id)) return onClose();
    setSending(false);
    setProblem(problemFor(sent.rejection.reason));
  };

  return (
    <View style={styles.sheet} pointerEvents={sending ? "none" : "auto"}>
      <View style={styles.topline}>
        <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
          {say.newItem}
        </Text>
        <PressTarget name={say.close} outsideScroll onPress={onClose} style={(pressed) => [styles.closeHit, pressStyle(pressed, reduce)]}>
          {() => (
            <View style={[styles.close, { backgroundColor: c.sheetIn }]}>
              <Icon name="x" size={16} color={c.ink} />
            </View>
          )}
        </PressTarget>
      </View>
      <View style={[styles.group, { backgroundColor: c.sheetIn }]}>
        <TextInput
          ref={nameField}
          aria-label={say.itemName}
          placeholder={say.itemName}
          placeholderTextColor={c.muted}
          value={typed.name}
          maxLength={MAX_ROW_NAME_LENGTH}
          autoCapitalize="words"
          onChangeText={(name) => change({ name })}
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => detailField.current?.focus()}
          style={[type.input, styles.field, styles.strong, { color: c.ink }]}
        />
        <View style={[styles.groupRule, { backgroundColor: c.hairline }]} />
        <TextInput
          ref={detailField}
          aria-label={say.itemDetail}
          placeholder={say.addDetail}
          placeholderTextColor={c.muted}
          value={typed.detail}
          maxLength={MAX_DETAIL_LENGTH}
          onChangeText={(detail) => change({ detail })}
          enterKeyHint="next"
          submitBehavior="submit"
          onSubmitEditing={() => priceField.current?.focus()}
          style={[type.input, styles.field, { color: c.ink }]}
        />
      </View>
      <View style={[styles.group, { backgroundColor: c.sheetIn }]}>
        <View style={styles.row}>
          <Text style={[type.caption, styles.rowLabel, { color: c.muted }]}>{say.price}</Text>
          <Text style={[type.input, { color: c.ink }]}>$</Text>
          <TextInput
            ref={priceField}
            aria-label={say.price}
            placeholder={say.pricePlaceholder}
            placeholderTextColor={c.muted}
            inputMode="decimal"
            value={typed.price}
            onChangeText={(price) => change({ price })}
            enterKeyHint="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void add()}
            style={[type.input, tabular, styles.priceInput, styles.strong, { color: c.ink }]}
          />
        </View>
        <View style={[styles.groupRule, { backgroundColor: c.hairline }]} />
        <View style={styles.row}>
          <Text style={[type.caption, styles.rowLabel, { color: c.muted }]}>{say.quantity}</Text>
          <Stepper value={typed.quantity} min={1} max={MAX_QUANTITY} onChange={(quantity) => change({ quantity })} names={[say.oneFewer, say.oneMore]} />
        </View>
      </View>
      <Text style={[type.caption, styles.label, { color: c.muted }]}>{say.whoHadIt}</Text>
      <View role="group" aria-label={say.whoHadIt} style={styles.chips}>
        {split.participants.map((person) => {
          const on = typed.who.includes(person.id);
          return (
            <PressTarget
              key={person.id}
              name={person.name}
              toggled={on}
              outsideScroll
              onPress={() => change({ who: on ? typed.who.filter((one) => one !== person.id) : [...typed.who, person.id] })}
              style={(pressed) => pressStyle(pressed, reduce)}
            >
              {() => (
                <View style={[styles.chip, { backgroundColor: on ? c.action : c.sheetIn }]}>
                  <Text style={[type.label, { color: on ? c.onAction : c.ink }]}>{person.name}</Text>
                </View>
              )}
            </PressTarget>
          );
        })}
      </View>
      <View style={styles.action}>
        <Button label={say.addItem} busy={sending} outsideScroll onPress={() => void add()} />
      </View>
      {problem ? (
        <Text role="status" style={[type.small, styles.problem, { color: c.muted }]}>
          {problem === "overLimit" ? say.addProblem.overLimit(`$${(MAX_CENTS / 100).toLocaleString("en-US")}`) : say.addProblem[problem]}
        </Text>
      ) : null}
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
  priceInput: { width: 96, textAlign: "right", minHeight: 44, paddingRight: 10 },
  label: { marginHorizontal: 2, marginTop: 4, marginBottom: -4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: layout.pairGap },
  chip: { minHeight: 44, paddingHorizontal: 15, borderRadius: 22, justifyContent: "center" },
  action: { marginTop: 4 },
  problem: { alignSelf: "center", marginTop: -4 },
});
