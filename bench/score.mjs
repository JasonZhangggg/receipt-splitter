import "./register-ts.mjs";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runTotalCheck } from "../src/core/total-check.ts";
import { readLabels } from "./read-labels.mjs";

const { values: flags } = parseArgs({
  options: {
    parser: { type: "string" },
    labels: { type: "string", default: join(import.meta.dirname, "labels") },
    json: { type: "boolean" },
  },
});
if (!flags.parser) {
  console.error(
    [
      "usage: npm run bench -- --parser=<labels | a name in bench/parsers | path to a parser module> [--labels=<dir>] [--json]",
      "A parser module's default export takes { name, imagePath } and returns a Receipt, a Promise of one, or null.",
    ].join("\n"),
  );
  process.exit(2);
}

const labels = readLabels(flags.labels);
const named = join(import.meta.dirname, "parsers", `${flags.parser}.mjs`);
const parse =
  flags.parser === "labels"
    ? ({ name }) => labels.find((label) => label.name === name).receipt
    : (await import(pathToFileURL(existsSync(named) ? named : resolve(flags.parser)).href)).default;

const exact = { receipts: 0, items: [0, 0], adjustments: [0, 0], totalCheck: [0, 0] };
const structure = { receipts: 0, items: [0, 0], adjustments: [0, 0] };
const misses = [];

for (const label of labels) {
  const imagePath = join(flags.labels, "..", "data", label.image);
  const output = await Promise.resolve()
    .then(() => parse({ name: label.name, imagePath }))
    .catch((error) => {
      console.error(`${label.name}: the parser threw ${error}`);
      return null;
    });
  const predicted = isReceiptShaped(output) ? output : null;
  if (output !== null && predicted === null) console.error(`${label.name}: the parser returned something that is not a Receipt`);
  const byStructure = label.source === "cord";
  const tally = byStructure ? structure : exact;
  const items = byStructure
    ? Math.min(predicted?.items.length ?? 0, label.receipt.items.length)
    : matched(label.receipt.items.map(({ price }) => price), predicted?.items.map(({ price }) => price));
  const adjustmentKey = ({ kind, amount }) => (byStructure ? kind : `${kind} ${amount}`);
  const adjustments = matched(label.receipt.adjustments.map(adjustmentKey), predicted?.adjustments.map(adjustmentKey));
  let perfect =
    predicted?.items.length === label.receipt.items.length &&
    predicted?.adjustments.length === label.receipt.adjustments.length &&
    items === label.receipt.items.length &&
    adjustments === label.receipt.adjustments.length;
  tally.receipts += 1;
  tally.items[0] += items;
  tally.items[1] += label.receipt.items.length;
  tally.adjustments[0] += adjustments;
  tally.adjustments[1] += label.receipt.adjustments.length;
  if (!byStructure) {
    const passed = predicted?.total === label.receipt.total && runTotalCheck(predicted).ok;
    tally.totalCheck[0] += passed ? 1 : 0;
    tally.totalCheck[1] += 1;
    perfect &&= passed;
  }
  if (!perfect) misses.push(label.name);
}

if (flags.json) {
  console.log(JSON.stringify({ exact, structure, misses }));
} else {
  const rate = ([hit, all]) => `${hit}/${all} ${all === 0 ? "n/a" : `${((100 * hit) / all).toFixed(1)}%`}`;
  console.log(`exact, ${exact.receipts} receipts: Item prices ${rate(exact.items)}, Adjustments ${rate(exact.adjustments)}, Total check ${rate(exact.totalCheck)}`);
  console.log(`structure, ${structure.receipts} receipts: Items ${rate(structure.items)}, Adjustments ${rate(structure.adjustments)}`);
  console.log(misses.length === 0 ? "misses: none" : `misses: ${misses.join(" ")}`);
}

function matched(expected, actual = []) {
  const left = [...actual];
  return expected.filter((value) => {
    const at = left.indexOf(value);
    if (at !== -1) left.splice(at, 1);
    return at !== -1;
  }).length;
}

function isReceiptShaped(value) {
  return (
    Array.isArray(value?.items) &&
    value.items.every((item) => Number.isSafeInteger(item?.price)) &&
    Array.isArray(value.adjustments) &&
    value.adjustments.every((adjustment) => typeof adjustment?.kind === "string" && Number.isSafeInteger(adjustment.amount)) &&
    Number.isSafeInteger(value.subtotal) &&
    Number.isSafeInteger(value.total)
  );
}
