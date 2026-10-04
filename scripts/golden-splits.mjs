import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const releases = process.argv.length > 2
  ? process.argv.slice(2).map((pair) => pair.split("="))
  : [["rs-8", "6093b46"], ["rs-9", "538ccc0"], ["rs-10", "5ba0cd1"], ["rs-11", "6baf220"], ["v2-1", "df790d5", "topgolf"], ["v2-2", "1ed0165", "topgolfBundles"], ["v2-7b", "29547a1", "topgolfDetails"]];

const dinner = `
import { applyOperation, createSplit } from "./src/core/operations";
const host = { id: "ann", name: "Ann" };
const created = createSplit({
  id: "golden-split-id-0000000",
  host,
  participants: [host],
  paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  receipt: {
    items: [{ id: "fries", name: "Fries", price: 800 }, { id: "pitcher", name: "Pitcher", price: 3000 }],
    adjustments: [{ id: "tip", kind: "tip", name: "Tip", amount: 500 }],
    subtotal: 3800,
    total: 4300,
  },
});
if (!created.ok) throw new Error(JSON.stringify(created.rejection));
let split = created.split;
const ops = [
  { by: null, type: "addParticipant", participant: { id: "bob", name: "Bob" } },
  { by: null, type: "addParticipant", participant: { id: "cat", name: "Cat" } },
  { by: "bob", type: "setJoined", participantId: "bob", joined: true },
  { by: "bob", type: "pick", participantId: "bob", device: "bobs-phone", takeOver: false },
  { by: "bob", type: "claim", itemId: "fries", participantId: "bob" },
  { by: "bob", type: "claim", itemId: "pitcher", participantId: "ann" },
  { by: "bob", type: "claim", itemId: "pitcher", participantId: "bob" },
  { by: "ann", type: "editReceipt", items: [{ type: "edit", itemId: "fries", price: 900 }], subtotalDelta: 100, totalDelta: 100 },
  { by: "ann", type: "editReceipt", items: [{ type: "edit", itemId: "pitcher", quantity: 2 }] },
  { by: "bob", type: "recordPayment", participantId: "bob", device: "bobs-phone", amount: 1000 },
];
for (const op of ops) {
  try {
    const result = applyOperation(split, op, { creator: true }, 1767225600000);
    if (result?.ok) split = result.split;
  } catch {}
}
const last = split.recentChanges.at(-1);
if (last) {
  const result = applyOperation(split, { by: "cat", type: "undo", revision: last.revision }, { creator: false }, 1767225600000);
  if (result?.ok) split = result.split;
}
process.stdout.write(JSON.stringify(split, null, 2) + "\\n");
`;

const bucketOne = ["ultra1", "guinness1", "pineapple1", "watermelon1"];
const bucketTwo = ["ultra2", "guinness2", "pineapple2", "watermelon2"];

const details = { gameplay: "2 bays, 1 hour", guinness1: "$2.00 off" };

