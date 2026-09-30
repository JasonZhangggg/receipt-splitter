import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTotalCheck } from "../src/core/total-check.ts";
import { readLabels } from "./read-labels.mjs";

const BENCH = import.meta.dirname;
const OUT = join(BENCH, "out");

const receipts = readLabels(join(BENCH, "labels")).map((label) => ({ ...label, totalCheck: runTotalCheck(label.receipt).ok }));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "report.html"), page(receipts));
console.log(JSON.stringify({ ok: true, receipts: receipts.length, report: join(OUT, "report.html") }));

function page(data) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt labels</title>
<style>
  :root { color-scheme: light; font: 15px/1.4 ui-sans-serif, system-ui, sans-serif; color: #1d1d1f; background: #f5f5f4; }
  body { margin: 0; }
  header { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #ddd; }
  header h1 { font-size: 15px; margin: 0; font-variant-numeric: tabular-nums; }
  header .spacer { flex: 1; }
  button, select { font: inherit; padding: 4px 10px; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 440px); gap: 16px; padding: 16px; align-items: start; }
  figure { margin: 0; }
  figure img { display: block; max-width: 100%; max-height: calc(100vh - 90px); margin: 0 auto; box-shadow: 0 1px 3px rgb(0 0 0 / 0.2); }
  section { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0 0 12px; }
  dt { color: #666; }
  dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  td { padding: 3px 0; vertical-align: top; }
  td.amount { text-align: right; white-space: nowrap; padding-left: 12px; }
  td.kind { color: #666; padding-right: 8px; }
  tr.sum td { border-top: 1px solid #ccc; font-weight: 600; }
  tr.total td { border-top: 2px solid #1d1d1f; font-weight: 700; font-size: 17px; }
  .pass { color: #1a7f37; }
  .fail { color: #cf222e; }
  .note { background: #fff8c5; border: 1px solid #d4a72c; border-radius: 4px; padding: 8px; margin-top: 12px; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <button id="previous" aria-label="Previous receipt">&larr;</button>
  <h1 id="position"></h1>
  <button id="next" aria-label="Next receipt">&rarr;</button>
  <span class="spacer"></span>
  <select id="jump" aria-label="Jump to receipt"></select>
</header>
<main>
  <figure><a id="full" target="_blank"><img id="image" alt=""></a></figure>
  <section id="label" aria-label="Label"></section>
</main>
<script>
const receipts = ${json};
const indexOfReceipt = (name) => Math.max(0, receipts.findIndex((receipt) => receipt.name === name));
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const money = (amount, region) => {
  const sign = amount < 0 ? "-" : "";
  const value = Math.abs(amount);
  return region === "US" ? sign + "$" + (value / 100).toFixed(2) : sign + "Rp " + value.toLocaleString("id-ID");
};
const jump = document.getElementById("jump");
jump.innerHTML = receipts.map((receipt) => '<option value="' + receipt.name + '">' + receipt.name + "</option>").join("");

function show(index) {
  const receipt = receipts[(index + receipts.length) % receipts.length];
  const { items, adjustments, subtotal, total } = receipt.receipt;
  const row = (name, amount, className = "", kind = "") =>
    '<tr class="' + className + '"><td class="kind">' + escape(kind) + "</td><td>" + escape(name) + '</td><td class="amount">' + money(amount, receipt.region) + "</td></tr>";
  document.getElementById("position").textContent = indexOfReceipt(receipt.name) + 1 + " / " + receipts.length + "  " + receipt.name;
  document.getElementById("image").src = "../data/" + receipt.image;
  document.getElementById("image").alt = "Receipt photo " + receipt.image;
  document.getElementById("full").href = "../data/" + receipt.image;
  jump.value = receipt.name;
  document.getElementById("label").innerHTML =
    "<dl>" +
    "<dt>Source</dt><dd>" + escape(receipt.source + " " + receipt.sourceId) + "</dd>" +
    "<dt>Region</dt><dd>" + escape(receipt.region) + "</dd>" +
    "<dt>Tags</dt><dd>" + escape(receipt.tags.join(", ") || "none") + "</dd>" +
    "<dt>Checked</dt><dd>" + (receipt.checked ? "yes" : "no") + "</dd>" +
    '<dt>Total check</dt><dd class="' + (receipt.totalCheck ? "pass" : "fail") + '">' + (receipt.totalCheck ? "passes" : "fails") + "</dd>" +
    "</dl><table>" +
    items.map((item) => row(item.name, item.price)).join("") +
    row("Subtotal", subtotal, "sum") +
    adjustments.map((adjustment) => row(adjustment.name, adjustment.amount, "", adjustment.kind)).join("") +
    row("Total", total, "total") +
    "</table>" +
    (receipt.note ? '<p class="note">' + escape(receipt.note) + "</p>" : "");
  if (location.hash.slice(1) !== receipt.name) history.replaceState(null, "", "#" + receipt.name);
}

const current = () => indexOfReceipt(location.hash.slice(1));
document.getElementById("previous").onclick = () => show(current() - 1);
document.getElementById("next").onclick = () => show(current() + 1);
jump.onchange = () => show(indexOfReceipt(jump.value));
document.addEventListener("keydown", (event) => {
  if (event.target === jump) return;
  if (event.key === "ArrowRight" || event.key === "j") show(current() + 1);
  if (event.key === "ArrowLeft" || event.key === "k") show(current() - 1);
});
window.onhashchange = () => show(current());
show(current());
</script>
</body>
</html>
`;
}
