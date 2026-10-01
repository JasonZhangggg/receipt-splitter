import { StyleSheet, View } from "react-native";

import { pressFeel, pressStyle, useReducedMotion } from "../motion";
import { useColors } from "../theme";
import { Icon, type IconName } from "./icon";

const pressFace = { dataSet: { pressFace: "" } };

const slipHeight = 188;
const compactScale = 0.72;
const compactTrim = ((slipHeight + 26) * (1 - compactScale)) / 2;

export function Slip({ icon, pressed, compact = false }: { icon: IconName; pressed: boolean; compact?: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={compact && styles.compact}>
      <View {...pressFace} style={[styles.slip, { backgroundColor: c.paper, filter: c.lift }, pressStyle(pressed, reduce, pressFeel.slip)]}>
        <View style={styles.lines}>
          {[0, 1, 2, 3].map((line) => (
            <View key={line} style={[styles.line, line % 2 === 1 && styles.shortLine, { backgroundColor: c.hairline }]} />
          ))}
        </View>
        <View style={[styles.camera, { backgroundColor: c.action }]}>
          <Icon name={icon} size={28} color={c.onAction} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slip: { width: 148, height: slipHeight, marginBottom: 26, borderRadius: 14 },
  compact: {
    transform: [{ scale: compactScale }],
    marginTop: -compactTrim,
    marginBottom: -compactTrim - 12,
  },
  lines: { position: "absolute", top: 26, left: 24, right: 24, gap: 11 },
  line: { height: 5, borderRadius: 3 },
  shortLine: { marginRight: "30%" },
  camera: {
    position: "absolute",
    top: 84,
    left: 42,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
