import { formatCents } from "./money";

export const copy = {
  wordmark: "Receipt Splitter",
  headline: ["Split the bill", "at the table."],
  pitch: "Take a photo of the receipt and send the link. Everyone taps what they ordered and pays you back.",
  action: "Scan or upload a receipt",
  privacy: "The photo stays on your phone.",
  exampleKicker: "Example scan",
  flagNote: "Check this price.",
  total: "Total",
};

export const example = {
  merchant: "Nonna Rosa",
  detail: "Table 12, Sep 29, 8:41 PM",
  items: [
    { name: "Margherita pizza", cents: 1800 },
    { name: "Caesar salad", cents: 1250 },
    { name: "Spicy rigatoni", cents: 2100 },
    { name: "Lemonade pitcher", cents: 1400 },
    { name: "Tiramisu", cents: 850, flagged: true },
  ],
  subtotal: 7500,
  adjustments: [
    { name: "Tax", cents: 666 },
    { name: "Tip 20%", cents: 1500 },
  ],
};

const sum = (rows: { cents: number }[]) => rows.reduce((total, row) => total + row.cents, 0);
const itemsSum = sum(example.items);

export const summaryRows = [{ name: "Subtotal", cents: example.subtotal }, ...example.adjustments];
export const totalCents = example.subtotal + sum(example.adjustments);
export const shortfallLine = `Items add up to ${formatCents(itemsSum)}, ${formatCents(example.subtotal - itemsSum)} short of the subtotal.`;

export const fallbackSamples = {
  800: [...copy.headline, example.merchant, copy.total, ...example.items.map((item) => formatCents(item.cents)), formatCents(totalCents)],
  500: [
    copy.wordmark.toUpperCase(),
    copy.pitch,
    copy.action,
    copy.privacy,
    copy.exampleKicker.toUpperCase(),
    example.detail,
    ...example.items.map((item) => item.name),
    copy.flagNote,
    ...summaryRows.flatMap((row) => [row.name, formatCents(row.cents)]),
    shortfallLine,
  ],
};
