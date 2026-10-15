import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents, type Cents } from "../../src/core/money";
import { claimersOf, type Operation } from "../../src/core/operations";
import { pickDevice } from "../../src/core/pick-device";
import { computeShares, shareBreakdown } from "../../src/core/shares";
import { isRoutableSplitId, type AdjustmentId, type Participant, type ItemId, type ParticipantId, type Split, type SplitId, type SplitItem } from "../../src/core/split";
import { applyChange, forgetSplit, noteSplit, rememberSplit, type SplitChange, splitOnDevice, thisDevice, type SplitOnDevice } from "../../src/device";
import { money, newName } from "../../src/draft";
import { newParticipantId, splitUrl, useLiveSplit, type GoneReason } from "../../src/live/client";
import { actedByKey } from "../../src/ui/components/acted-by-key";
import { Toast } from "../../src/ui/components/toast";
import { Button, type Press } from "../../src/ui/components/button";
import { Popover, useEscape } from "../../src/ui/components/popover";
import { AdjustmentSheet, type CloseGuard } from "../../src/ui/adjustment-sheet";
import { HistorySheet } from "../../src/ui/history";
import { PaymentsSheet } from "../../src/ui/pay/payments-sheet";
import { joinCopy } from "../../src/ui/home-copy";
import { ItemSheet } from "../../src/ui/item-sheet";
import { AddSheet } from "../../src/ui/item-sheet/add";
import { PhotoViewer, ReceiptSheet } from "../../src/ui/photo-viewer";
import { splitCopy as say } from "../../src/ui/split-copy";
import { SplitHeader } from "../../src/ui/split-view/header";
import { circleTap, linesNear } from "../../src/ui/split-view/model";
import { PeopleSheet, type PersonRow } from "../../src/ui/split-view/people-sheet";
import { ViewingLine } from "../../src/ui/split-view/viewing-line";
import { PersonMenu, personMenuWidth } from "../../src/ui/split-view/person-menu";
import { ClaimConfirm, claimConfirmWidth } from "../../src/ui/split-view/claim-confirm";
import { holdOf, takenName } from "../../src/ui/split-view/name-hold";
import { ReceiptCard } from "../../src/ui/split-view/receipt-card";
import { useLayoutHeight, useLayoutWidth } from "../../src/ui/components/viewport";
import { BottomSheet } from "../../src/ui/split-view/bottom-sheet";
import { SplitFooter } from "../../src/ui/split-view/footer";
import { SplitIntro } from "../../src/ui/split-view/intro";
import { PayBody, firstName, payFacts, payTitle } from "../../src/ui/pay/pay-sheet";
import { PayBlock } from "../../src/ui/pay/pay-block";
import { shareStatus, statusWords } from "../../src/ui/pay/model";
import { webStyle } from "../../src/ui/motion";
import { breakpoints, layout, type, useColors } from "../../src/ui/theme";

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const splitId = isRoutableSplitId(id) ? id : null;
  const { live, send } = useLiveSplit(id);
  const expired = live.status === "gone" && live.reason === "notFound";
  useEffect(() => {
    if (expired && splitId) forgetSplit(splitId);
  }, [expired, splitId]);

  if (live.status === "live" && splitId) return <SplitPage key={splitId} splitId={splitId} split={live.split} photo={live.photo} send={send} />;
  return (
    <View style={[styles.screen, { backgroundColor: c.field, paddingTop: insets.top, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
      <View style={styles.column}>
        <SplitHeader />
        {live.status === "gone" ? (
          <Gone reason={live.reason} />
        ) : (
          <Text role="status" style={[type.body, styles.opening, { color: c.muted }]}>
            {joinCopy.opening}
          </Text>
        )}
      </View>
    </View>
  );
}

function Gone({ reason }: { reason: GoneReason }) {
  const c = useColors();
  const words = reason === "notFound" ? joinCopy.expired : joinCopy.unreadable;
  return (
    <View style={styles.gone}>
      <Text role="heading" aria-level={1} style={[type.hero, { color: c.ink }]}>
        {words.title}
      </Text>
      <Text style={[type.body, { color: c.muted }]}>{words.hint}</Text>
      <View style={styles.goneAction}>
        <Button kind="soft" label={joinCopy.newSplit} onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}

type Phase = "pick" | "collapsing" | "regular";
type OverlayKind =
  | { readonly kind: "item"; readonly itemId: ItemId; readonly lines: readonly ItemId[] }
  | { readonly kind: "add" }
  | { readonly kind: "adjustment"; readonly adjustmentId: AdjustmentId }
  | { readonly kind: "history" }
  | { readonly kind: "receipt" }
  | { readonly kind: "people" }
  | { readonly kind: "pay" }
  | { readonly kind: "payments"; readonly viewer: ParticipantId | null };
/** What is open over the page and the press that opened it: focus goes back there. */
type Overlay = OverlayKind & { readonly from: Press };
type Send = ReturnType<typeof useLiveSplit>["send"];
/** The one bar at the bottom of the page: an Undo for the last delete or payment, or a line to read. Over the sheet when the sheet stays open. */
type Bar = { readonly message: string; readonly action?: { readonly label: string; readonly onPress: () => void }; readonly over: "footer" | "sheet" };

/** An Adjustment's sheet is named for its saved kind; its heading follows a kind switch at once. */
const overlayLabel = (overlay: OverlayKind, split: Split, title: string) =>
  overlay.kind === "adjustment"
    ? say.editKind[split.receipt.adjustments.find(({ id }) => id === overlay.adjustmentId)?.kind ?? "tax"]
    : { item: say.editItem, add: say.addMenu, history: say.history, receipt: say.receiptPhoto, payments: say.payments, people: say.people, pay: title }[overlay.kind];
const checkFor = 80;
const tallPickTop = 170;

function SplitPage({ splitId, split, photo, send }: { splitId: SplitId; split: Split; photo: boolean; send: Send }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const pageHeight = useLayoutHeight();
  const wide = useLayoutWidth() >= breakpoints.pairFrom;
  const device = useMemo(() => pickDevice(thisDevice(), splitId), [splitId]);
  const [memory, setMemory] = useState<SplitOnDevice>(() => splitOnDevice(splitId));
  const remember = (change: SplitChange) => {
    rememberSplit(splitId, change);
    setMemory((current) => applyChange(current, change));
  };
  const held = split.picks.find((pick) => pick.participantId === memory.me);
  const me = memory.me && held?.device === device ? memory.me : null;
  const nameHold = useMemo(() => holdOf(split, memory.me, device), [split, memory.me, device]);
  const lastHold = useRef(nameHold);
  const [phase, setPhase] = useState<Phase>(me ? "regular" : "pick");
  const [chosen, setChosen] = useState<ParticipantId | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [payProblem, setPayProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParticipantId | null>(me);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [closing, setClosing] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [bar, setBar] = useState<Bar | null>(null);
  const [viewing, setViewing] = useState(false);
  // The viewer needs the photo. If it goes away mid-view the flag drops with it, so it cannot come back when a photo does and Escape keeps closing sheets.
  if (viewing && !photo) setViewing(false);
  const photoUrl = `/api/splits/${splitId}/photo`;
  useEffect(() => {
    if (photo) Image.prefetch(photoUrl).catch(() => {});
  }, [photo, photoUrl]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => noteSplit(split), [split]);

  const shares = useMemo(() => computeShares(split), [split]);
  const people = split.participants;
  // A selected person someone removed falls back to this device's own name.
  const selectedPerson = people.find((person) => person.id === selected) ?? people.find((person) => person.id === me) ?? null;
  const selfPerson = people.find((person) => person.id === me);
  const creating = memory.creatorSecret !== undefined;
  const act = (op: Operation) => send(op).then((answer) => answer.ok);

  const closeGuard = useRef<CloseGuard | null>(null);
  const closeOverlay = () => {
    if (closeGuard.current?.()) return;
    // A closing sheet drops the keyboard with it, whichever way it was closed.
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
    setClosing(true);
  };

  const choose = async (participantId: ParticipantId, takeOver: boolean) => {
    setPickProblem(null);
    setChosen(participantId);
    if (!(await act({ by: participantId, type: "pick", participantId, device, takeOver }))) {
      setChosen(null);
      return setPickProblem(say.pickFailed);
    }
    remember({ me: participantId });
    setSelected(participantId);
    // The pick sheet collapses on its own; a switch from the People sheet closes that sheet instead.
    if (phase === "pick") timers.current.push(setTimeout(() => setPhase("collapsing"), checkFor));
    else {
      setChosen(null);
      closeOverlay();
    }
  };

  const nameTaken = useEffectEvent((lost: ParticipantId) =>
    setBar({
      message: say.pickedOnAnotherPhone(people.find(({ id }) => id === lost)?.name ?? ""),
      action: {
        label: say.thatsMe,
        onPress: () => {
          setBar(null);
          void choose(lost, true);
        },
      },
      over: "footer",
    }),
  );
  useEffect(() => {
    const lost = takenName(lastHold.current, nameHold);
    lastHold.current = nameHold;
    if (lost) nameTaken(lost);
  }, [nameHold]);

  const addPerson = async (typed: string): Promise<{ readonly id: ParticipantId } | { readonly refused: string }> => {
    const named = newName(typed, people.map(({ name }) => name));
    if (!named.ok) return { refused: named.reason === "nameTaken" ? say.nameTaken : say.nameNeeded };
    const participant = { id: newParticipantId(), name: named.name };
    return (await act({ by: me, type: "addParticipant", participant })) ? { id: participant.id } : { refused: say.nameRefused };
  };

  const addYourself = async (typed: string) => {
    const added = await addPerson(typed);
    if ("refused" in added) return added.refused;
    await choose(added.id, false);
    return null;
  };

  // A circle tap for someone else asks once; a yes holds until the selection changes, even back to the same person.
  const [trusted, setTrusted] = useState<ParticipantId | null>(null);
  const [trustedOn, setTrustedOn] = useState(selected);
  if (trustedOn !== selected) {
    setTrustedOn(selected);
    setTrusted(null);
  }
  const [confirming, setConfirming] = useState<{ readonly itemId: ItemId; readonly name: string; readonly person: Participant; readonly had: boolean; readonly from: Press; readonly closing: boolean } | null>(null);
  const claim = async (itemId: ItemId, person: ParticipantId) => {
    const item = split.receipt.items.find(({ id }) => id === itemId);
    if (item && me) for (const op of circleTap(item, person)) await act({ ...op, by: me });
  };
  const onCircle = async (item: SplitItem, from: Press) => {
    if (!me || !selectedPerson) return setPhase("pick");
    if (selectedPerson.id !== me && trusted !== selectedPerson.id) {
      return setConfirming({ itemId: item.id, name: item.name, person: selectedPerson, had: claimersOf(item.split).includes(selectedPerson.id), from, closing: false });
    }
    await claim(item.id, selectedPerson.id);
  };
  const closeConfirming = () => setConfirming((open) => open && { ...open, closing: true });
  const confirmClaim = () => {
    if (!confirming || confirming.closing) return;
    setTrusted(confirming.person.id);
    closeConfirming();
    void claim(confirming.itemId, confirming.person.id);
  };
  const confirmingGone = () => {
    if (confirming && (wide || confirming.from.keyboard || actedByKey()) && confirming.from.trigger.isConnected) confirming.from.trigger.focus({ preventScroll: true });
    setConfirming(null);
  };

  const share = async () => {
    const url = splitUrl(splitId);
    // A cancelled share sheet rejects, and that is not a failure. Only the copy fallback has a result to show.
    if (typeof navigator.share === "function") return void (await navigator.share({ url }).catch(() => {}));
    const copied = await (navigator.clipboard?.writeText(url).then(() => true) ?? Promise.resolve(false)).catch(() => false);
    setBar({ message: copied ? say.linkCopied : say.copyFailed, over: "footer" });
  };

  const myShare = shares.shares.find((row) => row.participantId === me)?.share ?? cents(0);
  const markPaid = async (payer: ParticipantId, amount: Cents | null) => {
    setPayProblem(null);
    const answer = await send(amount !== null ? { by: payer, type: "recordPayment", participantId: payer, device, amount } : { by: payer, type: "clearPayment", participantId: payer, device });
    if (!answer.ok) setPayProblem(answer.rejection.reason === "payerOnly" ? say.payerOnly : say.saveFailed);
    return answer.ok;
  };

  // The menu keeps the person it opened for, so it can finish leaving after they are gone.
  const [menu, setMenu] = useState<{ readonly person: Participant; readonly from: Press; readonly closing: boolean } | null>(null);
  const [peopleProblem, setPeopleProblem] = useState<string | null>(null);
  const present = (id: ParticipantId) => people.some((person) => person.id === id);
  // Someone removed elsewhere: their menu leaves, and a selection of them goes back to this device's name, so a Revert does not bring it back.
  if (menu && !menu.closing && !present(menu.person.id)) setMenu({ ...menu, closing: true });
  if (selected !== null && selected !== me && !present(selected)) setSelected(me);
  // A confirm whose person or Item is gone, or whose answer would now do the opposite, leaves as a Cancel would.
  if (confirming && !confirming.closing) {
    const item = split.receipt.items.find(({ id }) => id === confirming.itemId);
    if (!item || !present(confirming.person.id) || claimersOf(item.split).includes(confirming.person.id) !== confirming.had) setConfirming({ ...confirming, closing: true });
  }
  const closeMenu = () => setMenu((open) => open && { ...open, closing: true });
  const menuGone = () => {
    if (menu && (wide || menu.from.keyboard || actedByKey())) {
      // The row it hung from may be the one removed; the sheet's Done link is the nearest sensible place.
      const row = menu.from.trigger.isConnected ? menu.from.trigger : document.querySelector<HTMLElement>(`[data-pressable][aria-label="${say.done}"]`);
      row?.focus({ preventScroll: true });
    }
    setMenu(null);
  };
  const remove = async (person: Participant) => {
    closeMenu();
    if (!(await act({ by: me, type: "removeParticipant", participantId: person.id }))) setPeopleProblem(say.saveFailed);
  };
  const hold = (participantId: ParticipantId, from: Press) => {
    const person = people.find(({ id }) => id === participantId);
    if (!person) return;
    setPeopleProblem(null);
    setMenu((open) => (open && !open.closing ? open : { person, from, closing: false }));
  };
  const peopleNote = peopleProblem ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{peopleProblem}</Text> : null;

  const open = (kind: OverlayKind, from: Press) => {
    setPayProblem(null);
    setOverlay({ ...kind, from });
  };
  const deleted = ({ name, revision }: { readonly name: string; readonly revision: number }) =>
    setBar({
      message: say.deleted(name),
      action: {
        label: say.undo,
        onPress: async () => {
          setBar(null);
          const answer = await send({ by: me, type: "undo", revision });
          if (!answer.ok && answer.rejection.reason !== "alreadyUndone") setBar({ message: say.undoFailed, over: "footer" });
        },
      },
      over: "footer",
    });
  const overlayGone = () => {
    setOverlay(null);
    setClosing(false);
    if (!overlay || !(wide || overlay.from.keyboard || actedByKey())) return;
    const trigger = overlay.from.trigger.isConnected
      ? overlay.from.trigger
      : overlay.kind === "item"
        ? nearestLine(split, overlay.lines, overlay.itemId)
        : overlay.kind === "adjustment"
          ? document.querySelector<HTMLElement>(`[data-pressable][aria-label="${say.add}"]`)
          : null;
    trigger?.focus({ preventScroll: true });
  };
  // Payments opened by a named viewer closes once that viewer is gone, so it never lists the removed person's phone as its own. The Pay and People sheets close when this phone loses its name.
  const viewerGone = (overlay?.kind === "payments" && overlay.viewer !== null && overlay.viewer !== me) || ((overlay?.kind === "pay" || overlay?.kind === "people") && (me === null || selectedPerson === null)) || (overlay?.kind === "receipt" && !photo);
  if (viewerGone && !closing) setClosing(true);
  // Escape closes the person menu over the People sheet first, and the sheet on the next press.
  useEscape(overlay !== null && !closing && !viewing && (menu === null || menu.closing), closeOverlay);

  // Closing the pick sheet takes its Close button away, so a key's close hands focus to the button that asks again.
  const asking = useRef(false);
  const lookOnly = () => {
    asking.current = actedByKey();
    setPhase("collapsing");
  };
  const pickLeft = () => {
    setPhase("regular");
    setChosen(null);
  };
  useEffect(() => {
    if (phase !== "regular" || !asking.current) return;
    asking.current = false;
    document.querySelector<HTMLElement>(`[data-pressable][aria-label="${say.question}"]`)?.focus({ preventScroll: true });
  }, [phase]);

  const [host] = people;
  const viewed = me && selectedPerson ? payFacts(split, selectedPerson, me) : null;
  const viewedTitle = me && selectedPerson && viewed ? payTitle(split, selectedPerson, me) : say.payments;
  const onPaid = async (paid: boolean) => {
    if (!me) return;
    const before = split.payments.find(({ participantId }) => participantId === me)?.amount ?? null;
    if (!(await markPaid(me, paid ? myShare : null)) || !paid) return;
    setBar({
      message: say.markedPaid(money(myShare)),
      action: {
        label: say.undo,
        onPress: () => {
          if (me) void markPaid(me, before);
          setBar(null);
        },
      },
      over: "footer",
    });
    closeOverlay();
  };
  const peopleRows: readonly PersonRow[] = people.map((person) => {
    const pick = split.picks.find(({ participantId }) => participantId === person.id);
    return {
      person,
      share: money(shares.shares.find(({ participantId }) => participantId === person.id)?.share ?? cents(0)),
      mine: person.id === me,
      viewed: person.id === selectedPerson?.id,
      heldElsewhere: pick !== undefined && pick.device !== device,
    };
  });
  const peopleSheet = (asking: boolean) => (
    <>
      <PeopleSheet
        rows={peopleRows}
        meName={asking ? null : (selfPerson?.name ?? "")}
        intro={intro(split, creating)}
        chosen={chosen}
        onView={(participantId) => {
          setSelected(participantId);
          closeOverlay();
        }}
        onPick={(participantId, takeOver) => void choose(participantId, takeOver)}
        onAdd={asking ? addYourself : (typed) => addPerson(typed).then((added) => ("refused" in added ? added.refused : null))}
        onRemove={hold}
        onClose={asking ? lookOnly : closeOverlay}
        url={splitUrl(splitId)}
      />
      {pickProblem ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{pickProblem}</Text> : null}
      {peopleNote}
    </>
  );
  const pickContent = peopleSheet(true);
  const overlayContent = overlay ? (
    overlay.kind === "item" ? (
      <ItemSheet
        split={split}
        itemId={overlay.itemId}
        me={me}
        send={send}
        onClose={closeOverlay}
        onNote={(message) => setBar({ message, over: "sheet" })}
        onDeleted={deleted}
        guardRef={closeGuard}
      />
    ) : overlay.kind === "add" ? (
      <AddSheet split={split} me={me} send={send} onClose={closeOverlay} />
    ) : overlay.kind === "adjustment" ? (
      <AdjustmentSheet split={split} adjustmentId={overlay.adjustmentId} me={me} send={send} onClose={closeOverlay} onDeleted={deleted} guardRef={closeGuard} />
    ) : overlay.kind === "payments" ? (
      <PaymentsSheet split={split} me={me} onClose={closeOverlay} sheet />
    ) : overlay.kind === "people" ? (
      peopleSheet(false)
    ) : overlay.kind === "pay" ? (
      selectedPerson ? (
        <>
          <PayBody split={split} person={selectedPerson} viewer={me} onClose={closeOverlay} />
          {payProblem ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{payProblem}</Text> : null}
        </>
      ) : null
    ) : overlay.kind === "receipt" ? (
      <ReceiptSheet uri={photoUrl} onOpen={() => setViewing(true)} onClose={closeOverlay} />
    ) : (
      <HistorySheet split={split} me={me} onRevert={(revision) => act({ by: me, type: "undo", revision })} onRestore={() => act({ by: me, type: "restoreReceipt" })} onClose={closeOverlay} />
    )
  ) : null;
  const payBar = overlay?.kind === "pay" && viewed?.hasBar ? <PayBlock split={split.id} host={host.name} handles={split.paymentHandles} state={viewed.state} onPaid={(paid) => void onPaid(paid)} /> : undefined;

  const showingNow = closing ? null : overlay;
  const receipt = (
    <ReceiptCard
      split={split}
      shares={shares}
      selected={me ? selectedPerson : null}
      me={me}
      onCircle={(item, from) => void onCircle(item, from)}
      onOpen={(item, from) => open({ kind: "item", itemId: item.id, lines: split.receipt.items.map(({ id }) => id) }, from)}
      onAdd={(from) => open({ kind: "add" }, from)}
      onOpenAdjustment={(row, from) => open({ kind: "adjustment", adjustmentId: row.id }, from)}
      showing={
        showingNow?.kind === "item"
          ? showingNow.itemId
          : showingNow?.kind === "adjustment"
            ? showingNow.adjustmentId
            : showingNow?.kind === "add"
              ? "add"
              : null
      }
    />
  );
  const footer = (() => {
    const ask = { text: "", ink: c.muted, paidState: false };
    if (!me || !selectedPerson || !viewed) return <SplitFooter label={say.question} amount="" whose={null} aside={ask} pill={{ kind: "ask" }} onOpen={() => setPhase("pick")} onHeight={setFooterHeight} />;
    const mine = selectedPerson.id === me;
    const pill = !viewed.hasBar ? null : viewed.state.kind === "settled" || viewed.state.kind === "over" ? ({ kind: "paid" } as const) : ({ kind: "pay", host: firstName(host.name) } as const);
    const claimed = shareBreakdown(split, selectedPerson.id).items.length;
    const status = shareStatus(shares, split.payments, selectedPerson.id, me);
    // A settled share the pill already marks keeps the items count; every other paid state reads in words.
    const words = status.kind === "settled" && pill?.kind === "paid" ? null : statusWords(status);
    const ink = status.kind === "short" || status.kind === "over" ? c.warn : c.muted;
    return (
      <SplitFooter
        label={mine ? say.yourShare : say.shareOf(selectedPerson.name)}
        amount={money(viewed.share)}
        whose={mine ? null : selectedPerson.name}
        aside={words ? { text: words, ink, paidState: true } : { text: say.itemsLine(claimed, split.receipt.items.length), ink: c.muted, paidState: false }}
        pill={pill}
        onOpen={(from) => open({ kind: "pay" }, from)}
        onHeight={setFooterHeight}
      />
    );
  })();

  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: footerHeight + 16, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }}
      >
        <View style={styles.column}>
          <SplitHeader onShare={() => void share()} />
          <SplitIntro
            host={host.name}
            total={money(split.receipt.total)}
            onReceipt={photo ? (from) => open({ kind: "receipt" }, from) : undefined}
            onPeople={(from) => (me ? open({ kind: "people" }, from) : setPhase("pick"))}
            onPayments={(from) => open({ kind: "payments", viewer: me }, from)}
            onHistory={(from) => open({ kind: "history" }, from)}
          />
          {me && selectedPerson && selectedPerson.id !== me ? <ViewingLine name={selectedPerson.name} onBack={() => setSelected(me)} /> : null}
          <View style={styles.doc}>{receipt}</View>
        </View>
      </ScrollView>
      {phase === "pick" ? null : footer}
      {phase === "regular" ? null : (
        <BottomSheet tapAway label={say.question} minHeight={pageHeight - tallPickTop} closing={phase === "collapsing"} onDown={pickLeft} testID="split-sheet">
          {pickContent}
        </BottomSheet>
      )}
      {overlay ? (
        <BottomSheet tapAway label={overlayLabel(overlay, split, viewedTitle)} onDown={overlayGone} holds={() => closeGuard.current?.() ?? false} closing={closing} bar={payBar} testID={overlay.kind === "pay" ? "breakdown" : `${overlay.kind}-sheet`}>
          {overlayContent}
        </BottomSheet>
      ) : null}
      {menu ? (
        <Popover anchor={menu.from.trigger} label={say.personMenu(menu.person.name)} instant={menu.from.keyboard} closing={menu.closing} onClose={closeMenu} onGone={menuGone} width={personMenuWidth} side="above" align="start">
          <PersonMenu split={split} person={menu.person} onRemove={() => void remove(menu.person)} />
        </Popover>
      ) : null}
      {confirming ? (
        <Popover anchor={confirming.from.trigger} label={say.confirmFor(confirming.name, confirming.person.name, confirming.had)} instant={confirming.from.keyboard} closing={confirming.closing} onClose={closeConfirming} onGone={confirmingGone} width={claimConfirmWidth} align="start">
          <ClaimConfirm question={say.confirmFor(confirming.name, confirming.person.name, confirming.had)} action={say.confirmForAction(confirming.person.name, confirming.had)} onYes={confirmClaim} onNo={closeConfirming} />
        </Popover>
      ) : null}
      <Toast message={bar?.message ?? null} onHide={() => setBar(null)} action={bar?.action} lift={bar?.over === "sheet" && overlay && !closing ? 12 : footerHeight + 8} />
      {viewing && photo ? <PhotoViewer photo={{ uri: photoUrl, name: say.receiptPhoto }} onExited={() => setViewing(false)} /> : null}
    </View>
  );
}

function intro(split: Split, creating: boolean) {
  const total = money(split.receipt.total);
  return creating ? { lead: say.linkReady, rest: ` ${total}` } : { lead: split.participants[0].name, rest: say.invited, strong: total };
}

/** After Split or Delete item the line is gone; focus goes to the nearest line still on screen, or to the header of the collapsed Bundle that hides it. */
function nearestLine(split: Split, lines: readonly ItemId[], gone: ItemId): HTMLElement | null {
  const shown = (target: HTMLElement | undefined) => (target && target.getClientRects().length > 0 && target.offsetHeight > 0 ? target : null);
  for (const id of linesNear(lines, gone)) {
    const line = shown([...document.querySelectorAll<HTMLElement>(`[data-testid="line-${id}"] [data-pressable]`)].at(-1));
    if (line) return line;
    const bundle = split.receipt.adjustments.find((row) => row.kind === "bundleDiscount" && row.bundle.items.includes(id));
    const header = bundle && shown(document.querySelector<HTMLElement>(`[data-testid="bundle-${bundle.id}"] [data-pressable]`) ?? undefined);
    if (header) return header;
  }
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", ...webStyle({ overflow: "clip" }) },
  page: { flex: 1 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  doc: { paddingTop: 6 },
  opening: { paddingTop: 24 },
  gone: { gap: 8, paddingTop: 24 },
  goneAction: { marginTop: 16 },
  people: { gap: layout.blockGap },
  problem: { alignSelf: "flex-start", marginTop: 10, marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
