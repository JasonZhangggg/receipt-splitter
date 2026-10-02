import { cents, price } from "./money";
import { adjustmentId, itemId, participantId, type Adjustment, type NonEmpty, type ParticipantId, type Split, type SplitItem } from "./split";
import { mintedId } from "./test-ids";

export const jason = participantId("jason");
export const priya = participantId("priya");

const rows = [
  ["gameplay", "Gameplay", 8775, 1],
  ["ultra1", "Michelob Ultra 16oz Aluminum Bottle", 629, 1],
  ["guinness1", "Guinness Draught 14.9oz Can", 2187, 3],
  ["pineapple1", "High Noon Pineapple 12oz Can", 849, 1],
  ["watermelon1", "High Noon Watermelon 12oz Can", 849, 1],
  ["ultra2", "Michelob Ultra 16oz Aluminum Bottle", 629, 1],
  ["guinness2", "Guinness Draught 14.9oz Can", 1458, 2],
  ["pineapple2", "High Noon Pineapple 12oz Can", 849, 1],
  ["watermelon2", "High Noon Watermelon 12oz Can", 1698, 2],
] as const;

export type TopgolfItem = (typeof rows)[number][0];

export const bucketOne = ["ultra1", "guinness1", "pineapple1", "watermelon1"] as const satisfies readonly TopgolfItem[];
export const bucketTwo = ["ultra2", "guinness2", "pineapple2", "watermelon2"] as const satisfies readonly TopgolfItem[];

function bucket(id: string, amount: number, items: NonEmpty<TopgolfItem>): Adjustment {
  const [first, ...rest] = items;
  return {
    id: adjustmentId(id),
    kind: "bundleDiscount",
    name: "Beer Bucket Discount (10%)",
    amount: cents(amount),
    bundle: { name: "Beer Bucket", items: [itemId(first), ...rest.map(itemId)] },
  };
}

export function topgolf(claims: Partial<Record<TopgolfItem, readonly ParticipantId[]>> = {}): Split {
  const items = rows.map(([id, name, amount, quantity]): SplitItem => {
    const claimers = [...(claims[id] ?? [])].sort();
    const units = Array.from({ length: quantity }, () => claimers);
    return { id: itemId(id), name, price: price(amount), split: { by: "even", units: [units[0], ...units.slice(1)] } };
  });
  return {
    schemaVersion: 2,
    id: mintedId("topgolf-split-0000000"),
    currency: "USD",
    receipt: {
      items: [items[0], ...items.slice(1)],
      adjustments: [
        bucket("bucket1", -451, bucketOne),
        bucket("bucket2", -463, bucketTwo),
        { id: adjustmentId("tax"), kind: "tax", name: "Tax", amount: cents(494) },
        { id: adjustmentId("tip"), kind: "tip", name: "Tip", amount: cents(3226) },
      ],
      subtotal: cents(17923),
      total: cents(20729),
    },
    participants: [
      { id: jason, name: "Jason" },
      { id: priya, name: "Priya" },
    ],
    picks: [],
    payments: [],
    paymentHandles: [{ service: "venmo", handle: "jason-host" }],
    revision: 0,
    recentChanges: [],
  };
}

export const eachOf = (items: readonly TopgolfItem[], who: ParticipantId) => Object.fromEntries(items.map((item) => [item, [who]]));
