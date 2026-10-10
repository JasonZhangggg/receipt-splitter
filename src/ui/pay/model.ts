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

/**
 * What the line under a share says: the shown person's PayState, or for the Host on their own share how many of the people who owe something have paid
 * in full (settled or over), out of how many owe something. `started` is whether anyone has paid anything, short included.
 */
export type ShareStatus = PayState | { readonly kind: "host"; readonly paid: number; readonly of: number; readonly started: boolean };

export function shareStatus(shares: Shares, payments: Split["payments"], person: ParticipantId, viewer: ParticipantId | null): ShareStatus {
  const [host, ...others] = shares.shares;
  const stateOf = (id: ParticipantId, share: Cents) => payState(share, payments.find((payment) => payment.participantId === id)?.amount ?? null);
  if (person !== host.participantId) {
    const row = others.find(({ participantId }) => participantId === person);
    return row ? stateOf(person, row.share) : { kind: "nothing" };
  }
  if (viewer !== host.participantId) return { kind: "nothing" };
  const states = others.map(({ participantId, share }) => stateOf(participantId, share)).filter(({ kind }) => kind !== "nothing");
  const paid = states.filter(({ kind }) => kind === "settled" || kind === "over").length;
  return { kind: "host", paid, of: states.length, started: paid > 0 || states.some(({ kind }) => kind === "short") };
}

/** Quiet by default: nothing until someone has paid. */
export function statusWords(status: ShareStatus): string | null {
  switch (status.kind) {
    case "nothing":
    case "unpaid":
      return null;
    case "settled":
      return say.status.paid(money(status.paid));
    case "short":
      return say.status.short(money(status.paid), money(status.rest));
    case "over":
      return say.status.over(money(status.paid), money(status.back));
    case "host":
      return status.started ? say.status.paidYou(status.paid, status.of) : null;
  }
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
