import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents } from "../src/core/money";
import { recentSplits, rememberSplit } from "../src/device";
import { loadDraft, mismatchNote, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction, type Ready, type ReceiptFile } from "../src/draft";
import { createSplitLink, newParticipantId, sendPhoto } from "../src/live/client";
import { prefetchModel, recognize } from "../src/ocr";
import { readReceipt } from "../src/parse";
import { readOnServer } from "../src/scan/client";
import { TextLink } from "../src/ui/components/text-link";
import { ThemeToggle } from "../src/ui/components/theme-toggle";
import { Toast } from "../src/ui/components/toast";
import { blockerText, copy } from "../src/ui/home-copy";
import { PayWords, roomForAnotherApp } from "../src/ui/home-sentence/pay-words";
import { PeopleWords, type NameField } from "../src/ui/home-sentence/people-words";
import { ReceiptWords, type ReadingStage, type ReceiptState } from "../src/ui/home-sentence/receipt-words";
import { webStyle } from "../src/ui/motion";
import { RecentSplits } from "../src/ui/recent-splits";
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
  const scanning = useRef(0);
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

  const dispatch = useCallback((action: DraftAction) => {
    setFailure(null);
    apply(action);
  }, []);

  const read = useCallback(async (photo: File) => {
    if (!isPhoto(photo)) return setNotice(copy.notPhoto);
    const scan = ++scanning.current;
    const file: ReceiptFile = { name: photo.name || copy.pastedPhoto };
    setStage("start");
    dispatch({ type: "reading", file });
    globalThis.performance?.mark?.("scan-picked");
    const boxes = await recognize(photo, (fraction) => scan === scanning.current && fraction >= ENGINE_READY && setStage("text")).catch(() => null);
    globalThis.performance?.mark?.("copy-start");
    const copying = receiptCopyOf(photo, boxes ?? []).catch(() => null);
    void copying.then(() => globalThis.performance?.mark?.("copy-done"));
    if (scan === scanning.current) pageCopy = { file, copy: copying };
    if (boxes && scan === scanning.current) setStage("server");
    const slow = boxes ? setTimeout(() => scan === scanning.current && setStage("slow"), SLOW_SERVER_MS) : undefined;
    const onServer = boxes && (await readOnServer(photo, boxes));
    clearTimeout(slow);
    const onDevice = boxes && !onServer ? readReceipt(boxes) : null;
    globalThis.performance?.mark?.("scan-read");
    if (scan === scanning.current) dispatch({ type: "read", file, receipt: onServer || (onDevice?.receipt ?? null), ...(onDevice && !onDevice.totalRead && { totalUnread: true as const }) });
  }, [dispatch]);
  usePhotoDrop(read, draft.scan.status === "empty");
  const choose = () => pickPhoto(read);

  const sides = { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right };
  const columnWidth = width >= breakpoints.roomyFrom ? 480 : 440;
  const { scan } = draft;
  const receipt: ReceiptState = scan.status === "empty" ? { kind: "empty" } : scan.status === "reading" ? { kind: "reading", stage } : { kind: "read", total: scan.receipt?.total ?? cents(0) };
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
      <ScrollView ref={scroller} style={styles.screen} contentContainerStyle={[styles.page, sides, { paddingTop: 20 + insets.top, paddingBottom: 32 + room }]}>
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

          {stored.length > 0 ? <RecentSplits splits={stored} now={now} /> : null}
        </View>
      </ScrollView>

      <HomeFooter reason={reason} problem={problem} blocked={blocked} busy={creating} onPress={press} onHeight={setFooterHeight} width={columnWidth} />
      <Toast message={notice} onHide={() => setNotice(null)} lift={footerHeight} />
    </View>
  );
}

// With no room past the page, iOS cannot scroll the window to reveal a field, so useKeyboardRoom scrolls the page's own scroller.
const still = webStyle({ overflow: "clip" });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1, alignItems: "center" },
  column: { width: "100%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  sentence: { marginTop: 40 },
  refusal: { marginTop: 8 },
  addApp: { marginTop: 4 },
});
