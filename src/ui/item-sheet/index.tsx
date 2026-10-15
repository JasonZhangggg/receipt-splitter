import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Keyboard, Platform, StyleSheet, Text, View } from "react-native";

import { MAX_CENTS, price as toPrice, type Cents } from "../../core/money";
import { MAX_DETAIL_LENGTH, MAX_SHARES, applyOperation, claimersOf, type ItemPatch, type ItemValue, type Operation } from "../../core/operations";
import { SPLIT_MODES, type SplitMode, type ItemId, type ParticipantId, type Split, type SplitItem } from "../../core/split";
import { money, plainAmount } from "../../draft";
import type { Answer } from "../../live/client";
import { Icon } from "../components/icon";
import { IconAction, LabeledField, MoneyField, Options, PersonToggle } from "../components/sheet-fields";
import { TextLink } from "../components/text-link";
import { useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors } from "../theme";
import { bundleNote, itemParts, lineAmounts, nameParts, splitIds } from "../split-view/model";
import type { CloseGuard } from "../adjustment-sheet";
import { amountStatus } from "./amount-status";
import { readAmount } from "./new-item";
import { SheetHeader } from "../split-view/sheet-header";

type ItemEdit = Omit<Extract<ItemPatch, { type: "edit" }>, "type" | "itemId">;

type Props = {
  split: Split;
  itemId: ItemId;
  me: ParticipantId | null;
  send: (op: Operation) => Promise<Answer>;
  onClose: () => void;
  /** A line the sheet cannot act on, said in the page's bar while the sheet stays open. */
  onNote: (message: string) => void;
  /** The Item is gone; `revision` is the one an Undo names. */
  onDeleted: (deleted: { readonly name: string; readonly revision: number }) => void;
  guardRef: RefObject<CloseGuard | null>;
};

/** The price field, or a person's field when the Item is split by amount. */
type AmountField = "price" | ParticipantId;

const saveAfter = 600;
const maxAmount = `$${(MAX_CENTS / 100).toLocaleString("en-US")}`;

function merge(pending: ItemEdit, next: ItemEdit): ItemEdit {
  const values = [...(pending.values ?? []), ...(next.values ?? [])].filter(
    (value, index, all) => all.findLastIndex((other) => other.participantId === value.participantId) === index,
  );
  const reshaped = next.by !== undefined && next.by !== pending.by;
  return { ...pending, ...next, values: reshaped ? (next.values ?? []) : values };
}

/**
 * The part of an edit that sets how the price divides, with the price when it is typed alongside. It is sent only once the amounts add up to the price.
 * A price edit on its own is sent as it always was.
 */
function divide({ by, values, price, ...rest }: ItemEdit): { readonly sendable: ItemEdit; readonly held: ItemEdit } {
  const resplit = by !== undefined || (values?.length ?? 0) > 0;
  const priced = price === undefined ? {} : { price };
  return {
    sendable: resplit ? rest : { ...rest, ...priced },
    held: { ...(by !== undefined && { by }), ...(resplit && values !== undefined && { values }), ...(resplit && priced) },
  };
}

/** What each By amount field holds as typed: the edit's last value for the person, else the Item's. */
function typedAmounts(parts: readonly (readonly [ParticipantId, number])[], edit: ItemEdit): { participantId: ParticipantId; cents: number }[] {
  return parts.map(([participantId, cents]) => ({ participantId, cents: edit.values?.findLast((value) => value.participantId === participantId)?.value ?? cents }));
}

function holdsBack(seen: Split, itemId: ItemId, edit: ItemEdit, last: ParticipantId | null): boolean {
  const row = seen.receipt.items.find(({ id }) => id === itemId);
  if (!row || row.split.by !== "amount" || row.split.units[0].length === 0 || Object.keys(divide(edit).held).length === 0) return false;
  return amountStatus(row.price, typedAmounts(row.split.units[0], edit), last).by !== "exact";
}

function repriced(split: Split, itemId: ItemId, price: SplitItem["price"]): Split {
  const [first, ...rest] = split.receipt.items;
  const at = (row: SplitItem): SplitItem => (row.id === itemId ? { ...row, price } : row);
  return { ...split, receipt: { ...split.receipt, items: [at(first), ...rest.map(at)] } };
}

