import { MAX_CENTS, type Cents } from "../../src/core/money";
import type { NonEmpty } from "../../src/core/split";
import type { Check } from "./check";

export type ChargeKind = "discount" | "tax" | "tip" | "serviceCharge" | "fee";

/** A discount printed under an Item or inside a Bundle. The amount is negative. */
export type ReadDiscount = { readonly name: string; readonly amount: Cents };

export type ReadItem = {
  readonly name: string;
  /** What the receipt charges for the line once the discounts printed under it are taken off. It covers every unit. */
  readonly price: Cents;
  readonly quantity: number | null;
  readonly details: readonly string[];
  /** The discounts printed under the Item, already folded into `price`. */
  readonly discounts: readonly ReadDiscount[];
};

export type ReadAdjustment = { readonly kind: ChargeKind; readonly name: string; readonly amount: Cents };

export type Subtotal = { readonly amount: Cents; readonly beforeDiscounts: boolean };

/** `items` holds indexes into the reading's Items. */
export type ReadBundle<Members extends readonly number[] = readonly number[]> = {
  readonly name: string;
  readonly items: Members;
  readonly discounts: readonly ReadDiscount[];
};

/** One reading of a reply, before the check. A Bundle may still be empty, which the check refuses. */
export type Reading = {
  readonly subtotal: Subtotal | null;
  readonly total: Cents;
  readonly items: NonEmpty<ReadItem>;
  readonly bundles: readonly ReadBundle[];
  /** Receipt-level charges and credits, in printed order. */
  readonly adjustments: readonly ReadAdjustment[];
  /** Lines of the reply that did not parse. */
  readonly skipped: number;
};

/** The body of a 200 from `POST /api/scan`. */
export type ScanReply = {
  readonly items: NonEmpty<ReadItem>;
  readonly bundles: readonly ReadBundle<NonEmpty<number>>[];
  readonly adjustments: readonly ReadAdjustment[];
  readonly subtotal: Subtotal | null;
  readonly total: Cents;
  readonly check: Check;
};

const KINDS: Readonly<Record<string, "item" | ChargeKind>> = { i: "item", d: "discount", t: "tax", p: "tip", s: "serviceCharge", f: "fee" };

