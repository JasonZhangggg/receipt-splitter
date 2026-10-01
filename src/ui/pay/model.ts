import { cents, type Cents } from "../../core/money";
import { plainAmount } from "../../draft";
import { splitCopy as say } from "../split-copy";

export type PayState =
  | { readonly kind: "nothing" }
  | { readonly kind: "unpaid"; readonly owe: Cents }
  | { readonly kind: "settled"; readonly paid: Cents }
  | { readonly kind: "over"; readonly paid: Cents; readonly back: Cents }
  | { readonly kind: "short"; readonly paid: Cents; readonly rest: Cents };

export function payState(share: Cents, paid: Cents | null): PayState {
  if (paid === null) return share > 0 ? { kind: "unpaid", owe: share } : { kind: "nothing" };
  if (paid === share) return { kind: "settled", paid };
  return paid > share ? { kind: "over", paid, back: cents(paid - share) } : { kind: "short", paid, rest: cents(share - paid) };
}

export type Viewer = "payer" | "host" | "other";

export const dollars = (amount: Cents) => `$${plainAmount(amount)}`;

/** The line that squares a Payment with a Share that moved after it, or null when they match. */
export function differenceNote(state: PayState, viewer: Viewer, payer: string, host: string): string | null {
  if (state.kind === "over") return say.paidOver(viewer, payer, host, dollars(state.paid), dollars(state.back));
  if (state.kind === "short") return say.paidShort(viewer, payer, dollars(state.paid), dollars(state.rest));
  return null;
}
