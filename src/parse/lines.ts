import { cents, price, type Cents, type Price } from "../core/money";
import type { Row } from "./rows";
import { MAX_QUANTITY } from "../core/limits";

export type Quantity = { readonly count: number; readonly unitPrice: Price };

export type Line =
  | { readonly kind: "item"; readonly name: string; readonly price: Price; readonly quantity: Quantity | null; readonly count?: number }
  | { readonly kind: "quantity"; readonly price: Price; readonly quantity: Quantity | null }
  | { readonly kind: "modifier"; readonly name: string; readonly price: Price }
  | {
      readonly kind: "discount";
      readonly name: string;
      readonly amount: Cents;
      readonly appliesTo: "item" | "receipt";
      readonly markedBy: "label" | "minusSign";
    }
  | { readonly kind: "subtotal"; readonly amount: Cents }
  | { readonly kind: "tax" | "tip" | "serviceCharge"; readonly name: string; readonly amount: Cents }
  | { readonly kind: "total"; readonly amount: Cents }
  | { readonly kind: "noise"; readonly text: string };

type Label = "subtotal" | "tax" | "tip" | "serviceCharge" | "discount" | "total" | "noise";

const LABELS: readonly (readonly [Label, RegExp])[] = [
  ["noise", /suggest|\btel|\bvisa\b/i],
  ["subtotal", /\bsub\s*-?\s*to\s*ta\s*l?\b/i],
  ["tax", /\b(tax(?!able)\w*|txtl)\b|^([a-z]{2}\s+)?state$/i],
  ["tip", /\b(tip|gratuity)\b/i],
  ["serviceCharge", /\bservice\b/i],
  ["discount", /\b(discount|coupon)\b/i],
  ["total", /\b(total|totl|amount\s+due|balance\s+due)\b/i],
];

const MONEY = /(-{1,2})?\s?\$?\s?(\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\s?|,)(\d{2})(?!\d)(-(?!\d))?/g;
const AT = /(\d{1,2})\s*@\s*\$?\s?(\d{1,6}[.,]\d{2})/;
const LEADING_COUNT = /^\s*(0\d\s+)?\d{1,2}\s+(?![x×]\s)(?=\S)/i;
const TIMES = /^(\d{1,2})\s?[x×]\s+(?=\S)/i;
const MODIFIER_MARK = /^(\+|add\b|make\s+it\b|extra\b|sub\b|no\b|w\/|with\b)/i;

type Amount = { readonly cents: number; readonly start: number; readonly bracketed: boolean };

export function hasWords(text: string): boolean {
  return /[a-z]{2}/i.test(text);
}

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
  const indented = anchor !== null && hasWords(label) && row.left > anchor.left + row.lineHeight;
  if (labelled === "discount" || amount < 0) {
    const appliesTo = anchor && (indented || echoes(label, anchor.text)) && !/coupon/i.test(label) ? "item" : "receipt";
    const markedBy = labelled === "discount" ? "label" : "minusSign";
    return { kind: "discount", name: label, amount: cents(-Math.abs(amount)), appliesTo, markedBy };
  }
  if (last.bracketed) return { kind: "noise", text: row.text };
  const at = AT.exec(row.text);
  const quantity = at && { count: Number(at[1]), unitPrice: price(moneyCents(at[2])) };
  const extended = quantity && at && last.start > at.index + at[0].length - 1 ? price(amount) : null;
  const name = label.slice(0, at && at.index < label.length ? at.index : undefined).replace(LEADING_COUNT, "").replace(/[\s(]+$/, "").trim();
  if (quantity) {
    const total = extended ?? price(quantity.count * quantity.unitPrice);
    const uncorroborated = extended !== quantity.count * quantity.unitPrice ? quantity : null;
    if (!hasWords(name)) return { kind: "quantity", price: total, quantity: uncorroborated };
    return { kind: "item", name, price: total, quantity: uncorroborated };
  }
  if (!hasWords(label)) return { kind: "noise", text: row.text };
  const counted = LEADING_COUNT.test(label);
  if (counted ? name.startsWith("+") : indented || MODIFIER_MARK.test(name)) {
    return { kind: "modifier", name, price: price(amount) };
  }
  return { kind: "item", ...withCount(name), price: price(amount), quantity: null };
}

function withCount(name: string): { readonly name: string; readonly count?: number } {
  const times = TIMES.exec(name);
  const count = Number(times?.[1]);
  if (!times || count < 1 || count > MAX_QUANTITY) return { name };
  return { name: name.slice(times[0].length), ...(count > 1 && { count }) };
}

export function echoes(label: string, itemRow: string): boolean {
  const tokens = (text: string) => (text.toLowerCase().match(/[a-z]{4,}|\d+\.\d{2}/g) ?? []).filter((token) => !LABELS.some(([kind, pattern]) => kind === "discount" && pattern.test(token)));
  const item = new Set(tokens(itemRow));
  return tokens(label).some((token) => item.has(token));
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
