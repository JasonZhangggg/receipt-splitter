import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents } from "../src/core/money";
import { recentSplits, rememberSplit } from "../src/device";
import { mismatchNote, loadDraft, newName, readiness, reduceDraft, saveDraft, splitRequest, type Draft, type DraftAction, type Ready, type ReceiptFile } from "../src/draft";
import { createSplitLink, newParticipantId, sendPhoto } from "../src/live/client";
import { prefetchModel, recognize } from "../src/ocr";
import { parseReceipt } from "../src/parse";
import { readOnServer } from "../src/scan/client";
import { Button, PressTarget } from "../src/ui/components/button";
import { NameChips } from "../src/ui/components/name-chips";
import { PaymentRows } from "../src/ui/components/payment-row";
import { Sheet } from "../src/ui/components/sheet";
import { useLayoutHeight } from "../src/ui/components/viewport";
import { Slip } from "../src/ui/components/slip";
import { Toast } from "../src/ui/components/toast";
import { copy, createCopy, joinCopy } from "../src/ui/home-copy";
import { webStyle } from "../src/ui/motion";
import { PhotoViewer, type Photo } from "../src/ui/photo-viewer";
import { RecentSplits } from "../src/ui/recent-splits";
import type { ReceiptJpeg } from "../src/ui/receipt-input/jpeg";
import { isPhoto, photoUri, pickPhoto, receiptCopyOf, releasePhotoUri, thumbnailOf, usePhotoDrop } from "../src/ui/receipt-input/photo";
import { ReceiptSummary } from "../src/ui/receipt-input/receipt-summary";
import { Reading } from "../src/ui/receipt-input/reading";
import { breakpoints, layout, motion, type, useColors } from "../src/ui/theme";


const ringChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

