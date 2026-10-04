import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { price as toPrice } from "../../core/money";
import { applyOperation, claimersOf, type ItemPatch, type ItemValue, type Operation } from "../../core/operations";
import { SPLIT_MODES, type ItemId, type ParticipantId, type Split, type SplitItem, type SplitMode } from "../../core/split";
import { parseAmount, plainAmount } from "../../draft";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { Dot } from "../split-view/dot";
import { bundleNote, lineAmounts, splitIds } from "../split-view/model";
import { MAX_DETAIL_LENGTH, MAX_SHARES } from "../../core/limits";

type ItemEdit = Omit<Extract<ItemPatch, { type: "edit" }>, "type" | "itemId">;

type Props = {
  split: Split;
  itemId: ItemId;
  me: ParticipantId | null;
  send: (op: Operation) => Promise<boolean>;
  onAddPerson: (name: string) => void;
  onClose: () => void;
};

const saveAfter = 600;
const tabular = { fontVariant: ["tabular-nums" as const] };

function merge(pending: ItemEdit, next: ItemEdit): ItemEdit {
  const values = [...(pending.values ?? []), ...(next.values ?? [])].filter(
    (value, index, all) => all.findLastIndex((other) => other.participantId === value.participantId) === index,
  );
  const reshaped = next.by !== undefined && next.by !== pending.by;
  return { ...pending, ...next, values: reshaped ? (next.values ?? []) : values };
}

