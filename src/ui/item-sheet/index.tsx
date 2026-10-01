import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { price as toPrice } from "../../core/money";
import { MAX_QUANTITY, MAX_SHARES, applyOperation, claimersOf, type ItemPatch, type ItemValue, type Operation } from "../../core/operations";
import { SPLIT_MODES, type ItemId, type ParticipantId, type Split, type SplitItem, type SplitMode } from "../../core/split";
import { parseAmount, plainAmount } from "../../draft";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { Dot } from "../split-view/dot";
import { unitAmounts } from "../split-view/model";

type ItemEdit = Omit<Extract<ItemPatch, { type: "edit" }>, "type" | "itemId">;

type Props = {
  split: Split;
  itemId: ItemId;
  me: ParticipantId | null;
  send: (op: Operation) => Promise<boolean>;
  onAddPerson: (name: string, unit: number) => void;
  onClose: () => void;
};

const saveAfter = 600;
const tabular = { fontVariant: ["tabular-nums" as const] };

function merge(pending: ItemEdit, next: ItemEdit): ItemEdit {
  const values = [...(pending.values ?? []), ...(next.values ?? [])].filter(
    (value, index, all) => all.findLastIndex((other) => other.unit === value.unit && other.participantId === value.participantId) === index,
  );
  const reshaped = next.by !== undefined && next.by !== pending.by;
  return { ...pending, ...next, values: reshaped ? (next.values ?? []) : values };
}

