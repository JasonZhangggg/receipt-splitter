# Receipt

The receipt card on the Split page `/s/<id>` lists the Receipt one row per unit, grouped by Bundle. An Item with quantity 3 shows three rows, each with its own circle, the Item's name, and the unit price, so Guinness x3 at 21.87 reads as three rows at 7.29. A line that does not divide evenly gives the extra cents to the first rows. The column heads read **Item** and **Price**. No line shows an × or a quantity. A Bundle, such as Topgolf's "Beer Bucket", is one row on the card's surface with the Bundle's name, a summary such as "6 items · 10% off", its net price, and a chevron. It has no claim circle. Every Bundle starts collapsed. Closed, it shows a dot for each person who had something inside it, and a yellow "1 unclaimed" once claiming has started and a unit inside it has no claimer. Open, it lists one row per unit, indented so each row's circle lines up with the left edge of the Bundle's name, with a light vertical line from under the header's empty leading slot down beside them, then its discount, such as "Discount (10%) -4.51". The receipt-level Adjustments (Tax, Tip) stay under the Subtotal. A Bundle's discount shows in a breakdown only for a person who had an Item in that Bundle. Tapping a row opens the Item sheet for that unit, which for a Bundle Item adds a line such as "In Beer Bucket. Its 10% off takes $0.73 off this line." and ends with **Delete item**, which removes that unit only.

## Sub-features

- `receipt-units` shows one row per unit at its unit price, each with its own circle, and no quantity column.
- `receipt-bundle` opens and closes a Bundle in place by tap, Enter, or Space, with `aria-expanded`, and keeps focus on its header.
- `receipt-bundle-flag` shows a closed Bundle's unclaimed units and an open Bundle's yellow lines.
- `receipt-bundle-note` names the Bundle's discount on a Bundle Item's sheet.
- `receipt-delete` deletes an Item from its sheet for every browser, with a History row that **Revert** undoes.

## How to get to it (user POV)

- Open a Split whose Receipt holds a Bundle, such as one made from `e2e/fixtures/topgolf-synthetic.png` on `/`.
- Tap a Bundle's header, or focus it and press Enter or Space.
- Tap a line inside an open Bundle, then **Delete item**.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

One `drive` cannot tap, so these steps run as a Playwright spec or a short Playwright script against the lane's port. `e2e/receipt.spec.ts` is the reference. Run it with `PORT=<port> npx playwright test e2e/receipt.spec.ts`.

- **A Topgolf Split.** `POST /api/splits` with the Receipt in `e2e/receipt.spec.ts` (`topgolf`), which is the Receipt that scanning `e2e/fixtures/topgolf-synthetic.png` produces: Gameplay $87.75, two Beer Buckets with `bundleDiscount` rows of -4.51 and -4.63, Tax $4.94, and Tip $32.26, for $207.29.
- **Read a Bundle (`receipt-bundle`).** The header is a button named `Beer Bucket, 6 items, 10% off, collapsed`, with `aria-expanded="false"` and `aria-controls` naming the region of its Items. Press Enter on it. The name ends in `expanded`, focus stays on it, and the region holds three buttons named `Open Guinness Draught 14.9oz Can, $7.29, nobody had it`. A closed region holds no list. Once someone claims, the header name adds who had what and the count, such as `Beer Bucket, 6 items, 10% off, had by Sam, 5 unclaimed, collapsed`. Space closes it. Save an ARIA snapshot of the card with `page.getByTestId("receipt").ariaSnapshot()`.
- **Flag (`receipt-bundle-flag`).** Pick Sam and check Gameplay. Each closed header shows its unclaimed units in yellow, "6 unclaimed" on the first Bundle. A closed Bundle shows nothing unclaimed before any line is checked.
- **Note and delete (`receipt-bundle-note`, `receipt-delete`).** Open the first Bundle and tap the first Guinness row. The dialog named `Item` reads "In Beer Bucket. Its 10% off takes $0.73 off this line.", its `Price` reads 7.29 with "each" beside it, and it has one group `Who had it`. Tap **Delete item**. The sheet closes, two Guinness rows stay with their claims, and the header reads `Beer Bucket, 5 items, 10% off, ...` in every browser. History shows it as a price change of the Guinness line, 21.87 to 14.58. Delete a one-unit Item, such as the Michelob Ultra, and History reads "Removed Michelob Ultra 16oz Aluminum Bottle and 1 more", because the delete also edits the Bundle. Its button **Revert Removed Michelob Ultra 16oz Aluminum Bottle** brings it back.

## Gotchas

- The summary counts units, not lines. The first Bundle has four lines and six units.
- A Bundle's Items render only while it is open, so open it before looking for a line inside it.
- The header's net price is the Items' sum plus the discount, so it is not any printed line on the receipt.
- The desktop popover and right pane come in V2-4. Drive this at 390 px.