export function ItemSheet({ split: current, itemId, me, send, onAddPerson, onClose }: Props) {
  const c = useColors();
  // Split and Delete item change the Item at once; the sheet keeps showing the Split as it looked at the tap, unsaved edits included, until it has left.
  const [leavingFrom, setLeavingFrom] = useState<Split | null>(null);
  const split = leavingFrom ?? current;
  const currentRef = useRef(current);
  // The name, detail, price and amount fields are uncontrolled; a lost Split or Delete item remounts them on the Item as it is now.
  const [fields, setFields] = useState(0);
  const reduce = useReducedMotion();
  const [pending, setPending] = useState<ItemEdit>({});
  const [sent, setSent] = useState<readonly ItemEdit[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const flushRef = useRef<() => void>(() => {});
  const [shown, setShown] = useState<SplitItem | undefined>(() => split.receipt.items.find(({ id }) => id === itemId));
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [enterAfter, setEnterAfter] = useState<number | null>(null);
  const [fade, setFade] = useState<Fade | null>(null);
  const incomingRef = useRef<View>(null);
  const leavingRef = useRef<View>(null);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), leaving.ms);
    return () => clearTimeout(timer);
  }, [leaving]);
  useLayoutEffect(() => {
    if (leaving) dom(leavingRef.current)?.animate([{ opacity: leaving.from }, { opacity: 0 }], { duration: leaving.ms, easing: motion.easeOut, fill: "forwards" });
  }, [leaving]);

  const patch = (edit: ItemEdit): Operation => ({ by: me, type: "editReceipt", items: [{ type: "edit", itemId, ...edit }] });
  const live = split.receipt.items.find(({ id }) => id === itemId);
  const unconfirmed = leavingFrom ? {} : [...sent, pending].reduce(merge, {});
  const preview = live && Object.keys(unconfirmed).length > 0 ? applyOperation(split, patch(unconfirmed), { creator: false }) : null;
  const seen = preview?.ok ? preview.split : split;
  const item: SplitItem | undefined = seen.receipt.items.find(({ id }) => id === itemId);
  const refusal = preview && !preview.ok ? preview.rejection.reason : null;

  const flush = () => {
    if (Object.keys(pending).length === 0 || refusal) return;
    const sending = pending;
    setPending({});
    setSent((was) => [...was, sending]);
    void send(patch(sending)).then((ok) => {
      setSent((was) => was.filter((edit) => edit !== sending));
      setProblem(ok ? null : say.saveFailed);
    });
  };
  useLayoutEffect(() => {
    flushRef.current = flush;
    currentRef.current = current;
  });

  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const timer = setTimeout(() => flushRef.current(), saveAfter);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => () => flushRef.current(), []);

  if (item && shown && item.split.by !== shown.split.by) {
    const { from, left } = fade ?? settled;
    if (from > unseen) {
      const ms = Math.round(rowsFadeOut * from);
      setLeaving({ item: shown, from, ms });
      setEnterAfter(ms);
    } else {
      setEnterAfter(left);
    }
    setFade(null);
    setShown(item);
  }
  if (!item) return null;
  const edit = (next: ItemEdit) => setPending((was) => merge(was, next));
  const had = claimersOf(item.split);
  const nameOf = (id: ParticipantId) => split.participants.find((person) => person.id === id)?.name ?? "";
  const toggle = (participantId: ParticipantId, on: boolean) => {
    flush();
    void send({ by: me, type: on ? "unclaim" : "claim", itemId, participantId });
  };
  const close = () => {
    flush();
    onClose();
  };
  const leave = (op: Operation) => {
    setLeavingFrom(seen);
    void send(op).then((ok) => {
      if (ok || !currentRef.current.receipt.items.some(({ id }) => id === itemId)) return onClose();
      setLeavingFrom(null);
      setFields((was) => was + 1);
      setProblem(say.saveFailed);
    });
  };
  const remove = () => {
    if (leavingFrom) return;
    flushRef.current = () => {};
    leave({ by: me, type: "editReceipt", items: [{ type: "delete", itemId }] });
  };
  const note = bundleNote(seen.receipt, itemId, item.price);
  const quantity = item.quantity ?? 1;
  const splitLine = () => {
    const [first, ...rest] = splitIds(split.receipt, item);
    if (!first || leavingFrom) return;
    flush();
    leave({ by: me, type: "editReceipt", items: [{ type: "split", itemId, ids: [first, ...rest] }] });
  };

  return (
    <View style={styles.sheet} pointerEvents={leavingFrom ? "none" : "auto"}>
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
      <View style={[styles.group, { backgroundColor: c.sheetIn }]}>
        <TextInput
          aria-label={say.itemName}
          key={fields}
          defaultValue={item.name}
          onChangeText={(name) => name.trim() && edit({ name: name.trim() })}
          enterKeyHint="done"
          style={[type.input, styles.field, styles.strong, { color: c.ink }]}
        />
        <View style={[styles.groupRule, { backgroundColor: c.hairline }]} />
        <TextInput
          aria-label={say.itemDetail}
          placeholder={say.addDetail}
          placeholderTextColor={c.muted}
          key={fields}
          defaultValue={item.detail ?? ""}
          maxLength={MAX_DETAIL_LENGTH}
          onChangeText={(detail) => edit({ detail: detail.trim() })}
          enterKeyHint="done"
          style={[type.input, styles.field, { color: c.ink }]}
        />
      </View>
      <View style={[styles.group, { backgroundColor: c.sheetIn }]}>
        <View style={styles.priceField}>
          <Text style={[type.caption, styles.fieldLabel, { color: c.muted }]}>{say.price}</Text>
          <Text style={[type.input, { color: c.ink }]}>$</Text>
          <TextInput
            aria-label={say.price}
            inputMode="decimal"
            key={fields}
            defaultValue={plainAmount(item.price)}
            onChangeText={(text) => {
              const amount = parseAmount(text);
              if (amount !== null && amount >= 0) edit({ price: toPrice(amount) });
            }}
            enterKeyHint="done"
            style={[type.input, tabular, styles.priceInput, styles.strong, { color: c.ink }]}
          />
        </View>
        {quantity > 1 ? (
          <>
            <View style={[styles.groupRule, { backgroundColor: c.hairline }]} />
            <View style={styles.priceField}>
              <Text style={[type.caption, styles.fieldLabel, { color: c.muted }]}>{say.quantity}</Text>
              <Text testID="quantity" style={[type.input, tabular, styles.strong, styles.quantity, { color: c.ink }]}>
                {quantity}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {note ? (
        <View style={styles.note}>
          <Icon name="bag" size={15} color={c.muted} />
          <Text style={[type.caption, styles.noteText, { color: c.muted }]}>{note}</Text>
        </View>
      ) : null}
      {quantity > 1 ? (
        <PressTarget name={say.splitInto(quantity)} outsideScroll onPress={splitLine} style={(pressed) => pressStyle(pressed, reduce)}>
          {() => (
            <View style={[styles.wide, { backgroundColor: c.sheetIn }]}>
              <Text style={[type.button, { color: c.ink }]}>{say.splitInto(quantity)}</Text>
            </View>
          )}
        </PressTarget>
      ) : null}
      <Text style={[type.caption, styles.label, { color: c.muted }]}>{say.whoHadIt}</Text>
      <View role="group" aria-label={say.whoHadIt} style={styles.chips}>
        {split.participants.map((person) => {
          const on = had.includes(person.id);
          return (
            <PressTarget key={person.id} name={person.name} toggled={on} outsideScroll onPress={() => toggle(person.id, on)} style={(pressed) => pressStyle(pressed, reduce)}>
              {() => (
                <View style={[styles.chip, { backgroundColor: on ? c.action : c.sheetIn }]}>
                  <Text style={[type.label, { color: on ? c.onAction : c.ink }]}>{person.name}</Text>
                </View>
              )}
            </PressTarget>
          );
        })}
        {adding !== null ? (
          <TextInput
            autoFocus
            aria-label={say.newPerson}
            placeholder={say.newPerson}
            placeholderTextColor={c.muted}
            value={adding}
            autoCapitalize="words"
            enterKeyHint="done"
            onChangeText={setAdding}
            onSubmitEditing={() => {
              if (adding.trim()) onAddPerson(adding);
              setAdding(null);
            }}
            submitBehavior="submit"
            onBlur={() => setAdding(null)}
            style={[type.input, styles.chipInput, { color: c.ink, backgroundColor: c.sheetIn }]}
          />
        ) : (
          <PressTarget name={say.addPerson} outsideScroll onPress={() => setAdding("")} style={(pressed) => pressStyle(pressed, reduce)}>
            {() => (
              <View style={[styles.chip, styles.add, { boxShadow: `inset 0 0 0 1px ${c.hairline}` }]}>
                <Icon name="plus" size={18} color={c.muted} />
              </View>
            )}
          </PressTarget>
        )}
      </View>
      <Text style={[type.caption, styles.label, { color: c.muted }]}>{say.split}</Text>
      <Segments
        value={item.split.by}
        onChange={(by) => {
          if (by !== item.split.by) setFade({ from: opacityOf(incomingRef.current), left: msLeft(leavingRef.current) });
          edit({ by });
        }}
      />
      <View>
        <View ref={incomingRef} key={item.split.by} style={reduce ? null : enterAfter === null ? rowsEnter : [rowsEnterAfter, webStyle({ animationDelay: `${enterAfter}ms` })]}>
          <SplitRows key={fields} item={item} me={me} nameOf={nameOf} edit={edit} />
        </View>
        {leaving && !reduce ? (
          <View ref={leavingRef} key={`${leaving.item.split.by}-leaving`} pointerEvents="none" style={[styles.leaving, { opacity: leaving.from }]}>
            <SplitRows item={leaving.item} me={me} nameOf={nameOf} edit={() => {}} />
          </View>
        ) : null}
      </View>
      <SumLine item={item} />
      {refusal === "amountOverPrice" ? <Text style={[type.small, styles.problem, { color: c.muted }]}>{say.overPrice}</Text> : null}
      {problem ? <Text style={[type.small, styles.problem, { color: c.muted }]}>{problem}</Text> : null}
      <PressTarget name={say.deleteItem} outsideScroll onPress={remove} style={(pressed) => pressStyle(pressed, reduce)}>
        {() => (
          <View style={[styles.wide, styles.delete, { backgroundColor: c.sheetIn }]}>
            <Icon name="trash" size={18} color={c.danger} />
            <Text style={[type.button, { color: c.danger }]}>{say.deleteItem}</Text>
          </View>
        )}
      </PressTarget>
    </View>
  );
}

type SplitRowsProps = { item: SplitItem; me: ParticipantId | null; nameOf: (id: ParticipantId) => string; edit: (next: ItemEdit) => void };

function SplitRows({ item, me, nameOf, edit }: SplitRowsProps) {
  const c = useColors();
  const amounts = lineAmounts(item);
  return (
    <>
    {amounts.map(({ participantId, cents: amount }, index) => {
        const shares = item.split.by === "shares" ? (item.split.units[0][index]?.[1] ?? 1) : 0;
        const value = (next: number): ItemValue => ({ participantId, value: next });
        return (
          <View key={participantId} style={[styles.splitRow, index > 0 && [styles.divided, { borderTopColor: c.hairline }]]}>
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
      })}
    </>
  );
}

function SumLine({ item: { split, price } }: { item: SplitItem }) {
  const c = useColors();
  if (split.by === "even") return null;
  if (split.by === "shares") {
    const count = split.units[0].reduce((total, [, weight]) => total + weight, 0);
    return <Text style={[type.caption, styles.sum, { color: c.muted }]}>{say.shares(count)}</Text>;
  }
  const counted = split.units[0].reduce((total, [, amount]) => total + amount, 0);
  const left = price - counted;
  return (
    <View style={styles.sumRow}>
      <Text style={[type.caption, { color: c.muted }]}>{say.ofTotal(`$${plainAmount(counted)}`, `$${plainAmount(price)}`)}</Text>
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

type StepperProps = { value: number; min: number; max: number; onChange: (value: number) => void; names: readonly [string, string] };

function Stepper({ value, min, max, onChange, names }: StepperProps) {
  const c = useColors();
  const step = (by: number) => {
    const next = Math.min(max, Math.max(min, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <View style={[styles.stepper, { backgroundColor: c.sheetIn }]}>
      <Button kind="icon" icon="minus" name={names[0]} disabled={value <= min} onPress={() => step(-1)} outsideScroll />
      <Text aria-live="polite" style={[type.button, tabular, styles.count, { color: c.ink }]}>
        {value}
      </Text>
      <Button kind="icon" icon="plus" name={names[1]} disabled={value >= max} onPress={() => step(1)} outsideScroll />
    </View>
  );
}

const slide = webStyle({ transitionProperty: "transform", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });
const rowsFadeIn = 150;
const rowsFadeOut = 120;
const rowsEnter = webAnimation({
  animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }],
  animationDuration: `${rowsFadeIn}ms`,
  animationTimingFunction: motion.easeOut,
});
// After a swap the old rows fade out fully first, so the two copies are never both visible. The delay is set inline to what is left of that fade.
const rowsEnterAfter = webAnimation({
  animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }],
  animationDuration: `${rowsFadeIn}ms`,
  animationFillMode: "backwards",
  animationTimingFunction: motion.easeOut,
});

type Leaving = { item: SplitItem; from: number; ms: number };
// What the user was seeing when they switched: the incoming rows' opacity, and the animation time left on the leaving layer.
type Fade = { from: number; left: number };
const settled: Fade = { from: 1, left: 0 };

const unseen = 0.02;
const dom = (node: View | null) => (Platform.OS === "web" ? (node as unknown as HTMLElement | null) : null);
const opacityOf = (node: View | null) => {
  const el = dom(node);
  return el ? Number(getComputedStyle(el).opacity) : 1;
};
// Animation time left on the node, the same clock a CSS delay runs on.
const msLeft = (node: View | null) =>
  Math.max(0, ...(dom(node)?.getAnimations().map((fade) => Number(fade.effect?.getComputedTiming().endTime) - Number(fade.currentTime)) ?? []));

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, lineHeight: 22, marginTop: 2 },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  field: { minHeight: layout.field, paddingHorizontal: 16, borderRadius: layout.fieldRadius },
  group: { borderRadius: layout.fieldRadius, overflow: "hidden" },
  groupRule: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  strong: { fontWeight: "500" },
  priceField: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: layout.field, paddingHorizontal: 16 },
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
  count: { minWidth: 18, textAlign: "center" },
  sum: { marginHorizontal: 2 },
  sumRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 2 },
  sumEnd: { flexDirection: "row", alignItems: "center", gap: 4 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 2 },
  noteText: { flexShrink: 1 },
  wide: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: layout.field, borderRadius: layout.fieldRadius },
  delete: { marginTop: 4 },
  quantity: { minWidth: 80, textAlign: "right" },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});

