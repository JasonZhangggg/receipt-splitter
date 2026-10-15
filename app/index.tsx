import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { recentSplits, rememberSplit } from "../src/device";
import { loadDraft, mismatchNote, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction, type Ready, type ReceiptFile } from "../src/draft";
import { createSplitLink, newParticipantId, sendPhoto } from "../src/live/client";
import { prefetchModel, recognize } from "../src/ocr";
import { readReceipt } from "../src/parse";
import { readOnServer } from "../src/scan/client";
import { chooseRoute, FALLBACK_WAIT_MS, within } from "../src/scan/route";
import { TextLink } from "../src/ui/components/text-link";
import { ThemeToggle } from "../src/ui/components/theme-toggle";
import { Toast } from "../src/ui/components/toast";
import { blockerText, copy } from "../src/ui/home-copy";
import { PayWords, roomForAnotherApp } from "../src/ui/home-sentence/pay-words";
import { PeopleWords, type NameField } from "../src/ui/home-sentence/people-words";
import { ReceiptWords, type ReadingStage, type ReceiptState } from "../src/ui/home-sentence/receipt-words";
import { stagePacer } from "../src/ui/home-sentence/stage-pacer";
import { webStyle } from "../src/ui/motion";
import { PinnedTop, useScrolledPast } from "../src/ui/pinned-top";
import { RecentSplits, recentGap } from "../src/ui/recent-splits";
import { HomeFooter } from "../src/ui/receipt-input/home-footer";
import type { ReceiptJpeg } from "../src/ui/receipt-input/jpeg";
import { focusInPlace, useKeyboardRoom } from "../src/ui/receipt-input/keyboard-room";
import { isPhoto, pickPhoto, receiptCopyOf, usePhotoDrop } from "../src/ui/receipt-input/photo";
import { breakpoints, layout, type, useColors } from "../src/ui/theme";

