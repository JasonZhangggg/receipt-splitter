import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Keyboard, Platform, StyleSheet, Text, View } from "react-native";

import { MAX_CENTS, price as toPrice, type Cents } from "../../core/money";
import { MAX_DETAIL_LENGTH, MAX_SHARES, applyOperation, claimersOf, type ItemPatch, type ItemValue, type Operation } from "../../core/operations";
import { type SplitMode, type ItemId, type Participant, type ParticipantId, type Split, type SplitItem } from "../../core/split";
import { money, plainAmount } from "../../draft";
import type { Answer } from "../../live/client";
import type { Lay } from "../lay";
import { Icon } from "../components/icon";
import { SectionHead } from "../components/section-head";
import { PressTarget, type Press } from "../components/button";
import { IconAction, LabeledField, MoneyField, PersonToggle } from "../components/sheet-fields";
import { TextLink, linkPress, underline } from "../components/text-link";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { failedCopy, splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors, useOnPage } from "../theme";
import { bundleNote, itemParts, lineAmounts, nameParts, splitIds } from "../split-view/model";
import type { CloseGuard } from "../adjustment-sheet";
import { amountStatus, suggestedAmounts } from "./amount-status";
import { readAmount } from "./new-item";
import { viewerFirst } from "../pay/model";
import { SheetHeader } from "../split-view/sheet-header";

type ItemEdit = Omit<Extract<ItemPatch, { type: "edit" }>, "type" | "itemId">;

type Props = {
  split: Split;
  itemId: ItemId;
  me: ParticipantId | null;
  send: (op: Operation) => Promise<Answer>;
  lay: Lay;
  onClose: () => void;
  /** A line the sheet cannot act on, said in the page's bar while the sheet stays open. */
  onNote: (message: string) => void;
  /** The Item is gone; `revision` is the one an Undo names. */
  onDeleted: (deleted: { readonly name: string; readonly revision: number }) => void;
  guardRef: RefObject<CloseGuard | null>;
  /** Opens the menu of ways to split from the mode link; `pick` applies one. The page holds the popover, since it floats over the sheet. */
  onModes: (open: ModesOpen) => void;
  /** The menu is open, so the link says it is expanded. */
  modesOpen: boolean;
};

export type ModesOpen = { readonly from: Press; readonly value: SplitMode; readonly pick: (by: SplitMode) => void };

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

