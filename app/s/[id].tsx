import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents, type Cents } from "../../src/core/money";
import { claimersOf } from "../../src/core/operations";
import { pickDevice } from "../../src/core/pick-device";
import { computeShares } from "../../src/core/shares";
import { isRoutableSplitId, type AdjustmentId, type Participant, type ItemId, type ParticipantId, type Split, type SplitId, type SplitItem } from "../../src/core/split";
import { applyChange, forgetSplit, noteSplit, rememberSplit, type SplitChange, splitOnDevice, thisDevice, type SplitOnDevice } from "../../src/device";
import { money } from "../../src/core/currency";
import { CurrencyContext } from "../../src/ui/currency";
import { newName } from "../../src/draft";
import { newParticipantId, splitUrl, useLiveSplit, type Answer, type GoneReason } from "../../src/live/client";
import { actedByKey } from "../../src/ui/components/acted-by-key";
import { Toast } from "../../src/ui/components/toast";
import { Button, type Press } from "../../src/ui/components/button";
import type { Lay } from "../../src/ui/lay";
import { Popover, useEscape } from "../../src/ui/components/popover";
import { AdjustmentSheet, type CloseGuard } from "../../src/ui/adjustment-sheet";
import { TotalsSheet } from "../../src/ui/totals-sheet";
import type { TotalLine } from "../../src/ui/totals-sheet/totals";
import { HistorySheet, type HistoryAsk } from "../../src/ui/history";
import { PaymentsSheet } from "../../src/ui/pay/payments-sheet";
import { joinCopy } from "../../src/ui/home-copy";
import { ItemSheet, type ModesOpen } from "../../src/ui/item-sheet";
import { ModeMenu, modeMenuWidth } from "../../src/ui/item-sheet/mode-menu";
import { AddSheet } from "../../src/ui/item-sheet/add";
import { PhotoViewer } from "../../src/ui/photo-viewer";
import { failedCopy, splitCopy as say } from "../../src/ui/split-copy";
import { ConnectionNotice } from "../../src/ui/split-view/connection-notice";
import type { Connection } from "../../src/live/connection";
import { SplitHeader, useSiteShare } from "../../src/ui/split-view/header";
import { shareLink } from "../../src/ui/share-link";
import { billParts, circleTap, filterCounts, linesNear, peopleOrder, type ItemFilter } from "../../src/ui/split-view/model";
import { FilterMenu, filterMenuWidth } from "../../src/ui/split-view/item-filters";
import { PeopleSheet, type PersonRow } from "../../src/ui/split-view/people-sheet";
import { PersonPicker, personPickerWidth } from "../../src/ui/split-view/person-picker";
import { ShareHead } from "../../src/ui/split-view/share-head";
import { takeJustMade } from "../../src/ui/split-view/just-made";
import { LinkReadySheet } from "../../src/ui/split-view/link-ready-sheet";
import { ColumnStack, SidePanel } from "../../src/ui/split-view/side-panel";
import { ViewingLine } from "../../src/ui/split-view/viewing-line";
import { PersonMenu, personMenuWidth } from "../../src/ui/split-view/person-menu";
import { ClaimConfirm, claimConfirmWidth } from "../../src/ui/split-view/claim-confirm";
import { holdOf, takenName } from "../../src/ui/split-view/name-hold";
import { ReceiptCard } from "../../src/ui/split-view/receipt-card";
import { useLayoutHeight, useLayoutWidth } from "../../src/ui/components/viewport";
import { BottomSheet } from "../../src/ui/split-view/bottom-sheet";
import { SplitFooter, type FooterPill } from "../../src/ui/split-view/footer";
import { SplitIntro } from "../../src/ui/split-view/intro";
import { PayBody, firstName, payFacts, payTitle } from "../../src/ui/pay/pay-sheet";
import { PayBlock, PayButton } from "../../src/ui/pay/pay-block";
import { justPaid, paymentStatus, shareStatus, statusWords } from "../../src/ui/pay/model";
import { useBusyLoader } from "../../src/ui/document";
import { webStyle } from "../../src/ui/motion";
import { TextLink } from "../../src/ui/components/text-link";
import { Presence } from "../../src/ui/presence";
import { frameFor, frameGutter } from "../../src/ui/frame";
import { breakpoints, layout, type, useColors } from "../../src/ui/theme";

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const splitId = isRoutableSplitId(id) ? id : null;
  const { live, send, act, connection, idle } = useLiveSplit(id);
  const site = useSiteShare();
  const expired = live.status === "gone" && live.reason === "notFound";
  useEffect(() => {
    if (expired && splitId) forgetSplit(splitId);
  }, [expired, splitId]);

  useBusyLoader(live.status === "connecting", joinCopy.opening);

  if (live.status === "live" && splitId) {
    return (
      <CurrencyContext.Provider value={live.split.currency}>
        <SplitPage key={splitId} splitId={splitId} split={live.split} server={live.server} photo={live.photo} send={send} act={act} idle={idle} connection={connection} />
      </CurrencyContext.Provider>
    );
  }
  return (
    <View style={[styles.screen, { backgroundColor: c.field, paddingTop: insets.top, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
      <View style={styles.column}>
        <SplitHeader onShare={site.share} />
        {live.status === "gone" ? <Gone reason={live.reason} /> : null}
      </View>
      <Toast message={site.notice} onHide={site.hideNotice} />
    </View>
  );
}

function Gone({ reason }: { reason: GoneReason }) {
  const c = useColors();
  const words = reason === "notFound" ? joinCopy.missing : joinCopy.unreadable;
  return (
    <View style={styles.gone}>
      <Text role="heading" aria-level={1} style={[type.hero, { color: c.ink }]}>
        {words.title}
      </Text>
      <Text style={[type.body, { color: c.muted }]}>{words.hint}</Text>
      <View style={styles.goneAction}>
        <Button label={joinCopy.newSplit} onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}

type Phase = "pick" | "collapsing" | "regular";
type OverlayKind =
  | { readonly kind: "item"; readonly itemId: ItemId; readonly lines: readonly ItemId[] }
  | { readonly kind: "add" }
  | { readonly kind: "adjustment"; readonly adjustmentId: AdjustmentId }
  | { readonly kind: "totals"; readonly line: TotalLine }
  | { readonly kind: "history" }
  | { readonly kind: "people" }
  | { readonly kind: "made" }
  | { readonly kind: "pay" }
  | { readonly kind: "payments"; readonly viewer: ParticipantId | null };
/** What is open over the page and the press that opened it: focus goes back there. */
type Overlay = OverlayKind & { readonly from: Press };
type Send = ReturnType<typeof useLiveSplit>["send"];
type Act = ReturnType<typeof useLiveSplit>["act"];
/** The one bar at the bottom of the page: an Undo for the last delete or payment, or a line to read. Over the sheet when the sheet stays open. */
type Bar = { readonly message: string; readonly action?: { readonly label: string; readonly onPress: () => void } };

/** An Adjustment's sheet is named for its saved kind; its heading follows a kind switch at once. */
const overlayLabel = (overlay: OverlayKind, split: Split, title: string) =>
  overlay.kind === "adjustment"
    ? say.editKind[split.receipt.adjustments.find(({ id }) => id === overlay.adjustmentId)?.kind ?? "tax"]
    : overlay.kind === "totals"
      ? say.editTotals[overlay.line]
      : { item: say.editItem, add: say.addMenu, history: say.history, receipt: say.receiptPhoto, payments: say.payments, people: say.people, made: say.linkReadyTitle, pay: title }[overlay.kind];
const checkFor = 80;
/** The Host's footer pill: how many of the people who owe have paid, "All paid" once they all have, or just Payments while nobody owes yet. */
const collectLabel = ({ paid, owing }: { paid: number; owing: number }) => (owing === 0 ? say.payments : paid === owing ? say.ring.allPaidTitle : say.status.paidOf(paid, owing));
// Where scroll bars take room (Windows, Linux, a Mac set to always show them), a blank strip as wide as the bar sits on the left too, so the frame is centered in the window rather than beside the bar.
const evenGutters = webStyle({ scrollbarGutter: "stable both-edges" });
const wideBodyTop = 12;
// Where the pick sheet's top edge sits before the links row has been measured, and the gap it keeps below that row once it has.
const tallPickTop = 170;
const pickGap = 12;

/** The Split as the server holds it is `server`; `split` is what this phone shows, with its unanswered actions laid over `server` (see `useLiveSplit`). */
function SplitPage({ splitId, split, server, photo, send, act, idle, connection }: { splitId: SplitId; split: Split; server: Split; photo: boolean; send: Send; act: Act; idle: boolean; connection: Connection }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const pageHeight = useLayoutHeight();
  const layoutWidth = useLayoutWidth();
  const wide = layoutWidth >= breakpoints.pairFrom;
  const [pageRoom, setPageRoom] = useState<number | null>(null);
  const frame = frameFor(layoutWidth, pageRoom ?? layoutWidth);
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
  // The footer waits under the pick sheet until the sheet is down, then rises in from the bottom edge.
  const [rise, setRise] = useState(false);
  const [chosen, setChosen] = useState<ParticipantId | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  /** "I already paid" (or its undo) tapped while an earlier action was still unanswered: it goes out once those settle, from the Share they leave. */
  const [paying, setPaying] = useState<boolean | null>(null);
  // What a tap on "I already paid" waits with: the Share the person saw when they tapped, which is what they agreed to pay.
  const waitingToPay = useRef<{ readonly paid: boolean; readonly share: Cents } | null>(null);
  const [payNote, setPayNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParticipantId | null>(me);
  // The Host arrives from Create link to Link ready: the link to send and, in case this phone is not theirs, the names to switch to.
  const [overlay, setOverlay] = useState<Overlay | null>(() => (me && takeJustMade(splitId) ? { kind: "made", from: { trigger: document.body, keyboard: false } } : null));
  const [closing, setClosing] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [linksBottom, setLinksBottom] = useState<number | null>(null);
  // Where the wide column starts below the top bar, so the sticky column ends at the window's bottom edge rather than past it.
  const [asideTop, setAsideTop] = useState(0);
  const [bar, setBar] = useState<Bar | null>(null);
  /** The Receipt link's press while the photo viewer is open: focus goes back there. */
  const [viewing, setViewing] = useState<Press | null>(null);
  // The viewer needs the photo. If it goes away mid-view it closes, so it cannot come back when a photo does and Escape keeps closing sheets.
  if (viewing && !photo) setViewing(null);
  const photoUrl = `/api/splits/${splitId}/photo`;
  useEffect(() => {
    if (photo) Image.prefetch(photoUrl).catch(() => {});
  }, [photo, photoUrl]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => noteSplit(server), [server]);

  const shares = useMemo(() => computeShares(split), [split]);
  const people = split.participants;
  // A selected person someone removed falls back to this device's own name.
  const selectedPerson = people.find((person) => person.id === selected) ?? people.find((person) => person.id === me) ?? null;
  const selfPerson = people.find((person) => person.id === me);
  const creating = memory.creatorSecret !== undefined;
  // The Split as last rendered. A send that timed out settles after the server's join state has rendered, so this tells whether the action landed anyway.
  const latest = useRef(split);
  useEffect(() => {
    latest.current = split;
  });

  // The sheet as last rendered. A close that follows an await runs in the render that started it, so it asks this ref whether a sheet is open now.
  const openSheet = useRef(overlay);
  useEffect(() => {
    openSheet.current = overlay;
  });

  // The phase as last rendered. People tapped while a pick is unanswered opens the pick sheet, which the pick then has to collapse.
  const shownPhase = useRef(phase);
  useEffect(() => {
    shownPhase.current = phase;
  });

  const closeGuard = useRef<CloseGuard | null>(null);
  const closeOverlay = () => {
    // With no sheet open, `closing` would stay set and shut the next sheet the moment it opens.
    if (openSheet.current === null) return;
    if (closeGuard.current?.()) return;
    // A closing sheet drops the keyboard with it, whichever way it was closed.
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
    setClosing(true);
  };

  const choose = async (participantId: ParticipantId, takeOver: boolean) => {
    setPickProblem(null);
    setChosen(participantId);
    // A switch from the People sheet closes it on the tap, as viewing someone does, and the pick lands behind it. Link ready stays up, so the Host can still share the link.
    const switching = shownPhase.current !== "pick";
    if (switching && openSheet.current?.kind !== "made") closeOverlay();
    const picked = await send({ by: participantId, type: "pick", participantId, device, takeOver });
    // A pick the server recorded before the answer timed out stands.
    const recorded = latest.current.picks.some((pick) => pick.participantId === participantId && pick.device === device);
    if (!picked.ok && !(picked.rejection.reason === "disconnected" && recorded)) {
      setChosen(null);
      // Another phone took the name first: say so, since trying again would only ask "That's me". A switch whose sheet has closed says it in the bar.
      const problem = picked.rejection.reason === "namePicked" ? say.pickLost(people.find(({ id }) => id === participantId)?.name ?? "") : failedCopy(picked, say.pickFailed);
      return switching && openSheet.current?.kind !== "made" ? setBar({ message: problem }) : setPickProblem(problem);
    }
    remember({ me: participantId });
    setSelected(participantId);
    // The pick sheet collapses on its own; a switch from the People sheet closes that sheet instead.
    // The pick sheet collapses on its own, even one People showed while the pick was in flight; a switch closes whatever sheet opened meanwhile.
    if (shownPhase.current === "pick") timers.current.push(setTimeout(() => setPhase("collapsing"), checkFor));
    else {
      setChosen(null);
      if (openSheet.current?.kind !== "made") closeOverlay();
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
    const added = await send({ by: me, type: "addParticipant", participant });
    return added.ok ? { id: participant.id } : { refused: failedCopy(added, say.nameRefused) };
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
  /**
   * Shows `op` on the Split now and sends it. When the server refuses it or never answers, the Split goes back to how the server has it and the bar says what didn't apply,
   * with Try again for a refusal that is only the connection or the pace. False means the connection is down: nothing was shown or sent.
   */
  const lay: Lay = (op, how = {}) => {
    const laid = act(op);
    if (!laid.sent) return false;
    void laid.answer.then((answer) => {
      if (answer.ok) return how.then?.(answer);
      const said = how.said ? how.said(answer) : failedCopy(answer, say.saveFailed);
      if (said === null) return;
      const again = how.retry && (answer.rejection.reason === "disconnected" || answer.rejection.reason === "rateLimited");
      setBar({
        // The button already says "try again", so the generic line does not.
        message: again && said === say.saveFailed ? say.couldntSave : said,
        action: again
          ? {
              label: say.tryAgain,
              onPress: () => {
                setBar(null);
                if (!lay(op, how)) setBar({ message: say.connection.failed });
              },
            }
          : undefined,
      });
    });
    return true;
  };
  // The Item is read off the Split on screen, so a second quick tap on a dot acts on the first.
  const claim = (itemId: ItemId, person: ParticipantId) => {
    const item = split.receipt.items.find(({ id }) => id === itemId);
    if (!item || !me) return;
    if (!lay({ ...circleTap(item, person), by: me })) setBar({ message: say.connection.failed });
  };
  const onCircle = (item: SplitItem, from: Press) => {
    if (!me || !selectedPerson) {
      // On a wide screen the pick takes the column, so whatever was open there closes first, as a close would, keeping an edit that cannot save yet.
      if (wide && openSheet.current !== null) {
        if (closeGuard.current?.()) return;
        setOverlay(null);
        setClosing(false);
      }
      return setPhase("pick");
    }
    if (selectedPerson.id !== me && trusted !== selectedPerson.id) {
      return setConfirming({ itemId: item.id, name: item.name, person: selectedPerson, had: claimersOf(item.split).includes(selectedPerson.id), from, closing: false });
    }
    claim(item.id, selectedPerson.id);
  };
  const closeConfirming = () => setConfirming((open) => open && { ...open, closing: true });
  const confirmClaim = () => {
    if (!confirming || confirming.closing) return;
    setTrusted(confirming.person.id);
    closeConfirming();
    claim(confirming.itemId, confirming.person.id);
  };
  const confirmingGone = () => {
    if (confirming && (wide || confirming.from.keyboard || actedByKey()) && confirming.from.trigger.isConnected) confirming.from.trigger.focus({ preventScroll: true });
    setConfirming(null);
  };

  const share = async () => {
    const result = await shareLink(splitUrl(splitId));
    if (result !== "shared") setBar({ message: result === "copied" ? say.linkCopied : say.copyFailed });
  };

  const myShare = shares.shares.find((row) => row.participantId === me)?.share ?? cents(0);
  const markPaid = (payer: ParticipantId, amount: Cents | null, then?: (answer: Extract<Answer, { ok: true }>) => void) =>
    lay(amount !== null ? { by: payer, type: "recordPayment", participantId: payer, device, amount } : { by: payer, type: "clearPayment", participantId: payer, device }, { then });

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
  // History's Revert or Restore question, hung from the row's arrow. It leaves with the sheet, or once another phone has reverted the same change.
  const [question, setQuestion] = useState<(HistoryAsk & { readonly closing: boolean }) | null>(null);
  if (question && !question.closing) {
    const change = question.target === "restore" ? null : split.recentChanges.find(({ revision }) => revision === question.target);
    if (overlay?.kind !== "history" || closing || (change !== null && (change === undefined || change.undoneBy !== null))) setQuestion({ ...question, closing: true });
  }
  const closeQuestion = () => setQuestion((open) => open && { ...open, closing: true });
  // Payments' question before marking someone else paid or not paid. It leaves with the sheet, or once that person's paid state changes some other way.
  const [paidAsk, setPaidAsk] = useState<{ readonly id: ParticipantId; readonly paid: boolean; readonly from: Press; readonly closing: boolean } | null>(null);
  if (paidAsk && !paidAsk.closing && (overlay?.kind !== "payments" || closing || !present(paidAsk.id) || split.payments.some(({ participantId }) => participantId === paidAsk.id) === paidAsk.paid)) setPaidAsk({ ...paidAsk, closing: true });
  const closePaidAsk = () => setPaidAsk((open) => open && { ...open, closing: true });
  const paidAskGone = () => {
    if (paidAsk && (wide || paidAsk.from.keyboard || actedByKey()) && paidAsk.from.trigger.isConnected) paidAsk.from.trigger.focus({ preventScroll: true });
    setPaidAsk(null);
  };
  const questionGone = () => {
    if (question && (wide || question.from.keyboard || actedByKey()) && question.from.trigger.isConnected) question.from.trigger.focus({ preventScroll: true });
    setQuestion(null);
  };
  // The Edit item sheet's menu of ways to split. It leaves with the sheet.
  const [modes, setModes] = useState<(ModesOpen & { readonly closing: boolean }) | null>(null);
  if (modes && !modes.closing && (overlay?.kind !== "item" || closing)) setModes({ ...modes, closing: true });
  const closeModes = () => setModes((open) => open && { ...open, closing: true });
  const modesGone = () => {
    if (modes && (wide || modes.from.keyboard || actedByKey()) && modes.from.trigger.isConnected) modes.from.trigger.focus({ preventScroll: true });
    setModes(null);
  };
  // Which lines the receipt shows, for this page view only. "Yours" falls back to All while nobody is viewed.
  const [pickedFilter, setFilter] = useState<ItemFilter>("all");
  const [filterMenu, setFilterMenu] = useState<{ readonly from: Press; readonly closing: boolean } | null>(null);
  const closeFilterMenu = () => setFilterMenu((open) => open && { ...open, closing: true });
  const filterMenuGone = () => {
    if (filterMenu && (filterMenu.from.keyboard || actedByKey()) && filterMenu.from.trigger.isConnected) filterMenu.from.trigger.focus({ preventScroll: true });
    setFilterMenu(null);
  };
  // The wide layout's people menu under "What you had".
  const [picker, setPicker] = useState<{ readonly from: Press; readonly closing: boolean } | null>(null);
  const closePicker = () => setPicker((open) => open && { ...open, closing: true });
  // The menu hangs from the share view's head, which goes when this device loses its name.
  if (picker && !picker.closing && (!me || !selectedPerson)) setPicker({ ...picker, closing: true });
  const pickerGone = () => {
    // After Edit people the trigger has gone with the share view, so focus goes to the People view that replaced it. After picking someone it has gone too, since the share view is keyed by whose share it shows, so focus goes to the new head's trigger.
    const people = document.querySelector<HTMLElement>(`[role="region"][data-testid="people-sheet"] [data-pressable]`);
    if (picker) {
      if (picker.from.trigger.isConnected) picker.from.trigger.focus({ preventScroll: true });
      else if (people) people.focus({ preventScroll: true });
      else focusHead.current = "";
    }
    setPicker(null);
  };
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
    const removed = await send({ by: me, type: "removeParticipant", participantId: person.id });
    if (!removed.ok) setPeopleProblem(failedCopy(removed, say.saveFailed));
  };
  const hold = (participantId: ParticipantId, from: Press) => {
    const person = people.find(({ id }) => id === participantId);
    if (!person) return;
    setPeopleProblem(null);
    setMenu((open) => (open && !open.closing ? open : { person, from, closing: false }));
  };
  const peopleNote = peopleProblem ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{peopleProblem}</Text> : null;

  const open = (kind: OverlayKind, from: Press) => {
    // On a wide screen the column is not modal, so a click can replace what is open, or what is still fading out. The pick holds the column until it is answered.
    if (wide && phase !== "regular") return;
    if (openSheet.current !== null) {
      if (closeGuard.current?.()) return;
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
    }
    setPayNote(null);
    setClosing(false);
    setOverlay({ ...kind, from });
  };
  const deleted = ({ name, revision }: { readonly name: string; readonly revision: number }) =>
    setBar({
      message: say.deleted(name),
      action: {
        label: say.undo,
        onPress: () => {
          setBar(null);
          const said = (answer: Extract<Answer, { ok: false }>) => (answer.rejection.reason === "alreadyUndone" ? null : failedCopy(answer, say.undoFailed));
          if (!lay({ by: me, type: "undo", revision }, { said })) setBar({ message: say.connection.failed });
        },
      },
    });
  const photoClosed = () => {
    if (viewing && (wide || viewing.keyboard || actedByKey()) && viewing.trigger.isConnected) viewing.trigger.focus({ preventScroll: true });
    setViewing(null);
  };
  const overlayGone = () => {
    setOverlay(null);
    setClosing(false);
    if (!overlay || !(wide || overlay.from.keyboard || actedByKey())) return;
    // Link ready opened by itself, so on a wide screen focus goes to the share view's head rather than back to the page.
    if (overlay.kind === "made") {
      if (wide) focusHead.current = "";
      return;
    }
    const trigger = overlay.from.trigger.isConnected
      ? overlay.from.trigger
      : overlay.kind === "item"
        ? nearestLine(split, overlay.lines, overlay.itemId)
        : overlay.kind === "adjustment"
          ? document.querySelector<HTMLElement>(`[data-pressable][aria-label="${say.add}"]`)
          : null;
    if (trigger) return trigger.focus({ preventScroll: true });
    // A link in the wide column's head went away with the share view it sat in; it comes back on the next render.
    if (wide) focusHead.current = overlay.kind === "payments" ? say.payments : overlay.kind === "history" ? say.history : "";
  };
  // Payments opened by a named viewer closes once that viewer is gone, so it never lists the removed person's phone as its own. The Pay and People sheets close when this phone loses its name.
  const viewerGone = (overlay?.kind === "payments" && overlay.viewer !== null && overlay.viewer !== me) || ((overlay?.kind === "pay" || overlay?.kind === "people") && (me === null || selectedPerson === null));
  if (viewerGone && !closing) setClosing(true);
  // Escape closes the person menu over the People sheet, or the split menu over Edit item, first, and the sheet on the next press.
  useEscape(overlay !== null && !closing && !viewing && (picker === null || picker.closing) && (menu === null || menu.closing) && (modes === null || modes.closing) && (question === null || question.closing) && (paidAsk === null || paidAsk.closing), closeOverlay);

  // Closing the pick sheet takes its Close button away, so a key's close hands focus to the button that asks again.
  const asking = useRef(false);
  const lookOnly = () => {
    asking.current = actedByKey();
    setPhase("collapsing");
  };
  const pickLeft = () => {
    // On a wide screen the pick's buttons leave with it; focus goes to the share view's head that takes the column.
    if (wide) focusHead.current = "";
    setPhase("regular");
    setRise(true);
    setChosen(null);
  };
  const focusHead = useRef<string | null>(null);
  useEffect(() => {
    if (focusHead.current === null) return;
    // The panel calls `overlayGone` from its own effect, which runs before this one in the same commit, while the head is still away; wait for the render that brings it back.
    const links = [...document.querySelectorAll<HTMLElement>(`[data-testid="share-head"] [data-pressable]`)];
    if (links.length === 0) return;
    const label = focusHead.current;
    focusHead.current = null;
    // The head's links are named by their text, so the one to focus is found by it; the person menu's trigger comes first.
    (links.find((link) => label !== "" && link.textContent === label) ?? links[0]).focus({ preventScroll: true });
  });
  useEffect(() => {
    if (phase !== "regular" || !asking.current) return;
    asking.current = false;
    document.querySelector<HTMLElement>(`[data-pressable][aria-label="${say.question}"]`)?.focus({ preventScroll: true });
  }, [phase]);

  const [host] = people;
  const viewed = me && selectedPerson ? payFacts(split, selectedPerson, me) : null;
  const viewedTitle = me && selectedPerson && viewed ? payTitle(split, selectedPerson, me) : say.payments;
  // The sheet closes the moment the payment is shown; the Undo bar follows the server's answer.
  // `agreed` is the Share the person saw when they tapped. If the actions that settled in between moved it, nothing is recorded: the sheet stays open and says the new amount, and a second tap records that.
  const pay = (paid: boolean, agreed: Cents = myShare) => {
    waitingToPay.current = null;
    setPaying(null);
    if (!me) return;
    if (paid && agreed !== myShare) {
      const note = say.shareNow(money(myShare, split.currency));
      // The note goes under the pay button: in the Pay sheet on a phone, and in the column's share view on a wide screen.
      if ((wide ? overlay === null : overlay?.kind === "pay") && viewed?.hasBar) {
        setPayNote(note);
        // The refusal that moved the Share already raised this line; the note says the same thing without covering the sheet.
        setBar((open) => (open?.message === say.saveFailed ? null : open));
      } else setBar({ message: note });
      return;
    }
    const before = split.payments.find(({ participantId }) => participantId === me)?.amount ?? null;
    const shown = markPaid(me, paid ? myShare : null, () => {
      if (!paid) return;
      setBar({
        message: say.markedPaid(money(justPaid(myShare, before), split.currency)),
        action: {
          label: say.undo,
          onPress: () => {
            setBar(null);
            if (!markPaid(me, before)) setBar({ message: say.connection.failed });
          },
        },
      });
    });
    if (!shown) return setBar({ message: say.connection.failed });
    if (paid && overlay?.kind === "pay") closeOverlay();
  };
  // The amount is the Share, which an action still on its way can change, so a tap made then waits for those to settle, and records only if the Share is still the one the person saw.
  const onPaid = (paid: boolean) => {
    setPayNote(null);
    if (idle) return pay(paid);
    waitingToPay.current = { paid, share: myShare };
    setPaying(paid);
  };
  const payWhenSettled = useEffectEvent(() => {
    const waiting = waitingToPay.current;
    if (waiting !== null) pay(waiting.paid, waiting.share);
  });
  useEffect(() => {
    if (paying !== null && idle) payWhenSettled();
  }, [paying, idle]);
  // On Payments anyone with a name can check a friend off. Checking yourself off goes the Pay sheet's way with its Undo; the Host checks friends off directly,
  // since the money reaches them; anyone else is asked first, so a stray tap does not mark someone else paid.
  const record = (id: ParticipantId, paid: boolean) => {
    if (me === null) return;
    const owed = shares.shares.find(({ participantId }) => participantId === id)?.share ?? cents(0);
    if (!lay(paid ? { by: me, type: "recordPayment", participantId: id, device, amount: owed } : { by: me, type: "clearPayment", participantId: id, device })) setBar({ message: say.connection.failed });
  };
  const check = (id: ParticipantId, paid: boolean, from: Press) => {
    if (me === null) return;
    if (id === me) return onPaid(paid);
    if (me === split.participants[0].id) return record(id, paid);
    setPaidAsk({ id, paid, from, closing: false });
  };
  const peopleRows: readonly PersonRow[] = peopleOrder(people, (person) => person, me, split.participants[0].id).map((person) => {
    const pick = split.picks.find(({ participantId }) => participantId === person.id);
    return {
      person,
      share: money(shares.shares.find(({ participantId }) => participantId === person.id)?.share ?? cents(0), split.currency),
      mine: person.id === me,
      host: person.id === split.participants[0].id,
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
        lay={lay}
        onClose={closeOverlay}
        onNote={(message) => setBar({ message })}
        onDeleted={deleted}
        guardRef={closeGuard}
        onModes={(open) => setModes({ ...open, closing: false })}
        modesOpen={modes !== null && !modes.closing}
      />
    ) : overlay.kind === "add" ? (
      <AddSheet split={split} me={me} lay={lay} onClose={closeOverlay} />
    ) : overlay.kind === "adjustment" ? (
      <AdjustmentSheet split={split} adjustmentId={overlay.adjustmentId} me={me} send={send} lay={lay} onClose={closeOverlay} onDeleted={deleted} guardRef={closeGuard} />
    ) : overlay.kind === "totals" ? (
      <TotalsSheet split={split} line={overlay.line} me={me} send={send} onClose={closeOverlay} guardRef={closeGuard} />
    ) : overlay.kind === "payments" ? (
      <PaymentsSheet split={split} me={me} onClose={closeOverlay} sheet onCheck={check} />
    ) : overlay.kind === "people" ? (
      peopleSheet(false)
    ) : overlay.kind === "made" ? (
      <LinkReadySheet
        url={splitUrl(splitId)}
        rows={peopleRows}
        chosen={chosen}
        problem={pickProblem}
        onPick={(participantId) => void choose(participantId, false)}
        onClose={closeOverlay}
      />
    ) : overlay.kind === "pay" ? (
      selectedPerson ? (
        <>
          <PayBody split={split} person={selectedPerson} viewer={me} onClose={closeOverlay} />
        </>
      ) : null
    ) : (
      <HistorySheet split={split} me={me} onRevert={(revision) => send({ by: me, type: "undo", revision })} onRestore={() => send({ by: me, type: "restoreReceipt" })} onAsk={(ask) => setQuestion({ ...ask, closing: false })} onClose={closeOverlay} />
    )
  ) : null;
  const payBar = overlay?.kind === "pay" && viewed?.hasBar ? <PayBlock split={split.id} host={host.name} handles={split.paymentHandles} state={viewed.state} busy={paying !== null} notice={payNote} onPaid={onPaid} /> : undefined;

  const showingNow = closing ? null : overlay;
  const filterViewer = me ? (selectedPerson?.id ?? null) : null;
  const filter = pickedFilter === "mine" && filterViewer === null ? "all" : pickedFilter;
  const receipt = (
    <ReceiptCard
      split={split}
      shares={shares}
      wide={wide}
      whoColumn={layoutWidth >= breakpoints.roomyFrom}
      filter={filter}
      onFilter={setFilter}
      onFilterMenu={(from) => setFilterMenu({ from, closing: false })}
      filterMenuOpen={filterMenu !== null && !filterMenu.closing}
      selected={me ? selectedPerson : null}
      me={me}
      onCircle={onCircle}
      onOpen={(item, from) => open({ kind: "item", itemId: item.id, lines: split.receipt.items.map(({ id }) => id) }, from)}
      onAdd={(from) => open({ kind: "add" }, from)}
      onOpenAdjustment={(row, from) => open({ kind: "adjustment", adjustmentId: row.id }, from)}
      onOpenTotals={(line, from) => open({ kind: "totals", line }, from)}
      showing={
        showingNow?.kind === "item"
          ? showingNow.itemId
          : showingNow?.kind === "adjustment"
            ? showingNow.adjustmentId
            : showingNow?.kind === "totals"
              ? showingNow.line
              : showingNow?.kind === "add"
                ? "add"
                : null
      }
    />
  );
  const footer = (() => {
    if (!me || !selectedPerson || !viewed) return <SplitFooter label={say.question} amount="" whose={null} note={null} pill={{ kind: "ask" }} onOpen={() => setPhase("pick")} onHeight={setFooterHeight} rise={rise} />;
    const mine = selectedPerson.id === me;
    const collect = mine && viewed.isHost ? collectLabel(paymentStatus(split, shares, me)) : null;
    const pill: FooterPill | null = collect ? { kind: "collect", label: collect } : !viewed.payer ? null : viewed.state.kind === "settled" || viewed.state.kind === "over" ? { kind: "paid" } : { kind: "pay", host: firstName(host.name), ready: viewed.hasBar };
    const status = shareStatus(shares, split.payments, selectedPerson.id, me);
    // A settled share the pill already marks says nothing more, nor does the Host's count the pill already shows; every other paid state reads in words.
    const words = (status.kind === "settled" && pill?.kind === "paid") || pill?.kind === "collect" ? null : statusWords(status, split.currency);
    const ink = status.kind === "short" || status.kind === "over" ? c.warn : c.muted;
    return (
      <SplitFooter
        label={mine ? say.yourShare : say.shareOf(selectedPerson.name)}
        amount={money(viewed.share, split.currency)}
        whose={mine ? null : selectedPerson.name}
        note={words ? { text: words, ink } : null}
        pill={pill}
        onOpen={(from) => open({ kind: "pay" }, from)}
        onPill={pill?.kind === "collect" ? (from) => open({ kind: "payments", viewer: me }, from) : undefined}
        onHeight={setFooterHeight}
        rise={rise}
      />
    );
  })();

  const title = (person: Participant) => (person.id === me ? say.whatYouHad : say.whatTheyHad(person.name));
  const due = viewed?.hasBar ? (viewed.state.kind === "unpaid" ? viewed.state.owe : viewed.state.kind === "short" ? viewed.state.rest : null) : null;
  const shareView =
    me && selectedPerson && viewed ? (
      <>
        <PayBody
          split={split}
          person={selectedPerson}
          viewer={me}
          onClose={() => {}}
          head={
            <ShareHead
              title={selectedPerson.id === me ? say.yourShare : say.shareOf(firstName(selectedPerson.name))}
              amount={money(viewed.share, split.currency)}
              bill={billParts(shares, selectedPerson.id)}
              legend={selectedPerson.id === me ? say.youHad : firstName(selectedPerson.name)}
              had={title(selectedPerson)}
              open={picker !== null && !picker.closing}
              onPick={(from) => setPicker({ from, closing: false })}
            />
          }
          beside={due === null ? null : <PayButton split={split.id} host={host.name} handles={split.paymentHandles} amount={due} />}
        />
        {viewed.hasBar ? (
          <View style={styles.payRest}>
            <PayBlock compact split={split.id} host={host.name} handles={split.paymentHandles} state={viewed.state} busy={paying !== null} notice={payNote} onPaid={onPaid} />
          </View>
        ) : null}
      </>
    ) : (
      <ShareHead title={say.question} amount={null} bill={null} legend="" had={null} open={false} onPick={() => setPhase("pick")} />
    );
  const aside =
    phase !== "regular" ? (
      <SidePanel key="pick" label={say.question} closing={phase === "collapsing"} onDown={pickLeft} testID="split-sheet">
        {pickContent}
      </SidePanel>
    ) : overlay ? (
      <SidePanel
        key={overlay.kind === "item" ? `item-${overlay.itemId}` : overlay.kind === "adjustment" ? `adjustment-${overlay.adjustmentId}` : overlay.kind === "totals" ? `totals-${overlay.line}` : overlay.kind}
        label={overlayLabel(overlay, split, viewedTitle)}
        closing={closing}
        onDown={overlayGone}
        focusFirst={overlay.from.keyboard || actedByKey()}
        testID={overlay.kind === "pay" ? "breakdown" : `${overlay.kind}-sheet`}
      >
        {overlayContent}
        {payBar}
      </SidePanel>
    ) : (
      // Keyed by whose share it shows, so picking someone else fades their share in as the column's other views do, instead of swapping the numbers in place.
      <SidePanel key={`share-${selectedPerson?.id ?? ""}`} label={selectedPerson ? title(selectedPerson) : say.question} testID="share-panel">
        {shareView}
      </SidePanel>
    );

  const layers = (
    <>
      {menu ? (
        <Popover anchor={menu.from.trigger} label={say.personMenu(menu.person.name)} instant={menu.from.keyboard} closing={menu.closing} onClose={closeMenu} onGone={menuGone} width={personMenuWidth} side="above" align="start">
          <PersonMenu split={split} person={menu.person} onRemove={() => void remove(menu.person)} />
        </Popover>
      ) : null}
      {filterMenu ? (
        <Popover anchor={filterMenu.from.trigger} label={say.showItems} instant={filterMenu.from.keyboard} closing={filterMenu.closing} onClose={closeFilterMenu} onGone={filterMenuGone} width={filterMenuWidth}>
          <FilterMenu
            filter={filter}
            counts={filterCounts(split.receipt.items, filterViewer)}
            viewer={filterViewer}
            whose={selectedPerson && selectedPerson.id !== me ? firstName(selectedPerson.name) : null}
            onPick={(next) => {
              setFilter(next);
              closeFilterMenu();
            }}
          />
        </Popover>
      ) : null}
      {modes ? (
        <Popover anchor={modes.from.trigger} label={say.split} instant={modes.from.keyboard} closing={modes.closing} onClose={closeModes} onGone={modesGone} width={modeMenuWidth}>
          <ModeMenu
            value={modes.value}
            onPick={(by) => {
              modes.pick(by);
              closeModes();
            }}
          />
        </Popover>
      ) : null}
      {question ? (
        <Popover anchor={question.from.trigger} label={question.question} instant={question.from.keyboard} closing={question.closing} onClose={closeQuestion} onGone={questionGone} width={claimConfirmWidth}>
          <ClaimConfirm
            question={question.question}
            action={question.action}
            onYes={() => {
              if (question.closing) return;
              closeQuestion();
              question.onYes();
            }}
            onNo={closeQuestion}
          />
        </Popover>
      ) : null}
      {paidAsk ? (
        <Popover anchor={paidAsk.from.trigger} label={say.ring.askPaid(firstName(people.find(({ id }) => id === paidAsk.id)?.name ?? ""), paidAsk.paid)} instant={paidAsk.from.keyboard} closing={paidAsk.closing} onClose={closePaidAsk} onGone={paidAskGone} width={claimConfirmWidth} align="start">
          <ClaimConfirm
            question={say.ring.askPaid(firstName(people.find(({ id }) => id === paidAsk.id)?.name ?? ""), paidAsk.paid)}
            action={paidAsk.paid ? say.ring.yesPaid : say.ring.yesUnpaid}
            onYes={() => {
              if (paidAsk.closing) return;
              closePaidAsk();
              record(paidAsk.id, paidAsk.paid);
            }}
            onNo={closePaidAsk}
          />
        </Popover>
      ) : null}
      {confirming ? (
        <Popover anchor={confirming.from.trigger} label={say.confirmFor(confirming.name, confirming.person.name, confirming.had)} instant={confirming.from.keyboard} closing={confirming.closing} onClose={closeConfirming} onGone={confirmingGone} width={claimConfirmWidth} align="start">
          <ClaimConfirm question={say.confirmFor(confirming.name, confirming.person.name, confirming.had)} action={say.confirmForAction(firstName(confirming.person.name), confirming.had)} onYes={confirmClaim} onNo={closeConfirming} />
        </Popover>
      ) : null}
      {picker ? (
        <Popover anchor={picker.from.trigger} label={say.whoseItems} instant={picker.from.keyboard} closing={picker.closing} onClose={closePicker} onGone={pickerGone} width={personPickerWidth} align="start">
          <PersonPicker
            rows={people.map((person) => ({ id: person.id, name: person.name, share: money(shares.shares.find(({ participantId }) => participantId === person.id)?.share ?? cents(0), split.currency) }))}
            me={me}
            viewed={selectedPerson?.id ?? null}
            onView={(participantId) => {
              setSelected(participantId);
              closePicker();
            }}
            onEdit={() => {
              closePicker();
              open({ kind: "people" }, picker.from);
            }}
          />
        </Popover>
      ) : null}
      <Toast message={bar?.message ?? null} onHide={() => setBar(null)} action={bar?.action} lift={wide ? 16 : overlay && !closing ? 12 : footerHeight + 8} clearRight={wide ? frame.clearRight : 0} />
      {viewing && photo ? <PhotoViewer photo={{ uri: photoUrl, name: say.receiptPhoto }} onExited={photoClosed} /> : null}
    </>
  );

  if (wide)
    return (
      <View style={[styles.screen, { backgroundColor: c.field }]}>
        <ScrollView style={[styles.page, evenGutters]} contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: frameGutter }} onContentSizeChange={(width) => setPageRoom(width)}>
          <View style={[styles.frame, { width: frame.inner }]}>
            <SplitHeader
              onShare={() => void share()}
              links={
                <>
                  {photo ? <TextLink label={say.receipt} onPress={setViewing} /> : null}
                  <TextLink label={say.people} onPress={(from) => (me ? open({ kind: "people" }, from) : setPhase("pick"))} />
                  <TextLink label={say.payments} onPress={(from) => open({ kind: "payments", viewer: me }, from)} />
                  <TextLink label={say.history} onPress={(from) => open({ kind: "history" }, from)} />
                </>
              }
            />
            <View style={[styles.wideBody, { columnGap: frame.gap }]} onLayout={(event) => setAsideTop(Math.ceil(insets.top + event.nativeEvent.layout.y + wideBodyTop))}>
              <View style={styles.wideColumn}>
                <SplitIntro
                  host={host.name}
                  total={money(split.receipt.total, split.currency)}
                  place={split.place}
                  wide
                  onPeople={(from) => (me ? open({ kind: "people" }, from) : setPhase("pick"))}
                  onPayments={(from) => open({ kind: "payments", viewer: me }, from)}
                  onHistory={(from) => open({ kind: "history" }, from)}
                />
                <Presence present={me !== null && selectedPerson !== null && selectedPerson.id !== me} animate>
                  {me && selectedPerson ? <ViewingLine name={selectedPerson.name} onBack={() => setSelected(me)} /> : null}
                </Presence>
                <View style={styles.doc}>{receipt}</View>
              </View>
              <View style={[styles.aside, { width: frame.column, height: pageHeight - asideTop }]}>
                <ColumnStack depth={phase !== "regular" || overlay ? 1 : 0}>{aside}</ColumnStack>
              </View>
            </View>
          </View>
        </ScrollView>
        <ConnectionNotice connection={connection} />
        {layers}
      </View>
    );

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
            total={money(split.receipt.total, split.currency)}
            place={split.place}
            onLinksBottom={setLinksBottom}
            onReceipt={photo ? setViewing : undefined}
            onPeople={(from) => (me ? open({ kind: "people" }, from) : setPhase("pick"))}
            onPayments={(from) => open({ kind: "payments", viewer: me }, from)}
            onHistory={(from) => open({ kind: "history" }, from)}
          />
          <Presence present={me !== null && selectedPerson !== null && selectedPerson.id !== me} animate>
            {me && selectedPerson ? <ViewingLine name={selectedPerson.name} onBack={() => setSelected(me)} /> : null}
          </Presence>
          <View style={styles.doc}>{receipt}</View>
        </View>
      </ScrollView>
      {phase === "regular" ? footer : null}
      <ConnectionNotice connection={connection} />
      {phase === "regular" ? null : (
        <BottomSheet tapAway label={say.question} minHeight={pageHeight - (linksBottom === null ? tallPickTop : linksBottom + pickGap)} closing={phase === "collapsing"} onDown={pickLeft} testID="split-sheet">
          {pickContent}
        </BottomSheet>
      )}
      {overlay ? (
        <BottomSheet tapAway label={overlayLabel(overlay, split, viewedTitle)} onDown={overlayGone} holds={() => closeGuard.current?.() ?? false} closing={closing} bar={payBar} testID={overlay.kind === "pay" ? "breakdown" : `${overlay.kind}-sheet`}>
          {overlayContent}
        </BottomSheet>
      ) : null}
      {layers}
    </View>
  );
}

function intro(split: Split, creating: boolean) {
  const total = money(split.receipt.total, split.currency);
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
  gone: { gap: 8, paddingTop: 24 },
  goneAction: { marginTop: 16 },
  people: { gap: layout.blockGap },
  // The wide layout: one page that scrolls as a whole, the receipt on the left and on the right a column for what a phone shows in sheets, which stays in view while the receipt scrolls past.
  frame: { alignSelf: "center" },
  wideBody: { flexDirection: "row", alignItems: "flex-start", paddingTop: wideBodyTop },
  wideColumn: { flex: 1, minWidth: 0, paddingBottom: 64 },
  aside: { ...webStyle({ position: "sticky", top: "0px" }), paddingTop: 24 },
  payRest: { marginTop: 8 },
  problem: { alignSelf: "flex-start", marginTop: 10, marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
