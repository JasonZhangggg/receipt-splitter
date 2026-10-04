import { cents, price, type Cents } from "../core/money";
import { adjustmentId, itemId, type Adjustment, type AdjustmentFields, type Item, type NonEmpty, type Receipt } from "../core/split";
import { runTotalCheck } from "../core/total-check";
import type { TextBox } from "../ocr/types";
import { classifyLines, echoes, hasWords, type Line, type Quantity } from "./lines";
import { groupRows } from "./rows";

type DraftItem = Omit<Item, "id" | "quantity"> & { readonly quantity: Quantity | null; readonly count?: number };

type ReceiptLevelDraft = Exclude<AdjustmentFields, { readonly kind: "bundleDiscount" }>;
type BundleDiscountDraft = { readonly kind: "bundleDiscount"; readonly name: string; readonly amount: Cents; readonly bundle: { readonly name: string; readonly itemIndexes: NonEmpty<number> } };
type DraftAdjustment = ReceiptLevelDraft | BundleDiscountDraft;

type Draft = {
  readonly items: DraftItem[];
  readonly adjustments: DraftAdjustment[];
  readonly subtotals: Cents[];
  readonly discountBeforeSubtotal: Cents;
  readonly total: Cents | null;
  readonly laterTotals: Cents[];
  readonly droppedDiscountTotal: boolean;
};

type DiscountTotals = "drop" | "keep";

type Header = { readonly name: string; readonly at: number };

const PERCENT = /(\d{1,2}(?:\.\d{1,2})?)\s?%/;

type Section = "items" | "adjustments" | "closed";

const ONE_READ_AS_SEVEN = 7;

export function parseReceipt(boxes: readonly TextBox[]): Receipt | null {
  const lines = classifyLines(groupRows(boxes));
  const readings = [lines, lines.map(strayMinusAsItem)].flatMap(readingsOf).flatMap((draft) => {
    if (draft.items.length === 0 || draft.total === null) return [];
    const receipt = toReceipt(draft.items, draft.adjustments, subtotalOf(draft, draft.total), draft.total);
    return [receipt, ...repairs(receipt, draft)];
  });
  return readings.find((receipt) => runTotalCheck(receipt).ok) ?? readings[0] ?? null;
}

function readingsOf(lines: readonly Line[]): Draft[] {
  const dropped = assemble(lines, "drop");
  return dropped.droppedDiscountTotal ? [dropped, assemble(lines, "keep")] : [dropped];
}

function strayMinusAsItem(line: Line): Line {
  if (line.kind !== "discount" || line.markedBy !== "minusSign" || !hasWords(line.name)) return line;
  return { kind: "item", name: line.name, price: price(-line.amount), quantity: null };
}

function assemble(lines: readonly Line[], discountTotals: DiscountTotals): Draft {
  const items: DraftItem[] = [];
  const adjustments: DraftAdjustment[] = [];
  const subtotals: Cents[] = [];
  const pending: DraftAdjustment[] = [];
  const laterTotals: Cents[] = [];
  let discountBeforeSubtotal = cents(0);
  let droppedDiscountTotal = false;
  let total: Cents | null = null;
  let section: Section = "items";
  let previous: Line | null = null;
  let header: Header | null = null;

  for (const line of lines) {
    if (section === "closed") {
      if (line.kind === "tax" || line.kind === "tip" || line.kind === "serviceCharge") pending.push(line);
      if (line.kind !== "total" || total === null) continue;
      if (pending.length > 0 && line.amount === total + sum(amounts(pending))) {
        adjustments.push(...pending.splice(0));
        total = line.amount;
      } else {
        laterTotals.push(line.amount);
      }
      continue;
    }
    switch (line.kind) {
      case "item":
        if (section !== "items") break;
        if (line.price === 0) header = { name: line.name, at: items.length };
        items.push(line);
        break;
      case "modifier":
        if (section === "items") foldInto(items, line.name, line.price);
        break;
      case "quantity":
        if (section !== "items") break;
        if (previous?.kind === "noise" && hasWords(previous.text)) {
          items.push({ name: previous.text, price: line.price, quantity: line.quantity });
        } else if (items.length > 0) {
          items[items.length - 1] = { ...items[items.length - 1], price: line.price, quantity: line.quantity };
        }
        break;
      case "discount": {
        const size = header && section === "items" ? bundleSize(items, header, line) : null;
        if (line.appliesTo === "item" && section === "items" && items.length > 0) {
          foldInto(items, line.name, line.amount);
        } else if (header && size) {
          const { name, at } = header;
          items.splice(at, 1);
          const [first, ...rest] = Array.from({ length: size }, (_, i) => at + i);
          adjustments.push({ kind: "bundleDiscount", name: line.name, amount: line.amount, bundle: { name, itemIndexes: [first, ...rest] } });
          if (subtotals.length === 0) discountBeforeSubtotal = cents(discountBeforeSubtotal + line.amount);
          header = null;
        } else if (discountTotals === "drop" && isDiscountTotal(line, adjustments)) {
          droppedDiscountTotal = true;
        } else {
          adjustments.push({ kind: "discount", name: line.name, amount: line.amount });
          if (subtotals.length === 0) discountBeforeSubtotal = cents(discountBeforeSubtotal + line.amount);
        }
        break;
      }
      case "subtotal":
        subtotals.push(line.amount);
        section = "adjustments";
        break;
      case "tax":
      case "tip":
      case "serviceCharge":
        section = "adjustments";
        if (!isRunningTotal(line, items, adjustments, subtotals)) adjustments.push(line);
        break;
      case "total":
        total = line.amount;
        section = "closed";
        break;
      case "noise":
        break;
      default:
        line satisfies never;
    }
    previous = line;
  }
  return { items, adjustments, subtotals, discountBeforeSubtotal, total, laterTotals, droppedDiscountTotal };
}

