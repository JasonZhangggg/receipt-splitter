# Receipt and home redesign, round 3

The approved design for the post-launch redesign of the Split page receipt and the home page, round 3 of the operator's mockups, approved on 2026-10-01. It is a static sketch, not app code. `docs/plans/receipt-splitter-v2.md` builds from it.

- `round3.html` is the design. Open it in a browser. It loads its fonts from `fonts/` beside it, so this folder works on its own.
- `round3.png` is its contact sheet, at 1x.
- In Figma, round 3 is node 50-2, the target design.
- The receipt photo in the frames is drawn in HTML from made-up lines. No real receipt photo is in this folder.

## Frames

The board has four parts. Each frame's first state is the default state, with nothing picked, selected, or open.

Receipt, phone (390 px).

- 1, default. The pick sheet opens first.
- 1b, pick sheet closed. Both buckets are collapsed.
- 2, Sam picked. Nothing is checked yet.
- 3, first bucket open.
- 4, tap a line. The item sheet opens with its split options.
- 5, Sam's drinks. The second bucket shows who had what and 1 unclaimed.
- 6, View receipt. The home page's photo viewer over the Split page.

Receipt, desktop.

- 1, default. Nobody is picked and the buckets are collapsed. The right pane lists the people.
- 2, Gameplay tapped. The popover hangs from the line, and your share stays in view.
- 3, bucket 2 open. The can nobody checked is yellow.
- 4, View receipt clicked. The home page's photo viewer over the Split page.

Web home, centered column.

- 1440 px, empty.
- 1024 px, empty.
- 1440 px, scanned. The thumbnail opens the photo, and the camera button replaces the photo.
- 1024 px, scanned.
- 1440 px, photo open.

Phone home.

- Empty. No **Example** button.
- Scanned. The compact receipt card.
- Photo open.

## The operator's picks

These come from `~/.claude/orchestrate/receipt-splitter/preferences.md`, rounds 1 to 3.

- On the phone, an Item opens C's bottom sheet with **Evenly**, **By shares**, and **By amount**, and a **Delete item** button.
- On desktop, an Item opens A's popover anchored to its line. A's right pane holds the people and your share.
- A bucket combines C's card with B's collapse. Closed, its header reads as one line with a summary such as "6 drinks · 10% off".
- The bucket header has no leading control, so nobody claims a whole bucket from it. The bucket card uses the same surface as the rows.
- A quantity column starts every row. No row shows an ×. Deleting happens inside the Item's detail.
- The web home is A, the centered column. Before the link exists, home shows a compact receipt card, the Payment handle, and the names. The Item list waits for the Split page.
- The phone home loses the **Example** button.
- Names flow. Type a name and press Enter, and a new input opens with focus. With no names, the chip after the focused input says **+ Add**.
- Tapping the receipt thumbnail opens the photo. The Split page has a **View receipt** button that opens the same viewer.
- The 1024 px home drop box keeps room around its content.

## The indent rule

The operator approved round 3 with one change that the board does not draw. This rule wins over the board.

- Inside a bucket, indent each child row so the child's quantity lines up with the left edge of the parent's name text, such as "Beer Bucket".
- Draw a light vertical line from under the parent's quantity down beside the children.

## Other decisions after the sketch

- The math in `round3.html` is a sketch. `computeShares` and `shareBreakdown` in `src/core/shares.ts` set the real cents.
- The board does not draw a failing Total check on the home page. `docs/plans/receipt-splitter-v2.md` says how home shows it.

## Amendment: no quantity column

The operator removed the quantity column after round 3. This wins over the board and over the indent rule above where they disagree.

- An Item with quantity N shows N rows, one per unit. Each row has its own circle, the Item's name, and the unit price. Guinness x3 at 21.87 shows three rows at 7.29. No row says "1 of 3".
- A line that does not divide evenly gives the extra cents to the first rows: 10.00 for three shows 3.34, 3.33, 3.33.
- A circle claims that unit only. Tapping a row opens the Item sheet for that unit.
- The sheet shows the unit price, with "each" when the Item has more than one unit. A price edit sets the Item's total to that price times the quantity. **Delete item** removes that unit and keeps the claims on the others. The sheet has no quantity stepper.
- The column heads read Item and Price. The header keeps an empty leading slot as wide as the circle column.
- Inside a bucket, the whole child row indents so the child's circle lines up with the left edge of the parent's name text. The light vertical line runs from under the header's leading slot, at the center of the circles above it.

## Amendment: smaller rows

On 2026-10-02 the operator asked for each Item's text and circle a little smaller. Item names and prices, Bundle headers and Bundle children use 14 px on a 20.5 px line, down from 15 on 22. The select circle is 16 px, down from 18, inside the same 44 px tap target. The indent rule and the chevron on the rule still hold.