/** The reply's lines, without code fences or blank lines. */
export function replyLines(text: string): string[] {
  return text
    .replace(/```[a-z]*\n?/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function amount(field: string | undefined): Cents | null {
  const bare = (field ?? "").replace(/[,$£€\s+]/g, "");
  if (!/^-?\d+-?$/.test(bare)) return null;
  const value = Number(bare.replace(/-/g, ""));
  if (!Number.isSafeInteger(value) || value > MAX_CENTS) return null;
  return (bare.includes("-") ? -value : value) as Cents;
}

function whole(field: string | undefined): number | null {
  return /^\s*\d+\s*$/.test(field ?? "") ? Number(field) : null;
}

const negative = (value: Cents) => -Math.abs(value) as Cents;

const fieldsOf = (line: string) => line.replace(/^>\s*/, "").split("|").map((field) => field.trim());

const tagOf = (line: string) => fieldsOf(line)[0].toLowerCase();

type ItemDraft = { name: string; price: Cents; quantity: number | null; details: string[]; discounts: ReadDiscount[] };

/** Reads pass 1's compact format. Returns null without a total or an Item. */
export function readLines(lines: readonly string[]): Reading | null {
  let subtotal: Subtotal | null = null;
  let total: Cents | null = null;
  const items: ItemDraft[] = [];
  const bundles: { name: string; items: number[]; discounts: ReadDiscount[] }[] = [];
  const adjustments: ReadAdjustment[] = [];
  let skipped = 0;
  let bundle: (typeof bundles)[number] | null = null;
  let last: ItemDraft | null = null;

  for (const line of lines) {
    const inside = line.startsWith(">");
    const fields = fieldsOf(line);
    const tag = fields[0].toLowerCase();
    if (!inside && !["+", "-", "sub", "tot"].includes(tag)) bundle = null;

    if (tag === "sub") {
      const printed = amount(fields[1]);
      if (fields[1] === "-") subtotal = null;
      else if (printed === null) skipped += 1;
      else subtotal = { amount: printed, beforeDiscounts: /^pre$/i.test(fields[2] ?? "") };
      continue;
    }
    if (tag === "tot") {
      const printed = amount(fields[1]);
      if (printed === null) skipped += 1;
      else total = printed;
      continue;
    }
    if (tag === "b") {
      bundle = { name: fields.slice(1).join("|"), items: [], discounts: [] };
      bundles.push(bundle);
      last = null;
      continue;
    }
    if (tag === "-") {
      const off = amount(fields.at(-1));
      if (last === null || off === null || fields.length < 3) {
        skipped += 1;
        continue;
      }
      last.price = (last.price + negative(off)) as Cents;
      last.discounts.push({ name: fields.slice(1, -1).join(" "), amount: negative(off) });
      continue;
    }
    if (tag === "+") {
      if (last === null) {
        skipped += 1;
        continue;
      }
      const addOn = fields.length >= 3 ? amount(fields.at(-1)) : null;
      if (addOn !== null) last.price = (last.price + addOn) as Cents;
      last.details.push((addOn !== null ? fields.slice(1, -1) : fields.slice(1)).join(" ").trim());
      continue;
    }

    const kind = KINDS[tag];
    if (kind === undefined || fields.length < 3) {
      skipped += 1;
      continue;
    }
    const weight = fields.length >= 4 && /^\d*\.\d+$/.test(fields.at(-1)!) && amount(fields.at(-2)) !== null ? fields.pop()! : null;
    const quantity = fields.length >= 4 && whole(fields.at(-1)) !== null && whole(fields.at(-1))! < 1000 && amount(fields.at(-2)) !== null ? whole(fields.pop()) : null;
    const printed = amount(fields.at(-1));
    if (printed === null) {
      skipped += 1;
      continue;
    }
    if (kind === "tip" && printed < 0) {
      skipped += 1;
      continue;
    }
    const name = fields.slice(1, -1).join("|");
    const member = inside ? bundle : null;
    if (kind === "item") {
      last = { name, price: printed, quantity: quantity !== null && quantity > 1 ? quantity : null, details: weight === null ? [] : [weight], discounts: [] };
      items.push(last);
      member?.items.push(items.length - 1);
      continue;
    }
    last = null;
    const signed = kind === "discount" ? negative(printed) : printed;
    if (kind === "discount" && member !== null) member.discounts.push({ name, amount: signed });
    else adjustments.push({ kind, name, amount: signed });
  }

  if (total === null || items.length === 0) return null;
  return { subtotal, total, items: items as unknown as NonEmpty<ReadItem>, bundles, adjustments, skipped };
}

/** The reply for a reading. A Bundle the reading left empty gives its discounts to the whole receipt. */
export function toReply(reading: Reading, check: Check): ScanReply {
  const isFull = (bundle: ReadBundle): bundle is ReadBundle<NonEmpty<number>> => bundle.items.length > 0;
  const orphaned = reading.bundles.filter((bundle) => !isFull(bundle)).flatMap((bundle) => bundle.discounts);
  return {
    items: reading.items,
    bundles: reading.bundles.filter(isFull),
    adjustments: [...reading.adjustments, ...orphaned.map(({ name, amount }) => ({ kind: "discount" as const, name, amount }))],
    subtotal: reading.subtotal,
    total: reading.total,
    check,
  };
}

export type Edited = { readonly lines: string[]; readonly applied: number; readonly refused: { readonly fee: number; readonly total: number } };

/**
 * An item, discount, fee or service line named as a total. Such a receipt line sums other lines (a deposit total, a savings total),
 * so an edit that writes one counts them twice. Tax and tip are exempt, because some receipts print their only tax line as "Total tax".
 */
const isNamedTotal = (line: string) => ["i", "d", "f", "s", "-"].includes(tagOf(line)) && /\btotal\b/i.test(fieldsOf(line)[1] ?? "");

/**
 * Applies pass 2's edits to pass 1's lines, numbered from 1. `after|n` lands below line n's `+` and `-` lines,
 * so an edit never separates an Item from its detail or its discount. A `drop` of a fee or deposit line, or a `fix` that turns it into another kind,
 * is refused as `fee`. An `add`, `after` or `fix` that writes a line named as a total is refused as `total`.
 */
export function applyEdits(lines: readonly string[], text: string): Edited {
  const head: string[] = [];
  const slots: (string | null)[][] = lines.map((line) => [line]);
  const tail: string[] = [];
  let applied = 0;
  const refused = { fee: 0, total: 0 };
  const inRange = (n: number | null): n is number => n !== null && n >= 1 && n <= lines.length;

  for (const edit of replyLines(text)) {
    const fields = edit.split("|");
    const op = fields[0].trim().toLowerCase();
    const n = whole(fields[1]);
    const rest = fields.slice(2).join("|").trim();
    if (["add", "after", "fix"].includes(op) && isNamedTotal(op === "add" ? fields.slice(1).join("|") : rest)) {
      refused.total += 1;
    } else if (op === "sub" || op === "tot") {
      const at = lines.findIndex((line) => tagOf(line) === op);
      if (at >= 0) slots[at][0] = edit;
      else head.push(edit);
      applied += 1;
    } else if (op === "drop" && inRange(n)) {
      if (tagOf(lines[n - 1]) === "f") refused.fee += 1;
      else {
        slots[n - 1][0] = null;
        applied += 1;
      }
    } else if (op === "fix" && inRange(n) && rest) {
      if (tagOf(lines[n - 1]) === "f" && tagOf(rest) !== "f") refused.fee += 1;
      else {
        slots[n - 1][0] = rest;
        applied += 1;
      }
    } else if (op === "after" && inRange(n) && rest) {
      let below = n - 1;
      while (below + 1 < lines.length && ["+", "-"].includes(tagOf(lines[below + 1]))) below += 1;
      slots[below].push(rest);
      applied += 1;
    } else if (op === "add" && fields.length > 1) {
      tail.push(fields.slice(1).join("|"));
      applied += 1;
    }
  }
  return { lines: [...head, ...slots.flat().filter((line): line is string => line !== null), ...tail], applied, refused };
}
