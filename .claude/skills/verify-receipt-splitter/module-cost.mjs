#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const needle = process.argv[2];
if (!needle) {
  console.error('usage: module-cost.mjs "<text inside one Metro module of the entry bundle>"');
  process.exit(1);
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const dir = join(root, "dist/_expo/static/js/web");
const entry = readdirSync(dir).find((file) => /^entry-.*\.js$/.test(file));
if (!entry) {
  console.error(`no entry-*.js in ${dir}; run npm run build first`);
  process.exit(1);
}
const bundle = readFileSync(join(dir, entry), "utf8");
const at = bundle.indexOf(needle);
if (at === -1) {
  console.error(`${JSON.stringify(needle)} is not in ${entry}`);
  process.exit(1);
}

const start = bundle.lastIndexOf("__d(function", at);
const end = bundle.indexOf("__d(function", at);
const module = bundle.slice(start, end === -1 ? undefined : end);
const brotli = (text) => brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY } }).length;
const without = bundle.slice(0, start) + (end === -1 ? "" : bundle.slice(end));

console.log(
  JSON.stringify({
    entry,
    moduleRawBytes: Buffer.byteLength(module),
    moduleBrotliAlone: brotli(module),
    entryBrotli: brotli(bundle),
    entryBrotliWithoutModule: brotli(without),
    brotliDelta: brotli(bundle) - brotli(without),
    moduleHead: module.slice(0, 160),
  }),
);
