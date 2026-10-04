import { expect, test } from "vitest";

import { parseCreateSplitRequest } from "./core/parse";
import { participantId, type Receipt } from "./core/split";
import { mintedId } from "./core/test-ids";
import { emptyDraft, readiness, reduceDraft, splitRequest } from "./draft";
import { parseReceipt } from "./parse";
import { box } from "./parse/fixtures/boxes";
import { receiptOfReply } from "./scan/client";
import { readLines, toReply } from "../worker/scan/format";

let seed = 12345;
const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

const WORDS = ["Perrier", "Fries", "BURGER", "Sprite", "x", "2x", "3 @", "Qty 2", "TAX", "Sales Tax", "TIP", "Gratuity", "SUBTOTAL", "Sub Total", "TOTAL", "Amount Due", "Discount", "Promo", "Bundle", "Combo", "Service fee", "Deposit", "VISA", "CHANGE", "", " ", "​", "​​", "🍔", "🍔🍟", "👨‍👩‍👧‍👦", "⠀", "Ｓam", "‮evil", "a".repeat(90), "é".repeat(85), "#", "-", "*", "|", "日本語の長い名前".repeat(12)];
const AMOUNTS = ["1.00", "3.50", "12.99", "0.00", "-2.00", "2.00-", "(1.50)", "1,000,003.50", "1,000,028.04", "99,999.99", "100,000.01", "999999.99", "12345678.90", "$5", "7.7", "0.01", "-", "1O.00"];

function deviceRead(): Receipt | null {
  const rows = between(1, random() < 0.15 ? 260 : 40);
  const boxes = Array.from({ length: rows }, (_, row) => {
    const name = Array.from({ length: between(0, 3) }, () => pick(WORDS)).join(" ");
    return [...(name ? [box(name, 20, row)] : []), ...(random() < 0.85 ? [box(pick(AMOUNTS), 400, row)] : [])];
  }).flat();
  return parseReceipt(boxes);
}

const TAGS = ["i", "i", "i", "i", "d", "t", "p", "s", "f", "sub", "tot", "b", ">i", ">d", "+", "-", "x"];
const CENTS = ["350", "100000003", "10000001", "9999999", "-500", "0", "1", "abc", "2804", "-", "10000000"];

function serverRead(): Receipt | null {
  const lines = Array.from({ length: between(1, random() < 0.15 ? 260 : 30) }, () => {
    const tag = pick(TAGS);
    if (tag === "sub") return `sub|${pick(CENTS)}${random() < 0.3 ? "|pre" : ""}`;
    if (tag === "tot") return `tot|${pick(CENTS)}`;
    if (tag === "b") return `b|${pick(WORDS)}`;
    return `${tag}|${pick(WORDS)}|${pick(CENTS)}${random() < 0.2 ? `|${between(0, 30)}` : ""}`;
  });
  if (random() < 0.8) lines.push(`tot|${pick(["2804", "100000002804", "-100", "0", "10000000"])}`);
  const reading = readLines(lines);
  return reading && receiptOfReply(JSON.parse(JSON.stringify(toReply(reading, { passed: true, gaps: { subtotal: null, total: 0 as never } }))));
}

test("every read either reader makes that Create split link would send, the core accepts", () => {
  const ready = { device: 0, server: 0 };
  const refused: unknown[] = [];
  for (const [reader, read] of [["device", deviceRead], ["server", serverRead]] as const) {
    while (ready[reader] < 3000) {
      const receipt = read();
      if (!receipt) continue;
      const draft = reduceDraft({ ...emptyDraft, handles: [{ service: "venmo", handle: "test-debug" }], names: ["Me"] }, { type: "read", file: { name: "r", thumbnail: null }, receipt });
      const found = readiness(draft);
      if (found.kind !== "ready") continue;
      ready[reader] += 1;
      let next = 0;
      const request = splitRequest(found, () => participantId(`p${next++}`));
      const created = parseCreateSplitRequest(JSON.parse(JSON.stringify({ split: request })), mintedId("property-split-00000"));
      if (!created.ok && refused.length < 3) refused.push({ reader, rejection: created.rejection, read: receipt, sent: request.receipt });
    }
  }
  expect(ready).toEqual({ device: 3000, server: 3000 });
  expect(refused).toEqual([]);
}, 120_000);