export function ItemSheet({ split, itemId, me, send, onAddPerson, onClose }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [pending, setPending] = useState<ItemEdit>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ unit: number; name: string } | null>(null);
  const flushRef = useRef<() => void>(() => {});
  const [shown, setShown] = useState<SplitItem | undefined>(() => split.receipt.items.find(({ id }) => id === itemId));
  const [leaving, setLeaving] = useState<SplitItem | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), rowsFade);
    return () => clearTimeout(timer);
  }, [leaving]);

  const patch = (edit: ItemEdit): Operation => ({ by: me, type: "editReceipt", items: [{ type: "edit", itemId, ...edit }] });
  const live = split.receipt.items.find(({ id }) => id === itemId);
  const preview = live && Object.keys(pending).length > 0 ? applyOperation(split, patch(pending), { creator: false }) : null;
  const item: SplitItem | undefined = preview?.ok ? preview.split.receipt.items.find(({ id }) => id === itemId) : live;
  const refusal = preview && !preview.ok ? preview.rejection.reason : null;

  const flush = () => {
    if (Object.keys(pending).length === 0 || refusal) return;
    const sending = pending;
    setPending({});
    void send(patch(sending)).then((ok) => setProblem(ok ? null : say.saveFailed));
  };
  useLayoutEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const timer = setTimeout(() => flushRef.current(), saveAfter);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => () => flushRef.current(), []);

  if (item && shown && item.split.by !== shown.split.by) {
    setLeaving(shown);
    setShown(item);
  }
  if (!item) return null;
  const edit = (next: ItemEdit) => setPending((was) => merge(was, next));
  const quantity = item.split.units.length;
  const nameOf = (id: ParticipantId) => split.participants.find((person) => person.id === id)?.name ?? "";
  const toggle = (participantId: ParticipantId, unit: number, had: boolean) => {
    flush();
    void send({ by: me, type: had ? "unclaim" : "claim", itemId, participantId, unit });
  };
  const close = () => {
    flush();
    onClose();
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.topline}>
        <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
          {say.item}
        </Text>
        <PressTarget name={say.close} outsideScroll onPress={close} style={(pressed) => [styles.closeHit, pressStyle(pressed, reduce)]}>
          {() => (
            <View style={[styles.close, { backgroundColor: c.sheetIn }]}>
              <Icon name="x" size={16} color={c.ink} />
            </View>
          )}
        </PressTarget>
      </View>
      <TextInput
        aria-label={say.itemName}
        defaultValue={item.name}
        onChangeText={(name) => name.trim() && edit({ name: name.trim() })}
        enterKeyHint="done"
        style={[type.input, styles.field, styles.strong, { color: c.ink, backgroundColor: c.sheetIn }]}
      />
      <View style={styles.priceRow}>
        <View style={[styles.priceField, { backgroundColor: c.sheetIn }]}>
          <Text style={[type.caption, styles.fieldLabel, { color: c.muted }]}>{say.price}</Text>
          <Text style={[type.input, { color: c.ink }]}>$</Text>
          <TextInput
            aria-label={say.price}
            inputMode="decimal"
            defaultValue={plainAmount(item.price)}
            onChangeText={(text) => {
              const amount = parseAmount(text);
              if (amount !== null && amount >= 0) edit({ price: toPrice(amount) });
            }}
            enterKeyHint="done"
            style={[type.input, tabular, styles.priceInput, styles.strong, { color: c.ink }]}
          />
        </View>
        <Stepper label={say.quantity} value={quantity} min={1} max={MAX_QUANTITY} onChange={(next) => edit({ quantity: next })} names={[say.fewer, say.more]} large />
      </View>
      <Text style={[type.caption, styles.label, { color: c.muted }]}>{say.whoHadIt}</Text>
      {item.split.units.map((_, unit) => {
        const had = claimersOf(item.split, unit);
        return (
          <View key={unit} style={styles.unit}>
            {quantity > 1 ? <Text style={[type.caption, { color: c.muted }]}>{say.unit(unit + 1, quantity)}</Text> : null}
            <View role="group" aria-label={quantity > 1 ? `${say.whoHadIt}, ${say.unit(unit + 1, quantity)}` : say.whoHadIt} style={styles.chips}>
              {split.participants.map((person) => {
                const on = had.includes(person.id);
                return (
                  <PressTarget key={person.id} name={person.name} toggled={on} outsideScroll onPress={() => toggle(person.id, unit, on)} style={(pressed) => pressStyle(pressed, reduce)}>
                    {() => (
                      <View style={[styles.chip, { backgroundColor: on ? c.action : c.sheetIn }]}>
                        <Text style={[type.label, { color: on ? c.onAction : c.ink }]}>{person.name}</Text>
                      </View>
                    )}
                  </PressTarget>
                );
              })}
              {adding?.unit === unit ? (
                <TextInput
                  autoFocus
                  aria-label={say.newPerson}
                  placeholder={say.newPerson}
                  placeholderTextColor={c.muted}
                  value={adding.name}
                  autoCapitalize="words"
                  enterKeyHint="done"
                  onChangeText={(name) => setAdding({ unit, name })}
                  onSubmitEditing={() => {
                    if (adding.name.trim()) onAddPerson(adding.name, unit);
                    setAdding(null);
                  }}
                  submitBehavior="submit"
                  onBlur={() => setAdding(null)}
                  style={[type.input, styles.chipInput, { color: c.ink, backgroundColor: c.sheetIn }]}
                />
              ) : (
                <PressTarget name={say.addPerson} outsideScroll onPress={() => setAdding({ unit, name: "" })} style={(pressed) => pressStyle(pressed, reduce)}>
                  {() => (
                    <View style={[styles.chip, styles.add, { boxShadow: `inset 0 0 0 1px ${c.hairline}` }]}>
                      <Icon name="plus" size={18} color={c.muted} />
                    </View>
                  )}
                </PressTarget>
              )}
            </View>
          </View>
        );
      })}
      <Text style={[type.caption, styles.label, { color: c.muted }]}>{say.split}</Text>
      <Segments value={item.split.by} onChange={(by) => edit({ by })} />
      <View>
        <View key={item.split.by} style={reduce ? null : rowsEnter}>
          <SplitRows item={item} me={me} nameOf={nameOf} edit={edit} />
        </View>
        {leaving && !reduce ? (
          <View key={`${leaving.split.by}-leaving`} pointerEvents="none" style={[styles.leaving, rowsLeave]}>
            <SplitRows item={leaving} me={me} nameOf={nameOf} edit={() => {}} />
          </View>
        ) : null}
      </View>
      <SumLine item={item} />
      {refusal === "amountOverPrice" ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{say.overPrice}</Text> : null}
      {problem ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{problem}</Text> : null}
    </View>
  );
}

