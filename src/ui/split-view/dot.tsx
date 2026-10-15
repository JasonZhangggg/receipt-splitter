import { StyleSheet, Text, View } from "react-native";

import { type Colors, onPastel } from "../colors";
import { useReducedMotion, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";

type Tone = "dot" | "quiet" | "me" | "sheet" | "sheetIn" | "onAction" | "none";

const fills: Record<Tone, (c: Colors) => { fill: string; ink: string }> = {
  dot: (c) => ({ fill: c.dot, ink: c.ink }),
  quiet: (c) => ({ fill: c.dot, ink: c.muted }),
  me: (c) => ({ fill: c.action, ink: c.onAction }),
  sheet: (c) => ({ fill: c.sheet, ink: c.ink }),
  sheetIn: (c) => ({ fill: c.sheetIn, ink: c.muted }),
  onAction: (c) => ({ fill: c.onAction, ink: c.action }),
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
  claim: { width: 12, height: 12, borderRadius: 6 },
});

const claimMotion = webStyle({ transitionProperty: "background-color, box-shadow, transform", transitionDuration: "200ms, 200ms, 160ms", transitionTimingFunction: motion.easeOut });
const claimFade = webStyle({ transitionProperty: "background-color, box-shadow", transitionDuration: `${motion.reducedFade}ms`, transitionTimingFunction: motion.easeOut });

/** The 12 px dot that claims a line: a hollow ring, filled when the viewer has the line. It presses to 0.8 and retargets from wherever it is if tapped again. */
export function ClaimDot({ on, pressed }: { on: boolean; pressed: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View
      testID={on ? "checked" : undefined}
      style={[
        styles.claim,
        { backgroundColor: on ? c.ink : "transparent", boxShadow: `inset 0 0 0 1px ${on ? c.ink : c.dash}` },
        reduce ? claimFade : claimMotion,
        pressed && !reduce && { transform: [{ scale: 0.8 }] },
      ]}
    />
  );
}
