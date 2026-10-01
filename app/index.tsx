import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { blockedReason, flaggedRows, loadDraft, reduceDraft, saveDraft, type ReceiptFile } from "../src/draft";
import { prefetchModel, recognize } from "../src/ocr";
import { parseReceipt } from "../src/parse";
import { Button, PressTarget } from "../src/ui/components/button";
import { FileRow } from "../src/ui/components/file-row";
import { NameChips } from "../src/ui/components/name-chips";
import { PaymentRows } from "../src/ui/components/payment-row";
import { panel, Sheet } from "../src/ui/components/sheet";
import { Slip } from "../src/ui/components/slip";
import { Toast } from "../src/ui/components/toast";
import { copy } from "../src/ui/home-copy";
import { webStyle } from "../src/ui/motion";
import { ReceiptEditor } from "../src/ui/receipt-editor";
import { isPhoto, pickPhoto, thumbnailOf, usePhotoDrop } from "../src/ui/receipt-input/photo";
import { Reading } from "../src/ui/receipt-input/reading";
import { breakpoints, motion, type, useColors } from "../src/ui/theme";

const createLater = () => {};

const ringChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [draft, dispatch] = useReducer(reduceDraft, undefined, () => loadDraft());
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const scanning = useRef(0);
  useEffect(prefetchModel, []);
  useEffect(() => saveDraft(draft), [draft]);

  const read = useCallback(async (photo: File) => {
    if (!isPhoto(photo)) return setNotice(copy.notPhoto);
    const scan = ++scanning.current;
    const file: ReceiptFile = { name: photo.name || copy.pastedPhoto, thumbnail: await thumbnailOf(photo).catch(() => null) };
    if (scan !== scanning.current) return;
    setProgress(0);
    dispatch({ type: "reading", file });
    const receipt = await recognize(photo, (fraction) => scan === scanning.current && setProgress(fraction)).then(parseReceipt, () => null);
    if (scan === scanning.current) dispatch({ type: "read", file, receipt });
  }, []);
  const dragging = usePhotoDrop(read, draft.scan.status === "empty");
  const choose = () => pickPhoto(read);
  const example = () => {
    scanning.current++;
    dispatch({ type: "example" });
  };

  const wide = width >= breakpoints.panelFrom;
  const hero = wide ? copy.hero.desktop : copy.hero.phone;
  const gutter = wide ? 32 : 20;
  const sides = { paddingLeft: gutter + insets.left, paddingRight: gutter + insets.right };
  const { scan } = draft;
  const reason = blockedReason(draft);
  const compact = !wide && height - insets.top - insets.bottom < shortScreen;
  const besidePanel = wide ? { marginLeft: gutter + insets.left, marginRight: panelSpace + insets.right } : sides;

  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.page, { paddingBottom: wide ? 0 : sheetHeight }]}>
        <View style={[styles.header, sides, { paddingTop: (wide ? 20 : 4) + insets.top, minHeight: (wide ? panel.top : 56) + insets.top }]}>
          <Text role="heading" aria-level={1} style={[type.wordmark, { color: c.ink }]}>
            {copy.wordmark}
          </Text>
          {scan.status === "empty" ? <Button kind="link" icon="receipt" label={copy.example} onPress={example} /> : null}
        </View>
        {scan.status === "empty" ? (
          <PressTarget
            onPress={choose}
            style={() => [
              styles.hero,
              wide
                ? [
                    styles.heroWide,
                    ringChange,
                    besidePanel,
                    { backgroundColor: c.paper, borderColor: dragging ? c.ink : c.dash },
                  ]
                : [sides, compact && styles.heroCompact],
            ]}
          >
            {(pressed) => (
              <View style={[styles.drop, !wide && [styles.dashed, compact && styles.dropCompact, { borderColor: dragging ? c.ink : c.dash }]]}>
                <Slip icon={wide ? "upload" : "camera"} pressed={pressed} compact={compact} />
                <Text style={[type.hero, { color: c.ink }]}>{hero.title}</Text>
                <Text style={[type.secondary, { color: c.muted }]}>{hero.hint}</Text>
                <Text style={[type.caption, { color: c.muted }]}>{copy.formats}</Text>
              </View>
            )}
          </PressTarget>
        ) : scan.status === "reading" ? (
          <View style={[styles.hero, wide ? [styles.heroWide, besidePanel] : sides]}>
            <Reading progress={progress} title={copy.reading} />
          </View>
        ) : (
          <View style={[styles.doc, besidePanel]}>
            <View style={[styles.column, wide && styles.columnWide]}>
              <FileRow name={scan.file.name} items={scan.receipt.items.length} thumbnail={scan.file.thumbnail} onReplace={choose} />
              <ReceiptEditor receipt={scan.receipt} flagged={flaggedRows(draft)} dispatch={dispatch} />
            </View>
          </View>
        )}
      </ScrollView>

      <Sheet
        wide={wide}
        onHeight={setSheetHeight}
        action={
          <Button
            label={copy.action}
            onPress={createLater}
            outsideScroll
            disabled={reason !== null}
            reason={scan.status === "read" ? (reason ?? undefined) : undefined}
          />
        }
      >
        <PaymentRows handles={draft.handles} dispatch={dispatch} outsideScroll />
        <NameChips names={draft.names} onAdd={(name) => dispatch({ type: "addName", name })} onRemove={(name) => dispatch({ type: "removeName", name })} outsideScroll />
      </Sheet>
      <Toast message={notice} onHide={() => setNotice(null)} lift={wide ? 0 : sheetHeight} />
    </View>
  );
}

const panelSpace = panel.right + panel.width + 28;

const shortScreen = 700;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hero: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  heroWide: { marginBottom: 32, paddingTop: 24, paddingBottom: 48, paddingHorizontal: 32, borderRadius: 32, borderWidth: 2, borderStyle: "dashed" },
  drop: { alignItems: "center", gap: 6 },
  dashed: { alignSelf: "stretch", paddingVertical: 28, paddingHorizontal: 16, borderRadius: 28, borderWidth: 2, borderStyle: "dashed" },
  dropCompact: { paddingVertical: 14 },
  heroCompact: { paddingVertical: 4 },
  doc: { paddingTop: 12, paddingBottom: 20 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480, gap: 12 },
  columnWide: { maxWidth: 560 },
});
