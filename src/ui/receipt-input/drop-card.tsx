import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { webStyle } from "../motion";
import { motion, useColors } from "../theme";

const ringChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

/** The thin-ruled box that holds the receipt block in each of its three states. Its rule darkens while a photo is dragged over it. */
export function DropCard({ children, over = false, padded = true }: { children: ReactNode; over?: boolean; padded?: boolean }) {
  const c = useColors();
  return <View style={[styles.card, padded && styles.padded, ringChange, { borderColor: over ? c.ink : c.hairline }]}>{children}</View>;
}

/** The torn-off slip a thumbnail stands for: gray paper with a few gray lines. */
export function Slip({ lines, width = 52, height = 68 }: { lines: readonly `${number}%`[]; width?: number; height?: number }) {
  const c = useColors();
  return (
    <View style={[styles.slip, { width, height, backgroundColor: c.hairline }]}>
      {lines.map((line, index) => (
        <View key={index} style={[styles.line, { width: line, backgroundColor: c.dash }]} />
      ))}
    </View>
  );
}

export const slipLines = ["80%", "60%", "70%", "45%", "65%"] as const;

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14 },
  padded: { paddingVertical: 22, paddingHorizontal: 20, gap: 14 },
  slip: { flexShrink: 0, borderRadius: 4, paddingVertical: 9, paddingHorizontal: 8, gap: 5 },
  line: { height: 2, borderRadius: 1 },
});
