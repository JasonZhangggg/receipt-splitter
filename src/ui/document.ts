import { Platform } from "react-native";

import type { Appearance, Scheme } from "./appearance";
import { colors } from "./colors";
import { fallbackMetrics, faces } from "./fonts.generated";

const weights = [400, 500] as const;
/** A flip of the appearance crossfades the whole page instead of jumping from one brightness to the other. */
const appearanceFade = 200;
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
:root { --focus: ${light.focus}; --on-action: ${light.onAction}; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --focus: ${dark.focus}; --on-action: ${dark.onAction}; } }
:root[data-theme="dark"] { --focus: ${dark.focus}; --on-action: ${dark.onAction}; }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: ${appearanceFade}ms; animation-timing-function: ease; }
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
html, body { overscroll-behavior: none; }
body { text-wrap: pretty; }
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

export function installDocument() {
  if (Platform.OS !== "web" || document.getElementById("rs-theme")) return;
  for (const href of Object.values(faces)) {
    const preload = Object.assign(document.createElement("link"), { rel: "preload", as: "font", type: "font/woff2", href, crossOrigin: "anonymous" });
    document.head.appendChild(preload);
  }
  const style = document.createElement("style");
  style.id = "rs-theme";
  style.textContent = css(colors);
  document.head.appendChild(style);

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("viewport-fit")) viewport.content += ", viewport-fit=cover";
}

/** Does at runtime what the script in public/index.html does before the first paint. With no pick, each theme-color tag goes back to its own scheme's color. */
export function paintAppearance(picked: Appearance) {
  if (Platform.OS !== "web") return;
  const root = document.documentElement;
  if (picked) root.dataset.theme = picked;
  else delete root.dataset.theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own: Scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = colors[picked ?? own].field;
  }
}
