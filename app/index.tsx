import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { recentSplits, rememberSplit, thisDevice } from "../src/device";
import { loadDraft, mismatchNote, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction, type Ready, type ReceiptFile } from "../src/draft";
import { createSplitLink, newParticipantId, sendPhoto } from "../src/live/client";
import { prefetchModel, recognize } from "../src/ocr";
import { readReceipt } from "../src/parse";
import { readOnServer } from "../src/scan/client";
import { chooseRoute, FALLBACK_WAIT_MS, within } from "../src/scan/route";
import { Toast } from "../src/ui/components/toast";
import { useEscape } from "../src/ui/components/popover";
import type { Press } from "../src/ui/components/button";
import { actedByKey } from "../src/ui/components/acted-by-key";
import { blockerText, copy, historyCopy } from "../src/ui/home-copy";
import { PayWords } from "../src/ui/home-sentence/pay-words";
import { PeopleWords, type NameField } from "../src/ui/home-sentence/people-words";
import { ReceiptWords, type ReadingStage, type ReceiptState } from "../src/ui/home-sentence/receipt-words";
import { stagePacer } from "../src/ui/home-sentence/stage-pacer";
import { webStyle } from "../src/ui/motion";
import { RecentSheet, RecentSplits } from "../src/ui/recent-splits";
import { BottomSheet } from "../src/ui/split-view/bottom-sheet";
import { SplitHeader } from "../src/ui/split-view/header";
import { shareLink, siteUrl } from "../src/ui/share-link";
import { splitCopy } from "../src/ui/split-copy";
import { HomeFooter } from "../src/ui/receipt-input/home-footer";
import type { ReceiptJpeg } from "../src/ui/receipt-input/jpeg";
import { focusInPlace, useKeyboardRoom } from "../src/ui/receipt-input/keyboard-room";
import { isPhoto, pickPhoto, receiptCopyOf, usePhotoDrop } from "../src/ui/receipt-input/photo";
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
  const { width } = useWindowDimensions();
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
    const receipt = (notReceipt ? null : onServer) || (onDevice?.receipt ?? null);
    if (scan === scanning.current) {
      land({ type: "read", file, receipt, ...(notReceipt && receipt === null && { notReceipt: true as const }), ...(onDevice && !onDevice.totalRead && { totalUnread: true as const }) });
      if (receipt === null && globalThis.navigator?.onLine === false) setNotice(copy.scanOffline);
    }
  }, [dispatch]);
  // A drop or paste replaces a finished read as Change does; only a read in progress turns it away.
  usePhotoDrop(read, draft.scan.status !== "reading");
  const choose = () => pickPhoto(read);

  const sides = { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right };
  const columnWidth = width >= breakpoints.roomyFrom ? 480 : 440;
  const { scan } = draft;
  const receipt: ReceiptState = scan.status === "empty" ? { kind: "empty" } : scan.status === "reading" ? { kind: "reading", stage } : scan.status === "byHand" ? { kind: "byHand" } : { kind: "read", total: scan.receipt?.total ?? null };
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
    router.push(`/s/${created.id}`);
  };

  // A tap on the gray pill takes the person to what stops it: the bad handle, the name field, or Add the receipt.
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
        if (scan.status === "read") return choose();
        return focusInPlace((sentence.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>("[data-pressable]") ?? null);
    }
  };

  const closeAll = () => setAllSplits((open) => open && { ...open, closing: true });
  const allGone = () => {
    const from = allSplits?.from;
    setAllSplits(null);
    if (from && (from.keyboard || actedByKey()) && from.trigger.isConnected) from.trigger.focus({ preventScroll: true });
  };
  useEscape(allSplits !== null && !allSplits.closing, closeAll);

  return (
    <View style={[styles.screen, still, { backgroundColor: c.field }]}>
      <ScrollView
        ref={scroller}
        style={styles.screen}
        contentContainerStyle={[styles.page, sides, { paddingTop: insets.top, paddingBottom: bottomGap + room }]}
      >
        <View style={[styles.column, { maxWidth: columnWidth }]}>
          <SplitHeader home onShare={() => void shareSite()} />

          <Text ref={sentence} testID="sentence" style={[type.say, styles.sentence, { color: c.muted }]}>
            <ReceiptWords state={receipt} onChoose={choose} onByHand={() => dispatch({ type: "byHand" })} /> <PayWords handles={draft.handles} dispatch={dispatch} inputs={handleInputs} />{" "}
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
          {refusal ? (
            <Text role="alert" style={[type.caption, styles.refusal, { color: c.warn }]}>
              {refusal}
            </Text>
          ) : null}

          {stored.length > 0 ? <RecentSplits splits={stored} now={now} onSeeAll={(from) => setAllSplits({ from, closing: false })} /> : null}
        </View>
      </ScrollView>

      <HomeFooter reason={reason} live={scan.status !== "reading"} problem={problem} blocked={blocked} busy={creating} onPress={press} onHeight={setFooterHeight} width={columnWidth} />
      <Toast message={notice} onHide={() => setNotice(null)} lift={footerHeight} />
      {allSplits ? (
        <BottomSheet tapAway label={historyCopy.title} closing={allSplits.closing} onDown={allGone} testID="recent-sheet">
          <RecentSheet splits={stored} now={now} onClose={closeAll} />
        </BottomSheet>
      ) : null}
    </View>
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
  sentence: { marginTop: 40 },
  refusal: { marginTop: 8 },
});
