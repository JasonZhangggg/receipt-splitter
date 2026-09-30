import { Easing, Platform, StyleSheet, useColorScheme, type TextStyle, type ViewStyle } from "react-native";

import { colors, type Colors } from "./colors";
import { installDocument } from "./document";

export function useColors(): Colors {
  return colors[useColorScheme() === "dark" ? "dark" : "light"];
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const breakpoints = { bottomBarBelow: 768, twoColumnsFrom: 900 } as const;

const display = "ArchivoCondensed, 'ArchivoCondensed Fallback', sans-serif";
const body = "Archivo, 'Archivo Fallback', system-ui, -apple-system, sans-serif";

const archivoDescent = 0.2;
const widestHeadlineEm = 4.6;
const headlineWithoutContainerUnits = 56;

installDocument(colors, { fontSize: headlineWithoutContainerUnits, descent: archivoDescent });

const headlineSizes = {
  narrow: { fontSize: 64, lineHeight: 62, letterSpacing: -0.5 },
  wide: { fontSize: 92, lineHeight: 88, letterSpacing: -1 },
};

type WebLength = Record<"fontSize" | "lineHeight" | "paddingBottom" | "marginBottom" | "containerType", string>;
const webLength = (style: Partial<WebLength>) => style as ViewStyle & TextStyle;

export function headlineType(wide: boolean, windowWidth: number) {
  const max = wide ? headlineSizes.wide : headlineSizes.narrow;
  const text: TextStyle = { fontFamily: display, fontWeight: "800", letterSpacing: max.letterSpacing };
  if (Platform.OS === "web") {
    const fontSize = `min(${max.fontSize}px, ${(100 / widestHeadlineEm).toFixed(3)}cqi)`;
    return {
      column: webLength({ containerType: "inline-size" }),
      mask: webLength({ marginBottom: `calc(${fontSize} * -${archivoDescent})` }),
      text: [
        text,
        webLength({ fontSize, lineHeight: `${(max.lineHeight / max.fontSize).toFixed(4)}em`, paddingBottom: `${archivoDescent}em` }),
      ],
    };
  }
  const fontSize = Math.min(max.fontSize, Math.floor((windowWidth - 2 * space.xl) / widestHeadlineEm));
  const descender = Math.ceil(fontSize * archivoDescent);
  return {
    column: {},
    mask: { marginBottom: -descender },
    text: [text, { fontSize, lineHeight: Math.round((max.lineHeight * fontSize) / max.fontSize), paddingBottom: descender }],
  };
}

export const type = StyleSheet.create({
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

const easeOut = [0.23, 1, 0.32, 1] as const;
const drawer = [0.32, 0.72, 0, 1] as const;

export const easing = { easeOut: Easing.bezier(...easeOut), drawer: Easing.bezier(...drawer) };

export const motion = {
  easeOut: `cubic-bezier(${easeOut.join(", ")})`,
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
