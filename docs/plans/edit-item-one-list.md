# Edit item: one list for who had it and how to split

One PR. The operator picked the design from static mocks on 2026-10-22 (layout A, quantity as "2×" before the name, money field F).

## Intent

**Problem.** Edit item listed every name twice: once as dot toggles under "Who had it", again as rows under "How to split" with three tabs, a hint line and a status line. A quantity line put "Quantity 2 · Split into 2" in a row of its own, and the price field pinned its "$" to the left edge of a wide field, so a short price left a gap.

**Solution.**

- [ ] One "Who had it · $price" section. Each person is one row, the viewer first: the dot toggle on the left, their part on the right (amount, stepper and amount, or amount field), or a gray "Didn't have it".
- [ ] The mode is an underlined link with a chevron at the section head. It opens a popover menu of Evenly, By shares and By amount, each with a one-line description. The page owns the popover, as it does the person menu, and Escape closes it before the sheet.
- [ ] The status line reads "Split N ways", "You pay all of it" or "<name> pays all of it", "N shares in all", "Tap who had it.", and over the price offers "Make <name> $<amount>".
- [ ] A quantity line shows "N×" in gray before the name inside the name field, and a "Split into N" link with the new fork icon under the name.
- [ ] Money fields put the unit 8 px before the digits, the same gap as "N×", and grow leftward with the number from a minimum width.

**Out of scope.** Add item's own fields, and any money logic.

## Evidence

- Unit tests and typecheck.
- Before/after screenshots at 390 px, light and dark, from `verify-receipt-splitter`.
- The e2e specs that drive the mode now go through the menu (`e2e/split-mode.ts`).
