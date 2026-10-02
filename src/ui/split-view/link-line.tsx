import { useEffect, useEffectEvent, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/button";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

const copiedFor = 1600;

export function LinkLine({ url, onShared, quiet = false }: { url: string; onShared: () => void; quiet?: boolean }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(false);
  const done = useEffectEvent(onShared);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => done(), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);
  const sharable = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = () =>
    navigator.share({ url }).then(
      () => onShared(),
      () => {},
    );
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => setProblem(true),
    );
  return (
    <View style={styles.box}>
      <Text numberOfLines={1} style={[type.caption, styles.line, { color: c.muted }]}>
        {quiet ? null : <Text style={[type.button, { color: c.ink }]}>{`${say.linkReady.replace(".", "")}  `}</Text>}
        <Text testID="split-link">{url.replace(/^https?:\/\//, "")}</Text>
      </Text>
      {problem ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{say.copyFailed}</Text> : null}
      <View style={styles.two}>
        {sharable ? (
          <View style={styles.half}>
            <Button kind={quiet ? "soft" : "primary"} icon="share" label={say.share} onPress={() => void share()} outsideScroll />
          </View>
        ) : null}
        <View style={styles.half}>
          <Button kind={sharable || quiet ? "soft" : "primary"} icon={copied ? "check" : "copy"} label={copied ? say.copied : say.copy} onPress={() => void copy()} outsideScroll />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  line: { marginHorizontal: 4 },
  two: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