function showsAsBefore(item: SplitItem, edit: ItemEdit): boolean {
  const { name, detail, values = [], ...rest } = edit;
  if (values.length > 0 || Object.keys(rest).length > 0) return false;
  const [title, line] = nameParts(item);
  const [nextTitle, nextLine] = nameParts({ name: name ?? item.name, detail: detail === undefined ? item.detail : detail });
  return nextTitle === title && (nextLine || null) === (line || null);
}

export function ItemSheet({ split: current, itemId, me, send, onClose, onNote, onDeleted, guardRef }: Props) {
  const c = useColors();
  // Split and Delete item change the Item at once; the sheet keeps showing the Split as it looked at the tap, unsaved edits included, until it has left.
  const [leavingFrom, setLeavingFrom] = useState<Split | null>(null);
  // Another device's Split or Delete item takes the Item away; the sheet closes the same way, on the Split as it was.
  const [last, setLast] = useState(current);
  const [taken, setTaken] = useState(false);
  const split = leavingFrom ?? current;
  const currentRef = useRef(current);
  // The name, detail, price and amount fields are uncontrolled; a lost Split or Delete item remounts them on the Item as it is now.
  const [fields, setFields] = useState(0);
  const reduce = useReducedMotion();
  const [pending, setPending] = useState<ItemEdit>({});
  const [sent, setSent] = useState<readonly ItemEdit[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  // Text in an amount field that does not read as an amount saves nothing, so closing holds the sheet open on its problem instead of dropping it.
  const [unread, setUnread] = useState<ReadonlyMap<AmountField, "price" | "overLimit">>(new Map());
  const [held, setHeld] = useState(false);
  // The mode the typed amounts and shares are for, so they are dropped, not applied, once another device has changed it.
  const [typedFor, setTypedFor] = useState<SplitMode | null>(null);
  // A filled field remounts on its new amount, since the amount fields are uncontrolled.
  const [refills, setRefills] = useState<ReadonlyMap<ParticipantId, number>>(new Map());
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
  // What was typed for someone who is no longer on the Item, or for a mode another device has since changed, is dropped rather than sent.
  const claimers = live ? claimersOf(live.split) : [];
  const sentSoFar = sent.reduce(merge, {});
  const mine: ItemEdit = (pending.values?.length ?? 0) > 0 ? { ...pending, values: typedFor === (pending.by ?? sentSoFar.by ?? live?.split.by) ? pending.values!.filter(({ participantId }) => claimers.includes(participantId)) : [] } : pending;
  const unconfirmed: ItemEdit = leavingFrom ? {} : [...sent, mine].reduce(merge, {});
  const tried = live && Object.keys(unconfirmed).length > 0 ? applyOperation(split, patch(unconfirmed), { creator: false }) : null;
  const refusal = tried && !tried.ok ? tried.rejection.reason : null;
  // Amounts over the price save nothing, but the sheet still shows the rest of the edit, such as the switch to By amount, while the fields keep what was typed.
  const preview = refusal === "amountOverPrice" ? applyOperation(split, patch({ ...unconfirmed, values: [] }), { creator: false }) : tried;
  // A price lowered under the amounts cannot be applied even with the amounts dropped, so the sheet shows the Item at the price typed, over, until the amounts are fixed.
  const lowered = refusal === "amountOverPrice" && !preview?.ok && unconfirmed.price !== undefined ? repriced(split, itemId, unconfirmed.price) : null;
  const seen = preview?.ok ? preview.split : (lowered ?? split);
  const item: SplitItem | undefined = seen.receipt.items.find(({ id }) => id === itemId);
  const lastTyped = unconfirmed.values?.at(-1)?.participantId ?? null;
  // A By amount split that does not add up to the price is never stored: the previous split and its shares stay, and nothing reaches the server or History, until it adds up.
  const holding = holdsBack(seen, itemId, unconfirmed, lastTyped);
  // Amounts that went over the price because the price was lowered are not saved either.
  const unsaved = holding || refusal === "amountOverPrice";

  if (last !== current) {
    setLast(current);
    const has = (on: Split) => on.receipt.items.some(({ id }) => id === itemId);
    if (!leavingFrom && has(last) && !has(current)) {
      const was = Object.keys(unconfirmed).length > 0 ? applyOperation(last, patch(unconfirmed), { creator: false }) : null;
      setLeavingFrom(was?.ok ? was.split : last);
      setTaken(true);
    }
  }

  const flush = () => {
    const { sendable: sending, held: keeping } = holding ? divide(mine) : { sendable: mine, held: {} };
    if (Object.keys(sending).length === 0 || (refusal && !holding) || leavingFrom) return;
    const withSent = live && sent.length > 0 ? applyOperation(split, patch(sent.reduce(merge, {})), { creator: false }) : null;
    const base = withSent?.ok ? withSent.split.receipt.items.find(({ id }) => id === itemId) : live;
    if (base && showsAsBefore(base, sending)) {
      setPending(keeping);
      return;
    }
    setPending(keeping);
    setSent((was) => [...was, sending]);
    void send(patch(sending)).then(({ ok }) => {
      setSent((was) => was.filter((edit) => edit !== sending));
      setProblem(ok ? null : say.saveFailed);
    });
  };
  const holds = () => {
    if (leavingFrom || (unread.size === 0 && !unsaved)) return false;
    setHeld(true);
    return true;
  };
  useLayoutEffect(() => {
    flushRef.current = flush;
    currentRef.current = current;
    guardRef.current = holds;
  });
  useEffect(
    () => () => {
      guardRef.current = null;
    },
    [guardRef],
  );

  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const timer = setTimeout(() => flushRef.current(), saveAfter);
    return () => clearTimeout(timer);
  }, [pending, live]);
  useEffect(() => () => flushRef.current(), []);
  const closeTaken = useEffectEvent(onClose);
  useEffect(() => {
    if (taken) closeTaken();
  }, [taken]);

  const forget = (gone: (field: AmountField) => boolean) => {
    const next = new Map([...unread].filter(([field]) => !gone(field)));
    setUnread(next);
    if (next.size === 0) setHeld(false);
  };
  // Each claimer's Share breakdown is costly on a big Split, so the parts recompute when the Split, the price or the split changes, not on every keystroke in the name.
  // `split` stands in for `seen`, since the preview changes only this Item, which itemParts swaps in; a name or detail edit keeps the row's split object.
  const shownPrice = item?.price;
  const shownSplit = item?.split;
  const parts = useMemo((): Typed => {
    const row = split.receipt.items.find(({ id }) => id === itemId);
    return row && shownPrice !== undefined && shownSplit ? itemParts(split, { ...row, price: shownPrice, split: shownSplit }) : [];
  }, [split, itemId, shownPrice, shownSplit]);
  if (item && shown && item.split.by !== shown.split.by) {
    const { from, left } = fade ?? settled;
    if (from > unseen) {
      const ms = Math.round(rowsFadeOut * from);
      setLeaving({ item: shown, parts: itemParts(split, shown), from, ms });
      setEnterAfter(ms);
    } else {
      setEnterAfter(left);
    }
    setFade(null);
    setShown(item);
    forget((field) => field !== "price");
  }
  if (!item) return null;
  const edit = (next: ItemEdit) => {
    if (next.values && next.values.length > 0) setTypedFor(next.by ?? item.split.by);
    setPending((was) => merge(was, next));
  };
  const typedAmount = (field: AmountField, text: string): Cents | null => {
    const amount = readAmount(text);
    if (typeof amount === "number") {
      if (unread.has(field)) forget((other) => other === field);
      return amount;
    }
    if (unread.get(field) !== amount) setUnread(new Map([...unread, [field, amount]]));
    return null;
  };
  const unreadProblem = held ? [...unread][0] : undefined;
  const shownProblem = unreadProblem ? amountProblem(...unreadProblem) : problem;
  const had = claimersOf(item.split);
  const nameOf = (id: ParticipantId) => split.participants.find((person) => person.id === id)?.name ?? "";
  const toggle = (participantId: ParticipantId, on: boolean) => {
    flush();
    void send({ by: me, type: on ? "unclaim" : "claim", itemId, participantId });
  };
  // Close never takes focus, so a held sheet keeps its field and the keyboard. A closing sheet drops the keyboard as it leaves.
  const close = () => {
    if (!holds()) Keyboard.dismiss();
    flush();
    onClose();
  };
  // The fields show the row's two lines. When the row splits a size off the name, the first edit to either field saves that size as the detail, so the row keeps both lines.
  const [title, line] = nameParts(item);
  const sized = item.detail === undefined && line !== null;
  const leave = (op: Operation, then?: (answer: Extract<Answer, { ok: true }>) => void) => {
    setLeavingFrom(seen);
    void send(op).then((answer) => {
      if (answer.ok) then?.(answer);
      if (answer.ok || !currentRef.current.receipt.items.some(({ id }) => id === itemId)) return onClose();
      setLeavingFrom(null);
      setFields((was) => was + 1);
      forget(() => true);
      setProblem(say.saveFailed);
    });
  };
  const onlyItem = split.receipt.items.length < 2;
  const remove = () => {
    if (leavingFrom) return;
    if (onlyItem) return onNote(say.lastItem);
    flushRef.current = () => {};
    leave({ by: me, type: "editReceipt", items: [{ type: "delete", itemId }] }, ({ revision }) => revision !== null && onDeleted({ name: title, revision }));
  };
  const note = bundleNote(seen.receipt, itemId, item.price);
  const quantity = item.quantity ?? 1;
  const typed = typedAmounts(lineAmounts(item).map(({ participantId, cents }) => [participantId, cents] as const), unconfirmed);
  const fill = (participantId: ParticipantId, cents: number) => {
    forget((field) => field === participantId);
    edit({ values: [{ participantId, value: cents }] });
    setRefills(new Map([...refills, [participantId, (refills.get(participantId) ?? 0) + 1]]));
  };
  const splitLine = () => {
    const [first, ...rest] = splitIds(split.receipt, item);
    if (!first || leavingFrom) return;
    flush();
    leave({ by: me, type: "editReceipt", items: [{ type: "split", itemId, ids: [first, ...rest] }] });
  };
  const body = (shownItem: SplitItem, shownParts: Typed, as: Typed, editable: boolean) => (
    <>
      <SplitRows key={editable ? fields : undefined} item={shownItem} parts={shownParts} nameOf={nameOf} edit={editable ? edit : noEdit} typedAmount={editable ? typedAmount : noAmount} refills={editable ? refills : noRefills} />
      <StatusLine item={shownItem} typed={as} last={editable ? lastTyped : null} unsaved={editable && unsaved} nameOf={nameOf} onFill={editable ? fill : undefined} />
    </>
  );

  return (
    <View style={styles.sheet} pointerEvents={leavingFrom ? "none" : "auto"}>
      <SheetHeader
        title={say.editItem}
        onClose={close}
        keepsFocus
        action={<IconAction label={say.deleteItem} icon="trash" size={15} pressedInk="warn" dim={onlyItem} keepsFocus onPress={remove} />}
      />
      <View style={styles.body}>
        <View style={styles.pair}>
          <LabeledField
            label={say.itemName}
            key={`name-${fields}`}
            placeholder={say.itemNamePlaceholder}
            defaultValue={title}
            onChangeText={(name) => name.trim() && edit({ name: name.trim(), ...(sized && { detail: line }) })}
            enterKeyHint="done"
          />
          <MoneyField
            label={say.price}
            key={`price-${fields}`}
            placeholder={plainAmount(0)}
            defaultValue={plainAmount(item.price)}
            onChangeText={(text) => {
              const amount = typedAmount("price", text);
              if (amount !== null) edit({ price: toPrice(amount) });
            }}
            enterKeyHint="done"
            selectTextOnFocus
          />
        </View>
        {quantity > 1 ? (
          <View style={styles.quantity}>
            <Text style={[type.caption, { color: c.muted }]}>{say.quantity}</Text>
            <Text testID="quantity" style={[type.caption, tabular, { color: c.ink }]}>
              {quantity}
            </Text>
            <TextLink label={say.splitInto(quantity)} outsideScroll onPress={splitLine} />
          </View>
        ) : null}
        <View style={styles.detail}>
          <LabeledField
            label={say.itemDetail}
            key={`detail-${fields}`}
            placeholder={say.addDetail}
            defaultValue={line ?? ""}
            maxLength={MAX_DETAIL_LENGTH}
            onChangeText={(detail) => edit({ detail: detail.trim(), ...(sized && { name: title }) })}
            enterKeyHint="done"
          />
        </View>
        {note ? (
          <View style={styles.note}>
            <Icon name="bag" size={15} color={c.muted} />
            <Text style={[type.caption, styles.noteText, { color: c.muted }]}>{note}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Icon name="people" size={16} color={c.muted} />
            <Text numberOfLines={1} style={[type.caption, styles.hintLead, { color: c.ink }]}>
              {say.whoHadIt}
            </Text>
            <Text numberOfLines={1} style={[type.caption, styles.hint, { color: c.muted }]}>
              {say.whoHint}
            </Text>
          </View>
          <View role="group" aria-label={say.whoHadIt} style={styles.people}>
            {split.participants.map((person) => {
              const on = had.includes(person.id);
              return <PersonToggle key={person.id} name={person.name} on={on} onPress={() => toggle(person.id, on)} />;
            })}
          </View>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Icon name="pie" size={16} color={c.muted} />
            <Text style={[type.caption, { color: c.ink }]}>{say.split}</Text>
            <Text style={[type.caption, tabular, { color: c.ink }]}>{money(item.price)}</Text>
          </View>
          <Options
            options={SPLIT_MODES}
            labels={say.modes}
            name={say.split}
            value={item.split.by}
            onChange={(by) => {
              if (by !== item.split.by) setFade({ from: opacityOf(incomingRef.current), left: msLeft(leavingRef.current) });
              edit({ by });
            }}
          />
          <Text style={[type.caption, styles.modeHint, { color: c.muted }]}>{say.modeHints[item.split.by]}</Text>
          <View>
            <View ref={incomingRef} key={item.split.by} style={[styles.rows, reduce ? null : enterAfter === null ? rowsEnter : [rowsEnterAfter, webStyle({ animationDelay: `${enterAfter}ms` })]]}>
              {body(item, parts, typed, true)}
            </View>
            {leaving && !reduce ? (
              <View ref={leavingRef} key={`${leaving.item.split.by}-leaving`} pointerEvents="none" style={[styles.leaving, styles.rows, { opacity: leaving.from }]}>
                {body(leaving.item, leaving.parts, lineAmounts(leaving.item), false)}
              </View>
            ) : null}
          </View>
        </View>
        {shownProblem ? (
          <Text role="status" style={[type.caption, { color: c.warn }]}>
            {shownProblem}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** What each amount field holds as typed, which the Item does not show while the amounts are over the price. */
type Typed = readonly { readonly participantId: ParticipantId; readonly cents: number }[];

const noEdit = () => {};
const noAmount = () => null;
const noRefills: ReadonlyMap<ParticipantId, number> = new Map();

type SplitRowsProps = {
  item: SplitItem;
  /** Each claimer's part as the list and the Pay sheet show it. */
  parts: Typed;
  nameOf: (id: ParticipantId) => string;
  edit: (next: ItemEdit) => void;
  typedAmount: (field: ParticipantId, text: string) => Cents | null;
  refills: ReadonlyMap<ParticipantId, number>;
};

function SplitRows({ item, parts, nameOf, edit, typedAmount, refills }: SplitRowsProps) {
  const c = useColors();
  return (
    <>
      {parts.map(({ participantId, cents: amount }, index) => {
        const shares = item.split.by === "shares" ? (item.split.units[0][index]?.[1] ?? 1) : 0;
        const value = (next: number): ItemValue => ({ participantId, value: next });
        return (
          <View key={participantId} style={styles.splitRow}>
            <Text numberOfLines={1} style={[type.body, styles.whoName, { color: c.ink }]}>
              {nameOf(participantId)}
            </Text>
            <View style={styles.part}>
              {item.split.by === "shares" ? (
                <Stepper value={shares} min={1} max={MAX_SHARES} onChange={(next) => edit({ values: [value(next)] })} names={[say.fewerShares(nameOf(participantId)), say.moreShares(nameOf(participantId))]} />
              ) : null}
              {item.split.by === "amount" ? (
                <MoneyField
                  key={refills.get(participantId) ?? 0}
                  label={say.amountOf(nameOf(participantId))}
                  showLabel={false}
                  width={88}
                  defaultValue={amount === 0 ? "" : plainAmount(amount)}
                  placeholder={plainAmount(0)}
                  onChangeText={(text) => {
                    const read = typedAmount(participantId, text.trim() === "" ? "0" : text);
                    if (read !== null) edit({ values: [value(read)] });
                  }}
                  selectTextOnFocus
                />
              ) : (
                <Text style={[type.body, tabular, styles.amount, { color: c.ink }]}>{money(amount)}</Text>
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}

function amountProblem(field: AmountField, problem: "price" | "overLimit"): string {
  if (field === "price") return problem === "price" ? say.addProblem.price : say.addProblem.overLimit(maxAmount);
  return problem === "price" ? say.adjustmentProblem.amount : say.adjustmentProblem.overLimit(maxAmount);
}

type StatusProps = { item: SplitItem; typed: Typed; last: ParticipantId | null; unsaved: boolean; nameOf: (id: ParticipantId) => string; onFill?: (participantId: ParticipantId, cents: number) => void };

/** Where the split stands: a tick when it adds up, a warning with the gap when a By amount split does not. */
function StatusLine({ item, typed, last, unsaved, nameOf, onFill }: StatusProps) {
  const c = useColors();
  const people = lineAmounts(item).length;
  const amounts = item.split.by === "amount" && people > 0 ? amountStatus(item.price, typed, last) : null;
  const off = amounts !== null && amounts.by !== "exact";
  const words =
    people === 0
      ? say.nobodyHasThis
      : amounts === null
        ? say.peopleLine(people, money(item.price))
        : amounts.by === "exact"
          ? say.allAssigned(money(item.price))
          : amounts.by === "over"
            ? say.overThePrice(money(amounts.over))
            : say.leftToAssign(money(amounts.left));
  const fillWith = amounts !== null && amounts.by !== "exact" ? amounts.fill : null;
  return (
    <View style={styles.status}>
      <View style={styles.statusWords}>
        <Icon name={people === 0 || off ? "exclaim" : "check"} size={people === 0 || off ? 15 : 14} color={off ? c.warn : c.muted} />
        <Text testID={amounts ? "amount-status" : undefined} numberOfLines={1} style={[type.caption, tabular, styles.statusText, { color: off ? c.warn : c.muted }]}>
          {words}
        </Text>
        {unsaved ? <Text style={[type.caption, { color: c.warn }]}>{say.notSaved}</Text> : null}
      </View>
      {fillWith && onFill ? <TextLink label={say.giveTheRest(nameOf(fillWith.participantId))} name={say.giveTheRestName(nameOf(fillWith.participantId), money(fillWith.cents))} outsideScroll onPress={() => onFill(fillWith.participantId, fillWith.cents)} /> : null}
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
    <View style={styles.stepper}>
      <IconAction label={names[0]} icon="minus" size={13} disabled={value <= min} pressedInk="ink" onPress={() => step(-1)} />
      <Text aria-live="polite" style={[type.caption, tabular, styles.count, { color: c.muted }]}>
        {say.shares(value)}
      </Text>
      <IconAction label={names[1]} icon="plus" size={13} disabled={value >= max} pressedInk="ink" onPress={() => step(1)} />
    </View>
  );
}

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

type Leaving = { item: SplitItem; parts: Typed; from: number; ms: number };
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
  sheet: { gap: 10 },
  body: { gap: 24 },
  pair: { flexDirection: "row", alignItems: "flex-end", gap: 20 },
  detail: { marginTop: -8 },
  quantity: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -16 },
  note: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteText: { flexShrink: 1 },
  section: { gap: 8 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  people: { flexDirection: "row", flexWrap: "wrap", columnGap: 4 },
  modeHint: { marginTop: -4 },
  rows: { gap: 0 },
  leaving: { position: "absolute", top: 0, left: 0, right: 0 },
  splitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  whoName: { flexShrink: 1 },
  part: { flexDirection: "row", alignItems: "center", gap: 6 },
  amount: { minWidth: 60, textAlign: "right" },
  stepper: { flexDirection: "row", alignItems: "center" },
  count: { minWidth: 56, textAlign: "center" },
  hintLead: { flexShrink: 0 },
  hint: { flexShrink: 1 },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, marginTop: 8 },
  statusWords: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  statusText: { flexShrink: 0 },
});
