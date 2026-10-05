import type { Reading } from "./format";

const dollars = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const sum = (amounts: readonly number[]) => amounts.reduce((total, amount) => total + amount, 0);
const count = (amounts: readonly unknown[]) => `${amounts.length} line${amounts.length === 1 ? "" : "s"}`;

const SAVINGS_TWICE_RULE = "When the receipt lists the same savings twice, once under each item and again in a summary block, keep the per-item lines and skip the summary block.";

/** The sums the check computed from a reading, as plain text for pass 2, with any exact coincidence between a gap and a group of lines. */
export function arithmeticBreakdown(reading: Reading): string {
  const itemDiscounts = reading.items.flatMap((item) => item.discounts.map((discount) => discount.amount));
  const itemsBefore = sum(reading.items.map((item) => item.price)) - sum(itemDiscounts);
  const bundleDiscounts = reading.bundles.flatMap((bundle) => bundle.discounts.map((discount) => discount.amount));
  const of = (kind: string) => reading.adjustments.filter((adjustment) => adjustment.kind === kind).map((adjustment) => adjustment.amount);
  const [orderDiscounts, fees, service, tax, tip] = [of("discount"), of("fee"), of("serviceCharge"), of("tax"), of("tip")];
  const afterDiscounts = itemsBefore + sum(itemDiscounts) + sum(bundleDiscounts) + sum(orderDiscounts) + sum(fees) + sum(service);
  const allLines = afterDiscounts + sum(tax) + sum(tip);
  const subtotal = reading.subtotal;
  const subtotalCompared = subtotal?.beforeDiscounts ? itemsBefore + sum(fees) + sum(service) : afterDiscounts;
  const subtotalGap = subtotal === null ? null : subtotal.amount - subtotalCompared;
  const totalGap = reading.total - allLines;

  const parts = [
    `items before discounts ${dollars(itemsBefore)} (${count(reading.items)})`,
    `item discounts ${dollars(sum(itemDiscounts))} (${count(itemDiscounts)})`,
    ...(bundleDiscounts.length ? [`bundle discounts ${dollars(sum(bundleDiscounts))} (${count(bundleDiscounts)})`] : []),
    `order discounts ${dollars(sum(orderDiscounts))} (${count(orderDiscounts)})`,
    `fees and deposits ${dollars(sum(fees))}`,
    `service ${dollars(sum(service))}`,
    `tax ${dollars(sum(tax))} (${count(tax)})`,
    `tip ${dollars(sum(tip))}`,
  ];
  const printed = [
    subtotal === null
      ? "no printed subtotal"
      : `printed SUB ${dollars(subtotal.amount)} (${subtotal.beforeDiscounts ? "before" : "after"} discounts) against lines ${dollars(subtotalCompared)}, gap ${dollars(subtotalGap!)}`,
    `printed TOT ${dollars(reading.total)} against all lines ${dollars(allLines)}, gap ${dollars(totalGap)}`,
  ];

  const notes: string[] = [];
  if (itemDiscounts.length && orderDiscounts.length && sum(itemDiscounts) === sum(orderDiscounts))
    notes.push("order discounts equal item discounts exactly: likely a summary block counted twice");
  const lineAmounts = [...reading.items.map((item) => ({ name: item.name, cents: item.price })), ...reading.adjustments.map((adjustment) => ({ name: adjustment.name, cents: adjustment.amount }))];
  for (const gap of new Set([subtotalGap, totalGap].filter((value): value is number => value !== null && value !== 0))) {
    const same = lineAmounts.find((line) => Math.abs(line.cents) === Math.abs(gap));
    if (same) notes.push(`the gap ${dollars(gap)} equals the line "${same.name}": it may be missing, doubled, or a summary line`);
    if (Math.abs(gap) >= 100 && Math.abs(gap) % 100 === 0) notes.push(`the gap ${dollars(gap)} is whole dollars: a misread dollar digit is likely`);
    for (const [label, group] of [
      ["item discounts", itemDiscounts],
      ["order discounts", orderDiscounts],
      ["bundle discounts", bundleDiscounts],
    ] as const)
      if (group.length && Math.abs(gap) === Math.abs(sum(group))) notes.push(`the gap ${dollars(gap)} equals the ${label}: those discounts are likely counted twice or belong to a summary block`);
    if (sum(tax) !== 0 && Math.abs(gap) === Math.abs(sum(tax))) notes.push(`the gap ${dollars(gap)} equals the tax: tax may be missing or counted twice`);
  }

  return [`Sums of the first reading: ${parts.join(", ")}.`, `${printed.join("; ")}.`, ...notes.map((note) => `Note: ${note}.`), SAVINGS_TWICE_RULE].join("\n");
}
