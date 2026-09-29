export type SampleItem = { id: string; name: string; cents: number; flagged?: boolean };

export const sample = {
  merchant: "Nonna Rosa",
  detail: "Table 12, Sep 29, 8:41 PM",
  items: [
    { id: "1", name: "Margherita pizza", cents: 1800 },
    { id: "2", name: "Caesar salad", cents: 1250 },
    { id: "3", name: "Spicy rigatoni", cents: 2100 },
    { id: "4", name: "Lemonade pitcher", cents: 1400 },
    { id: "5", name: "Tiramisu", cents: 850, flagged: true },
  ] as SampleItem[],
  subtotal: 7500,
  tax: 666,
  tip: 1500,
  total: 9666,
};

export const itemsSum = sample.items.reduce((sum, item) => sum + item.cents, 0);
export const gap = sample.subtotal - itemsSum;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (cents: number) => usd.format(cents / 100);
export const bare = (cents: number) => (cents / 100).toFixed(2);

export const copy = {
  pitch: "Take a photo of the receipt and send the link. Everyone taps what they ordered and pays you back.",
  privacy: "The photo stays on your phone.",
  scan: "Scan a receipt",
  scanHint: "Camera or photo library",
  sampleLabel: "Sample receipt",
  short: `Items add up to ${money(itemsSum)}, ${money(gap)} short of the subtotal.`,
  fix: "Check the highlighted price.",
};
