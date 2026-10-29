import { cents, type Cents } from "../../core/money";
import type { Shares } from "../../core/shares";
import type { ParticipantId, Split } from "../../core/split";
import { money, type Currency } from "../../core/currency";
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

/** The one wording for a paid state: null while quiet (nothing or unpaid), so the line under a share stays empty and a Payments row falls back to its own words. */
export function statusWords(status: ShareStatus, currency: Currency): string | null {
  switch (status.kind) {
    case "nothing":
    case "unpaid":
      return null;
    case "settled":
      return say.status.paid(money(status.paid, currency));
    case "short":
      return say.status.short(money(status.paid, currency), money(status.rest, currency));
    case "over":
      return say.status.over(money(status.paid, currency), money(status.back, currency));
    case "host":
      return status.started ? say.status.paidYou(status.paid, status.of) : null;
  }
}

export type PaymentRow = {
  readonly id: ParticipantId;
  readonly name: string;
  readonly isHost: boolean;
  readonly share: Cents;
  /** The row's PayState kind, or "host" for the Host, who paid the bill and so has paid their own Share. */
  readonly state: PayState["kind"] | "host";
  /** The paid state in words, or "Paid the bill" for the Host. */
  readonly words: string;
};

export type PaymentStatus = {
  readonly rows: readonly PaymentRow[];
  /** People other than the Host who have paid in full or more. */
  readonly paid: number;
  /** People other than the Host who owe or paid anything. */
  readonly owing: number;
  /** "N of M paid you" for the Host, "N of M paid" for everyone else; null while nobody owes anything. */
  readonly summary: string | null;
};

/** Everyone in chip order with their share and paid state in words. */
export function paymentStatus(split: Pick<Split, "participants" | "payments" | "currency">, shares: Shares, viewer: ParticipantId | null): PaymentStatus {
  const host = split.participants[0];
  let paid = 0;
  let owing = 0;
  const rows = split.participants.map(({ id, name }, index): PaymentRow => {
    const share = shares.shares[index].share;
    if (index === 0) return { id, name, isHost: true, share, state: "host", words: say.status.paidTheBill };
    const state = payState(share, split.payments.find((payment) => payment.participantId === id)?.amount ?? null);
    if (state.kind !== "nothing") owing += 1;
    if (state.kind === "settled" || state.kind === "over") paid += 1;
    return { id, name, isHost: false, share, state: state.kind, words: statusWords(state, split.currency) ?? (state.kind === "unpaid" ? say.status.unpaid : say.status.nothing) };
  });
  const summary = owing === 0 ? null : `${paid} of ${owing} paid${viewer === host.id ? " you" : ""}`;
  return { rows, paid, owing, summary };
}

/** The viewer's own row first and everyone else after it in chip order, as the Payments list reads. */
export function viewerFirst<Row extends { readonly id: ParticipantId }>(rows: readonly Row[], viewer: ParticipantId | null): Row[] {
  const mine = rows.filter(({ id }) => id === viewer);
  return [...mine, ...rows.filter(({ id }) => id !== viewer)];
}

/**
 * What has been paid toward everyone's Shares, out of their sum, which the Payments summary line and ring give on every phone. The Host paid their own Share with
 * the bill, so it counts as paid; friends' Payments count as recorded, so an overpayment shows as more than owed.
 */
export function billPaid(rows: readonly PaymentRow[], payments: Split["payments"]): { readonly paid: Cents; readonly owed: Cents } {
  const owed = rows.reduce((sum, { share }) => sum + share, 0);
  const host = rows.filter(({ isHost }) => isHost).reduce((sum, { share }) => sum + share, 0);
  const friends = new Set(rows.filter(({ isHost }) => !isHost).map(({ id }) => id));
  const paid = payments.filter(({ participantId }) => friends.has(participantId)).reduce((sum, { amount }) => sum + amount, host);
  return { paid: cents(paid), owed: cents(owed) };
}

/** People other than the Host and the viewer who owe $0.00 and paid nothing, which Payments folds into one line instead of a row each. */
export function foldedRows<Row extends Pick<PaymentRow, "id" | "state">>(rows: readonly Row[], viewer: ParticipantId | null): { readonly shown: Row[]; readonly quiet: Row[] } {
  const quiet = rows.filter(({ id, state }) => state === "nothing" && id !== viewer);
  return { shown: rows.filter((row) => !quiet.includes(row)), quiet };
}

/** What a payment just made adds: the Share less what was already paid, so "I paid the rest" names the rest and not the running total. */
export function justPaid(share: Cents, before: Cents | null): Cents {
  return cents(share - (before ?? 0));
}

const fractions: Record<string, string> = { "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾" };

/** The Items a person had, by name, with their part of any they shared: "½ Spring rolls, Pho". */
export function itemsLine(items: readonly { readonly name: string; readonly fraction: readonly [number, number] }[]): string {
  return items
    .map(({ name, fraction: [part, whole] }) => (part === whole ? name : `${fractions[`${part}/${whole}`] ?? `${part}/${whole}`} ${name}`))
    .join(", ");
}
