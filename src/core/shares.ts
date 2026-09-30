import { cents, type Cents } from "./money";
import type { Item, ItemId, ParticipantId, Split } from "./split";

export type HostShare = {
  readonly participantId: ParticipantId;
  readonly share: Cents;
};

export type Share = HostShare & {
  readonly paid: Cents;
  /** Share minus paid. Negative when the Participant paid more than their Share. */
  readonly owed: Cents;
};

export type Shares = {
  readonly shares: readonly [host: HostShare, ...others: Share[]];
  readonly unclaimed: {
    readonly itemIds: readonly ItemId[];
    readonly subtotal: Cents;
    readonly total: Cents;
  };
};

export function computeShares(split: Pick<Split, "receipt" | "participants" | "payments">): Shares {
  const { items, total } = split.receipt;
  const loads = loadItems(total, items);
  const pools = new Map<string, { readonly claimers: readonly ParticipantId[]; load: number }>();
  const unclaimedIds: ItemId[] = [];
  let unclaimedSubtotal = 0;
  let unclaimedTotal = 0;

  items.forEach((item, index) => {
    if (item.claimedBy.length === 0) {
      unclaimedIds.push(item.id);
      unclaimedSubtotal += item.price;
      unclaimedTotal += loads[index];
      return;
    }
    const key = item.claimedBy.join(",");
    const pool = pools.get(key);
    if (pool) pool.load += loads[index];
    else pools.set(key, { claimers: item.claimedBy, load: loads[index] });
  });

  const shareOf = new Map<ParticipantId, number>(split.participants.map(({ id }) => [id, 0]));
  for (const [key, { claimers, load }] of pools) {
    const count = claimers.length;
    const base = Math.floor(load / count);
    const leftover = load - base * count;
    const start = fnv1a(key) % count;
    claimers.forEach((claimer, position) => {
      const extra = (position - start + count) % count < leftover ? 1 : 0;
      shareOf.set(claimer, (shareOf.get(claimer) ?? 0) + base + extra);
    });
  }

  const paidBy = new Map(split.payments.map((payment) => [payment.participantId, payment.amount]));
  const shareFor = (id: ParticipantId) => cents(shareOf.get(id) ?? 0);
  const [host, ...others] = split.participants;
  return {
    shares: [
      { participantId: host.id, share: shareFor(host.id) },
      ...others.map(({ id }) => {
        const share = shareFor(id);
        const paid = paidBy.get(id) ?? cents(0);
        return { participantId: id, share, paid, owed: cents(share - paid) };
      }),
    ],
    unclaimed: { itemIds: unclaimedIds, subtotal: cents(unclaimedSubtotal), total: cents(unclaimedTotal) },
  };
}

function loadItems(total: Cents, items: readonly Item[]): number[] {
  const weights = items.some((item) => item.price > 0) ? items.map((item) => item.price) : items.map(() => 1);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const parts = weights.map((weight, index) => {
    const product = total * weight;
    const remainder = product % weightSum;
    return { index, id: items[index].id, load: (product - remainder) / weightSum, remainder };
  });
  const loads = parts.map(({ load }) => load);
  const leftover = total - loads.reduce((sum, load) => sum + load, 0);
  const byRemainder = parts
    .filter(({ remainder }) => remainder > 0)
    .sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : 1));
  for (const { index } of byRemainder.slice(0, leftover)) loads[index] += 1;
  return loads;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}
