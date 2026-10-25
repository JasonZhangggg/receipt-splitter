import { plainAmount, type Currency } from "./currency";
import type { Cents } from "./money";
import type { PaymentHandle, PaymentService } from "./split";

export type PayTarget = "web" | "app";

type LinkBuilder = (user: string, amount: string, note: string, target: PayTarget, currency: Currency) => string | null;

const LINKS: { readonly [Service in PaymentService]: LinkBuilder } = {
  venmo: (user, amount, note, target) =>
    target === "app"
      ? `venmo://paycharge?txn=pay&recipients=${user}&amount=${amount}&note=${note}`
      : `https://venmo.com/${user}?txn=pay&amount=${amount}&note=${note}`,
  cashApp: (user, amount) => `https://cash.app/$${user}/${amount}`,
  paypal: (user, amount, _note, _target, currency) => `https://paypal.me/${user}/${amount}${currency}`,
  zelle: () => null,
};

/** Venmo, Cash App and Zelle move US dollars only; PayPal sends any currency a Split can be in. */
export const paysIn = (service: PaymentService, currency: Currency): boolean => service === "paypal" || currency === "USD";

/** The link that opens the app with the amount filled in, or null for an app that has none, or that can't send the Split's currency. */
export function payLink(handle: PaymentHandle, amount: Cents, note: string, target: PayTarget = "web", currency: Currency = "USD"): string | null {
  if (!paysIn(handle.service, currency)) return null;
  return LINKS[handle.service](encodeURIComponent(handle.handle), plainAmount(amount, currency), encodeURIComponent(note), target, currency);
}
