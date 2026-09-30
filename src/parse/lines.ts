import { cents, price, type Cents, type Price } from "../core/money";
import type { Row } from "./rows";

export type Quantity = { readonly count: number; readonly unitPrice: Price };

export type Line =
  | { readonly kind: "item"; readonly name: string; readonly price: Price; readonly quantity: Quantity | null }
  | { readonly kind: "quantity"; readonly price: Price; readonly quantity: Quantity }
  | { readonly kind: "modifier"; readonly name: string; readonly price: Price }
  | {
      readonly kind: "discount";
      readonly name: string;
      readonly amount: Cents;
      readonly appliesTo: "item" | "receipt";
      readonly readFrom: "label" | "minus";
    }
  | { readonly kind: "subtotal"; readonly amount: Cents }
  | { readonly kind: "tax" | "tip" | "serviceCharge"; readonly name: string; readonly amount: Cents }
  | { readonly kind: "total"; readonly amount: Cents }
  | { readonly kind: "noise"; readonly text: string };

type Label = "subtotal" | "tax" | "tip" | "serviceCharge" | "discount" | "total" | "noise";

const LABELS: readonly (readonly [Label, RegExp])[] = [
  ["noise", /suggest|tip\s*guide|\d\s*%\s*[=:+]|\d+\s*%\s*(tip|gratuity)|w\/\s*tax|\btel|\b(phone|fax|change|cash|visa|mastercard|amex|discover|credit|debit|tender(ed)?|payment|paid|auth\w*|approval|purchase)\b/i],
  ["subtotal", /\bsub\s*-?\s*to\s*ta\s*l?\b|\bsub\s*ttl\b|\bsubtota\w*|\bnet\s+total\b/i],
  ["tax", /\b(tax(?!able)\w*|txtl|hst|gst|vat|state)\b/i],
  ["tip", /\b(tip|gratuity|grat)\b/i],
  ["serviceCharge", /\b(service|svc|fees?)\b/i],
  ["discount", /\b(discount|disc|coupon|promo|off|comp|savings?)\b/i],
  ["total", /\b(total|totl|ttl|amount\s+due|balance\s+due|amt\s+due)\b/i],
  ["noise", /\b(guests?|table|server|check|order|ticket|thank|date|items?\s+sold|\d+\s+items)\b/i],
];

const MONEY = /(-{1,2})?\s?\$?\s?(\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\s?|,)(\d{2})(?!\d)(-(?!\d))?/g;
const AT = /(\d{1,2})\s*@\s*\$?\s?(\d{1,6}[.,]\d{2})/;
const LEADING_COUNT = /^\s*\d{1,2}\s+(?=\S)/;
const MODIFIER_MARK = /^(\+|add\b|make\s+it\b|extra\b|sub\b|no\b|w\/|with\b)/i;

type Amount = { readonly cents: number; readonly start: number; readonly bracketed: boolean };

export function classifyLines(rows: readonly Row[]): Line[] {
  let anchor: Row | null = null;
  return rows.map((row) => {
    const line = classify(row, anchor);
    if (line.kind === "item") anchor = row;
    return line;
  });
}

function classify(row: Row, anchor: Row | null): Line {
  const amounts = amountsIn(row.text);
  const last = amounts.at(-1);
  if (!last) return { kind: "noise", text: row.text };
  const label = row.text.slice(0, last.start).replace(/[\s:.$*#=-]+$/, "").trim();
  const labelled = LABELS.find(([, pattern]) => pattern.test(label))?.[0];
  if (labelled === "noise") return { kind: "noise", text: row.text };
  const amount = cents(last.cents);
  if (labelled === "subtotal" || labelled === "total") return { kind: labelled, amount };
  if (labelled === "tax" || labelled === "tip" || labelled === "serviceCharge") {
    return { kind: labelled, name: label, amount: cents(Math.abs(amount)) };
  }
  const indented = anchor !== null && /[a-z]{2}/i.test(label) && row.left > anchor.left + row.lineHeight;
  if (labelled === "discount" || amount < 0) {
    const appliesTo = /[a-z]{2}/i.test(label) && !/coupon/i.test(label) ? "item" : "receipt";
    const readFrom = labelled === "discount" ? "label" : "minus";
    return { kind: "discount", name: label, amount: cents(-Math.abs(amount)), appliesTo, readFrom };
  }
  if (last.bracketed) return { kind: "noise", text: row.text };
  const at = AT.exec(row.text);
  const quantity = at && { count: Number(at[1]), unitPrice: price(moneyCents(at[2])) };
  const extended = quantity && at && last.start > at.index + at[0].length - 1 ? price(amount) : null;
  const name = label.slice(0, at && at.index < label.length ? at.index : undefined).replace(LEADING_COUNT, "").replace(/[\s(]+$/, "").trim();
  if (quantity) {
    const total = extended ?? price(quantity.count * quantity.unitPrice);
    if (!/[a-z]{2}/i.test(name)) return { kind: "quantity", price: total, quantity };
    return { kind: "item", name, price: total, quantity: extended === null ? quantity : null };
  }
  if (!/[a-z]{2}/i.test(label)) return { kind: "noise", text: row.text };
  const counted = LEADING_COUNT.test(label);
  if (counted ? name.startsWith("+") : indented || MODIFIER_MARK.test(name)) {
    return { kind: "modifier", name, price: price(amount) };
  }
  return { kind: "item", name, price: price(amount), quantity: null };
}

function amountsIn(text: string): Amount[] {
  return [...text.matchAll(MONEY)].map((match) => {
    const value = Number(match[2].replace(/,/g, "")) * 100 + Number(match[3]);
    const negative = Boolean(match[1] || match[4]);
    const end = match.index + match[0].length;
    const bracketed = /\(\s*$/.test(text.slice(0, match.index)) && /^\s*\)/.test(text.slice(end));
    return { cents: negative ? -value : value, start: match.index, bracketed };
  });
}

function moneyCents(text: string): number {
  const [whole, fraction] = text.split(/[.,]/);
  return Number(whole) * 100 + Number(fraction);
}
