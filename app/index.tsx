import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { recentSplits, rememberSplit, thisDevice } from "../src/device";
import { markJustMade } from "../src/ui/split-view/just-made";
import { loadDraft, mismatchNote, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction, type Ready, type ReceiptFile } from "../src/draft";
import { createSplitLink, newParticipantId, sendPhoto } from "../src/live/client";
import { prefetchModel, recognize } from "../src/ocr";
import { readReceipt } from "../src/parse";
import { readOnServer } from "../src/scan/client";
import { chooseRoute, FALLBACK_WAIT_MS, within } from "../src/scan/route";
import { Toast } from "../src/ui/components/toast";
import { Popover, useEscape } from "../src/ui/components/popover";
import { useLayoutWidth } from "../src/ui/components/viewport";
import type { Press } from "../src/ui/components/button";
import { actedByKey } from "../src/ui/components/acted-by-key";
import { frameFor, frameGutter } from "../src/ui/frame";
import { blockerText, copy, historyCopy, paymentApps } from "../src/ui/home-copy";
import { AppMenu, appMenuWidth } from "../src/ui/home-sentence/app-menu";
import { CurrencyMenu } from "../src/ui/home-sentence/currency-menu";
import { appChoices, PayWords, roomForAnotherApp } from "../src/ui/home-sentence/pay-words";
import { PeopleWords, type NameField } from "../src/ui/home-sentence/people-words";
import { ReceiptWords, type ReadingStage, type ReceiptState } from "../src/ui/home-sentence/receipt-words";
import { SaySizeProvider, saySizes } from "../src/ui/home-sentence/say-size";
import { stagePacer } from "../src/ui/home-sentence/stage-pacer";
import { webStyle } from "../src/ui/motion";
import { Presence } from "../src/ui/presence";
import { RecentSheet, RecentSplits } from "../src/ui/recent-splits";
import { BottomSheet } from "../src/ui/split-view/bottom-sheet";
import { SplitHeader } from "../src/ui/split-view/header";
import { shareLink, siteUrl } from "../src/ui/share-link";
import { splitCopy } from "../src/ui/split-copy";
import { HomeFooter } from "../src/ui/receipt-input/home-footer";
import type { ReceiptJpeg } from "../src/ui/receipt-input/jpeg";
import { focusInPlace, useKeyboardRoom } from "../src/ui/receipt-input/keyboard-room";
import { isPhoto, pickPhoto, receiptCopyOf, usePhotoDrop } from "../src/ui/receipt-input/photo";
import type { PaymentService } from "../src/core/split";
import { breakpoints, layout, type, useColors } from "../src/ui/theme";

