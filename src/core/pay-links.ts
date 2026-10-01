import type { Cents } from "./money";
import type { PaymentHandle, PaymentService } from "./split";

export type PayTarget = "web" | "app";

type LinkBuilder = (user: string, amount: string, note: string, target: PayTarget) => string | null;

const LINKS: { readonly [Service in PaymentService]: LinkBuilder } = {
  venmo: (user, amount, note, target) =>
    target === "app"
      ? `venmo://paycharge?txn=pay&recipients=${user}&amount=${amount}&note=${note}`
      : `https://venmo.com/${user}?txn=pay&amount=${amount}&note=${note}`,
  cashApp: (user, amount) => `https://cash.app/$${user}/${amount}`,
  paypal: (user, amount) => `https://paypal.me/${user}/${amount}USD`,
  zelle: () => null,
};

/** The link that opens a payment of `amount` to the Host, or null for Zelle, which has no link. */
export function payLink(handle: PaymentHandle, amount: Cents, note: string, target: PayTarget = "web"): string | null {
  return LINKS[handle.service](encodeURIComponent(handle.handle), dollars(amount), encodeURIComponent(note), target);
}

function dollars(amount: Cents): string {
  return `${Math.trunc(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}
