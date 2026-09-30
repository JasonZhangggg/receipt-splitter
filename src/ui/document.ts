import { Platform } from "react-native";

import type { colors } from "./colors";
import { fallbackMetrics } from "./fallback-metrics.generated";

const faces: [family: string, weight: number, url: string][] = [
  ["Archivo", 500, require("../../assets/fonts/Archivo-Medium.ttf")],
  ["ArchivoCondensed", 800, require("../../assets/fonts/Archivo-CondensedBlack.ttf")],
];

const fallbacks = [
  {
    family: "Archivo Fallback",
    weight: 500,
    local: ["Arial", "ArialMT", "Liberation Sans", "LiberationSans", "Roboto", "Roboto-Regular"],
    metrics: fallbackMetrics[500],
  },
  {
    family: "ArchivoCondensed Fallback",
    weight: 800,
    local: [
      "Arial Bold",
      "Arial-BoldMT",
      "Liberation Sans Bold",
      "LiberationSans-Bold",
      "Roboto Bold",
      "Roboto-Bold",
      "Roboto",
      "Roboto-Regular",
    ],
    metrics: fallbackMetrics[800],
  },
];

type Headline = { fontSize: number; descent: number };

function css({ light, dark }: typeof colors, headline: Headline) {
  const fontFaces = faces.map(
    ([family, weight, url]) =>
      `@font-face { font-family: "${family}"; font-weight: ${weight}; font-display: swap; src: url("${url}") format("truetype"); }`,
  );
  const fallbackFaces = fallbacks.map(({ family, weight, local, metrics }) => {
    const src = local.map((name) => `local("${name}")`).join(", ");
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: ${src}; ${metrics} }`;
  });
  return `${[...fontFaces, ...fallbackFaces].join("\n")}
:root { color-scheme: light dark; --focus: ${light.focus}; }
@media (prefers-color-scheme: dark) { :root { --focus: ${dark.focus}; } }
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
body { background-color: ${light.field}; text-wrap: pretty; }
[role="heading"] { text-wrap: balance; }
@media (prefers-color-scheme: dark) { body { background-color: ${dark.field}; } }
[data-pressable] { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
[data-pressable]:focus { outline: none; }
[data-pressable]:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
[data-headline] { font-size: ${headline.fontSize}px; margin-bottom: -${headline.descent}em; }
[data-headline] > * { font-size: inherit; }
`;
}

function meta(name: string, content: string, media?: string) {
  const tag = document.createElement("meta");
  tag.name = name;
  tag.content = content;
  if (media) tag.media = media;
  document.head.appendChild(tag);
}

export function installDocument(themes: typeof colors, headline: Headline) {
  if (Platform.OS !== "web" || document.getElementById("rs-theme")) return;
  const style = document.createElement("style");
  style.id = "rs-theme";
  style.textContent = css(themes, headline);
  document.head.appendChild(style);

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("viewport-fit")) viewport.content += ", viewport-fit=cover";
  meta("theme-color", themes.light.field, "(prefers-color-scheme: light)");
  meta("theme-color", themes.dark.field, "(prefers-color-scheme: dark)");
}
