import { useSyncExternalStore } from "react";
import { Easing, StyleSheet, useColorScheme } from "react-native";

import { readAppearance, resolveScheme, storeAppearance, type Appearance, type Scheme } from "./appearance";
import { colors, type Colors } from "./colors";
import { installDocument, paintAppearance } from "./document";

let picked = readAppearance();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = () => picked;

export function setAppearance(next: Appearance) {
  picked = next;
  storeAppearance(next);
  paintAppearance(next);
  listeners.forEach((listener) => listener());
}

export const useAppearance = () => useSyncExternalStore(subscribe, current, current);

export const useSystemScheme = (): Scheme => (useColorScheme() === "dark" ? "dark" : "light");

export const useScheme = (): Scheme => resolveScheme(useAppearance(), useSystemScheme());

export function useColors(): Colors {
  return colors[useScheme()];
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const breakpoints = { exampleFrom: 768, columnFrom: 900, pairFrom: 1024, roomyFrom: 1280 } as const;

export const layout = {
  gutter: 22,
  header: 60,
  row: 52,
  adjustmentRow: 34,
  field: 54,
  fieldRadius: 16,
  cardRadius: 22,
  blockGap: 14,
  pairGap: 10,
  chipRowGap: 8,
} as const;

const sans = "'Plus Jakarta Sans', 'Plus Jakarta Sans Fallback', system-ui, -apple-system, sans-serif";

installDocument();
paintAppearance(picked);

// Four sizes, two weights. Hero is the share amount; title heads a sheet or the Total; body is every row, chip and button; caption is every line of supporting text.
export const type = StyleSheet.create({
  hero: { fontFamily: sans, fontWeight: "600", fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  title: { fontFamily: sans, fontWeight: "600", fontSize: 17, lineHeight: 22, letterSpacing: -0.17 },
  body: { fontFamily: sans, fontWeight: "400", fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: sans, fontWeight: "400", fontSize: 13, lineHeight: 18 },
  // A text field stays at 16 px so iOS Safari does not zoom the page on focus.
  input: { fontFamily: sans, fontWeight: "400", fontSize: 16, lineHeight: 23 },
  // A person's initial inside a dot; the dot sets its own size.
  glyph: { fontFamily: sans, fontWeight: "600", fontSize: 12, lineHeight: 15 },
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
  rowsIn: 200,
  rowsOut: 150,
  readingCycle: 1600,
  readingStagger: 150,
  readingBar: 240,
  stageIn: 200,
  photoIn: 240,
  photoOut: 180,
  controlIn: 200,
  dragOver: 150,
  spinnerTurn: 800,
} as const;
