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

export type PaymentRow = {
  readonly id: ParticipantId;
  readonly name: string;
  readonly isHost: boolean;
  readonly share: Cents;
  /** The paid state in words, or what the Host does. */
  readonly words: string;
};

export type PaymentStatus = {
  readonly rows: readonly PaymentRow[];
  /** People other than the Host who have a payment recorded. */
  readonly paid: number;
  /** People other than the Host who owe or paid anything. */
  readonly owing: number;
  /** "N of M paid you" for the Host, "N of M paid" for everyone else; null while nobody owes anything. */
  readonly summary: string | null;
};

const stateWords = (state: PayState): string => {
  switch (state.kind) {
    case "settled":
      return `Paid ${money(state.paid)}`;
    case "short":
      return `Paid ${money(state.paid)} · ${money(state.rest)} still owed`;
    case "over":
      return `Paid ${money(state.paid)} · ${money(state.back)} too much`;
    case "unpaid":
      return "Not paid";
    case "nothing":
      return "Nothing to pay";
  }
};

/** Everyone in chip order with their share and paid state in words. A recorded $0 counts as no payment. */
export function paymentStatus(split: Pick<Split, "participants" | "payments">, shares: Shares, viewer: ParticipantId | null): PaymentStatus {
  const host = split.participants[0];
  let paid = 0;
  let owing = 0;
  const rows = split.participants.map(({ id, name }, index): PaymentRow => {
    const share = shares.shares[index].share;
    if (index === 0) return { id, name, isHost: true, share, words: viewer === host.id ? "You get paid" : "Gets paid" };
    const recorded = split.payments.find((payment) => payment.participantId === id)?.amount ?? null;
    const state = payState(share, recorded !== null && recorded > 0 ? recorded : null);
    if (state.kind !== "nothing") owing += 1;
    if (state.kind === "settled" || state.kind === "short" || state.kind === "over") paid += 1;
    return { id, name, isHost: false, share, words: stateWords(state) };
  });
  const summary = owing === 0 ? null : `${paid} of ${owing} paid${viewer === host.id ? " you" : ""}`;
  return { rows, paid, owing, summary };
}
