import type { ParticipantId } from "../../core/split";

type Typed = { readonly participantId: ParticipantId; readonly cents: number };

/** What "Give <name> the rest" would type: the amount that makes the split add up to the price. */
export type Fill = { readonly participantId: ParticipantId; readonly cents: number };

/**
 * Where a By amount split stands against the price. While money is left, the rest can go only to the one person still at $0.00,
 * so no typed amount is overwritten. Once the amounts pass the price, the rest can go to the person who typed last, if their
 * amount covers the excess.
 */
export type AmountStatus =
  | { readonly by: "left"; readonly left: number; readonly assigned: number; readonly fill: Fill | null }
  | { readonly by: "exact" }
  | { readonly by: "over"; readonly over: number; readonly fill: Fill | null };

export function amountStatus(price: number, amounts: readonly Typed[], last: ParticipantId | null = null): AmountStatus {
  const assigned = amounts.reduce((sum, { cents }) => sum + cents, 0);
  if (assigned === price) return { by: "exact" };
  if (assigned > price) {
    const over = assigned - price;
    const typed = amounts.find(({ participantId }) => participantId === last);
    return { by: "over", over, fill: typed && typed.cents >= over ? { participantId: typed.participantId, cents: typed.cents - over } : null };
  }
  const empty = amounts.filter(({ cents }) => cents === 0);
  return { by: "left", left: price - assigned, assigned, fill: empty.length === 1 ? { participantId: empty[0]!.participantId, cents: price - assigned } : null };
}