function holdsBack(seen: Split, itemId: ItemId, live: SplitItem | undefined, edit: ItemEdit, last: ParticipantId | null): boolean {
  const row = seen.receipt.items.find(({ id }) => id === itemId);
  if (!row || row.split.by !== "amount" || row.split.units[0].length === 0 || Object.keys(divide(edit).held).length === 0) return false;
  const typed = typedAmounts(row.split.units[0], edit);
  // Amounts typed back to what is stored, such as a remainder left by a price raise, change nothing, so there is nothing to hold.
  const stored = live?.split.by === "amount" ? live.split.units[0] : null;
  if (edit.by !== "even" && edit.by !== "shares" && stored?.length === typed.length && typed.every(({ participantId, cents }, at) => stored[at]?.[0] === participantId && stored[at]?.[1] === cents)) return false;
  return amountStatus(row.price, typed, last).by !== "exact";
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

export function ItemSheet({ split: current, itemId, me, send, lay, onClose, onNote, onDeleted, guardRef, onModes, modesOpen }: Props) {
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
  // The price field is uncontrolled and keeps what was typed ("1234.5"); leaving it remounts the field on the plain two-decimal price ("1234.50") the sheet already shows, unless the text is not an amount.
  const [priceKey, setPriceKey] = useState(0);

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
  const holding = holdsBack(seen, itemId, live, unconfirmed, lastTyped);
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
    void send(patch(sending)).then((answer) => {
      setSent((was) => was.filter((edit) => edit !== sending));
      // An edit that timed out may have been applied; the Split the server then sent already shows it, so there is nothing to complain about.
      const again = answer.ok ? null : applyOperation(currentRef.current, patch(sending), { creator: false });
      const landed = again?.ok === true && JSON.stringify(again.split.receipt) === JSON.stringify(currentRef.current.receipt);
      const failed = !answer.ok && !landed;
      setProblem(failed ? failedCopy(answer, say.saveFailed) : null);
      if (failed) setFields((was) => was + 1);
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
  const closeTaken = useEffectEvent(() => {
    const gone = leavingFrom?.receipt.items.find(({ id }) => id === itemId);
    if (gone) onNote(say.removedElsewhere(nameParts(gone)[0]));
    onClose();
  });
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
    return row && shownPrice !== undefined && shownSplit ? itemParts(split, { ...row, price: shownPrice, split: shownSplit }, me) : [];
  }, [split, itemId, shownPrice, shownSplit, me]);
  if (item && shown && item.split.by !== shown.split.by) {
    const { from, left } = fade ?? settled;
    if (from > unseen) {
      const ms = Math.round(rowsFadeOut * from);
      setLeaving({ item: shown, parts: itemParts(split, shown, me), from, ms });
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
  const nameOf = (id: ParticipantId) => split.participants.find((person) => person.id === id)?.name ?? "";
  const toggle = (participantId: ParticipantId, on: boolean) => {
    flush();
    // The dot and the Shares follow at once; the page's bar says if it didn't apply.
    if (!lay({ by: me, type: on ? "unclaim" : "claim", itemId, participantId })) onNote(say.connection.failed);
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
  const leave = (op: Operation) => {
    setLeavingFrom(seen);
    void send(op).then((answer) => {
      if (answer.ok || !currentRef.current.receipt.items.some(({ id }) => id === itemId)) return onClose();
      setLeavingFrom(null);
      setFields((was) => was + 1);
      forget(() => true);
      setProblem(failedCopy(answer, say.saveFailed));
    });
  };
  const remove = () => {
    if (leavingFrom) return;
    // The line leaves the page and the sheet closes at once, on the picture it had. The Undo bar comes with the server's answer; a refusal puts the line back and says so in the bar.
    if (!lay({ by: me, type: "editReceipt", items: [{ type: "delete", itemId }] }, { then: ({ revision }) => revision !== null && onDeleted({ name: title, revision }) })) return setProblem(say.connection.failed);
    flushRef.current = () => {};
    setLeavingFrom(seen);
    onClose();
  };
  const note = bundleNote(seen.receipt, itemId, item.price);
  const quantity = item.quantity ?? 1;
  const typed = typedAmounts(lineAmounts(item).map(({ participantId, cents }) => [participantId, cents] as const), unconfirmed);
  const fill = (participantId: ParticipantId, cents: number) => {
    forget((field) => field === participantId);
    edit({ values: [{ participantId, value: cents }] });
    setRefills(new Map([...refills, [participantId, (refills.get(participantId) ?? 0) + 1]]));
  };
  const accept = (all: readonly { participantId: ParticipantId; cents: number }[]) => {
    forget((field) => field !== "price");
    edit({ values: all.map(({ participantId, cents }) => ({ participantId, value: cents })) });
    setRefills(new Map([...refills, ...all.map(({ participantId }): [ParticipantId, number] => [participantId, (refills.get(participantId) ?? 0) + 1])]));
  };
  const splitLine = () => {
    const [first, ...rest] = splitIds(split.receipt, item);
    if (!first || leavingFrom) return;
    flush();
    leave({ by: me, type: "editReceipt", items: [{ type: "split", itemId, ids: [first, ...rest] }] });
  };
  const people = viewerFirst(split.participants, me);
  const body = (shownItem: SplitItem, shownParts: Typed, as: Typed, editable: boolean) => {
    const suggested = shownItem.split.by === "amount" && !held ? suggestedAmounts(shownItem.price, as, editable ? lastTyped : null) : null;
    return (
      <>
        <SplitRows key={editable ? fields : undefined} item={shownItem} people={people} parts={shownParts} nameOf={nameOf} me={me} edit={editable ? edit : noEdit} toggle={editable ? toggle : noToggle} typedAmount={editable ? typedAmount : noAmount} refills={editable ? refills : noRefills} suggested={suggested} />
        <StatusLine item={shownItem} typed={as} last={editable ? lastTyped : null} unsaved={editable && unsaved} attempted={editable && held} nameOf={nameOf} me={me} onFill={editable ? fill : undefined} suggested={suggested} onAccept={editable ? accept : undefined} />
      </>
    );
  };
  const pick = (by: SplitMode) => {
    if (by !== item.split.by) setFade({ from: opacityOf(incomingRef.current), left: msLeft(leavingRef.current) });
    edit({ by });
  };

  return (
    <View style={styles.sheet} pointerEvents={leavingFrom ? "none" : "auto"}>
      <SheetHeader
        title={say.editItem}
        onClose={close}
        keepsFocus
        action={<IconAction label={say.deleteItem} icon="trash" size={15} pressedInk="warn" keepsFocus onPress={remove} />}
      />
      <View style={styles.body}>
        <View style={styles.pair}>
          <LabeledField
            label={say.itemName}
            key={`name-${fields}`}
            prefix={quantity > 1 ? say.times(quantity) : undefined}
            placeholder={say.itemNamePlaceholder}
            defaultValue={title}
            onChangeText={(name) => name.trim() && edit({ name: name.trim(), ...(sized && { detail: line }) })}
            enterKeyHint="done"
          />
          <MoneyField
            label={say.price}
            key={`price-${fields}-${priceKey}`}
            onBlur={() => unread.has("price") || setPriceKey((was) => was + 1)}
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
        {quantity > 1 ? (
          <View style={styles.quantity}>
            <TextLink ink icon="split" label={say.splitInto(quantity)} outsideScroll onPress={splitLine} />
          </View>
        ) : null}
        {note ? (
          <View style={styles.note}>
            <Icon name="bag" size={15} color={c.muted} />
            <Text style={[type.caption, styles.noteText, { color: c.muted }]}>{note}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
          <SectionHead label={say.whoHadIt} main>
            <PressTarget name={say.modeFor(say.modes[item.split.by])} popup="dialog" expanded={modesOpen} outsideScroll onPress={(from) => onModes({ from, value: item.split.by, pick })} style={(pressed) => [styles.mode, pressStyle(pressed, reduce, linkPress)]}>
              {() => (
                <View style={styles.modeFace}>
                  <Text testID="split-mode" style={[type.caption, underline, { color: c.ink, textDecorationColor: c.ink }]}>
                    {say.modes[item.split.by]}
                  </Text>
                  <Icon name="chevron" size={12} color={c.ink} />
                </View>
              )}
            </PressTarget>
          </SectionHead>
          <View testID="split-rows">
            <View ref={incomingRef} key={item.split.by} style={[styles.rows, reduce ? null : enterAfter === null ? rowsEnter : [rowsEnterAfter, webStyle({ animationDelay: `${enterAfter}ms` })]]}>
              {body(item, parts, typed, true)}
            </View>
            {leaving && !reduce ? (
              <View ref={leavingRef} key={`${leaving.item.split.by}-leaving`} pointerEvents="none" aria-hidden style={[styles.leaving, styles.rows, { opacity: leaving.from }]}>
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
const noToggle = () => {};

type SplitRowsProps = {
  item: SplitItem;
  /** Everyone on the Split, the viewer first: each gets a row, with their part when they had the Item. */
  people: readonly Participant[];
  /** Each claimer's part as the list and the Pay sheet show it. */
  parts: Typed;
  nameOf: (id: ParticipantId) => string;
  me: ParticipantId | null;
  edit: (next: ItemEdit) => void;
  toggle: (participantId: ParticipantId, on: boolean) => void;
  typedAmount: (field: ParticipantId, text: string) => Cents | null;
  refills: ReadonlyMap<ParticipantId, number>;
  /** The even split offered in the empty amount fields as muted placeholders; the Split holds none of it. */
  suggested: readonly { participantId: ParticipantId; cents: number }[] | null;
};

/** One row a person: their dot and name, which add or drop them, then their part of the price in the Item's mode. */
function SplitRows({ item, people, parts, nameOf, me, edit, toggle, typedAmount, refills, suggested }: SplitRowsProps) {
  const c = useColors();
  return (
    <View role="group" aria-label={say.whoHadIt}>
      {people.map((person) => {
        const participantId = person.id;
        const part = parts.find((each) => each.participantId === participantId);
        const you = participantId === me;
        const shares = item.split.by === "shares" ? (item.split.units[0].find(([id]) => id === participantId)?.[1] ?? 1) : 0;
        const value = (next: number): ItemValue => ({ participantId, value: next });
        return (
          <View key={participantId} style={styles.splitRow}>
            <PersonToggle name={you ? `${person.name}, ${say.you}` : person.name} label={you ? say.youHad : person.name} on={part !== undefined} onPress={() => toggle(participantId, part !== undefined)} />
            {part === undefined ? (
              <Text style={[type.caption, styles.didntHave, { color: c.muted }]}>{say.didntHave}</Text>
            ) : (
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
                    defaultValue={part.cents === 0 ? "" : plainAmount(part.cents)}
                    placeholder={plainAmount(suggested?.find((each) => each.participantId === participantId)?.cents ?? 0)}
                    onChangeText={(text) => {
                      const read = typedAmount(participantId, text.trim() === "" ? "0" : text);
                      if (read !== null) edit({ values: [value(read)] });
                    }}
                    selectTextOnFocus
                  />
                ) : (
                  <Text style={[type.body, tabular, styles.amount, { color: c.ink }]}>{money(part.cents)}</Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function amountProblem(field: AmountField, problem: "price" | "overLimit"): string {
  if (field === "price") return problem === "price" ? say.addProblem.price : say.addProblem.overLimit(maxAmount);
  return problem === "price" ? say.adjustmentProblem.amount : say.adjustmentProblem.overLimit(maxAmount);
}

type StatusProps = { item: SplitItem; typed: Typed; last: ParticipantId | null; unsaved: boolean; /** The user tried to close with the amounts not adding up. */ attempted: boolean; nameOf: (id: ParticipantId) => string; me: ParticipantId | null; onFill?: (participantId: ParticipantId, cents: number) => void; suggested: readonly { participantId: ParticipantId; cents: number }[] | null; onAccept?: (all: readonly { participantId: ParticipantId; cents: number }[]) => void };

/** Where the split stands: a tick when it adds up, a warning with the gap when a By amount split does not. */
function StatusLine({ item, typed, last, unsaved, attempted, nameOf, me, onFill, suggested, onAccept }: StatusProps) {
  const c = useColors();
  const onPage = useOnPage();
  const lines = lineAmounts(item);
  const people = lines.length;
  const amounts = item.split.by === "amount" && people > 0 ? amountStatus(item.price, typed, last) : null;
  // Right after switching to By amount nothing is typed, so the whole price is left; that is a starting point, not a mistake, until an amount is typed or Close is tried.
  const fresh = amounts?.by === "left" && amounts.assigned === 0 && last === null && !attempted;
  const off = amounts !== null && amounts.by !== "exact" && !fresh;
  const words =
    suggested
      ? say.suggestedEven
      : people === 0
      ? onPage ? say.nobodyHasThisClick : say.nobodyHasThis
      : amounts === null
        ? people === 1
          ? lines[0].participantId === me
            ? say.youPayAll
            : say.paysAll(nameOf(lines[0].participantId))
          : item.split.by === "shares"
            ? say.sharesInAll(item.split.units[0].reduce((sum, [, count]) => sum + count, 0))
            : say.splitWays(people)
        : amounts.by === "exact"
          ? say.allAssigned(money(item.price))
          : amounts.by === "over"
            ? say.overThePrice(money(amounts.over))
            : say.leftToAssign(money(amounts.left));
  const fillWith = amounts !== null && amounts.by !== "exact" && !suggested ? amounts.fill : null;
  return (
    <View style={styles.status}>
      <View style={styles.statusWords}>
        {fresh ? null : <Icon name={people === 0 || off ? "exclaim" : "check"} size={people === 0 || off ? 15 : 14} color={off ? c.warn : c.muted} />}
        <Text testID={amounts ? "amount-status" : undefined} numberOfLines={1} style={[type.caption, tabular, styles.statusText, { color: off ? c.warn : c.muted }]}>
          {words}
        </Text>
        {unsaved && !fresh ? <Text style={[type.caption, { color: c.warn }]}>{say.notSaved}</Text> : null}
      </View>
      {suggested && onAccept ? <TextLink label={say.useSuggested} name={say.useSuggestedName} outsideScroll onPress={() => onAccept(suggested)} /> : null}
      {fillWith && onFill ? (
        <TextLink
          label={amounts?.by === "over" ? say.makeAmount(nameOf(fillWith.participantId), money(fillWith.cents)) : say.giveTheRest(nameOf(fillWith.participantId))}
          name={amounts?.by === "over" ? undefined : say.giveTheRestName(nameOf(fillWith.participantId), money(fillWith.cents))}
          outsideScroll
          onPress={() => onFill(fillWith.participantId, fillWith.cents)}
        />
      ) : null}
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
  quantity: { marginTop: -16, marginBottom: -12 },
  note: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteText: { flexShrink: 1 },
  section: { gap: 8, marginTop: 20 },
  rows: { gap: 0 },
  leaving: { position: "absolute", top: 0, left: 0, right: 0 },
  splitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  whoName: { flexShrink: 1 },
  part: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  didntHave: { flexShrink: 0 },
  amount: { minWidth: 60, textAlign: "right" },
  stepper: { flexDirection: "row", alignItems: "center" },
  count: { minWidth: 56, textAlign: "center" },
  mode: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginHorizontal: -12, marginVertical: -12 },
  modeFace: { flexDirection: "row", alignItems: "center", gap: 4 },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, marginTop: 8 },
  statusWords: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  statusText: { flexShrink: 0 },
});
