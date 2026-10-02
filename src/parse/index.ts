import { cents, price, type Cents } from "../core/money";
import { adjustmentId, itemId, type Adjustment, type AdjustmentFields, type Item, type Receipt } from "../core/split";
import { runTotalCheck } from "../core/total-check";
import type { TextBox } from "../ocr/types";
import { classifyLines, hasWords, type Line, type Quantity } from "./lines";
import { groupRows } from "./rows";

type DraftItem = Omit<ParsedItem, "id" | "quantity"> & { readonly quantity: Quantity | null; readonly count?: number };

export type ParsedItem = Item & { readonly discountExceededPrice?: true };
type DraftAdjustment = AdjustmentFields;

type Draft = {
  readonly items: DraftItem[];
  readonly adjustments: DraftAdjustment[];
  readonly subtotals: Cents[];
  readonly discountBeforeSubtotal: Cents;
  readonly total: Cents | null;
  readonly laterTotals: Cents[];
};

type Section = "items" | "adjustments" | "closed";

const ONE_READ_AS_SEVEN = 7;

export function parseReceipt(boxes: readonly TextBox[]): Receipt<ParsedItem> | null {
  const lines = classifyLines(groupRows(boxes));
  const readings = [lines, lines.map(strayMinusAsItem)].map(assemble).flatMap((draft) => {
    if (draft.items.length === 0 || draft.total === null) return [];
    const receipt = toReceipt(draft.items, draft.adjustments, subtotalOf(draft, draft.total), draft.total);
    return [receipt, ...repairs(receipt, draft)];
  });
  return readings.find((receipt) => runTotalCheck(receipt).ok) ?? readings[0] ?? null;
}

function strayMinusAsItem(line: Line): Line {
  if (line.kind !== "discount" || line.markedBy !== "minusSign" || !hasWords(line.name)) return line;
  return { kind: "item", name: line.name, price: price(-line.amount), quantity: null };
}

function assemble(lines: readonly Line[]): Draft {
  const items: DraftItem[] = [];
  const adjustments: DraftAdjustment[] = [];
  const subtotals: Cents[] = [];
  const pending: DraftAdjustment[] = [];
  const laterTotals: Cents[] = [];
  let discountBeforeSubtotal = cents(0);
  let total: Cents | null = null;
  let section: Section = "items";
  let previous: Line | null = null;

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
        if (section === "items") items.push(line);
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
      case "discount":
        if (line.appliesTo === "item" && section === "items" && items.length > 0) {
          foldInto(items, line.name, line.amount);
        } else if (!isDiscountTotal(line, adjustments)) {
          adjustments.push({ kind: "discount", name: line.name, amount: line.amount });
          if (subtotals.length === 0) discountBeforeSubtotal = cents(discountBeforeSubtotal + line.amount);
        }
        break;
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
  return { items, adjustments, subtotals, discountBeforeSubtotal, total, laterTotals };
}

function foldInto(items: DraftItem[], name: string, amount: Cents): void {
  const above = items.at(-1);
  if (!above) {
    if (amount >= 0) items.push({ name, price: price(amount), quantity: null });
    return;
  }
  const folded = above.price + amount;
  items[items.length - 1] = folded < 0 ? { ...above, price: price(0), discountExceededPrice: true } : { ...above, price: price(folded) };
}

function isRunningTotal(line: DraftAdjustment, items: readonly DraftItem[], adjustments: readonly DraftAdjustment[], subtotals: readonly Cents[]): boolean {
  if (line.amount === 0) return true;
  const base = subtotals.at(-1) ?? sum(prices(items));
  if (line.amount === base + sum(amounts(adjustments))) return true;
  const taxes = adjustments.filter(({ kind }) => kind === "tax");
  return line.kind === "tax" && taxes.length > 0 && line.amount === sum(amounts(taxes));
}

function isDiscountTotal({ name, amount }: { readonly name: string; readonly amount: Cents }, adjustments: readonly DraftAdjustment[]): boolean {
  const discounts = amounts(adjustments.filter(({ kind }) => kind === "discount"));
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

function repairs(receipt: Receipt<ParsedItem>, draft: Draft): Receipt<ParsedItem>[] {
  const laterTotals = draft.laterTotals.map((later) => ({ ...receipt, total: later }));
  const onesReadAsSevens = draft.items.flatMap(({ quantity }, index) => {
    if (quantity?.count !== ONE_READ_AS_SEVEN) return [];
    const items = draft.items.map((item, i) => (i === index ? { ...item, price: quantity.unitPrice, quantity: null } : item));
    return [toReceipt(items, draft.adjustments, receipt.subtotal, receipt.total)];
  });
  return [...laterTotals, ...onesReadAsSevens];
}

function toReceipt(items: readonly DraftItem[], adjustments: readonly DraftAdjustment[], subtotal: Cents, total: Cents): Receipt<ParsedItem> {
  const [first, ...rest] = items.map(({ name, price: amount, count, discountExceededPrice }, i) => ({
    id: itemId(`i${i + 1}`),
    name,
    price: amount,
    ...(count && { quantity: count }),
    ...(discountExceededPrice && { discountExceededPrice }),
  }));
  return {
    items: [first, ...rest],
    adjustments: adjustments.map(({ kind, name, amount }, i): Adjustment => ({ id: adjustmentId(`a${i + 1}`), kind, name, amount })),
    subtotal,
    total,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const amounts = (rows: readonly { readonly amount: number }[]) => rows.map(({ amount }) => amount);
const prices = (items: readonly DraftItem[]) => items.map((item) => item.price);
