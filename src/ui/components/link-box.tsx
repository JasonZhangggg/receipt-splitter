import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { linkCopy } from "../home-copy";
import { useReducedMotion, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";
import { Button } from "./button";

const copiedFor = 1600;

const canShare = (url: string) => typeof navigator !== "undefined" && typeof navigator.share === "function" && (navigator.canShare?.({ url }) ?? true);

const appear = (from: Record<string, string | number>, duration: number) =>
  webStyle({ animationKeyframes: [{ from, to: { opacity: 1, transform: "none" } }], animationDuration: `${duration}ms`, animationTimingFunction: motion.easeOut });

const entrance = StyleSheet.create({
  risen: appear({ opacity: 0, transform: "translateY(8px)" }, motion.receiptIn),
  faded: appear({ opacity: 0 }, motion.reducedFade),
});

export function LinkBox({ url, onCopyFailed }: { url: string; onCopyFailed: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [sharable] = useState(() => canShare(url));

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => onCopyFailed(),
    );
  const share = () => navigator.share({ url }).catch(() => {});
  const copyButton = (
    <Button kind={sharable ? "soft" : "primary"} icon={copied ? "check" : "copy"} label={copied ? linkCopy.copied : linkCopy.copy} onPress={copy} outsideScroll />
  );

  return (
    <View style={[styles.box, reduce ? entrance.faded : entrance.risen]}>
      <Text numberOfLines={1} style={[type.small, styles.line, { color: c.muted }]}>
        <Text style={[type.button, { color: c.ink }]}>{linkCopy.ready}</Text>
        {"  "}
        <Text testID="split-link">{url.replace(/^https?:\/\//, "")}</Text>
      </Text>
      {sharable ? (
        <View style={styles.two}>
          <View style={styles.half}>
            <Button icon="share" label={linkCopy.share} onPress={share} outsideScroll />
          </View>
          <View style={styles.half}>{copyButton}</View>
        </View>
      ) : (
        copyButton
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  line: { marginHorizontal: 4 },
  two: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
});
