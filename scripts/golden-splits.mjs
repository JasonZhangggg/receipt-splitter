// Writes src/core/golden/<label>.json: the row each shipped release stored for one dinner, built by that release's own src/core.
// Usage: node scripts/golden-splits.mjs [label=rev ...]
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const releases = process.argv.length > 2
  ? process.argv.slice(2).map((pair) => pair.split("="))
  : [["rs-8", "6093b46"], ["rs-9", "538ccc0"], ["rs-10", "5ba0cd1"], ["rs-11", "6baf220"]];

const driver = `
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

const root = resolve(import.meta.dirname, "..");
const out = join(root, "src/core/golden");
mkdirSync(out, { recursive: true });
for (const [label, rev] of releases) {
  const work = mkdtempSync(join(tmpdir(), `golden-${label}-`));
  execFileSync("sh", ["-c", `git -C "${root}" archive ${rev} src/core | tar -x -C "${work}"`]);
  writeFileSync(join(work, "driver.ts"), driver);
  await build({ entryPoints: [join(work, "driver.ts")], bundle: true, platform: "node", format: "esm", outfile: join(work, "driver.mjs"), logLevel: "error" });
  writeFileSync(join(out, `${label}.json`), execFileSync("node", [join(work, "driver.mjs")]));
  rmSync(work, { recursive: true, force: true });
  console.log(`${label} (${rev}) -> src/core/golden/${label}.json`);
}
