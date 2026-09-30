import { expect, test } from "vitest";
import { cents, price } from "./money";
import { applyOperation, type Auth, type Operation } from "./operations";
import { parseSplit } from "./parse";
import { computeShares } from "./shares";
import { adjustmentId, itemId, participantId, type Participant, type Split, type SplitItem } from "./split";

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const next = random(6012);
const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));

const participants = Array.from({ length: 12 }, (_, index): Participant => ({
  id: participantId(`p${int(0, 46_655).toString(36)}_${index}`),
  name: `Participant ${index}`,
}));

const UNCLAIMED_ITEMS = 4;
const claimerCounts = Array.from({ length: 60 }, (_, index) => (index < 12 ? index + 1 : index < 12 + UNCLAIMED_ITEMS ? 0 : int(1, 12)));

const items = claimerCounts.map((count, index): SplitItem => {
  const shuffled = participants.map(({ id }) => ({ id, order: next() })).sort((a, b) => a.order - b.order);
  return {
    id: itemId(`i${index}`),
    name: `Item ${index}`,
    price: price(int(99, 4999)),
    claimedBy: shuffled
      .slice(0, count)
      .map(({ id }) => id)
      .sort(),
  };
});

const subtotal = items.reduce((sum, item) => sum + item.price, 0);
const tax = Math.round(subtotal * 0.08875);
const tip = Math.round(subtotal * 0.2);
const discount = -1500;
const [host, ...others] = participants;
const [firstItem, ...otherItems] = items;

const bigDinner: Pick<Split, "receipt" | "participants" | "payments"> = {
  receipt: {
    items: [firstItem, ...otherItems],
    adjustments: [
      { id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(tax) },
      { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(tip) },
      { id: adjustmentId("promo"), kind: "discount", name: "Promo", amount: cents(discount) },
    ],
    subtotal: cents(subtotal),
    total: cents(subtotal + tax + tip + discount),
  },
  participants: [host, ...others],
  payments: [],
};

test("computeShares on 60 Items and 12 Participants, with every claimer count from 1 to 12, has a median under 1 ms", async ({ bench }) => {
  const { shares, unclaimed } = computeShares(bigDinner);
  expect(unclaimed.itemIds).toHaveLength(UNCLAIMED_ITEMS);
  expect(shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total).toBe(210_732);

  const result = await bench("computeShares", () => {
    computeShares(bigDinner);
  }).run();

  console.log(JSON.stringify({ bench: "computeShares", medianMs: result.latency.p50, samples: result.latency.samplesCount }));
  expect(result.latency.p50).toBeLessThan(1);
});

test("applyOperation claims an Unclaimed Item on the same 60-Item, 12-Participant Split with a median under 0.1 ms", async ({ bench }) => {
  const stored = parseSplit({
    ...bigDinner,
    schemaVersion: 1,
    id: "bench",
    currency: "USD",
    paymentHandles: [{ service: "venmo", handle: "the-host" }],
    revision: 0,
    recentChanges: [],
  });
  if (!stored.ok) throw new Error(JSON.stringify(stored.rejection));
  const anyone: Auth = { creator: false };
  const claim: Operation = { by: host.id, type: "claim", itemId: itemId("i12"), participantId: host.id };
  const claimed = applyOperation(stored.split, claim, anyone);
  if (!claimed.ok) throw new Error(JSON.stringify(claimed.rejection));
  expect([claimed.split.revision, computeShares(claimed.split).unclaimed.itemIds]).toEqual([1, ["i13", "i14", "i15"]]);

  const result = await bench("applyOperation claim", () => {
    applyOperation(stored.split, claim, anyone);
  }).run();

  console.log(JSON.stringify({ bench: "applyOperation claim", medianMs: result.latency.p50, samples: result.latency.samplesCount }));
  expect(result.latency.p50).toBeLessThan(0.1);
});