// Back remounts home without a reload, so the Draft lives as long as the page; a reload keeps only the handles.
let pageDraft: Draft | null = null;
/** The cleaned copy of the scanned photo that Create sends, kept beside the Draft and keyed to the scan's file. */
let pageCopy: { file: ReceiptFile; copy: Promise<ReceiptJpeg | null> } | null = null;
/** The OCR worker reports this share once its engine is loaded and it starts looking for text (ENGINE_READY in public/ocr-worker.mjs). */
const ENGINE_READY = 0.6;
/** The OCR worker reports this share once every model file has downloaded or come from its cache, before it builds the engine (DOWNLOADED in public/ocr-worker.mjs). */
const DOWNLOADED = 0.5;
/** The server's reading answers in about 1 s at the median (ADR 0010). Past this the wait is a flex fallback or a second pass, so home says it is taking longer. */
const SLOW_SERVER_MS = 4000;
/** The sentence pins to the top only while it takes at most this share of the screen. Taller (many or long names, a phone held sideways), the whole page scrolls so no field sits where the keyboard can cover it and nothing is trapped off screen. */
const PINNED_MAX_SHARE = 0.4;

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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
  const scanning = useRef(0);
  const pacer = useRef({ cancel() {} });
  const scroller = useRef<ScrollView>(null);
  const sentence = useRef<Text>(null);
  const handleInputs = useRef<(TextInput | null)[]>([]);
  const nameField = useRef<NameField>(null);
  const [topHeight, setTopHeight] = useState(0);
  const { scrolled, onScroll } = useScrolledPast(recentGap);
  const room = useKeyboardRoom(scroller);
  useEffect(prefetchModel, []);
  useEffect(() => {
    pageDraft = draft;
    saveDraft(draft);
  }, [draft]);

  const dispatch = useCallback((action: DraftAction) => {
    setFailure(null);
    apply(action);
  }, []);

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
    const boxes = onServer ? null : await within(ocr, FALLBACK_WAIT_MS);
    const onDevice = boxes ? readReceipt(boxes) : null;
    globalThis.performance?.mark?.("scan-read");
    await stages.settle();
    const receipt = onServer || (onDevice?.receipt ?? null);
    if (scan === scanning.current) {
      dispatch({ type: "read", file, receipt, ...(onDevice && !onDevice.totalRead && { totalUnread: true as const }) });
      if (receipt === null && globalThis.navigator?.onLine === false) setNotice(copy.scanOffline);
    }
  }, [dispatch]);
  usePhotoDrop(read, draft.scan.status === "empty");
  const choose = () => pickPhoto(read);

  const sides = { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right };
  const columnWidth = width >= breakpoints.roomyFrom ? 480 : 440;
  const { scan } = draft;
  const receipt: ReceiptState = scan.status === "empty" ? { kind: "empty" } : scan.status === "reading" ? { kind: "reading", stage } : { kind: "read", total: scan.receipt?.total ?? null };
  const ready = readiness(draft);
  const blocked = ready.kind !== "ready";
  const reason = failure ?? (blocked ? blockerText(ready) : mismatchNote(draft));
  const problem = failure !== null || (blocked && (ready.kind === "badHandle" || tried === reason));

  const create = async (split: Ready) => {
    const request = splitRequest(split, newParticipantId);
    const scan = scanning.current;
    const photoCopy = draft.scan.status === "read" && pageCopy?.file === draft.scan.file ? pageCopy.copy : null;
    setCreating(true);
    setFailure(null);
    const created = await createSplitLink({ split: request });
    setCreating(false);
    if (!created.ok) return setFailure(created.reason);
    rememberSplit(created.id, { creatorSecret: created.creatorSecret });
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
    if (scan.status === "reading") return;
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

  return (
    <View style={[styles.screen, still, { backgroundColor: c.field }]}>
      <ScrollView ref={scroller} style={styles.screen} contentContainerStyle={[styles.page, { paddingBottom: 32 + room }]} onScroll={onScroll} scrollEventThrottle={16}>
        <PinnedTop pinned={topHeight <= height * PINNED_MAX_SHARE} scrolled={scrolled} top={20 + insets.top} bottom={12} left={sides.paddingLeft} right={sides.paddingRight} onHeight={setTopHeight}>
          <View style={[styles.column, { maxWidth: columnWidth }]}>
            <View style={styles.header}>
              <Text role="heading" aria-level={1} style={[type.title, { color: c.ink }]}>
                {copy.wordmark}
              </Text>
              <ThemeToggle />
            </View>

            <Text ref={sentence} testID="sentence" style={[type.say, styles.sentence, { color: c.muted }]}>
              <ReceiptWords state={receipt} onChoose={choose} /> <PayWords handles={draft.handles} dispatch={dispatch} inputs={handleInputs} />{" "}
              <PeopleWords ref={nameField} names={draft.names} onAdd={(name) => dispatch({ type: "addName", name })} onRemove={(name) => dispatch({ type: "removeName", name })} onRefusal={setRefusal} />
            </Text>
            {refusal ? (
              <Text role="alert" style={[type.caption, styles.refusal, { color: c.warn }]}>
                {refusal}
              </Text>
            ) : null}
            {roomForAnotherApp(draft.handles) ? (
              <View style={styles.addApp}>
                <TextLink plus label={copy.addApp} name={copy.addAppName} onPress={() => dispatch({ type: "addHandle" })} />
              </View>
            ) : null}
          </View>
        </PinnedTop>

        {stored.length > 0 ? (
          <View style={[styles.recent, { maxWidth: columnWidth + sides.paddingLeft + sides.paddingRight, paddingLeft: sides.paddingLeft, paddingRight: sides.paddingRight }]}>
            <RecentSplits splits={stored} now={now} />
          </View>
        ) : null}
      </ScrollView>

      <HomeFooter reason={reason} live={scan.status !== "reading"} problem={problem} blocked={blocked} busy={creating} onPress={press} onHeight={setFooterHeight} width={columnWidth} />
      <Toast message={notice} onHide={() => setNotice(null)} lift={footerHeight} />
    </View>
  );
}

// With no room past the page, iOS cannot scroll the window to reveal a field, so useKeyboardRoom scrolls the page's own scroller.
const still = webStyle({ overflow: "clip" });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1, alignItems: "center" },
  column: { width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  recent: { width: "100%" },
  sentence: { marginTop: 40 },
  refusal: { marginTop: 8 },
  addApp: { marginTop: 4 },
});
