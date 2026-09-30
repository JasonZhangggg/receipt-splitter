import { cents, type Cents } from "./money";
import type { ItemId, ParticipantId, Split } from "./split";

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
  const weights = items.some((item) => item.price > 0) ? items.map((item) => item.price) : items.map(() => 1);
  const scale = BigInt(items.reduce((multiple, { claimedBy }) => leastCommonMultiple(multiple, Math.max(claimedBy.length, 1)), 1));
  const weightOf = new Map<ParticipantId | null, bigint>([[null, 0n], ...split.participants.map(({ id }): [ParticipantId, bigint] => [id, 0n])]);
  const unclaimedIds: ItemId[] = [];
  let unclaimedSubtotal = 0;

  items.forEach(({ id, price, claimedBy }, index) => {
    const weight = BigInt(weights[index]) * scale;
    if (claimedBy.length === 0) {
      unclaimedIds.push(id);
      unclaimedSubtotal += price;
    }
    const claimers = claimedBy.length === 0 ? [null] : claimedBy;
    for (const claimer of claimers) weightOf.set(claimer, (weightOf.get(claimer) ?? 0n) + weight / BigInt(claimers.length));
  });

  const denominator = BigInt(weights.reduce((sum, weight) => sum + weight, 0)) * scale;
  const exact = [...weightOf].map(([id, weight]) => {
    const numerator = BigInt(total) * weight;
    return { id, floor: Number(numerator / denominator), remainder: numerator % denominator, rank: id === null ? UNCLAIMED_RANK : hashId(id) };
  });
  const leftover = total - exact.reduce((sum, { floor }) => sum + floor, 0);
  const roundedUp = new Set([...exact].sort(largestRemainderFirst).slice(0, leftover));
  const rounded = new Map(exact.map((part) => [part.id, part.floor + (roundedUp.has(part) ? 1 : 0)]));

  const paidBy = new Map(split.payments.map((payment) => [payment.participantId, payment.amount]));
  const shareFor = (id: ParticipantId) => cents(rounded.get(id) ?? 0);
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
    unclaimed: { itemIds: unclaimedIds, subtotal: cents(unclaimedSubtotal), total: cents(rounded.get(null) ?? 0) },
  };
}

const UNCLAIMED_RANK = 2 ** 32;

type ExactPart = { readonly id: ParticipantId | null; readonly remainder: bigint; readonly rank: number };

function largestRemainderFirst(a: ExactPart, b: ExactPart): number {
  if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
  return a.rank - b.rank || ((a.id ?? "") < (b.id ?? "") ? -1 : 1);
}

function leastCommonMultiple(a: number, b: number): number {
  let [x, y] = [a, b];
  while (y !== 0) [x, y] = [y, x % y];
  return (a / x) * b;
}

function hashId(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