/** How many Items under the header the discount covers: the run whose sum its printed percent turns into the discount, or null when no run does. */
function bundleSize(items: readonly DraftItem[], header: Header, discount: { readonly name: string; readonly amount: Cents }): number | null {
  const percent = Number(PERCENT.exec(discount.name)?.[1]);
  if (!percent || items[header.at].price !== 0 || !echoes(discount.name, header.name)) return null;
  let covered = 0;
  for (let end = header.at + 1; end < items.length; end++) {
    covered += items[end].price;
    if (Math.abs((covered * percent) / 100 + discount.amount) < 1) return end - header.at;
  }
  return null;
}

function foldInto(items: DraftItem[], name: string, amount: Cents): void {
  const above = items.at(-1);
  if (!above) {
    if (amount >= 0) items.push({ name, price: price(amount), quantity: null });
    return;
  }
  const folded = above.price + amount;
  items[items.length - 1] = { ...above, price: price(Math.max(folded, 0)) };
}

function isRunningTotal(line: ReceiptLevelDraft, items: readonly DraftItem[], adjustments: readonly DraftAdjustment[], subtotals: readonly Cents[]): boolean {
  if (line.amount === 0) return true;
  const base = subtotals.at(-1) ?? sum(prices(items));
  if (line.amount === base + sum(amounts(adjustments))) return true;
  const taxes = adjustments.filter(({ kind }) => kind === "tax");
  return line.kind === "tax" && taxes.length > 0 && line.amount === sum(amounts(taxes));
}

function isDiscountTotal({ name, amount }: { readonly name: string; readonly amount: Cents }, adjustments: readonly DraftAdjustment[]): boolean {
  const discounts = amounts(adjustments.filter(({ kind }) => kind === "discount" || kind === "bundleDiscount"));
  return /\btotal\b/i.test(name) && discounts.length > 0 && amount === sum(discounts);
}

function subtotalOf({ items, adjustments, subtotals, discountBeforeSubtotal }: Draft, total: Cents): Cents {
  const itemsSum = sum(prices(items));
  const read = [subtotals.at(-1), subtotals.length > 1 ? sum(subtotals) : undefined]
    .filter((amount) => amount !== undefined)
    .map((amount) => amount - discountBeforeSubtotal);
  if (read.length === 0) return cents(total - sum(amounts(adjustments)));
  return cents(read.find((amount) => amount === itemsSum) ?? read[0]);
}

function repairs(receipt: Receipt, draft: Draft): Receipt[] {
  const laterTotals = draft.laterTotals.map((later) => ({ ...receipt, total: later }));
  const onesReadAsSevens = draft.items.flatMap(({ quantity }, index) => {
    if (quantity?.count !== ONE_READ_AS_SEVEN) return [];
    const items = draft.items.map((item, i) => (i === index ? { ...item, price: quantity.unitPrice, quantity: null } : item));
    return [toReceipt(items, draft.adjustments, receipt.subtotal, receipt.total)];
  });
  return [...laterTotals, ...onesReadAsSevens];
}

function toReceipt(items: readonly DraftItem[], adjustments: readonly DraftAdjustment[], subtotal: Cents, total: Cents): Receipt {
  const [first, ...rest] = items.map(({ name, price: amount, count }, i) => ({
    id: itemId(`i${i + 1}`),
    name,
    price: amount,
    ...(count && { quantity: count }),
  }));
  return {
    items: [first, ...rest],
    adjustments: adjustments.map((row, i): Adjustment => {
      const id = adjustmentId(`a${i + 1}`);
      if (row.kind !== "bundleDiscount") return { id, kind: row.kind, name: row.name, amount: row.amount };
      const [first, ...rest] = row.bundle.itemIndexes.map((index) => itemId(`i${index + 1}`));
      return { id, kind: row.kind, name: row.name, amount: row.amount, bundle: { name: row.bundle.name, items: [first, ...rest] } };
    }),
    subtotal,
    total,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const amounts = (rows: readonly { readonly amount: number }[]) => rows.map(({ amount }) => amount);
const prices = (items: readonly DraftItem[]) => items.map((item) => item.price);
