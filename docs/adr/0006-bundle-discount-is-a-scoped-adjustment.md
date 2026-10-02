# A Bundle is a discount Adjustment that names its Items

Some receipts print a group of Items under a $0.00 header, then a discount for that group alone, such as Topgolf's "Beer Bucket" with four drinks and "Beer Bucket Discount (10%)". Before this decision the discount was a receipt-level Adjustment, so everyone paid part of the beer discount, Gameplay included. We model the group as an Adjustment of kind `bundleDiscount` that carries `bundle: { name, items: NonEmpty<ItemId> }`. Its amount divides only among the people who Claimed units of those Items, in proportion to their prices. The $0.00 header is not stored as an Item. Its name lives on the Bundle.

## Considered options

- A `bundles` list on the Receipt, each Bundle owning its Items and its discount. It mirrors the printed receipt more closely, but it needs a new Write kind, new History rows, a new edit path, and a change to the Total check. The Adjustment already has all four.
- Folding the discount into each Item's price at parse time. It needs no schema change, but every price then differs from the printed one and the discount row disappears from the Split page, which the approved design shows.
- An optional `items?` on every Adjustment, as the parser PR proposed. A tax or a tip that names Items has no meaning here, so the scope belongs to one kind. A new kind also makes every exhaustive `switch` on `AdjustmentKind` fail to compile until it handles Bundles.
- Keeping the $0.00 header as an Item. Anyone could Claim it, and its row would add a Unit that costs nothing.

## Consequences

- The part of the receipt-level Adjustments, such as tax and tip, that a Participant pays is proportional to their Claimed Items net of their Bundle discount portions.
- Deleting an Item drops it from its Bundle in the same Change. Deleting a Bundle's last Item removes its discount in the same Change, so a Bundle never names a missing Item, and one Revert brings both back.
- A stored Split that holds a Bundle is `schemaVersion: 2`, per ADR 0004's rule. A Worker that reads version 2 ships one deploy before any Worker writes it, so rolling back the writer never makes a live Split unreadable.
- Bundle detection is conservative. A discount that echoes the header but prints no percent, or a garbled one, stays receipt-wide. A coincidental run can pull a nearby Item into a Bundle. A $0.00 modifier inside a group drops the Bundle, which fails safe to receipt-wide.