// Back remounts home without a reload, so the Draft lives as long as the page; a reload keeps only the handles.
let pageDraft: Draft | null = null;
/** A read can outlive the Home that started it (Create link moves to the Split page). The scan count and the Home on screen live here, so a late result lands in the Home showing, or in the saved draft for the next one. */
const scanning = { current: 0 };
let onScreen: ((action: DraftAction) => void) | null = null;
const land = (action: DraftAction) => {
  if (onScreen) return onScreen(action);
  pageDraft = reduceDraft(pageDraft ?? loadDraft(), action);
  saveDraft(pageDraft);
};
/** The cleaned copy of the scanned photo that Create sends, kept beside the Draft and keyed to the scan's file. */
let pageCopy: { file: ReceiptFile; copy: Promise<ReceiptJpeg | null> } | null = null;
/** The OCR worker reports this share once its engine is loaded and it starts looking for text (ENGINE_READY in public/ocr-worker.mjs). */
const ENGINE_READY = 0.6;
/** The OCR worker reports this share once every model file has downloaded or come from its cache, before it builds the engine (DOWNLOADED in public/ocr-worker.mjs). */
const DOWNLOADED = 0.5;
/** The server's reading answers in about 1 s at the median (ADR 0010). Past this the wait is a flex fallback or a second pass, so home says it is taking longer. */
const SLOW_SERVER_MS = 4000;

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const width = useLayoutWidth();
  const wide = width >= breakpoints.pairFrom;
  const say = wide ? saySizes.wide : saySizes.phone;
  const [draft, apply] = useReducer(reduceDraft, undefined, () => pageDraft ?? loadDraft());
  const [stage, setStage] = useState<ReadingStage>("start");
  const [notice, setNotice] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [tried, setTried] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [now] = useState(Date.now);
  const [stored] = useState(() => recentSplits(now));
  const [allSplits, setAllSplits] = useState<{ from: Press; closing: boolean } | null>(null);
  /** The app menu of the clause at `index`. `picked` is the app it switched to and `added` that it added a clause, which say where the focus goes once it has gone. */
  const [appMenu, setAppMenu] = useState<{ index: number; from: Press; closing: boolean; picked: PaymentService | null; added: boolean } | null>(null);
  const [currencyMenu, setCurrencyMenu] = useState<{ from: Press; closing: boolean } | null>(null);
  const pacer = useRef({ cancel() {} });
  const scroller = useRef<ScrollView>(null);
  const sentence = useRef<Text>(null);
  const handleInputs = useRef<(TextInput | null)[]>([]);
  const nameField = useRef<NameField>(null);
  const room = useKeyboardRoom(scroller);
  useEffect(prefetchModel, []);
  useEffect(() => {
    pageDraft = draft;
    saveDraft(draft);
  }, [draft]);

  const shareSite = async () => {
    const result = await shareLink(siteUrl());
    if (result !== "shared") setNotice(result === "copied" ? splitCopy.linkCopied : splitCopy.copyFailed);
  };

  const dispatch = useCallback((action: DraftAction) => {
    setFailure(null);
    apply(action);
  }, []);
  useEffect(() => {
    onScreen = dispatch;
    return () => {
      if (onScreen === dispatch) onScreen = null;
    };
  }, [dispatch]);

  const read = useCallback(async (photo: File) => {
    if (!isPhoto(photo)) return setNotice(copy.notPhoto);
    const scan = ++scanning.current;
    const file: ReceiptFile = {};
    pacer.current.cancel();
    // Each step word stays up long enough to read, so a fast read does not flash them.
    const stages = stagePacer<ReadingStage>((next) => scan === scanning.current && setStage(next));
    pacer.current = stages;
    stages.push("start");
    dispatch({ type: "reading", file });
    globalThis.performance?.mark?.("scan-picked");
    let waiting = true;
    let downloaded = () => {};
    const ready = new Promise<void>((resolve) => (downloaded = resolve));
    const ocr = recognize(photo, (fraction) => {
      if (fraction >= DOWNLOADED) downloaded();
      if (fraction >= ENGINE_READY && waiting && scan === scanning.current) stages.push("text");
    }).catch(() => null);
    // The wait covers the download, so a slow phone building a cached engine still sends OCR text.
    const route = await chooseRoute(ready, ocr);
    // The photo route sends no OCR text, and neither does an OCR run that failed. The OCR run goes on in the worker for the fallback, and so does the download for the next scan.
    const sent = route === "photo" ? [] : ((await ocr) ?? []);
    waiting = false;
    globalThis.performance?.mark?.("copy-start");
    const copying = receiptCopyOf(photo, sent).catch(() => null);
    void copying.then(() => globalThis.performance?.mark?.("copy-done"));
    if (scan !== scanning.current) return;
    pageCopy = { file, copy: copying };
    stages.push("server");
    const slow = setTimeout(() => scan === scanning.current && stages.push("slow"), SLOW_SERVER_MS);
    const onServer = await readOnServer(photo, sent);
    clearTimeout(slow);
    const notReceipt = onServer === "notReceipt";
    // A "none" from the model can be wrong about a blurry receipt, so the on-device read still gets its turn.
    const boxes = onServer && !notReceipt ? null : await within(ocr, FALLBACK_WAIT_MS);
    const onDevice = boxes ? readReceipt(boxes) : null;
    globalThis.performance?.mark?.("scan-read");
    await stages.settle();
    const server = notReceipt ? null : onServer;
    const receipt = server?.receipt ?? onDevice?.receipt ?? null;
    if (scan === scanning.current) {
      const currency = server ? server.currency : onDevice?.currency;
      land({ type: "read", file, receipt, ...(server?.place && { place: server.place }), ...(currency && { currency }), ...(notReceipt && receipt === null && { notReceipt: true as const }), ...(onDevice && !onDevice.totalRead && { totalUnread: true as const }) });
      if (receipt === null && globalThis.navigator?.onLine === false) setNotice(copy.scanOffline);
    }
  }, [dispatch]);
  // A drop or paste replaces a finished read as Change does; only a read in progress turns it away.
  usePhotoDrop(read, draft.scan.status !== "reading");
  const choose = () => pickPhoto(read);

  const sides = { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right };
  // Below the wide layout home is one column, as wide as the Split page's.
  const columnWidth = 440;
  const { scan } = draft;
  const receipt: ReceiptState = scan.status === "empty" ? { kind: "empty" } : scan.status === "reading" ? { kind: "reading", stage } : scan.status === "byHand" ? { kind: "byHand" } : { kind: "read", total: scan.receipt?.total ?? null, place: scan.place ?? null };
  const ready = readiness(draft);
  const blocked = ready.kind !== "ready";
  const reason = failure ?? (blocked ? blockerText(ready) : mismatchNote(draft));
  // After a read, a note that blocks Create is a problem with the receipt (nothing read, too many Items); before it, the note only says what is still to do.
  const problem = failure !== null || (blocked && (ready.kind === "badHandle" || (ready.kind === "note" && scan.status === "read") || (reason !== null && tried === reason)));

  const create = async (split: Ready) => {
    const request = { ...splitRequest(split, newParticipantId), hostDevice: thisDevice() };
    const scan = scanning.current;
    const photoCopy = draft.scan.status === "read" && pageCopy?.file === draft.scan.file ? pageCopy.copy : null;
    setCreating(true);
    setFailure(null);
    const created = await createSplitLink({ split: request });
    setCreating(false);
    if (!created.ok) return setFailure(created.reason);
    rememberSplit(created.id, { creatorSecret: created.creatorSecret, me: request.participants[0].id });
    void photoCopy?.then((jpeg) => jpeg && sendPhoto(created.id, created.creatorSecret, jpeg));
    if (scan === scanning.current) {
      pageCopy = null;
      apply({ type: "created" });
    }
    markJustMade(created.id);
    router.push(`/s/${created.id}`);
  };

  // A tap on the gray pill takes the person to what stops it: the bad handle, the name field, or another photo.
  const press = () => {
    if (ready.kind === "ready") return void create(ready);
    if (ready.kind === "reading") return;
    setTried(blockerText(ready));
    switch (ready.kind) {
      case "badHandle":
        return focusInPlace(handleInputs.current[ready.index] ?? null);
      case "noName":
        return nameField.current?.open();
      case "note":
        return choose();
    }
  };

  const closeAll = () => setAllSplits((open) => open && { ...open, closing: true });
  const allGone = () => {
    const from = allSplits?.from;
    setAllSplits(null);
    if (from && (from.keyboard || actedByKey()) && from.trigger.isConnected) from.trigger.focus({ preventScroll: true });
  };
  useEscape(allSplits !== null && !allSplits.closing, closeAll);

  const closeAppMenu = (change: { picked?: PaymentService; added?: boolean } = {}) => setAppMenu((open) => open && { ...open, ...change, closing: true });
  const appMenuGone = () => {
    setAppMenu(null);
    // An added clause's field has the focus already. Otherwise a keyboard user goes back to the app's name, which a switch remounts under its new name.
    if (!appMenu || appMenu.added || !(appMenu.from.keyboard || actedByKey())) return;
    const word = appMenu.from.trigger.isConnected ? appMenu.from.trigger : appMenu.picked && document.querySelector<HTMLElement>(`[aria-label="${copy.paymentApp}, ${paymentApps[appMenu.picked].name}"]`);
    word?.focus({ preventScroll: true });
  };

  const currencyMenuGone = () => {
    const from = currencyMenu?.from;
    setCurrencyMenu(null);
    // The amount word stays in place under its menu, so a keyboard user lands back on it.
    if (from && (from.keyboard || actedByKey()) && from.trigger.isConnected) from.trigger.focus({ preventScroll: true });
  };

  const sentenceBlock = (
    <>
      <Text ref={sentence} testID="sentence" style={[say.text, wide ? styles.sentenceWide : styles.sentence, { color: c.muted }]}>
        <ReceiptWords
          state={receipt}
          currency={draft.currency}
          menu={currencyMenu !== null && !currencyMenu.closing}
          onCurrency={(from) => setCurrencyMenu({ from, closing: false })}
          onChoose={choose} onByHand={() => dispatch({ type: "byHand" })} onPlace={(name) => dispatch({ type: "setPlace", name })} />{" "}
        <PayWords handles={draft.handles} dispatch={dispatch} inputs={handleInputs} menu={appMenu && !appMenu.closing ? appMenu.index : null} onMenu={(index, from) => setAppMenu({ index, from, closing: false, picked: null, added: false })} />{" "}
        <PeopleWords
          ref={nameField}
          host={draft.host}
          friends={draft.friends}
          onSetHost={(name) => dispatch({ type: "setHost", name })}
          onRemoveHost={() => dispatch({ type: "removeHost" })}
          onAddFriend={(name) => dispatch({ type: "addFriend", name })}
          onRemoveFriend={(name) => dispatch({ type: "removeFriend", name })}
          onRefusal={setRefusal}
        />
      </Text>
      <Presence present={refusal !== null} animate>
        <Text role="alert" style={[type.caption, styles.refusal, { color: c.warn }]}>
          {refusal}
        </Text>
      </Presence>
    </>
  );
  const recents = stored.length > 0 ? <RecentSplits splits={stored} now={now} wide={wide} onSeeAll={(from) => setAllSplits({ from, closing: false })} /> : null;
  const footer = (
    <HomeFooter reason={reason} live={scan.status !== "reading"} problem={problem} blocked={blocked} busy={creating} onPress={press} onHeight={setFooterHeight} width={columnWidth} wide={wide} />
  );
  const frame = frameFor(width);

  return (
    <SaySizeProvider value={say}>
      <View style={[styles.screen, still, { backgroundColor: c.field }]}>
        {wide ? (
          // The Split page's wide frame: the sentence and Create on the left, Recent splits in the column beside it, centered in the window as one.
          <ScrollView ref={scroller} style={styles.screen} contentContainerStyle={[styles.page, { paddingTop: insets.top, paddingHorizontal: frameGutter }]}>
            <View style={[styles.frame, { width: frame.inner }]}>
              <SplitHeader home onShare={() => void shareSite()} />
              <View style={[styles.wideBody, { columnGap: frame.gap }]}>
                <View style={styles.wideMain}>
                  {sentenceBlock}
                  {footer}
                </View>
                <View style={[styles.aside, { width: frame.column }]}>{recents}</View>
              </View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            ref={scroller}
            style={styles.screen}
            contentContainerStyle={[styles.page, sides, { paddingTop: insets.top, paddingBottom: bottomGap + room }]}
          >
            <View style={[styles.column, { maxWidth: columnWidth }]}>
              <SplitHeader home onShare={() => void shareSite()} />
              {sentenceBlock}
              {recents}
            </View>
          </ScrollView>
        )}

        {wide ? null : footer}
        <Toast message={notice} onHide={() => setNotice(null)} lift={wide ? 16 : footerHeight} />
        {appMenu ? (
          <Popover anchor={appMenu.from.trigger} label={copy.paymentApp} instant={appMenu.from.keyboard} closing={appMenu.closing} onClose={() => closeAppMenu()} onGone={appMenuGone} width={appMenuWidth} align="start">
            <AppMenu
              service={draft.handles[appMenu.index]?.service ?? "venmo"}
              choices={appChoices(draft.handles, appMenu.index, draft.currency)}
              adding={roomForAnotherApp(draft.handles, draft.currency) ? draft.handles.length : null}
              onPick={(picked) => {
                if (picked !== draft.handles[appMenu.index]?.service) dispatch({ type: "setService", index: appMenu.index, service: picked });
                closeAppMenu({ picked });
              }}
              onAdd={() => {
                dispatch({ type: "addHandle" });
                closeAppMenu({ added: true });
              }}
            />
          </Popover>
        ) : null}
        {currencyMenu ? (
          <Popover
            anchor={currencyMenu.from.trigger}
            label={copy.currency}
            instant={currencyMenu.from.keyboard}
            closing={currencyMenu.closing}
            onClose={() => setCurrencyMenu((open) => open && { ...open, closing: true })}
            onGone={currencyMenuGone}
            width={appMenuWidth}
            align="start"
          >
            <CurrencyMenu
              currency={draft.currency}
              onPick={(currency) => {
                if (currency !== draft.currency) dispatch({ type: "setCurrency", currency });
                setCurrencyMenu((open) => open && { ...open, closing: true });
              }}
            />
          </Popover>
        ) : null}
        {allSplits ? (
          <BottomSheet tapAway label={historyCopy.title} closing={allSplits.closing} onDown={allGone} testID="recent-sheet">
            <RecentSheet splits={stored} now={now} onClose={closeAll} />
          </BottomSheet>
        ) : null}
      </View>
    </SaySizeProvider>
  );
}

/** Room under the page's last row, above the footer. */
const bottomGap = 32;

// With no room past the page, iOS cannot scroll the window to reveal a field, so useKeyboardRoom scrolls the page's own scroller.
const still = webStyle({ overflow: "clip" });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1, alignItems: "center" },
  column: { width: "100%", flex: 1 },
  sentence: { marginTop: 28 },
  sentenceWide: { marginTop: 32 },
  refusal: { marginTop: 8 },
  frame: { flex: 1 },
  wideBody: { flex: 1, flexDirection: "row", alignItems: "stretch", paddingBottom: 48 },
  wideMain: { flex: 1, minWidth: 0 },
  // Recent splits' heading sits on the middle of the sentence's first line.
  aside: { paddingTop: 32 + (type.sayWide.lineHeight - type.body.lineHeight) / 2 },
});
