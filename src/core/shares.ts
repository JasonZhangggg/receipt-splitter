import { cents, type Cents, type Price } from "./money";
import type { AdjustmentId, AdjustmentKind, ItemId, ParticipantId, Receipt, Split, SplitItem } from "./split";

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
  const claimerCountMultiple = BigInt(items.reduce((multiple, { claimedBy }) => leastCommonMultiple(multiple, Math.max(claimedBy.length, 1)), 1));
  const weightOf = new Map<ParticipantId | null, bigint>([[null, 0n], ...split.participants.map(({ id }): [ParticipantId, bigint] => [id, 0n])]);
  const unclaimedIds: ItemId[] = [];
  let unclaimedSubtotal = 0;

  items.forEach(({ id, price, claimedBy }, index) => {
    const weight = BigInt(weights[index]) * claimerCountMultiple;
    if (claimedBy.length === 0) {
      unclaimedIds.push(id);
      unclaimedSubtotal += price;
    }
    const claimers = claimedBy.length === 0 ? [null] : claimedBy;
    for (const claimer of claimers) weightOf.set(claimer, (weightOf.get(claimer) ?? 0n) + weight / BigInt(claimers.length));
  });

  const denominator = BigInt(weights.reduce((sum, weight) => sum + weight, 0)) * claimerCountMultiple;
  const floored = [...weightOf].map(([id, weight]) => {
    const numerator = BigInt(total) * weight;
    return { id, floor: Number(numerator / denominator), remainder: numerator % denominator, rank: id === null ? UNCLAIMED_RANK : tieRank(id) };
  });
  const leftover = total - floored.reduce((sum, { floor }) => sum + floor, 0);
  const roundedUp = new Set([...floored].sort(largestRemainderFirst).slice(0, leftover));
  const rounded = new Map(floored.map((part) => [part.id, part.floor + (roundedUp.has(part) ? 1 : 0)]));

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

export type ShareBreakdown = {
  readonly items: readonly { readonly id: ItemId; readonly name: string; readonly price: Price; readonly claimers: number; readonly portion: Cents }[];
  readonly adjustments: readonly { readonly id: AdjustmentId; readonly kind: AdjustmentKind; readonly name: string; readonly portion: Cents }[];
  readonly share: Cents;
};

type Fraction = readonly [numerator: bigint, denominator: bigint];

export function shareBreakdown(split: Pick<Split, "receipt" | "participants" | "payments">, participantId: ParticipantId): ShareBreakdown {
  const { items, adjustments, subtotal } = split.receipt;
  const shareIn = (receipt: Receipt<SplitItem>) => computeShares({ ...split, receipt }).shares.find((row) => row.participantId === participantId)?.share ?? 0;
  const share = shareIn(split.receipt);
  const itemsPart = shareIn({ ...split.receipt, adjustments: [], total: subtotal });
  const mine = items.filter(({ claimedBy }) => claimedBy.includes(participantId));
  const itemPortions = allocate(itemsPart, mine.map(({ price, claimedBy }): Fraction => [BigInt(price), BigInt(claimedBy.length)]));
  const [numerator, denominator] = claimedFraction(items, participantId);
  const adjustmentPortions = allocate(share - itemsPart, adjustments.map(({ amount }): Fraction => [BigInt(amount) * numerator, denominator]));
  return {
    items: mine.map(({ id, name, price, claimedBy }, index) => ({ id, name, price, claimers: claimedBy.length, portion: cents(itemPortions[index]) })),
    adjustments: adjustments.map(({ id, kind, name }, index) => ({ id, kind, name, portion: cents(adjustmentPortions[index]) })),
    share: cents(share),
  };
}

function claimedFraction(items: readonly SplitItem[], participantId: ParticipantId): Fraction {
  const weights = items.some((item) => item.price > 0) ? items.map((item) => BigInt(item.price)) : items.map(() => 1n);
  const multiple = BigInt(items.reduce((lcm, { claimedBy }) => leastCommonMultiple(lcm, Math.max(claimedBy.length, 1)), 1));
  const claimed = items.reduce((sum, { claimedBy }, index) => (claimedBy.includes(participantId) ? sum + (weights[index] * multiple) / BigInt(claimedBy.length) : sum), 0n);
  return [claimed, multiple * weights.reduce((sum, weight) => sum + weight, 0n)];
}

function allocate(target: number, parts: readonly Fraction[]): number[] {
  const floors = parts.map(([numerator, denominator]) => numerator / denominator - (numerator % denominator < 0n ? 1n : 0n));
  const remainders = parts.map(([numerator, denominator], index) => numerator - floors[index] * denominator);
  const byRemainder = parts
    .map((_, index) => index)
    .sort((a, b) => {
      const left = remainders[a] * parts[b][1];
      const right = remainders[b] * parts[a][1];
      return left === right ? a - b : left > right ? -1 : 1;
    });
  const portions = floors.map(Number);
  let left = target - portions.reduce((sum, portion) => sum + portion, 0);
  const order = left > 0 ? byRemainder : [...byRemainder].reverse();
  for (let step = 0; left !== 0 && order.length > 0; step += 1) {
    portions[order[step % order.length]] += Math.sign(left);
    left -= Math.sign(left);
  }
  return portions;
}

const UNCLAIMED_RANK = 2 ** 32;

type FlooredPart = { readonly id: ParticipantId | null; readonly remainder: bigint; readonly rank: number };

function largestRemainderFirst(a: FlooredPart, b: FlooredPart): number {
  if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
  return a.rank - b.rank || ((a.id ?? "") < (b.id ?? "") ? -1 : 1);
}

function leastCommonMultiple(a: number, b: number): number {
  let [x, y] = [a, b];
  while (y !== 0) [x, y] = [y, x % y];
  return (a / x) * b;
}

function tieRank(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
