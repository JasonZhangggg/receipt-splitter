# Desktop layout

On a window 1024px or wider (`breakpoints.pairFrom`), the Split page stops being the phone column.

## What Jason chose (design rounds 1 to 6, 2026-10-23)

- The receipt on the left, up to 640px wide. The intro says "Click" instead of "Tap" and loses its links row.
- A 440px column on the right, set off by a short vertical line that touches neither the top bar nor the bottom. The top bar has no line.
- By default the column shows "What you had": a menu trigger, then every item the person had, then tax and fees, then a line, then "Your share" with the Pay button beside the amount, then "Paid another way? Mark as paid".
- The trigger opens a menu of everyone with their share, and "Edit people" at the end, which opens the People sheet's content (add, remove, switch account).
- Payments and History are links at the top of the column. The Receipt link joins them when the Split has a photo.
- Every bottom sheet (Edit item, Add, Adjustment, Payments, History, People, the pick) shows in the column instead, not modal, so the receipt stays clickable.

Below 1024px nothing changes.

## Shape

- `SidePanel` holds what a `BottomSheet` holds, fades content in and out over 120ms, and reports `onDown` the way a sheet does, so the page's open and close logic is shared.
- `SurfaceContext` set to `"page"` makes `c.sheet` the page color inside the column, so pinned sheet titles and sheet dots match the ground.
- `PayBody` takes `head` and `beside` for the column's layout. `PayButton` is the pay pill at 44px. `PayBlock compact` keeps the note, the paid line and the link.