// Back remounts home without a reload, so the Draft lives as long as the page; a reload keeps only the handles.
let pageDraft: Draft | null = null;
/** The reading bar's share for on-device OCR. The rest waits on the server's reading, which reports no progress. */
const OCR_SHARE = 0.8;

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const height = useLayoutHeight();
  const [draft, apply] = useReducer(reduceDraft, undefined, () => pageDraft ?? loadDraft());
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [viewing, setViewing] = useState(false);
  const [now] = useState(Date.now);
  const [stored] = useState(() => recentSplits(now));
  const scanning = useRef(0);
  const receiptCopy = useRef<{ scan: number; copy: Promise<ReceiptJpeg | null> } | null>(null);
  const handleInput = useRef<TextInput>(null);
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
    const file: ReceiptFile = { name: photo.name || copy.pastedPhoto, thumbnail: await thumbnailOf(photo).catch(() => null) };
    if (scan !== scanning.current) return;
    const uri = photoUri(photo);
    setPhoto(uri === null ? null : { uri, name: file.name });
    setProgress(0);
    dispatch({ type: "reading", file });
    globalThis.performance?.mark?.("scan-picked");
    const boxes = await recognize(photo, (fraction) => scan === scanning.current && setProgress(fraction * OCR_SHARE)).catch(() => null);
    globalThis.performance?.mark?.("copy-start");
    const copying = receiptCopyOf(photo, boxes ?? []).catch(() => null);
    void copying.then(() => globalThis.performance?.mark?.("copy-done"));
    if (scan === scanning.current) receiptCopy.current = { scan, copy: copying };
    const receipt = boxes && ((await readOnServer(photo, boxes)) ?? parseReceipt(boxes));
    globalThis.performance?.mark?.("scan-read");
    if (scan === scanning.current) dispatch({ type: "read", file, receipt });
  }, [dispatch]);
  const dragging = usePhotoDrop(read, draft.scan.status === "empty");
  const choose = () => pickPhoto(read);
  const example = () => {
    scanning.current++;
    receiptCopy.current = null;
    setPhoto(null);
    dispatch({ type: "example" });
  };
  useEffect(() => (photo ? () => releasePhotoUri(photo.uri) : undefined), [photo]);

  const wide = width >= breakpoints.columnFrom;
  const roomy = width >= breakpoints.roomyFrom;
  const hero = wide ? copy.hero.desktop : copy.hero.phone;
  const gutter = wide ? 40 : layout.gutter;
  const sides = { paddingLeft: gutter + insets.left, paddingRight: gutter + insets.right };
  const { scan } = draft;
  const ready = readiness(draft);
  const reason = ready.kind === "note" ? ready.note : null;

  const create = async (split: Ready) => {
    const request = splitRequest(split, newParticipantId);
    const scan = scanning.current;
    const photoCopy = receiptCopy.current?.scan === scan ? receiptCopy.current.copy : null;
    setCreating(true);
    setFailure(null);
    const created = await createSplitLink({ split: request });
    setCreating(false);
    if (!created.ok) return setFailure(created.reason);
    rememberSplit(created.id, { creatorSecret: created.creatorSecret });
    void photoCopy?.then((jpeg) => jpeg && sendPhoto(created.id, created.creatorSecret, jpeg));
    if (scan === scanning.current) {
      receiptCopy.current = null;
      setPhoto(null);
      apply({ type: "created" });
    }
    router.push(`/s/${created.id}`);
  };

  const press = () => {
    switch (ready.kind) {
      case "ready":
        return void create(ready);
      case "noHandle":
        handleInput.current?.focus();
        return setFailure(createCopy.noHandle);
      case "note":
        return setFailure(ready.note);
    }
  };

  const people = draft.names;
  const addName = (typed: string): string | null => {
    const named = newName(typed, people);
    if (!named.ok) return named.reason === "nameTaken" ? joinCopy.nameTaken : null;
    dispatch({ type: "addName", name: typed });
    return null;
  };
  const removeName = (name: string) => dispatch({ type: "removeName", name });
  const compact = !wide && height - insets.top - insets.bottom < shortScreen;
  const columnWidth = roomy ? 480 : 440;
  const view = photo ? () => setViewing(true) : undefined;
  const zoneHeight = roomy ? 380 : 336;

  const action = (
    <Button
      label={creating ? copy.creating : copy.action}
      onPress={press}
      outsideScroll={!wide}
      busy={creating}
      disabled={reason !== null}
      reason={failure ?? (scan.status === "read" ? (reason ?? undefined) : undefined)}
      note={mismatchNote(draft) ?? undefined}
    />
  );
  const details = (
    <>
      <PaymentRows handles={draft.handles} dispatch={dispatch} firstHandle={handleInput} outsideScroll={!wide} />
      <NameChips names={people} onAdd={addName} onRemove={removeName} outsideScroll={!wide} />
    </>
  );

  const receipt =
    scan.status === "empty" ? (
      <PressTarget
        onPress={choose}
        style={() => [
          styles.hero,
          wide ? [styles.zone, ringChange, { minHeight: zoneHeight, backgroundColor: c.paper, borderColor: dragging ? c.ink : c.dash }] : [sides, styles.fills],
        ]}
      >
        {(pressed) => (
          <View style={[styles.drop, !wide && [styles.dashed, styles.dropFills, compact && styles.dropCompact, { borderColor: dragging ? c.ink : c.dash }]]}>
            <Slip icon={wide ? "upload" : "camera"} pressed={pressed} compact={compact || (wide && !roomy)} />
            <Text style={[type.hero, { color: c.ink }]}>{hero.title}</Text>
            {hero.hint ? <Text style={[type.secondary, { color: c.muted }]}>{hero.hint}</Text> : null}
            <Text style={[type.caption, { color: c.muted }]}>{copy.formats}</Text>
          </View>
        )}
      </PressTarget>
    ) : scan.status === "reading" ? (
      <View style={[styles.hero, wide ? [styles.zone, styles.reading, { minHeight: zoneHeight }] : sides]}>
        <Reading progress={progress} title={copy.reading} />
      </View>
    ) : (
      <View style={[!wide && [styles.hero, sides], styles.stack]}>
        <View style={[styles.cardColumn, !wide && styles.ticketColumn]}>
          <ReceiptSummary
            name={scan.file.name}
            items={scan.receipt?.items.length ?? 0}
            total={scan.receipt?.total ?? cents(0)}
            thumbnail={scan.file.thumbnail}
            onView={view}
            onReplace={choose}
            stacked={!wide}
          />
        </View>
      </View>
    );

  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.page, { paddingBottom: wide ? 0 : sheetHeight }]}>
        <View style={[styles.header, sides, { paddingTop: (wide ? 20 : 4) + insets.top, minHeight: (wide ? wideHeader : layout.header) + insets.top }]}>
          <Text role="heading" aria-level={1} style={[type.wordmark, { color: c.ink }]}>
            {copy.wordmark}
          </Text>
          <View style={styles.headerButtons}>
            {scan.status === "empty" && width >= breakpoints.exampleFrom ? <Button kind="link" icon="receipt" label={copy.example} onPress={example} /> : null}
            {stored.length > 0 ? (
              <View style={styles.recent}>
                <RecentSplits splits={stored} now={now} wide={wide} />
              </View>
            ) : null}
          </View>
        </View>
        {wide ? (
          <View style={[styles.center, sides, { paddingBottom: wideHeader }]}>
            <View style={[styles.column, { maxWidth: columnWidth }]}>
              {receipt}
              {details}
              <View style={styles.wideAction}>{action}</View>
            </View>
          </View>
        ) : (
          receipt
        )}
      </ScrollView>

      {wide ? null : (
        <Sheet onHeight={setSheetHeight} action={action}>
          {details}
        </Sheet>
      )}
      {viewing && photo ? <PhotoViewer photo={photo} onExited={() => setViewing(false)} onReplace={choose} /> : null}
      <Toast message={notice} onHide={() => setNotice(null)} lift={wide ? 0 : sheetHeight} />
    </View>
  );
}

const wideHeader = 76;

const shortScreen = 700;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 6 },
  recent: { marginRight: -12 },
  hero: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  zone: { flexGrow: 0, paddingVertical: 32, paddingHorizontal: 40, borderRadius: 26, borderWidth: 1.5, borderStyle: "dashed" },
  reading: { borderColor: "transparent" },
  drop: { alignItems: "center", gap: 6 },
  dashed: { alignSelf: "stretch", paddingVertical: 28, paddingHorizontal: 16, borderRadius: 28, borderWidth: 2, borderStyle: "dashed" },
  dropCompact: { paddingVertical: 14 },
  fills: { paddingTop: 44, paddingBottom: 48 },
  dropFills: { flexGrow: 1, justifyContent: "center" },
  stack: { alignSelf: "stretch" },
  cardColumn: { alignSelf: "center", width: "100%", maxWidth: 480, gap: layout.blockGap },
  ticketColumn: { maxWidth: 440 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  column: { width: "100%", gap: layout.blockGap },
  wideAction: { paddingTop: layout.blockGap },
});
