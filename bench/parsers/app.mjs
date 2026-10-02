import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReceipt } from "../../src/parse/index.ts";

const OCR = join(import.meta.dirname, "..", "ocr");

export function load({ name }) {
  return JSON.parse(readFileSync(join(OCR, `${name}.json`), "utf8")).boxes;
}

export default function parse(boxes) {
  return parseReceipt(boxes);
}
