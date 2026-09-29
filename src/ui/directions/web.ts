import { useEffect, useState } from "react";
import { Platform } from "react-native";

const faces: [family: string, weight: number, file: string][] = [
  ["PlexMono", 400, require("../../../assets/fonts/PlexMono-Regular.ttf")],
  ["PlexMono", 600, require("../../../assets/fonts/PlexMono-SemiBold.ttf")],
  ["Atkinson", 400, require("../../../assets/fonts/Atkinson-Regular.ttf")],
  ["Atkinson", 700, require("../../../assets/fonts/Atkinson-Bold.ttf")],
  ["Archivo", 500, require("../../../assets/fonts/Archivo-Medium.ttf")],
  ["ArchivoCondensed", 800, require("../../../assets/fonts/Archivo-CondensedBlack.ttf")],
];

const base = `
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
[role="button"] { touch-action: manipulation; user-select: none; -webkit-user-select: none; }
[data-focus-ring]:focus-visible { outline: 2px solid var(--focus, #2a6df4); outline-offset: 3px; }
[data-focus-ring]:focus:not(:focus-visible) { outline: none; }
`;

if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("rs-proto")) {
  const style = document.createElement("style");
  style.id = "rs-proto";
  style.textContent =
    faces
      .map(
        ([family, weight, file]) =>
          `@font-face { font-family: "${family}"; font-weight: ${weight}; font-display: swap; src: url("${file}") format("truetype"); }`,
      )
      .join("\n") + base;
  document.head.appendChild(style);
}

export function setPageColor(color: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.body.style.backgroundColor = color;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

const reduceQuery = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [reduce, setReduce] = useState(
    () => Platform.OS === "web" && typeof matchMedia !== "undefined" && matchMedia(reduceQuery).matches,
  );
  useEffect(() => {
    if (Platform.OS !== "web" || typeof matchMedia === "undefined") return;
    const query = matchMedia(reduceQuery);
    const onChange = () => setReduce(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

export const ease = {
  out: "cubic-bezier(0.23, 1, 0.32, 1)",
  inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
};

export function enter(
  reduce: boolean,
  { delay = 0, duration = 240, from = "translateY(8px)", easing = ease.out } = {},
): object {
  return {
    animationKeyframes: reduce
      ? [{ from: { opacity: 0 }, to: { opacity: 1 } }]
      : [{ from: { opacity: 0, transform: from }, to: { opacity: 1, transform: "none" } }],
    animationDuration: `${reduce ? 160 : duration}ms`,
    animationDelay: `${reduce ? 0 : delay}ms`,
    animationTimingFunction: reduce ? "ease" : easing,
    animationFillMode: "both",
  };
}

export function press(duration = 100): object {
  return {
    transitionProperty: "transform, background-color, opacity",
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: ease.out,
  };
}

export const focusRing = { dataSet: { focusRing: "" } } as object;
