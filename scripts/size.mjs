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

console.log(JSON.stringify({ file, entryBytes: raw.length, entryBrotliBytes: brotli.length }));
