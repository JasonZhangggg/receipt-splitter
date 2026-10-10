import type { ParticipantId } from "../../core/split";

type Typed = { readonly participantId: ParticipantId; readonly cents: number };

/**
 * Where a By amount split stands against the price. While money is left, `fillsInto` is the one person still at $0.00:
 * the rest can only go to them without overwriting an amount someone typed.
 */
export type AmountStatus =
  | { readonly by: "left"; readonly left: number; readonly assigned: number; readonly fillsInto: ParticipantId | null }
  | { readonly by: "exact" }
  | { readonly by: "over"; readonly over: number };

export function amountStatus(price: number, amounts: readonly Typed[]): AmountStatus {
  const assigned = amounts.reduce((sum, { cents }) => sum + cents, 0);
  if (assigned === price) return { by: "exact" };
  if (assigned > price) return { by: "over", over: assigned - price };
  const empty = amounts.filter(({ cents }) => cents === 0);
  return { by: "left", left: price - assigned, assigned, fillsInto: empty.length === 1 ? empty[0]!.participantId : null };
}