type SplitRowsProps = { item: SplitItem; me: ParticipantId | null; nameOf: (id: ParticipantId) => string; edit: (next: ItemEdit) => void };

function SplitRows({ item, me, nameOf, edit }: SplitRowsProps) {
  const c = useColors();
  const amounts = unitAmounts(item);
  return (
    <>
    {item.split.units.map((_, unit) =>
      amounts[unit].map(({ participantId, cents: amount }, index) => {
        const shares = item.split.by === "shares" ? (item.split.units[unit][index]?.[1] ?? 1) : 0;
        const value = (next: number): ItemValue => ({ unit, participantId, value: next });
        return (
          <View key={`${unit}-${participantId}`} style={[styles.splitRow, (unit > 0 || index > 0) && [styles.divided, { borderTopColor: c.hairline }]]}>
            <View style={styles.who}>
              <Dot name={nameOf(participantId)} tone={participantId === me ? "me" : "dot"} />
              <Text numberOfLines={1} style={[type.button, styles.whoName, { color: c.ink }]}>
                {nameOf(participantId)}
              </Text>
            </View>
            {item.split.by === "shares" ? (
              <Stepper value={shares} min={1} max={MAX_SHARES} onChange={(next) => edit({ values: [value(next)] })} names={[say.fewerShares(nameOf(participantId)), say.moreShares(nameOf(participantId))]} />
            ) : null}
            {item.split.by === "amount" ? (
              <View style={[styles.amountField, { backgroundColor: c.sheetIn }]}>
                <Text style={[type.button, { color: c.ink }]}>$</Text>
                <TextInput
                  aria-label={say.amountOf(nameOf(participantId))}
                  inputMode="decimal"
                  defaultValue={plainAmount(amount)}
                  onChangeText={(text) => {
                    const typed = parseAmount(text);
                    if (typed !== null && typed >= 0) edit({ values: [value(typed)] });
                  }}
                  style={[type.input, tabular, styles.amountInput, styles.strong, { color: c.ink }]}
                />
              </View>
            ) : (
              <Text style={[type.body, tabular, styles.amount, { color: c.ink }]}>{`$${plainAmount(amount)}`}</Text>
            )}
          </View>
        );
      }),
    )}
    </>
  );
}

function SumLine({ item }: { item: SplitItem }) {
  const c = useColors();
  const { split } = item;
  if (split.by === "even") return null;
  if (split.by === "shares") {
    const count = split.units.reduce((sum, unit) => sum + unit.reduce((total, [, weight]) => total + weight, 0), 0);
    return <Text style={[type.caption, styles.sum, { color: c.muted }]}>{say.shares(count)}</Text>;
  }
  const counted = split.units.reduce((sum, unit) => sum + unit.reduce((total, [, amount]) => total + amount, 0), 0);
  const left = item.price - counted;
  return (
    <View style={styles.sumRow}>
      <Text style={[type.caption, { color: c.muted }]}>{say.ofTotal(`$${plainAmount(counted)}`, `$${plainAmount(item.price)}`)}</Text>
      <View style={styles.sumEnd}>
        {left === 0 ? <Icon name="check" size={14} color={c.ink} /> : null}
        <Text style={[type.caption, styles.strong, { color: c.ink }]}>{left === 0 ? say.addsUp : say.left(`$${plainAmount(left)}`)}</Text>
      </View>
    </View>
  );
}

