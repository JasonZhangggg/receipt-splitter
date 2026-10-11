import { describe, expect, test } from "vitest";

import { colors, people, personInks, type Colors } from "./colors";

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
  ["danger", "sheetIn"],
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

const surfaces = {
  light: ["#FFFFFF", "#F5F6F7", "#EEEFF1", "#E3E5E8"],
  dark: ["#1C1D20", "#2A2B2F", "#26272B", "#3A3C41"],
};

describe.each(["light", "dark"] as const)("%s person hues", (scheme) => {
  const tone = scheme === "light" ? 0 : 1;
  test.each(people.map((pair) => pair[tone]))("%s meets 4.5:1 on every surface it sits on", (hue) => {
    for (const surface of surfaces[scheme]) expect(contrast(hue, surface)).toBeGreaterThanOrEqual(4.5);
  });

  // A selected chip is filled with the action color, so its dot uses the other scheme's tone.
  test.each(people.map((pair) => pair[1 - tone]))("%s meets 4.5:1 on the selected chip fill", (hue) => {
    expect(contrast(hue, colors[scheme].action)).toBeGreaterThanOrEqual(4.5);
  });
});

const blue = "#2F5FB3";
const rust = "#B3401F";
const cyan = "#0B6F8C";
const violet = "#7A45B8";
const rose = "#B02F63";
const magenta = "#9A3496";
const inksOf = (ids: string[]) => Object.fromEntries(personInks("light", ids));

describe("personInks", () => {
  // The hashes of jason and fay both land on cyan, and priya's, eli's and bob's all land on rose.
  test("each id takes its own hue, and a later id that hashes to a taken hue takes the next free one", () => {
    expect(inksOf(["jason", "sam", "priya", "dee", "eli", "fay"])).toEqual({ jason: cyan, sam: rust, priya: rose, dee: blue, eli: magenta, fay: violet });
  });

  test("the same table order gives the same hues, and the dark scheme gives the dark tones of the same hues", () => {
    const ids = ["jason", "sam", "priya", "dee", "eli", "fay"];
    expect(inksOf(ids)).toEqual(inksOf(ids));
    expect([...personInks("dark", ids).values()]).toEqual(["#5CC3E0", "#F2917A", "#EE86AE", "#86A9F0", "#E39AE0", "#BC9CEE"]);
  });

  test("someone who leaves recolors nobody unless they held a hue a later person had collided with", () => {
    expect(inksOf(["jason", "priya", "dee", "eli", "fay"])).toEqual({ jason: cyan, priya: rose, dee: blue, eli: magenta, fay: violet });
    expect(inksOf(["sam", "priya", "dee", "eli", "fay"])).toEqual({ sam: rust, priya: rose, dee: blue, eli: magenta, fay: cyan });
  });

  test("with more people than hues the hues start over", () => {
    const seven = inksOf(["jason", "sam", "priya", "dee", "eli", "fay", "ann"]);
    expect(new Set(Object.values(seven).slice(0, 6)).size).toBe(6);
    expect(seven.ann).toBe(magenta);
    expect(people.map((pair) => pair[0])).toContain(seven.ann);
  });
});