const topgolf = (bucketKind, detailed = false) => `
import { applyOperation, createSplit } from "./src/core/operations";
const items = [
  ["gameplay", "Gameplay", 8775, 1],
  ["ultra1", "Michelob Ultra 16oz Aluminum Bottle", 629, 1],
  ["guinness1", "Guinness Draught 14.9oz Can", 2187, 3],
  ["pineapple1", "High Noon Pineapple 12oz Can", 849, 1],
  ["watermelon1", "High Noon Watermelon 12oz Can", 849, 1],
  ["ultra2", "Michelob Ultra 16oz Aluminum Bottle", 629, 1],
  ["guinness2", "Guinness Draught 14.9oz Can", 1458, 2],
  ["pineapple2", "High Noon Pineapple 12oz Can", 849, 1],
  ["watermelon2", "High Noon Watermelon 12oz Can", 1698, 2],
];
const discount = () => ({ kind: "discount" });
const bundle = (items) => ({ kind: "bundleDiscount", bundle: { name: "Beer Bucket", items } });
const created = createSplit({
  id: "golden-topgolf-split-0",
  participants: [{ id: "jason", name: "Jason" }, { id: "priya", name: "Priya" }],
  paymentHandles: [{ service: "venmo", handle: "jason-host" }],
  receipt: {
    items: items.map(([id, name, price, quantity]) => ({ id, name, price, ...(quantity > 1 && { quantity }), ...(${detailed} && ${JSON.stringify(details)}[id] && { detail: ${JSON.stringify(details)}[id] }) })),
    adjustments: [
      { id: "bucket1", name: "Beer Bucket Discount (10%)", amount: -451, ...${bucketKind}(${JSON.stringify(bucketOne)}) },
      { id: "bucket2", name: "Beer Bucket Discount (10%)", amount: -463, ...${bucketKind}(${JSON.stringify(bucketTwo)}) },
      { id: "tax", kind: "tax", name: "Tax", amount: 494 },
      { id: "tip", kind: "tip", name: "Tip", amount: 3226 },
    ],
    subtotal: 17923,
    total: 20729,
  },
});
if (!created.ok) throw new Error(JSON.stringify(created.rejection));
const owner = (id) => (${JSON.stringify(bucketOne)}.includes(id) ? "priya" : "jason");
let split = created.split;
const ops = [
  { by: "priya", type: "pick", participantId: "priya", device: "priyas-phone", takeOver: false },
  ...items.flatMap(([id, , , quantity]) => Array.from({ length: quantity }, (_, unit) => ({ by: owner(id), type: "claim", itemId: id, participantId: owner(id), unit }))),
  { by: "jason", type: "editReceipt", adjustments: [{ type: "edit", adjustmentId: "tip", name: "Tip (18%)" }] },
  ...(${detailed} ? [{ by: "priya", type: "editReceipt", items: [{ type: "edit", itemId: "ultra1", detail: "Ice cold" }] }] : []),
];
for (const op of ops) {
  const result = applyOperation(split, op, { creator: true }, 1767225600000);
  if (!result.ok) throw new Error(JSON.stringify(result.rejection));
  split = result.split;
}
process.stdout.write(JSON.stringify(split) + "\\n");
`;

function asV2_2Writes(json) {
  const bundles = { bucket1: bucketOne, bucket2: bucketTwo };
  const bundled = (receipt) => ({
    ...receipt,
    adjustments: receipt.adjustments.map((row) => (bundles[row.id] ? { ...row, kind: "bundleDiscount", bundle: { name: "Beer Bucket", items: bundles[row.id] } } : row)),
  });
  const split = JSON.parse(json);
  return JSON.stringify({ ...split, schemaVersion: 2, receipt: bundled(split.receipt), original: bundled(split.original) }, null, 2) + "\n";
}

const pretty = (json) => JSON.stringify(JSON.parse(json), null, 2) + "\n";
const drivers = {
  dinner: { source: dinner, finish: (json) => json },
  topgolf: { source: topgolf("discount"), finish: asV2_2Writes },
  topgolfBundles: { source: topgolf("bundle"), finish: pretty },
  topgolfDetails: { source: topgolf("bundle", true), finish: pretty },
};

const root = resolve(import.meta.dirname, "..");
const out = join(root, "src/core/golden");
mkdirSync(out, { recursive: true });
for (const [label, rev, driver = "dinner"] of releases) {
  const work = mkdtempSync(join(tmpdir(), `golden-${label}-`));
  execFileSync("sh", ["-c", `git -C "${root}" archive ${rev} src/core | tar -x -C "${work}"`]);
  writeFileSync(join(work, "driver.ts"), drivers[driver].source);
  await build({ entryPoints: [join(work, "driver.ts")], bundle: true, platform: "node", format: "esm", outfile: join(work, "driver.mjs"), logLevel: "error" });
  writeFileSync(join(out, `${label}.json`), drivers[driver].finish(execFileSync("node", [join(work, "driver.mjs")], { encoding: "utf8" })));
  rmSync(work, { recursive: true, force: true });
  console.log(`${label} (${rev}) -> src/core/golden/${label}.json`);
}
