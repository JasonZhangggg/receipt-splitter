import { Platform } from "react-native";

import type { colors } from "./colors";
import { fallbackMetrics, faces } from "./fonts.generated";

const weights = [400, 500] as const;
const fallbackSources = ["Arial", "ArialMT", "Liberation Sans", "LiberationSans", "Roboto", "Roboto-Regular"];

/** Marks a rounded group of text fields, which draws the focus ring for the field inside it. */
export const fieldGroup = { dataSet: { field: "" } };

function css({ light, dark }: typeof colors) {
  const webFaces = weights.map(
    (weight) =>
      `@font-face { font-family: "Plus Jakarta Sans"; font-weight: ${weight}; font-display: swap; src: url("${faces[weight]}") format("woff2"); }`,
  );
  const local = fallbackSources.map((name) => `local("${name}")`).join(", ");
  const fallbackFaces = weights.map(
    (weight) => `@font-face { font-family: "Plus Jakarta Sans Fallback"; font-weight: ${weight}; src: ${local}; ${fallbackMetrics[weight]} }`,
  );
  return `${[...webFaces, ...fallbackFaces].join("\n")}
:root { color-scheme: light dark; --focus: ${light.focus}; --on-action: ${light.onAction}; }
@media (prefers-color-scheme: dark) { :root { --focus: ${dark.focus}; --on-action: ${dark.onAction}; } }
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
html, body { overscroll-behavior: none; }
body { background-color: ${light.field}; text-wrap: pretty; }
@media (prefers-color-scheme: dark) { body { background-color: ${dark.field}; } }
[data-pressable] { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
a[data-pressable] { -webkit-touch-callout: default; text-decoration: none; }
[data-pressable]:focus { outline: none; }
[data-pressable]:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
[data-pressable]:has([data-press-face]):focus-visible { outline: none; }
[data-pressable]:focus-visible [data-press-face] { outline: 2px solid var(--focus); outline-offset: 3px; }
:is(input, textarea):focus { outline: none; }
@media (any-pointer: fine) {
  :is(input, textarea):focus-visible:not([data-field] *), [data-field]:has(:is(input, textarea):focus-visible) { outline: 2px solid var(--focus); outline-offset: -2px; }
}
[data-app-picker]:has(select:focus-visible) [data-press-face] { outline: 2px solid var(--focus); outline-offset: 3px; border-radius: 4px; }
[data-app-picker]:has(select:focus-visible) [data-press-face][data-round] { border-radius: 20px; outline-color: var(--on-action); outline-offset: -2px; }
`;
}

function meta(name: string, content: string, media?: string) {
  const tag = document.createElement("meta");
  tag.name = name;
  tag.content = content;
  if (media) tag.media = media;
  document.head.appendChild(tag);
}

export function installDocument(themes: typeof colors) {
  if (Platform.OS !== "web" || document.getElementById("rs-theme")) return;
  for (const href of Object.values(faces)) {
    const preload = Object.assign(document.createElement("link"), { rel: "preload", as: "font", type: "font/woff2", href, crossOrigin: "anonymous" });
    document.head.appendChild(preload);
  }
  const style = document.createElement("style");
  style.id = "rs-theme";
  style.textContent = css(themes);
  document.head.appendChild(style);

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("viewport-fit")) viewport.content += ", viewport-fit=cover";
  meta("theme-color", themes.light.field, "(prefers-color-scheme: light)");
  meta("theme-color", themes.dark.field, "(prefers-color-scheme: dark)");
}
