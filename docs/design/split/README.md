# Split page design

> The B2 design in `docs/design/b2/` supersedes this one wherever the two differ.

The approved design for the Split page `/s/[id]`, round 8 of the operator's split-page mockups, approved on 2026-10-01. This is a static sketch, not app code. RS-10 and RS-11 build from it.

- `board.html` is the design. It draws every frame from one Split model with `render(state)` in `board.js`. Serve the repository root over HTTP and open `docs/design/split/board.html`. The fonts load from `../home/fonts/`, so this folder does not work on its own.
- `board.png` is its contact sheet, at 1x.
- `notes.md` holds the worked numbers, the spacing and type table, the decisions, and the open questions of round 8.
- The Figma file is `https://www.figma.com/design/rUCjp4g9qO5erLgaXSe5pO`. Round 8 is node 17-2. Round 7 is node 14-2.

The frames are lettered. A is home with names only. B, C, C2, D, and the dark J-C are the tall pick sheet. E is the collapse to the regular sheet. K is browsing without a pick. F is claiming. G and H are breakdowns. I1 and I2 are the Item sheet. I3 is History.

Changes after the sketch, decided by the operator. They win wherever `notes.md` or the board says otherwise.

- With quantity above 1, **Who had it** splits each unit, not the line total. The board draws quantity 1 only.
- Reverting someone else's change asks for confirmation first. The board reverts with one tap.
- A remainder left by a **By amount** split counts as Unclaimed.
- History shows only Payments and manual Receipt changes. It shows no picks, joins, added people, or Claims. The board's "Checked Sprite" and "Took Sam on a new phone" rows are not built. A wrong **That's me** is fixed by the real person tapping **That's me** again, not by a Revert.
- The math in `board.js` is a sketch. `computeShares` and `shareBreakdown` in `src/core/shares.ts` set the real cents.
