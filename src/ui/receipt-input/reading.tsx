import { StyleSheet, Text, View } from "react-native";

import { useReducedMotion, webAnimation, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";

const lines = [0, 1, 2, 3, 4, 5, 6];

const shortLines: Record<number, `${number}%`> = { 2: "30%", 4: "12%", 5: "30%" };

const at = (ms: number) => `${((ms / motion.readingCycle) * 100).toFixed(2)}%`;

const darken = (index: number) => {
  const start = index * motion.readingStagger;
  const done = start + motion.readingStagger;
  return webAnimation({
    animationKeyframes: [
      {
        "0%": { opacity: 0 },
        [at(start)]: { opacity: 0 },
        [at(done)]: { opacity: 1 },
        [at(motion.readingCycle * 0.85)]: { opacity: 1 },
        [at(motion.readingCycle * 0.95)]: { opacity: 0 },
        "100%": { opacity: 0 },
      },
    ],
    animationDuration: `${motion.readingCycle}ms`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  });
};

const darkening = Object.fromEntries(lines.map((line) => [line, darken(line)]));

/** What the phone can see of a read: its own OCR, the wait on the server's reading, and that wait running long. */
export type ReadingStage = "text" | "server" | "slow";

const stageIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "translateY(3px)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: `${motion.stageIn}ms`,
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

export function Reading({ progress, title, stage, line }: { progress: number; title: string; stage: ReadingStage; line: string }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View role="status" aria-live="polite" aria-label={title} style={styles.reading}>
      <View style={[styles.slip, { backgroundColor: c.paper, filter: c.lift }]}>
        {lines.map((line) => (
          <View key={line} style={[styles.line, { marginRight: shortLines[line] ?? 0, backgroundColor: c.skeleton }]}>
            {reduce ? null : <View testID="reading-line" style={[StyleSheet.absoluteFill, styles.ink, { backgroundColor: c.skeletonInk }, darkening[line]]} />}
          </View>
        ))}
      </View>
      <Text style={[type.reading, { color: c.ink }]}>{title}</Text>
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
      {/* A new key swaps the text in one commit, so the old line never shares a frame with the new one. The first stage arrives with the slip. */}
      <Text key={stage} testID="reading-stage" numberOfLines={1} style={[type.secondary, styles.stage, { color: c.muted }, !reduce && stage !== "text" && stageIn]}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reading: { alignItems: "center", gap: 6 },
  slip: { width: 148, height: 188, marginBottom: 26, paddingTop: 24, paddingHorizontal: 24, gap: 12, borderRadius: 14 },
  line: { height: 5, borderRadius: 3, overflow: "hidden" },
  ink: { borderRadius: 3 },
  track: { width: 160, height: 4, marginTop: 8, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, transformOrigin: "left" },
  stage: { marginTop: 10, textAlign: "center" },
});
