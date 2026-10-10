import { createHash } from "node:crypto";
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import nodeModule from "node:module";
import { extname } from "node:path";
import { chromium } from "@playwright/test";

const [major, minor] = process.versions.node.split(".").map(Number);
const typeStrippingFrom = { 22: 18, 23: 6 }[major] ?? (major > 23 ? 0 : Infinity);
if (minor < typeStrippingFrom) {
  console.error(`fallback-metrics.mjs needs Node 22.18, 23.6, or 24 and later to import home-copy.ts. This is Node ${process.versions.node}.`);
  process.exit(1);
}

function resolveExtensionlessTs(specifier, context, next) {
  try {
    return next(specifier, context);
  } catch (error) {
    const extensionlessRelative = /^\.\.?\//.test(specifier) && !extname(specifier);
    if (error.code !== "ERR_MODULE_NOT_FOUND" || !extensionlessRelative) throw error;
    return next(`${specifier}.ts`, context);
  }
}

nodeModule.registerHooks({ resolve: resolveExtensionlessTs });
const { fallbackSamples } = await import("../../src/ui/home-copy.ts");

const fontDir = new URL("../../public/fonts/", import.meta.url);

function hashedFace(weight) {
  const [found, ...extra] = readdirSync(fontDir).filter((name) => name.startsWith(`plus-jakarta-sans-${weight}`) && name.endsWith(".woff2"));
  if (!found || extra.length > 0) throw new Error(`expected one plus-jakarta-sans-${weight}*.woff2 in public/fonts`);
  const hash = createHash("sha256").update(readFileSync(new URL(found, fontDir))).digest("hex").slice(0, 10);
  const file = `plus-jakarta-sans-${weight}-${hash}.woff2`;
  if (file !== found) renameSync(new URL(found, fontDir), new URL(file, fontDir));
  return file;
}

const faces = [400, 600].map((weight) => ({
  file: hashedFace(weight),
  weight,
  local: "Arial",
  sample: fallbackSamples[weight],
}));

const browser = await chromium.launch();
const page = await browser.newPage();
const metrics = {};
const data = {};

for (const face of faces) {
  const bytes = readFileSync(new URL(face.file, fontDir)).toString("base64");
  data[face.weight] = `/fonts/${face.file}`;
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

const table = (values) => Object.entries(values).map(([weight, value]) => `  ${weight}: "${value}",`).join("\n");
writeFileSync(
  new URL("../../src/ui/fonts.generated.ts", import.meta.url),
  `export const faces = {\n${table(data)}\n};\n\nexport const fallbackMetrics = {\n${table(metrics)}\n};\n`,
);
