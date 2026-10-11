import { StyleSheet, Text, View } from "react-native";

import { type Colors, onPastel } from "../colors";
import { type, useColors } from "../theme";

type Tone = "dot" | "quiet" | "me" | "sheet" | "sheetIn" | "onAction" | "self" | "none";

const fills: Record<Tone, (c: Colors) => { fill: string; ink: string }> = {
  dot: (c) => ({ fill: c.dot, ink: c.ink }),
  quiet: (c) => ({ fill: c.dot, ink: c.muted }),
  me: (c) => ({ fill: c.action, ink: c.onAction }),
  sheet: (c) => ({ fill: c.sheet, ink: c.ink }),
  sheetIn: (c) => ({ fill: c.sheetIn, ink: c.muted }),
  onAction: (c) => ({ fill: c.onAction, ink: c.action }),
  self: (c) => ({ fill: c.selfBadge, ink: c.onSelfBadge }),
  none: (c) => ({ fill: "transparent", ink: c.muted }),
};

export function Dot({ name, size = 24, tone = "dot", ring, fillOverride }: { name: string; size?: number; tone?: Tone; ring?: string; fillOverride?: string }) {
  const c = useColors();
  const { fill: toneFill, ink: toneInk } = fills[tone](c);
  const fill = fillOverride ?? toneFill;
  const ink = fillOverride ? onPastel : toneInk;
  return (
    <View aria-hidden style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, boxShadow: ring }]}>
      <Text style={[type.glyph, { color: ink, fontSize: size > 24 ? 12 : size > 18 ? 10.5 : 11, lineHeight: size > 24 ? 14 : size > 18 ? 12 : 13 }]}>{[...name.trim()][0]?.toUpperCase() ?? ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { alignItems: "center", justifyContent: "center" },
});
