import { useEffect } from "react";
import { Platform } from "react-native";

import type { Appearance, Scheme } from "./appearance";
import { colors } from "./colors";
import { fallbackMetrics } from "./fonts.generated";
import { sentenceCss } from "./home-sentence/css";
import { iconCss } from "./icon-css";

const weights = [400, 500] as const;
const fallbackSources = ["Arial", "ArialMT", "Liberation Sans", "LiberationSans", "Roboto", "Roboto-Regular"];

/** Marks a rounded group of text fields, which draws the focus ring for the field inside it. */
export const fieldGroup = { dataSet: { field: "" } };

/** The Geist faces and their preloads are in public/index.html, so the font downloads beside the bundle. */
function css({ light, dark }: typeof colors) {
  const local = fallbackSources.map((name) => `local("${name}")`).join(", ");
  const fallbackFaces = weights.map(
    (weight) => `@font-face { font-family: "Geist Fallback"; font-weight: ${weight}; src: ${local}; ${fallbackMetrics[weight]} }`,
  );
  return `${fallbackFaces.join("\n")}
:root { --focus: ${light.focus}; --on-action: ${light.onAction}; --ink: ${light.ink}; --shimmer: ${light.shimmer}; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --focus: ${dark.focus}; --on-action: ${dark.onAction}; --ink: ${dark.ink}; --shimmer: ${dark.shimmer}; } }
:root[data-theme="dark"] { --focus: ${dark.focus}; --on-action: ${dark.onAction}; --ink: ${dark.ink}; --shimmer: ${dark.shimmer}; }
/* A theme flip is a clip-path circle on the new snapshot (use-appearance-flip.ts), so the default cross-fade of the root goes. */
::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
/* No color may be mid-fade when the circle reveals the new theme (rule 18). The toggle's icons keep their own turn. */
[data-theme-flip] *:not([data-theme-icon]) { transition: none !important; }
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-synthesis: none; -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
html, body { overscroll-behavior: none; }
body { text-wrap: pretty; }
[data-pressable] { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
a[data-pressable] { -webkit-touch-callout: default; text-decoration: none; }
[data-pressable]:focus, [role="dialog"]:focus { outline: none; }
[data-pressable]:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
[data-pressable]:has([data-press-face]):focus-visible { outline: none; }
[data-pressable]:focus-visible [data-press-face] { outline: 2px solid var(--focus); outline-offset: 3px; }
:is(input, textarea):focus { outline: none; }
@media (any-pointer: fine) {
  :is(input, textarea):focus-visible:not([data-field] *), [data-field]:has(:is(input, textarea):focus-visible) { outline: 2px solid var(--focus); outline-offset: -2px; }
}
:is(input, textarea)[data-underline]:focus-visible { outline: none; }
${iconCss}
${sentenceCss}`;
}

export function installDocument() {
  if (Platform.OS !== "web" || document.getElementById("rs-theme")) return;
  const style = document.createElement("style");
  style.id = "rs-theme";
  style.textContent = css(colors);
  document.head.appendChild(style);

  const live = () => document.documentElement.setAttribute("data-icons-live", "");
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, live, { capture: true, once: true });

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

/** Tells the loader in public/index.html that the first screen is on the page; it lifts once Geist has loaded too. */
export function announceMounted() {
  if (Platform.OS === "web") document.dispatchEvent(new Event("splitwith:mounted"));
}

/** Shows the loader from public/index.html over the page while `active`, under `label`. It appears after 300 ms, so a fast connect shows nothing, and it lifts when `active` ends. */
export function useBusyLoader(active: boolean, label: string) {
  useEffect(() => {
    if (Platform.OS !== "web" || !active) return;
    const loader = document.getElementById("rs-boot");
    const before = loader?.getAttribute("aria-label") ?? null;
    loader?.setAttribute("aria-label", label);
    document.dispatchEvent(new Event("splitwith:busy"));
    return () => {
      document.dispatchEvent(new Event("splitwith:idle"));
      if (before !== null) loader?.setAttribute("aria-label", before);
    };
  }, [active, label]);
}
