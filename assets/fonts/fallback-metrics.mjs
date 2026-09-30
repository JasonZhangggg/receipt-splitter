import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const faces = [
  {
    file: "Archivo-CondensedBlack.ttf",
    weight: 800,
    local: "Arial Bold",
    sample: ["Split the bill", "at the table.", "Nonna Rosa", "Total", "$18.00", "$12.50", "$21.00", "$91.66"],
  },
  {
    file: "Archivo-Medium.ttf",
    weight: 500,
    local: "Arial",
    sample: [
      "Take a photo of the receipt and send the link. Everyone taps what they ordered and pays you back.",
      "The photo stays on your phone.",
      "Scan or upload a receipt",
      "Margherita pizza",
      "Caesar salad",
      "Spicy rigatoni",
      "Lemonade pitcher",
      "Tiramisu",
      "Check this price.",
      "Subtotal",
      "Tip 20%",
      "Items add up to $75.00, $1.00 short of the subtotal.",
      "Table 12, Sep 29, 8:41 PM",
    ],
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();

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
          width: widths.reduce((a, b) => a + b, 0),
          ascent: metrics.fontBoundingBoxAscent / 1000,
          descent: metrics.fontBoundingBoxDescent / 1000,
        };
      };
      const web = await measure(`web-${weight}`, data);
      const fallback = await measure(`fallback-${weight}`, `local("${local}")`);
      const sizeAdjust = web.width / fallback.width;
      const descriptors = {
        sizeAdjust: `${(sizeAdjust * 100).toFixed(2)}%`,
        ascentOverride: `${((web.ascent / sizeAdjust) * 100).toFixed(2)}%`,
        descentOverride: `${((web.descent / sizeAdjust) * 100).toFixed(2)}%`,
        lineGapOverride: "0%",
      };
      const check = await measure(`check-${weight}`, `local("${local}")`, descriptors);
      return {
        descriptors,
        check: {
          widthRatio: +(check.width / web.width).toFixed(4),
          ascent: [+web.ascent.toFixed(3), +check.ascent.toFixed(3)],
          descent: [+web.descent.toFixed(3), +check.descent.toFixed(3)],
        },
      };
    },
    { bytes, weight: face.weight, local: face.local, sample: face.sample },
  );
  console.log(JSON.stringify({ face: face.file, local: face.local, ...result }));
}

await browser.close();
