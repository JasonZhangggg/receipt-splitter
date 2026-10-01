import { StyleSheet, View } from "react-native";

import { pressFeel, pressStyle, useReducedMotion } from "../motion";
import { useColors } from "../theme";
import { Icon, type IconName } from "./icon";

const pressFace = { dataSet: { pressFace: "" } };

export function Slip({ icon, pressed }: { icon: IconName; pressed: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View {...pressFace} style={[styles.slip, { backgroundColor: c.paper, boxShadow: c.lift }, pressStyle(pressed, reduce, pressFeel.slip)]}>
      <View style={styles.lines}>
        {[0, 1, 2, 3].map((line) => (
          <View key={line} style={[styles.line, line % 2 === 1 && styles.shortLine, { backgroundColor: c.hairline }]} />
        ))}
      </View>
      <View style={[styles.camera, { backgroundColor: c.action }]}>
        <Icon name={icon} size={28} color={c.onAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slip: { width: 148, height: 188, marginBottom: 26, borderRadius: 14 },
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
