import { StyleSheet, Text, View } from "react-native";

import { useReducedMotion, webAnimation, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";
import { DropCard, Slip, slipLines } from "./drop-card";

/** What the phone can see of a read: its own OCR, the wait on the server's reading, and that wait running long. */
export type ReadingStage = "text" | "server" | "slow";

const stageIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "translateY(3px)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: `${motion.stageIn}ms`,
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

const reducedStageIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }],
  animationDuration: `${motion.reducedFade}ms`,
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

export function Reading({ progress, title, stage, line }: { progress: number; title: string; stage: ReadingStage; line: string }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <DropCard>
      <View role="status" aria-live="polite" aria-label={title} style={styles.reading}>
        <View style={styles.row}>
          <Slip lines={slipLines} />
          <View style={styles.text}>
            <Text style={[type.body, { color: c.ink }]}>{title}</Text>
            {/* A new key swaps the text in one commit, so the old line never shares a frame with the new one. The first stage arrives with the card. */}
            <Text key={stage} testID="reading-stage" numberOfLines={1} style={[type.caption, { color: c.muted }, stage !== "text" && (reduce ? reducedStageIn : stageIn)]}>
              {line}
            </Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: c.hairline }]}>
          <View
            testID="reading-bar"
            style={[
              styles.fill,
              { backgroundColor: c.ink, transform: [{ scaleX: progress }] },
              reduce ? null : webStyle({ transitionProperty: "transform", transitionDuration: `${motion.readingBar}ms`, transitionTimingFunction: motion.easeOut }),
            ]}
          />
        </View>
      </View>
    </DropCard>
  );
}

const styles = StyleSheet.create({
  reading: { gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  text: { flex: 1, minWidth: 0 },
  track: { height: 2, borderRadius: 1, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 1, transformOrigin: "left" },
});
