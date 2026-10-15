// The B2 set (docs/design/b2/README.md): bg, fg, muted, faint, line, underline, warn red, ok green. `paper`, `inset` and `sheetIn` are a hair off the page until the screens drop their fills.
const light = {
  field: "#FCFCFC",
  paper: "#FAFAFA",
  inset: "#FCFCFC",
  ink: "#171717",
  muted: "#737373",
  hairline: "#EBEBEB",
  dash: "#A3A3A3",
  action: "#171717",
  onAction: "#FCFCFC",
  off: "#EBEBEB",
  onOff: "#666666",
  danger: "#C4342A",
  good: "#1D7A46",
  warn: "#C4342A",
  bar: "rgba(252, 252, 252, 0.78)",
  sheet: "#FCFCFC",
  sheetIn: "#FAFAFA",
  dot: "#D0D0D0",
  scrim: "rgba(23, 23, 23, 0.32)",
  segment: "#FCFCFC",
  segmentShadow: "0 0 0 1px #EBEBEB",
  selfBadge: "#FCFCFC",
  onSelfBadge: "#171717",
  selfBadgeEdge: "#A3A3A3",
  skeleton: "#EBEBEB",
  skeletonInk: "#D0D0D0",
  focus: "#171717",
  lift: "drop-shadow(0 1px 1px rgba(23, 23, 23, 0.04)) drop-shadow(0 8px 16px rgba(23, 23, 23, 0.05))",
  cardLift: "0 1px 1px rgba(23, 23, 23, 0.04), 0 8px 16px rgba(23, 23, 23, 0.05)",
  sheetShadow: "0 -1px 0 #EBEBEB, 0 -10px 30px rgba(0, 0, 0, 0.06)",
  panelShadow: "0 0 0 1px #EBEBEB, 0 10px 30px rgba(0, 0, 0, 0.06)",
  popShadow: "0 0 0 1px #EBEBEB, 0 2px 4px rgba(23, 23, 23, 0.04), 0 16px 36px rgba(23, 23, 23, 0.12)",
};

export type Colors = Record<keyof typeof light, string>;

const dark: Colors = {
  field: "#111111",
  paper: "#181818",
  inset: "#111111",
  ink: "#EDEDED",
  muted: "#999999",
  hairline: "#232323",
  dash: "#5C5C5C",
  action: "#EDEDED",
  onAction: "#111111",
  off: "#232323",
  onOff: "#999999",
  danger: "#F0766B",
  good: "#5CC489",
  warn: "#F0766B",
  bar: "rgba(17, 17, 17, 0.8)",
  sheet: "#111111",
  sheetIn: "#181818",
  dot: "#4A4A4A",
  scrim: "rgba(0, 0, 0, 0.5)",
  segment: "#232323",
  segmentShadow: "none",
  selfBadge: "#EDEDED",
  onSelfBadge: "#111111",
  selfBadgeEdge: "transparent",
  skeleton: "#232323",
  skeletonInk: "#4A4A4A",
  focus: "#EDEDED",
  lift: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4)) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.35))",
  cardLift: "0 1px 1px rgba(0, 0, 0, 0.4), 0 12px 18px rgba(0, 0, 0, 0.35)",
  sheetShadow: "0 -1px 0 #232323, 0 -10px 30px rgba(0, 0, 0, 0.4)",
  panelShadow: "0 0 0 1px #232323, 0 10px 30px rgba(0, 0, 0, 0.3)",
  popShadow: "0 0 0 1px #2E2E2E, 0 18px 40px rgba(0, 0, 0, 0.5)",
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
export const onPastel = "#111111";

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
