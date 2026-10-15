import { describe, expect, test } from "vitest";

import { colors, onPastel, people, personInks, type Colors } from "./colors";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("contrast matches the WCAG formula on known pairs", () => {
  expect(contrast("#000000", "#FFFFFF")).toBe(21);
  expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
});

const text: [fg: keyof Colors, bg: keyof Colors][] = [
  ["ink", "field"],
  ["ink", "paper"],
  ["ink", "inset"],
  ["ink", "sheet"],
  ["ink", "sheetIn"],
  ["muted", "field"],
  ["muted", "paper"],
  ["muted", "sheet"],
  ["muted", "sheetIn"],
  ["onAction", "action"],
  ["onOff", "off"],
  ["onSelfBadge", "selfBadge"],
  ["good", "sheet"],
  ["good", "sheetIn"],
  ["good", "paper"],
  ["good", "field"],
  ["warn", "sheet"],
  ["warn", "sheetIn"],
  ["warn", "paper"],
  ["warn", "field"],
];

const shapes: [fg: keyof Colors, bg: keyof Colors][] = [
  ["action", "field"],
  ["action", "sheet"],
  ["focus", "field"],
  ["focus", "paper"],
  ["focus", "sheet"],
];

describe.each(["light", "dark"] as const)("%s colors", (scheme) => {
  test.each(text)("%s text on %s meets WCAG AA 4.5:1", (fg, bg) => {
    expect(contrast(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(4.5);
  });

  test.each(shapes)("%s shape on %s meets WCAG AA 3:1", (fg, bg) => {
    expect(contrast(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(3);
  });

  // The Add receipt box's dashes are a quiet edge (preferences 66); its camera button and label name the control.
  test.each(["field", "paper"] as const)("dash on %s stays visible at 1.8:1", (bg) => {
    expect(contrast(colors[scheme].dash, colors[scheme][bg])).toBeGreaterThanOrEqual(1.8);
  });
});

describe.each(["light", "dark"] as const)("%s person hues", (scheme) => {
  test.each(people.map((hue) => hue[scheme].fill))("text on the fill %s meets 4.5:1", (fill) => {
    expect(contrast(onPastel, fill)).toBeGreaterThanOrEqual(4.5);
  });

  // The claimer initials sit on the card; the ring arcs on the sheet; the chip dots on the chip's quiet fill.
  test.each(people.map((hue) => hue[scheme].fill))("the fill %s stays apart from the card it is drawn on", (fill) => {
    expect(contrast(fill, colors[scheme].paper)).toBeGreaterThanOrEqual(1.1);
  });

  test.each(people.map((hue) => hue[scheme].mark))("the ring mark %s shows against the sheet at 1.5:1", (mark) => {
    expect(contrast(mark, colors[scheme].sheet)).toBeGreaterThanOrEqual(1.5);
  });

  test.each(people.map((hue) => hue[scheme].mark))("the chip dot %s shows against the chip fill at 1.5:1", (mark) => {
    expect(contrast(mark, colors[scheme].sheetIn)).toBeGreaterThanOrEqual(1.5);
  });

  // The selected person's badge is white in light mode, so a hairline sets it off the card; in dark mode the badge itself is bright against the card.
  test("the selected person's badge reads against the card: by its edge in light, by its fill in dark", () => {
    const { selfBadge, selfBadgeEdge, paper } = colors[scheme];
    expect(Math.max(contrast(selfBadge, paper), selfBadgeEdge === "transparent" ? 0 : contrast(selfBadgeEdge, paper))).toBeGreaterThanOrEqual(1.8);
  });
});

const hueOf = (name: string, scheme: "light" | "dark" = "light") => people.find((hue) => hue.light.fill === name || hue.dark.fill === name)![scheme];
const blue = people[0].light;
const peach = people[1].light;
const aqua = people[2].light;
const lavender = people[3].light;
const rose = people[4].light;
const butter = people[5].light;
const inksOf = (ids: string[]) => Object.fromEntries(personInks("light", ids));

describe("personInks", () => {
  // The hashes of jason and fay both land on aqua, and priya's, eli's and bob's all land on rose.
  test("each id takes its own hue, and a later id that hashes to a taken hue takes the next free one", () => {
    expect(inksOf(["jason", "sam", "priya", "dee", "eli", "fay"])).toEqual({ jason: aqua, sam: peach, priya: rose, dee: blue, eli: butter, fay: lavender });
  });

  test("the same table order gives the same hues, and the dark scheme gives the dark tones of the same hues", () => {
    const ids = ["jason", "sam", "priya", "dee", "eli", "fay"];
    expect(inksOf(ids)).toEqual(inksOf(ids));
    expect([...personInks("dark", ids).values()]).toEqual([people[2].dark, people[1].dark, people[4].dark, people[0].dark, people[5].dark, people[3].dark]);
    expect(hueOf(people[0].light.fill, "dark")).toEqual(people[0].dark);
  });

  test("someone who leaves recolors nobody unless they held a hue a later person had collided with", () => {
    expect(inksOf(["jason", "priya", "dee", "eli", "fay"])).toEqual({ jason: aqua, priya: rose, dee: blue, eli: butter, fay: lavender });
    expect(inksOf(["sam", "priya", "dee", "eli", "fay"])).toEqual({ sam: peach, priya: rose, dee: blue, eli: butter, fay: aqua });
  });

  test("with more people than hues the hues start over", () => {
    const seven = inksOf(["jason", "sam", "priya", "dee", "eli", "fay", "ann"]);
    expect(new Set(Object.values(seven).slice(0, 6).map(({ fill }) => fill)).size).toBe(6);
    expect(seven.ann).toEqual(butter);
    expect(people.map((hue) => hue.light)).toContainEqual(seven.ann);
  });
});
