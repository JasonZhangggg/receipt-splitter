import { cents, type Cents } from "../../core/money";
import type { Shares } from "../../core/shares";
import type { ParticipantId, Split } from "../../core/split";
import { money } from "../../draft";
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

export function differenceNote(state: PayState, viewer: Viewer, payer: string, host: string): string | null {
  if (state.kind === "over") return say.paidOver(viewer, payer, host, money(state.paid), money(state.back));
  if (state.kind === "short") return say.paidShort(viewer, payer, money(state.paid), money(state.rest));
  return null;
}

/** "short" and "over" both draw "!" on the chip: they paid, and their share has moved since. */
export type PaidMark = "paid" | "short" | "over";

/** Who shows a mark on their chip. The Host is owed, so never marked; someone who hasn't paid has none. */
export function paidMarks(shares: Shares, payments: Split["payments"]): ReadonlyMap<ParticipantId, PaidMark> {
  const [, ...others] = shares.shares;
  const marks = new Map<ParticipantId, PaidMark>();
  for (const { participantId, share } of others) {
    const amount = payments.find((payment) => payment.participantId === participantId)?.amount ?? null;
    const state = payState(share, amount);
    if (state.kind === "short" || state.kind === "over") marks.set(participantId, state.kind);
    else if (state.kind === "settled") marks.set(participantId, "paid");
  }
  return marks;
}
