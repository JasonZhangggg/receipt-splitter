# Spread layout

The Split page's look from design rounds 6 to 9 (2026-10-23). Jason picked it in the round-6 mock: "Spread, bigger items", then "No paid-by line", "Small line under the name", "Number with the share bar", "Share bar, no 21%" and "Pay centered on your share", with the original text weights. The mock is `.claude/ui-proposals/` round 6 (published as an artifact in the design thread).

It started from a bug report: at about 2000px wide nothing is centered, and the receipt's scroll bar sits in the middle of the page, because a flex-1 ScrollView holds a centered 640px column and the 440px column is pinned to the right edge.

One PR on `claude/project-thread-80frtv`, built in the commit order below so each step can be checked on its own.

## Behavior

### Everywhere

1. **Title.** The top of the page is the place in large type: 46px on a phone, 68px on desktop, weight 500, tight tracking. A Split with no place shows its total instead, such as "$152.10". A place over 24 characters drops to 34px on a phone and 48px on desktop, so it reads whole in two or three lines. Three lines is the cap, ending in "…", and a word wider than the column breaks (option B of the long-name shots on 2026-10-23).
2. **Paid-by line.** Under the title, one muted line: "Paid by Jason". The Host's name is in ink (white in dark mode), the rest muted. The mock's "on Oct 21" needs a date the Split doesn't store yet, so it waits for a storage change.
3. **No hint sentence.** "Tap the dot next to what you had. Tap a line to edit it or split it another way." goes, on both sizes. The intro sentence "Jason paid $152.10 at Golden Lotus." goes too, since the title and paid-by line say it.
4. **Bigger rows.** An Item's name and price are 18px on a phone and 21px on desktop, weight 500. A row the viewed person had is in ink. Every other row is muted, and turns ink on hover. The split line under the price ("$6.00 yours") stays small and muted. Rule 20 changes to match.
5. **Filters.** The list can show All, Yours ("Sam's" while viewing Sam), Nobody yet (no one on the line, so a By amount line with money left over isn't in it), or Shared (two or more people). Yours shows only once a name is picked. Each choice shows its count, one per line whatever its quantity. A Bundle stays while any of its lines shows, holding only those. The charges and the Total show only under All. An empty filter shows one muted line: "Nothing checked yet.", "Every item has someone." or "No item is shared yet." The choice is per page view and resets to All on reload.

### Phone (below 1024px)

6. **Links.** Receipt (when the Split has a photo), People, Payments and History stay as underlined links under the paid-by line.
7. **Items line.** "Items" with "3 of 10 yours" in muted text on the left. On the right, a "Show all 10" button with a chevron opens a small menu of the four filters with their counts and a tick on the current one. Picking one closes the menu and the button reads its name, such as "Nobody yet 3". The count is the same size as the label and sits on the same line, never raised.
8. **Footer.** Three parts:
   - "Your share" with a small up chevron, muted, at 15px.
   - Under it, the amount at 46px.
   - On the right, the Pay pill ("Pay Jason" and an arrow), centered against the label and the amount together.
   - Under them, a thin full-width bar in three parts: the viewed person's share (ink), everyone else's (gray), and what is still unclaimed (the track).
   The "2 of 10 items · incl. tax & tip" text goes. A paid state in words, when there is one, sits under the bar.

### Desktop (1024px and wider)

9. **One centered frame.** A 680px receipt column and a 420px column, 112px apart, centered in the window as one block. Below 1280px the column is 380px and the gap 56px, and the frame shrinks to the window less 48px each side. The whole page scrolls as one, with the browser's own scroll bar at the window edge. The right column is sticky at the top. The vertical rule between the columns goes.
10. **Top bar.** The wordmark on the left of the frame. Receipt, People, Payments and History as plain links on the right, before the theme and Share icons. The column head loses its Payments and History links.
11. **Filter tabs.** Over the list, "All 10", "Yours 3", "Nobody yet 3" and "Shared 2" as text tabs, the current one in ink with a 1.5px underline, and "PRICE" in small caps on the right. Counts are the same size as their labels.
12. **Who column.** From 1280px, each row has a third column, 150px, in small uppercase caps: who had it ("YOU, LEE", with the viewed person in ink), then the split mode when it isn't even ("SPLIT 2 WAYS", "BY SHARES"). The phone keeps the who line under the name.
13. **Share head.** At the top of the right column: "Your share" with a down chevron, at 17px muted sentence case, which opens the people menu. Under it the amount at 68px, aligned with the title on the left. Under that, the three-part bar and a legend: "You", "Everyone else", "Unclaimed $41.24".
14. **What you had.** Under the share head, as today: the Items and the charges, then "Your total" at body size and the pay block. The pay block keeps the app's pay pill and method picker (rule 75); the mock's "Pay with" tabs were a stand-in.

## Shape

- Filters are pure functions in `src/ui/split-view/model.ts`: `filterRows(rows, filter, viewer)`, `filterCounts(items, viewer)` and `itemFilters(viewer)`, with `type ItemFilter = "all" | "mine" | "none" | "shared"`. The page keeps the current filter in state. The tabs and the menu render from one table of filters, so labels and counts can't drift.
- The share bar is one component, `ShareBar`, taking the three amounts in cents from `billParts(shares, viewer)`. The phone footer and the desktop share head both use it.
- The wide branch of `app/s/[id].tsx` becomes one ScrollView whose content is the centered frame, with the right column `position: sticky` (web).

## Out of scope

Editing the place. The mock's "Pay with" tabs. Any change to sheets, People, Payments or History content.

## Checks

- [ ] Unit: `filterItems` and `filterCounts` for each filter, including a By amount line with money left over, a quantity line and a Bundle.
- [ ] e2e: the phone menu and the desktop tabs filter the list, and Total shows only under All.
- [ ] e2e: on desktop at 2000x900, the frame is centered (equal space each side within a few px) and the page has one scroll container.
- [ ] Live (`verify-receipt-splitter`): phone 412 and desktop 1280, 1600 and 2000, light and dark, with a claimed and an unclaimed row, the menu open, a filter picked, and a paid state.
- [ ] `npm run typecheck`, lint, unit and the touched e2e specs pass locally. CI runs the full e2e.
