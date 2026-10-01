import { Easing, StyleSheet, useColorScheme } from "react-native";

import { colors, type Colors } from "./colors";
import { installDocument } from "./document";

export function useColors(): Colors {
  return colors[useColorScheme() === "dark" ? "dark" : "light"];
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const breakpoints = { panelFrom: 900 } as const;

const sans = "'Plus Jakarta Sans', 'Plus Jakarta Sans Fallback', system-ui, -apple-system, sans-serif";

installDocument(colors);

export const type = StyleSheet.create({
  hero: { fontFamily: sans, fontWeight: "400", fontSize: 26, lineHeight: 29, letterSpacing: -0.52 },
  reading: { fontFamily: sans, fontWeight: "400", fontSize: 23, lineHeight: 27, letterSpacing: -0.46 },
  total: { fontFamily: sans, fontWeight: "500", fontSize: 26, lineHeight: 30, letterSpacing: -0.52 },
  wordmark: { fontFamily: sans, fontWeight: "500", fontSize: 17, lineHeight: 21, letterSpacing: -0.26 },
  body: { fontFamily: sans, fontWeight: "400", fontSize: 15, lineHeight: 22 },
  title: { fontFamily: sans, fontWeight: "500", fontSize: 16, lineHeight: 20, letterSpacing: -0.16 },
  input: { fontFamily: sans, fontWeight: "400", fontSize: 16, lineHeight: 23 },
  button: { fontFamily: sans, fontWeight: "500", fontSize: 15, lineHeight: 20 },
  label: { fontFamily: sans, fontWeight: "500", fontSize: 14, lineHeight: 19 },
  glyph: { fontFamily: sans, fontWeight: "500", fontSize: 12, lineHeight: 15 },
  secondary: { fontFamily: sans, fontWeight: "400", fontSize: 14, lineHeight: 21 },
  small: { fontFamily: sans, fontWeight: "400", fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: sans, fontWeight: "400", fontSize: 12.5, lineHeight: 17 },
});

const easeOut = [0.23, 1, 0.32, 1] as const;
export const easing = { easeOut: Easing.bezier(...easeOut) };

export const motion = {
  easeOut: `cubic-bezier(${easeOut.join(", ")})`,
  pressIn: 100,
  slipPressIn: 120,
  pressOut: 200,
  actionColor: 180,
  toastIn: 240,
  toastOut: 180,
  reducedFade: 160,
  readingCycle: 1600,
  readingStagger: 150,
  readingBar: 240,
  receiptIn: 240,
  dragOver: 150,
  spinnerTurn: 800,
} as const;
