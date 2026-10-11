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
  selfBadge: "#FFFFFF",
  onSelfBadge: "#111214",
  selfBadgeEdge: "#B0B4BA",
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
  selfBadge: "#F2F2F3",
  onSelfBadge: "#111214",
  selfBadgeEdge: "transparent",
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
 * Six dusty hues (blue, peach, aqua, lavender, rose, butter), each a grayish `fill` for the claimer initials on the card and in the pick sheet, with ink on it,
 * and a deeper `mark` for the chip dots, the payments dots and the ring arcs. Indexed by scheme. Kept clear of the status green and amber.
 */
export const people = [
  { light: { fill: "#E0E7F0", mark: "#91A1BA" }, dark: { fill: "#BBC1CA", mark: "#8899B1" } },
  { light: { fill: "#F0E1DC", mark: "#BB9588" }, dark: { fill: "#C8BCB4", mark: "#B08F7A" } },
  { light: { fill: "#C8D7D9", mark: "#77A0A5" }, dark: { fill: "#BFCDD0", mark: "#7CA4AD" } },
  { light: { fill: "#DDDAE5", mark: "#9F95B3" }, dark: { fill: "#D3D1DD", mark: "#A19BBA" } },
  { light: { fill: "#DDCFD4", mark: "#AF8B99" }, dark: { fill: "#D2C4C7", mark: "#B58F99" } },
  { light: { fill: "#DFDED0", mark: "#A29D78" }, dark: { fill: "#D2CEC1", mark: "#A99D79" } },
] as const;

/** Text on a person's fill: dark in both schemes, since the fills stay light in dark mode too. */
export const onPastel = "#111214";

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
