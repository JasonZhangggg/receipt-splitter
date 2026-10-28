import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId } from "../../core/split";
import { Button } from "../components/button";
import { SectionHead } from "../components/section-head";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors, useOnPage } from "../theme";
import { LinkLine } from "./link-line";
import { Line, type PersonRow } from "./people-sheet";
import { SheetHeader } from "./sheet-header";

type Props = {
  url: string;
  rows: readonly PersonRow[];
  chosen: ParticipantId | null;
  /** Why the last switch didn't take, or null. */
  problem: string | null;
  onShare: () => void;
  onPick: (id: ParticipantId) => void;
  onClose: () => void;
};

/** What the Host sees once Create link lands: the link with Copy, a large Share where the phone has a share sheet, and the names to switch to when the phone is someone else's. */
export function LinkReadySheet({ url, rows, chosen, problem, onShare, onPick, onClose }: Props) {
  const c = useColors();
  const onPage = useOnPage();
  const sharable = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <View pointerEvents={chosen === null ? "auto" : "none"} style={styles.sheet}>
      <SheetHeader title={say.linkReadyTitle} onClose={onClose} />
      <Text style={[type.body, styles.hint, { color: c.muted }]}>{say.linkReadyHint}</Text>
      <View style={styles.link}>
        <LinkLine url={url} share={!sharable} />
        {sharable ? <Button label={say.shareLink} icon="share" onPress={onShare} outsideScroll /> : null}
      </View>
      {rows.length > 1 ? (
        <View>
          <SectionHead label={say.youAre} rule={false} />
          <Text style={[type.caption, styles.switch, { color: c.muted }]}>{onPage ? say.switchHintClick : say.switchHint}</Text>
          <View role="list">
            {rows.map((row, at) => (
              <View key={row.person.id} role="listitem">
                <Line row={row} mode="switch" asking={false} host={at === 0} chosen={chosen} onPress={() => onPick(row.person.id)} />
              </View>
            ))}
          </View>
          {problem ? (
            <Text role="alert" style={[type.caption, styles.problem, { color: c.warn }]}>
              {problem}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  hint: { marginTop: -6 },
  link: { gap: 12 },
  switch: { marginTop: -2, marginBottom: 10 },
  problem: { marginTop: 8 },
});
