import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/button";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

const copiedFor = 1600;
const keptEnd = 6;

/** The link on one line, cut in the middle so its host and the end of its id both show, with Copy and, where the phone can share, Share. `share={false}` leaves Share to a larger button nearby. */
export function LinkLine({ url, share: offerShare = true }: { url: string; share?: boolean }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);
  const sharable = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = () => navigator.share({ url }).catch(() => {});
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => {
        setProblem(false);
        setCopied(true);
      },
      () => setProblem(true),
    );
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <View style={styles.box}>
      <View style={[styles.row, { backgroundColor: c.sheetIn }]}>
        <View testID="split-link" style={styles.link}>
          <Text numberOfLines={1} style={[type.caption, styles.head, { color: c.ink }]}>
            {shown.slice(0, -keptEnd)}
          </Text>
          <Text numberOfLines={1} style={[type.caption, styles.tail, { color: c.ink }]}>
            {shown.slice(-keptEnd)}
          </Text>
        </View>
        <Button kind="icon" icon={copied ? "check" : "copy"} name={copied ? say.copied : say.copy} onPress={() => void copy()} outsideScroll />
        {sharable && offerShare ? <Button kind="icon" icon="share" name={say.share} onPress={() => void share()} outsideScroll /> : null}
      </View>
      {problem ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{say.copyFailed}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingLeft: 16, paddingRight: 4, borderRadius: layout.fieldRadius },
  link: { flex: 1, flexDirection: "row", minWidth: 0, marginRight: 4 },
  head: { flexShrink: 1 },
  tail: { flexShrink: 0 },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
