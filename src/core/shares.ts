import { cents, type Cents, type Price } from "./money";
import type { AdjustmentId, AdjustmentKind, ItemId, ItemSplit, ParticipantId, Receipt, Split, SplitItem } from "./split";

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
    readonly total: Cents;
  };
};

type Party = ParticipantId | null;

type UnitParts = { readonly parts: ReadonlyMap<Party, bigint>; readonly denominator: bigint };

export function unitPrices(price: number, units: number): number[] {
  const base = Math.floor(price / units);
  return Array.from({ length: units }, (_, index) => base + (index < price % units ? 1 : 0));
}

function unitParts(split: ItemSplit, index: number, unitPrice: number): UnitParts {
  const entries: readonly (readonly [ParticipantId, bigint])[] =
    split.by === "even" ? split.units[index].map((id) => [id, 1n]) : split.units[index].map(([id, value]) => [id, BigInt(value)]);
  if (entries.length === 0) return { parts: new Map([[null, 1n]]), denominator: 1n };
  const total = sum(entries.map(([, value]) => value));
  if (split.by !== "amount") return { parts: new Map(entries), denominator: total };
  if (unitPrice === 0) return { parts: new Map(entries.map(([id]) => [id, 1n])), denominator: BigInt(entries.length) };
  const whole = BigInt(unitPrice) > total ? BigInt(unitPrice) : total;
  return { parts: new Map<Party, bigint>([...entries, [null, whole - total]]), denominator: whole };
}

type Piece = UnitParts & { readonly item: number; readonly weight: bigint };

function pieces(items: readonly SplitItem[]): readonly Piece[] {
  const anyPriced = items.some((item) => item.price > 0);
  return items.flatMap(({ price, split }, item) =>
    unitPrices(price, split.units.length).map((unitPrice, index) => ({ ...unitParts(split, index, unitPrice), item, weight: anyPriced ? BigInt(unitPrice) : 1n })),
  );
}

function weighted(items: readonly SplitItem[]) {
  const all = pieces(items);
  const multiple = all.reduce((lcm, { denominator }) => leastCommonMultiple(lcm, denominator), 1n);
  const weightOf = (party: Party, piece: Piece) => ((piece.parts.get(party) ?? 0n) * piece.weight * multiple) / piece.denominator;
  return { all, weightOf, denominator: sum(all.map(({ weight }) => weight)) * multiple };
}

