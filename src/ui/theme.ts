import { StyleSheet, useColorScheme } from "react-native";

import { colors, type Colors } from "./colors";
import { installDocument } from "./document";

installDocument(colors);

export function useColors(): Colors {
  return colors[useColorScheme() === "dark" ? "dark" : "light"];
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const breakpoints = { bottomBarBelow: 768, twoColumnsFrom: 900 } as const;

const display = "ArchivoCondensed, Impact, 'Arial Narrow', sans-serif";
const body = "Archivo, system-ui, -apple-system, sans-serif";

export const type = StyleSheet.create({
  display: { fontFamily: display, fontWeight: "800", fontSize: 64, lineHeight: 62, letterSpacing: -0.5 },
  displayWide: { fontSize: 92, lineHeight: 88, letterSpacing: -1 },
  title: { fontFamily: display, fontWeight: "800", fontSize: 40, lineHeight: 42 },
  heading: { fontFamily: display, fontWeight: "800", fontSize: 32, lineHeight: 34 },
  body: { fontFamily: body, fontWeight: "500", fontSize: 18, lineHeight: 26 },
  bodyWide: { fontSize: 21, lineHeight: 30 },
  small: { fontFamily: body, fontWeight: "500", fontSize: 14, lineHeight: 20 },
  kicker: { fontFamily: body, fontWeight: "500", fontSize: 12, lineHeight: 16, letterSpacing: 2, textTransform: "uppercase" },
  button: { fontFamily: body, fontWeight: "500", fontSize: 18, letterSpacing: 0.2 },
  moneyRow: { fontFamily: display, fontWeight: "800", fontSize: 26, fontVariant: ["tabular-nums"] },
  moneyTotal: { fontFamily: display, fontWeight: "800", fontSize: 48, fontVariant: ["tabular-nums"] },
  moneyBody: { fontFamily: body, fontWeight: "500", fontSize: 16, fontVariant: ["tabular-nums"] },
});

export const motion = {
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
  pressIn: 100,
  pressOut: 200,
  enter: 240,
  stagger: 40,
  headline: 480,
  sheetIn: 300,
  sheetOut: 200,
  toastIn: 240,
  toastOut: 180,
  reducedFade: 160,
} as const;
