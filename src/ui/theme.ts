import { useSyncExternalStore } from "react";
import { Easing, Platform, StyleSheet, useColorScheme } from "react-native";

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

// react-native-web's useColorScheme reads the scheme in render and subscribes in an effect, so a change between the two (a slow first paint) is lost and the colors stay on the old scheme. useSyncExternalStore re-reads the query once it has subscribed.
const systemDark = Platform.OS === "web" && typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
const subscribeSystem = (listener: () => void) => {
  systemDark?.addEventListener("change", listener);
  return () => systemDark?.removeEventListener("change", listener);
};
const systemNow = (): Scheme => (systemDark?.matches ? "dark" : "light");
const useWebScheme = () => useSyncExternalStore(subscribeSystem, systemNow, systemNow);
const useNativeScheme = (): Scheme => (useColorScheme() === "dark" ? "dark" : "light");

export const useSystemScheme: () => Scheme = Platform.OS === "web" ? useWebScheme : useNativeScheme;

export const useScheme = (): Scheme => resolveScheme(useAppearance(), useSystemScheme());

export function useColors(): Colors {
  return colors[useScheme()];
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const breakpoints = { columnFrom: 900, pairFrom: 1024, roomyFrom: 1280 } as const;

export const layout = {
  gutter: 24,
  header: 60,
  row: 52,
  adjustmentRow: 34,
  field: 54,
  fieldRadius: 27,
  cardRadius: 22,
  blockGap: 14,
  pairGap: 10,
  chipRowGap: 8,
} as const;

const sans = "'Geist', 'Geist Fallback', system-ui, -apple-system, sans-serif";

installDocument();
paintAppearance(picked);

// Five sizes, two weights (400 and 500). Say is home's sentence; hero is the share amount; title heads a sheet or the Total; body is every row, chip and button; caption is every line of supporting text.
export const type = StyleSheet.create({
  hero: { fontFamily: sans, fontWeight: "500", fontSize: 24, lineHeight: 30, letterSpacing: -0.48 },
  title: { fontFamily: sans, fontWeight: "500", fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: sans, fontWeight: "400", fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  caption: { fontFamily: sans, fontWeight: "400", fontSize: 14, lineHeight: 20, letterSpacing: -0.08 },
  // Home's one sentence, and a blank typed into it at the same size.
  say: { fontFamily: sans, fontWeight: "400", fontSize: 20, lineHeight: 35, letterSpacing: -0.3 },
  sayInput: { fontFamily: sans, fontWeight: "400", fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  // A text field stays at 16 px so iOS Safari does not zoom the page on focus.
  input: { fontFamily: sans, fontWeight: "400", fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },
  // A person's initial inside a dot; the dot sets its own size.
  glyph: { fontFamily: sans, fontWeight: "500", fontSize: 12, lineHeight: 15 },
});

/** Money amounts keep their digits one width, so a column of prices lines up and a changing total does not shift. */
export const tabular = { fontVariant: ["tabular-nums" as const] };

const easeOut = [0.23, 1, 0.32, 1] as const;
const easeDrawer = [0.32, 0.72, 0, 1] as const;
export const easing = { easeOut: Easing.bezier(...easeOut) };

export const motion = {
  easeOut: `cubic-bezier(${easeOut.join(", ")})`,
  easeDrawer: `cubic-bezier(${easeDrawer.join(", ")})`,
  themeReveal: 600,
  pressIn: 100,
  slipPressIn: 120,
  pillPressIn: 160,
  pressOut: 200,
  actionColor: 180,
  toastIn: 240,
  toastOut: 180,
  reducedFade: 160,
  rowsIn: 200,
  rowsOut: 150,
  photoIn: 240,
  photoOut: 180,
  footerIn: 240,
  controlIn: 200,
  dragOver: 150,
  spinnerTurn: 800,
} as const;
