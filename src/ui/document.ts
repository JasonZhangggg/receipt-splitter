import { Platform } from "react-native";

import type { colors } from "./colors";

function css({ light, dark }: typeof colors) {
  return `:root { color-scheme: light dark; --focus: ${light.focus}; }
@media (prefers-color-scheme: dark) { :root { --focus: ${dark.focus}; } }
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
body { background-color: ${light.paper}; text-wrap: pretty; }
[role="heading"] { text-wrap: balance; }
@media (prefers-color-scheme: dark) { body { background-color: ${dark.paper}; } }
[data-pressable] { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
[data-pressable]:focus { outline: none; }
[data-pressable]:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
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
  const style = document.createElement("style");
  style.id = "rs-theme";
  style.textContent = css(themes);
  document.head.appendChild(style);

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("viewport-fit")) viewport.content += ", viewport-fit=cover";
  meta("theme-color", themes.light.paper, "(prefers-color-scheme: light)");
  meta("theme-color", themes.dark.paper, "(prefers-color-scheme: dark)");
}
