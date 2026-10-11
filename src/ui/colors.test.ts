import { describe, expect, test } from "vitest";

import { colors, people, personInk, type Colors } from "./colors";

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

test("a person's hue comes from their id alone", () => {
  expect(personInk("light", "p-abc")).toBe(personInk("light", "p-abc"));
  expect(people.map((pair) => pair[0])).toContain(personInk("light", "p-abc"));
  expect(people.map((pair) => pair[1])).toContain(personInk("dark", "p-abc"));
});
