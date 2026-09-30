import { readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { chromium } from "@playwright/test";

function resolveExtensionlessTs(specifier, context, next) {
  try {
    return next(specifier, context);
  } catch {
    return next(`${specifier}.ts`, context);
  }
}

registerHooks({ resolve: resolveExtensionlessTs });
const { fallbackSamples } = await import("../../src/ui/home-copy.ts");

const faces = [
  { file: "Archivo-CondensedBlack.ttf", weight: 800, local: "Arial Bold", sample: fallbackSamples[800] },
  { file: "Archivo-Medium.ttf", weight: 500, local: "Arial", sample: fallbackSamples[500] },
];

const browser = await chromium.launch();
const page = await browser.newPage();
const metrics = {};

for (const face of faces) {
  const bytes = readFileSync(new URL(face.file, import.meta.url)).toString("base64");
  const result = await page.evaluate(
    async ({ bytes, weight, local, sample }) => {
      const data = Uint8Array.from(atob(bytes), (ch) => ch.charCodeAt(0));
      const measure = async (family, source, descriptors = {}) => {
        const font = new FontFace(family, source, { weight: String(weight), ...descriptors });
        document.fonts.add(await font.load());
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = `${weight} 1000px "${family}"`;
        const widths = sample.map((text) => ctx.measureText(text).width);
        const metrics = ctx.measureText("Hg");
        return {
          widths,
          ascent: metrics.fontBoundingBoxAscent / 1000,
          descent: metrics.fontBoundingBoxDescent / 1000,
        };
      };
      const web = await measure(`web-${weight}`, data);
      const fallback = await measure(`fallback-${weight}`, `local("${local}")`);
      const sizeAdjust = Math.floor(Math.min(...web.widths.map((width, i) => width / fallback.widths[i])) * 10000) / 10000;
      const descriptors = {
        sizeAdjust: `${(sizeAdjust * 100).toFixed(2)}%`,
        ascentOverride: `${((web.ascent / sizeAdjust) * 100).toFixed(2)}%`,
        descentOverride: `${((web.descent / sizeAdjust) * 100).toFixed(2)}%`,
        lineGapOverride: "0%",
      };
      const check = await measure(`check-${weight}`, `local("${local}")`, descriptors);
      const ratios = check.widths.map((width, i) => width / web.widths[i]);
      const widest = ratios.indexOf(Math.max(...ratios));
      return {
        descriptors,
        check: {
          widestRatio: ratios[widest],
          widestLine: sample[widest],
          ascent: [+web.ascent.toFixed(3), +check.ascent.toFixed(3)],
          descent: [+web.descent.toFixed(3), +check.descent.toFixed(3)],
        },
      };
    },
    { bytes, weight: face.weight, local: face.local, sample: face.sample },
  );
  console.log(JSON.stringify({ face: face.file, local: face.local, ...result }));
  if (result.check.widestRatio > 1) {
    console.error(`${face.file}: "${result.check.widestLine}" is ${result.check.widestRatio} times wider in ${face.local}`);
    process.exitCode = 1;
  }
  const d = result.descriptors;
  metrics[face.weight] =
    `size-adjust: ${d.sizeAdjust}; ascent-override: ${d.ascentOverride}; ` +
    `descent-override: ${d.descentOverride}; line-gap-override: ${d.lineGapOverride};`;
}

await browser.close();
if (process.exitCode) process.exit();

const entries = Object.entries(metrics).map(([weight, css]) => `  ${weight}: "${css}",`);
writeFileSync(
  new URL("../../src/ui/fallback-metrics.generated.ts", import.meta.url),
  `export const fallbackMetrics = {\n${entries.join("\n")}\n};\n`,
);