export function computeShares(split: Pick<Split, "receipt" | "participants" | "payments">): Shares {
  const { items, total } = split.receipt;
  const { all, weightOf, denominator } = weighted(items);
  const parties: Party[] = [null, ...split.participants.map(({ id }) => id)];
  const floored = parties.map((id) => {
    const numerator = BigInt(total) * sum(all.map((piece) => weightOf(id, piece)));
    const floor = floorDivide(numerator, denominator);
    return { id, floor: Number(floor), remainder: numerator - floor * denominator, rank: id === null ? UNCLAIMED_RANK : tieRank(id) };
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
    unclaimed: {
      itemIds: items.filter((_, index) => all.some((piece) => piece.item === index && (piece.parts.get(null) ?? 0n) > 0n)).map(({ id }) => id),
      total: cents(rounded.get(null) ?? 0),
    },
  };
}

export type ShareBreakdown = {
  readonly items: readonly { readonly id: ItemId; readonly name: string; readonly price: Price; readonly fraction: readonly [number, number]; readonly portion: Cents }[];
  readonly adjustments: readonly { readonly id: AdjustmentId; readonly kind: AdjustmentKind; readonly name: string; readonly portion: Cents }[];
  /** What the Share differs from the lines by when the Items disagree with the printed subtotal, and 0 when they agree. */
  readonly difference: Cents;
  readonly share: Cents;
};

type Fraction = readonly [numerator: bigint, denominator: bigint];

export function shareBreakdown(split: Pick<Split, "receipt" | "participants" | "payments">, participantId: ParticipantId): ShareBreakdown {
  const { items, adjustments } = split.receipt;
  const shareIn = (receipt: Receipt<SplitItem>) => computeShares({ ...split, receipt }).shares.find((row) => row.participantId === participantId)?.share ?? 0;
  const share = shareIn(split.receipt);
  const itemsSum = items.reduce((total, { price }) => total + price, 0);
  const itemsPart = shareIn({ ...split.receipt, adjustments: [], total: cents(itemsSum) });
  const agreeingShare = shareIn({ ...split.receipt, total: cents(itemsSum + adjustments.reduce((total, { amount }) => total + amount, 0)) });
  const { all, weightOf, denominator } = weighted(items);
  const mine = items.flatMap((item, index) => {
    const units = all.filter((piece) => piece.item === index);
    const multiple = units.reduce((lcm, { denominator: whole }) => leastCommonMultiple(lcm, whole), 1n);
    const had = (piece: Piece) => ((piece.parts.get(participantId) ?? 0n) * multiple) / piece.denominator;
    const unitsHad = sum(units.map(had));
    if (unitsHad === 0n) return [];
    const prices = unitPrices(item.price, units.length);
    const itemCents = sum(units.map((piece, unit) => had(piece) * BigInt(prices[unit])));
    return [{ item, fraction: [unitsHad, multiple * BigInt(units.length)] as const, cents: [itemCents, multiple] as const }];
  });
  const claimed = sum(all.map((piece) => weightOf(participantId, piece)));
  const adjustmentParts = adjustments.map(({ amount }): Fraction => [BigInt(amount) * claimed, denominator]);
  const [fewest, most] = roundingRange(adjustmentParts);
  // itemsPart and agreeingShare each round on their own, so their gap can be a cent more than the Adjustments can round to; the Items take that cent.
  const adjustmentsPart = Math.min(Math.max(agreeingShare - itemsPart, fewest), most);
  const itemPortions = allocate(agreeingShare - adjustmentsPart, mine.map(({ cents }): Fraction => cents));
  const adjustmentPortions = allocate(adjustmentsPart, adjustmentParts);
  return {
    items: mine.map(({ item: { id, name, price }, fraction }, index) => ({ id, name, price, fraction: reduced(fraction), portion: cents(itemPortions[index]) })),
    adjustments: adjustments.map(({ id, kind, name }, index) => ({ id, kind, name, portion: cents(adjustmentPortions[index]) })),
    difference: cents(share - agreeingShare),
    share: cents(share),
  };
}

function reduced([numerator, denominator]: Fraction): readonly [number, number] {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return [Number(numerator / divisor), Number(denominator / divisor)];
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/**
 * Rounds each line to the cent below or above its exact value, so no line leaves the range between 0 and its Item or Adjustment.
 * The target must lie in `roundingRange(parts)`.
 */
function allocate(target: number, parts: readonly Fraction[]): number[] {
  const floors = parts.map(([numerator, denominator]) => floorDivide(numerator, denominator));
  const remainders = parts.map(([numerator, denominator], index) => numerator - floors[index] * denominator);
  const portions = floors.map(Number);
  const short = target - portions.reduce((total, portion) => total + portion, 0);
  const roundedUp = parts
    .map((_, index) => index)
    .filter((index) => remainders[index] > 0n)
    .sort((a, b) => {
      const left = remainders[a] * parts[b][1];
      const right = remainders[b] * parts[a][1];
      return left === right ? a - b : left > right ? -1 : 1;
    });
  if (short < 0 || short > roundedUp.length) throw new RangeError(`cannot round ${parts.length} lines to ${target} cents`);
  for (const index of roundedUp.slice(0, short)) portions[index] += 1;
  return portions;
}

/** The fewest and most cents `allocate` can give the parts in total. */
function roundingRange(parts: readonly Fraction[]): readonly [number, number] {
  const floors = parts.map(([numerator, denominator]) => floorDivide(numerator, denominator));
  const fewest = Number(sum(floors));
  return [fewest, fewest + parts.filter(([numerator, denominator], index) => numerator !== floors[index] * denominator).length];
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator < 0n ? quotient - 1n : quotient;
}

const UNCLAIMED_RANK = 2 ** 32;

type FlooredPart = { readonly id: Party; readonly remainder: bigint; readonly rank: number };

function largestRemainderFirst(a: FlooredPart, b: FlooredPart): number {
  if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
  return a.rank - b.rank || ((a.id ?? "") < (b.id ?? "") ? -1 : 1);
}

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  let [x, y] = [a, b];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function leastCommonMultiple(a: bigint, b: bigint): bigint {
  return (a / greatestCommonDivisor(a, b)) * b;
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
