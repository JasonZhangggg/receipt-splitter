import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const dir = "dist/_expo/static/js/web";
const entries = readdirSync(dir).filter((f) => /^entry-.*\.js$/.test(f));
if (entries.length !== 1) {
  console.error(`expected one entry bundle in ${dir}, found ${entries.length}; run npm run build first`);
  process.exit(1);
}

const file = join(dir, entries[0]);
const raw = readFileSync(file);
const brotli = brotliCompressSync(raw, {
  params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
});

const { baselineBrotliBytes, growthBrotliBytes } = JSON.parse(readFileSync("scripts/size-budget.json", "utf8"));
const limit = baselineBrotliBytes + growthBrotliBytes;

console.log(JSON.stringify({ file, entryBytes: raw.length, entryBrotliBytes: brotli.length, limitBrotliBytes: limit }));

if (brotli.length > limit) {
  console.error(`entry is ${brotli.length - limit} bytes over its ${limit} byte brotli limit; trim it, or raise baselineBrotliBytes in scripts/size-budget.json in a PR that says why`);
  process.exit(1);
}
