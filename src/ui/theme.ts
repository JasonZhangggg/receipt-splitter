import { Easing, StyleSheet, useColorScheme } from "react-native";

import { colors, type Colors } from "./colors";
import { installDocument } from "./document";

export function useColors(): Colors {
  return colors[useColorScheme() === "dark" ? "dark" : "light"];
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const breakpoints = { bottomBarBelow: 768 } as const;

const body = "system-ui, -apple-system, sans-serif";

installDocument(colors);

export const type = StyleSheet.create({
  heading: { fontFamily: body, fontWeight: "500", fontSize: 24, lineHeight: 30 },
  small: { fontFamily: body, fontWeight: "500", fontSize: 14, lineHeight: 20 },
  kicker: { fontFamily: body, fontWeight: "500", fontSize: 12, lineHeight: 16, letterSpacing: 2, textTransform: "uppercase" },
  button: { fontFamily: body, fontWeight: "500", fontSize: 18, letterSpacing: 0.2 },
});

const easeOut = [0.23, 1, 0.32, 1] as const;
const drawer = [0.32, 0.72, 0, 1] as const;

export const easing = { easeOut: Easing.bezier(...easeOut), drawer: Easing.bezier(...drawer) };

export const motion = {
  easeOut: `cubic-bezier(${easeOut.join(", ")})`,
  pressIn: 100,
  pressOut: 200,
  sheetIn: 300,
  sheetOut: 200,
  toastIn: 240,
  toastOut: 180,
  reducedFade: 160,
} as const;
