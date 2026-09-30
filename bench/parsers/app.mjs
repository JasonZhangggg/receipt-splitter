import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReceipt } from "../../src/parse/index.ts";

const OCR = join(import.meta.dirname, "..", "ocr");

export default function parse({ name }) {
  const { boxes } = JSON.parse(readFileSync(join(OCR, `${name}.json`), "utf8"));
  return parseReceipt(boxes);
}