function Segments({ value, onChange }: { value: SplitMode; onChange: (mode: SplitMode) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const index = SPLIT_MODES.indexOf(value);
  return (
    <View style={[styles.segments, { backgroundColor: c.sheetIn }]}>
      <View role="group" aria-label={say.split} style={styles.segmentTrack}>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          { backgroundColor: c.segment, transform: [{ translateX: `${index * 100}%` }] },
          Platform.OS === "web" && !reduce && slide,
          { boxShadow: c.segmentShadow },
        ]}
      />
      {SPLIT_MODES.map((mode) => (
        <PressTarget key={mode} name={say.modes[mode]} toggled={mode === value} outsideScroll onPress={() => onChange(mode)} style={() => styles.segment}>
          {() => (
            <View style={styles.segmentFace}>
              <Text style={[type.label, { color: mode === value ? c.ink : c.muted }]}>{say.modes[mode]}</Text>
            </View>
          )}
        </PressTarget>
      ))}
      </View>
    </View>
  );
}

type StepperProps = { label?: string; value: number; min: number; max: number; onChange: (value: number) => void; names: readonly [string, string]; large?: boolean };

function Stepper({ label, value, min, max, onChange, names, large = false }: StepperProps) {
  const c = useColors();
  const step = (by: number) => {
    const next = Math.min(max, Math.max(min, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <View style={[styles.stepper, large && styles.stepperLarge, { backgroundColor: c.sheetIn }]}>
      {label ? <Text style={[type.caption, styles.stepperLabel, { color: c.muted }]}>{label}</Text> : null}
      <Button kind="icon" icon="minus" name={names[0]} disabled={value <= min} onPress={() => step(-1)} outsideScroll />
      <Text aria-live="polite" style={[type.button, tabular, styles.count, { color: c.ink }]}>
        {value}
      </Text>
      <Button kind="icon" icon="plus" name={names[1]} disabled={value >= max} onPress={() => step(1)} outsideScroll />
    </View>
  );
}

const slide = webStyle({ transitionProperty: "transform", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });
const rowsFade = 150;
const rowsEnter = webStyle({
  animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }],
  animationDuration: `${rowsFade}ms`,
  animationTimingFunction: "ease",
});
const rowsLeave = webStyle({
  animationKeyframes: [{ from: { opacity: 1 }, to: { opacity: 0 } }],
  animationDuration: `${rowsFade}ms`,
  animationTimingFunction: "ease",
  animationFillMode: "forwards",
});

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, lineHeight: 22, marginTop: 2 },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  field: { minHeight: layout.field, paddingHorizontal: 16, borderRadius: layout.fieldRadius },
  strong: { fontWeight: "500" },
  priceRow: { flexDirection: "row", gap: layout.pairGap },
  priceField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minHeight: layout.field, paddingHorizontal: 16, borderRadius: layout.fieldRadius },
  fieldLabel: { marginRight: "auto" },
  priceInput: { width: 80, textAlign: "right", minHeight: 44 },
  label: { marginHorizontal: 2, marginTop: 4, marginBottom: -4 },
  unit: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: layout.pairGap },
  chip: { minHeight: 44, paddingHorizontal: 15, borderRadius: 22, justifyContent: "center" },
  add: { width: 44, paddingHorizontal: 0, alignItems: "center" },
  chipInput: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
  segments: { padding: 3, borderRadius: 14 },
  segmentTrack: { flexDirection: "row" },
  thumb: { position: "absolute", top: 0, bottom: 0, left: 0, width: "33.333%", borderRadius: 11 },
  segment: { flex: 1 },
  segmentFace: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  leaving: { position: "absolute", top: 0, left: 0, right: 0 },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54 },
  divided: { borderTopWidth: 1 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  whoName: { flexShrink: 1 },
  amount: { minWidth: 64, textAlign: "right" },
  amountField: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingHorizontal: 10, borderRadius: 12 },
  amountInput: { width: 56, textAlign: "right", minHeight: 44 },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: 14 },
  stepperLarge: { borderRadius: 16, minHeight: 54 },
  stepperLabel: { paddingLeft: 14 },
  count: { minWidth: 18, textAlign: "center" },
  sum: { marginHorizontal: 2 },
  sumRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 2 },
  sumEnd: { flexDirection: "row", alignItems: "center", gap: 4 },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});

