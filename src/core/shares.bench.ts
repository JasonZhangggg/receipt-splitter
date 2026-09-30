import { expect, test } from "vitest";
import { cents, price } from "./money";
import { computeShares } from "./shares";
import { adjustmentId, itemId, participantId, type Participant, type Split, type SplitItem } from "./split";

const participants = Array.from({ length: 12 }, (_, index): Participant => ({
  id: participantId(`p${String(index).padStart(2, "0")}`),
  name: `Participant ${index}`,
}));

const items = Array.from({ length: 60 }, (_, index): SplitItem => ({
  id: itemId(`i${index}`),
  name: `Item ${index}`,
  price: price(199 + ((index * 7919) % 4800)),
  claimedBy: participants
    .filter((_, position) => (index + position) % (1 + (index % 4)) === 0)
    .map((participant) => participant.id),
}));

const subtotal = items.reduce((sum, item) => sum + item.price, 0);
const tax = Math.round(subtotal * 0.08875);
const tip = Math.round(subtotal * 0.2);
const [host, ...others] = participants;
const [firstItem, ...otherItems] = items;

const bigDinner: Pick<Split, "receipt" | "participants" | "payments"> = {
  receipt: {
    items: [firstItem, ...otherItems],
    adjustments: [
      { id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(tax) },
      { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(tip) },
    ],
    subtotal: cents(subtotal),
    total: cents(subtotal + tax + tip),
  },
  participants: [host, ...others],
  payments: [],
};

test("computeShares on 60 Items and 12 Participants has a median under 1 ms", async ({ bench }) => {
  const result = await bench("computeShares", () => {
    computeShares(bigDinner);
  }).run();

  console.log(JSON.stringify({ bench: "computeShares", medianMs: result.latency.p50, samples: result.latency.samplesCount }));
  expect(result.latency.p50).toBeLessThan(1);
});
