const light = {
  field: "#FFFFFF",
  paper: "#F5F6F7",
  inset: "#FFFFFF",
  ink: "#111214",
  muted: "#696D74",
  hairline: "#E3E5E8",
  dash: "#B0B4BA",
  action: "#111214",
  onAction: "#FFFFFF",
  off: "#EEEFF1",
  onOff: "#696D74",
  danger: "#C0281A",
  good: "#17734A",
  warn: "#8F5200",
  bar: "rgba(255, 255, 255, 0.86)",
  sheet: "#FFFFFF",
  sheetIn: "#F5F6F7",
  dot: "#E3E5E8",
  scrim: "rgba(17, 18, 20, 0.32)",
  segment: "#FFFFFF",
  segmentShadow: "0 1px 2px rgba(17, 18, 20, 0.08), 0 0 0 0.5px rgba(17, 18, 20, 0.06)",
  skeleton: "#E0E1E3",
  skeletonInk: "#B1B2B3",
  focus: "#111214",
  lift: "drop-shadow(0 1px 1px rgba(17, 18, 20, 0.06)) drop-shadow(0 12px 20px rgba(17, 18, 20, 0.08))",
  cardLift: "0 1px 1px rgba(17, 18, 20, 0.06), 0 12px 20px rgba(17, 18, 20, 0.08)",
  sheetShadow: "0 -1px 0 #E3E5E8, 0 -12px 32px rgba(17, 18, 20, 0.06)",
  panelShadow: "0 0 0 1px #E3E5E8, 0 12px 32px rgba(17, 18, 20, 0.06)",
  popShadow: "0 0 0 1px rgba(17, 18, 20, 0.06), 0 2px 4px rgba(17, 18, 20, 0.04), 0 18px 40px rgba(17, 18, 20, 0.14)",
};

export type Colors = Record<keyof typeof light, string>;

const dark: Colors = {
  field: "#121315",
  paper: "#1C1D20",
  inset: "#2A2B2F",
  ink: "#F2F2F3",
  muted: "#A0A3A9",
  hairline: "#2F3135",
  dash: "#4A4D53",
  action: "#F2F2F3",
  onAction: "#111214",
  off: "#26272B",
  onOff: "#A0A3A9",
  danger: "#FF8A7A",
  good: "#4CC38A",
  warn: "#F0B23E",
  bar: "rgba(18, 19, 21, 0.86)",
  sheet: "#1C1D20",
  sheetIn: "#2A2B2F",
  dot: "#3A3C41",
  scrim: "rgba(0, 0, 0, 0.5)",
  segment: "#3A3C41",
  segmentShadow: "none",
  skeleton: "#2F3033",
  skeletonInk: "#5C5D5F",
  focus: "#F2F2F3",
  lift: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4)) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.35))",
  cardLift: "0 1px 1px rgba(0, 0, 0, 0.4), 0 12px 18px rgba(0, 0, 0, 0.35)",
  sheetShadow: "0 -1px 0 #2F3135, 0 -14px 36px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  panelShadow: "0 0 0 1px #2F3135, 0 12px 32px rgba(0, 0, 0, 0.3)",
  popShadow: "0 0 0 1px #34363B, 0 18px 40px rgba(0, 0, 0, 0.5)",
};

export const colors = { light, dark };

/**
 * Six pastel hues, each a soft `fill` for chips and initials (ink reads on it) and a deeper `mark` for the payments dots and ring arcs. Indexed by scheme.
 * Kept clear of the status green and amber.
 */
export const people = [
  { light: { fill: "#CFDFF7", mark: "#8FB2EA" }, dark: { fill: "#2C4268", mark: "#6F93D1" } },
  { light: { fill: "#F8D8C8", mark: "#F0A98A" }, dark: { fill: "#5B382B", mark: "#D9805F" } },
  { light: { fill: "#C5E8EC", mark: "#7CCAD3" }, dark: { fill: "#1F4B53", mark: "#4DAAB8" } },
  { light: { fill: "#DFD5F4", mark: "#B7A2E6" }, dark: { fill: "#43365F", mark: "#9C86D6" } },
  { light: { fill: "#F5D0DE", mark: "#E98FB0" }, dark: { fill: "#5A3045", mark: "#D06F96" } },
  { light: { fill: "#EDE3B6", mark: "#D6C16A" }, dark: { fill: "#50462A", mark: "#B9A44F" } },
] as const;

export type PersonInk = { readonly fill: string; readonly mark: string };

const hueOf = (id: string) => {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) % people.length;
};

/**
 * Everyone's hue, from their ids in table order. Each id starts at its own hash; if an earlier person holds that hue it takes the next free one, wrapping.
 * Every phone sees the same table order, so every phone paints the same hues, and a person is recolored only when someone before them who shared their hash leaves.
 * Past six people the hues start over.
 */
export function personInks(scheme: "light" | "dark", ids: readonly string[]): Map<string, PersonInk> {
  const taken = new Set<number>();
  const inks = new Map<string, PersonInk>();
  for (const id of ids) {
    if (taken.size === people.length) taken.clear();
    let hue = hueOf(id);
    while (taken.has(hue)) hue = (hue + 1) % people.length;
    taken.add(hue);
    inks.set(id, people[hue][scheme]);
  }
  return inks;
}
