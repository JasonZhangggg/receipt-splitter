import { StyleSheet, Text, View } from "react-native";

import type { Colors } from "../colors";
import { type, useColors } from "../theme";

type Tone = "dot" | "me" | "sheet" | "sheetIn" | "onAction" | "none";

const fills: Record<Tone, (c: Colors) => { fill: string; ink: string }> = {
  dot: (c) => ({ fill: c.dot, ink: c.ink }),
  me: (c) => ({ fill: c.action, ink: c.onAction }),
  sheet: (c) => ({ fill: c.sheet, ink: c.ink }),
  sheetIn: (c) => ({ fill: c.sheetIn, ink: c.muted }),
  onAction: (c) => ({ fill: c.onAction, ink: c.action }),
  none: (c) => ({ fill: "transparent", ink: c.muted }),
};

/** A person's initial in a circle. */
export function Dot({ name, size = 24, tone = "dot", ring }: { name: string; size?: number; tone?: Tone; ring?: string }) {
  const c = useColors();
  const { fill, ink } = fills[tone](c);
  return (
    <View aria-hidden style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, boxShadow: ring }]}>
      <Text style={[type.glyph, { color: ink, fontSize: size > 24 ? 12 : 10.5, lineHeight: size > 24 ? 14 : 12 }]}>{[...name.trim()][0]?.toUpperCase() ?? ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { alignItems: "center", justifyContent: "center" },
});
