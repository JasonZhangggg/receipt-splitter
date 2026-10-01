# Home page, round 4: less on the page

This is a throwaway prototype. Nothing here is committed. Each idea is one static HTML file rendered by Playwright in Chromium, not the Expo app.

The operator said round 3 had too much text, the payment block took half the screen, the tip did not belong on the empty page, and the upload should be the main thing. This round keeps direction C (warm field, warm-charcoal dark mode, orange only on the action, Archivo) and cuts the empty page to three groups. The upload target comes first. Pay is one row and names are one row. The action sits below them.

## Files

- `ideas.png` is the contact sheet. Each idea has a row of seven shots.
- `idea1.html`, `idea2.html`, and `idea3.html` are the sources. Open one with `?s=empty|reading|read|ready|link&t=light|dark`. Widths of 900 px and up get the desktop layout.
- `shared.js` holds the draft, the Total check, `blocker()` (the one short reason the action is off), and the shared pieces each idea restyles: `payRow()`, `namesRow()`, `receiptBody()`, `actionBlock()`. `shared.css` holds the tokens and the mobile baseline from round 3, plus those pieces.
- `shots/` holds every screenshot, named `idea<n>-<state>-<width>-<theme>.png`. A `-fold` suffix is the 390 by 844 first screen (1280 by 820 on desktop). No suffix is the full page.
- `dropped/` holds the first idea 3 (thumb tile), replaced after the operator's references 4 and 5.
- `capture.mjs` takes the screenshots. `words.mjs` counts the visible words on the empty phone screen. `audit.mjs` checks contrast and tap targets into `audit.json`. `sheet.mjs` builds `ideas.png`. `dbg.mjs` evaluates one expression on one page.

## The draft every idea shows

The Receipt is SRD 1040 (Sukhothai Sushi, five Items, subtotal $22.98). The Perrier price is misread as $3.00 instead of $3.50, so the Items come to $0.50 under the subtotal and the action is blocked with the reason "Items are $0.50 short." The Adjustments are Tax $1.61, Service fee $3.45, and Tip $4.60. The Total is $32.64.

The tip is read from the receipt. SRD 1040 prints no tip amount (its printed total is $28.04), so the draft assumes a handwritten $4.60 to show what a read tip looks like. On a receipt with no tip the same line would read $0.00. The tip line has a dotted underline and a pencil icon, and a tap opens an editor. There is no tip control anywhere else.

## Word count on the empty phone screen

`words.mjs` counts every text node on the 390 by 844 first screen, every input placeholder, and the single glyph in the app picker. It skips the hidden option list inside the native `<select>`.

| Idea | Words | What they are |
| --- | --- | --- |
| 1. Centered card | 15 | Receipt Splitter, Add receipt, Photo or PDF, V, Venmo, @username, Me, Add, Create split link |
| 2. Open table | 16 | The same as idea 1, plus Example |
| 3. Drop zone | 17 | Receipt Splitter, Tap to add receipt, Photo or PDF, V, Venmo, @username, Me, Add, Create split link |

The empty state shows no reason under the disabled action. The only blocker is the receipt, and the target above already asks for it. The read state shows one short reason when the action is blocked.

## Idea 1. Centered card

Point of view. The upload is one big calm card in the middle of the page, and everything else is small and quiet beneath it.

- The card is 350 by 340 px, from y 84 to 424 on the phone. It holds a 96 px camera circle, "Add receipt" at 30 px, and "Photo or PDF".
- Pay is one row with an app picker (a native `<select>` styled as "V Venmo" with a chevron), one handle field, and a 52 px "+" button for another app. A lock was not needed. The picker's accessible name says the handle is saved on this device.
- Names are the "Me" chip and a "+ Add" chip.
- The action bar is fixed at the bottom with a frosted background.
- Read state. The receipt card replaces the upload card in the same place. Pay and names stay below it. The flagged row (y 338) and the Total (y 559) are both on the first screen.
- Desktop. The empty page is a 520 px column with "Drop a receipt". The read page is two columns, with the receipt on the left and pay, names, and the action in a sticky right column.
- Example receipt. None.

## Idea 2. Open table

Point of view. The whole screen above a bottom sheet is the drop target, drawn as a blank paper slip, and the slip becomes the receipt once it is read.

- The target covers everything from the header (y 56) to the top of the sheet (y 621), which is 565 px of tappable space. In the middle is a 148 by 188 px blank slip with a torn bottom edge and a camera circle on it.
- The bottom sheet holds pay, names, and the action in thumb reach. They stay in the same place through every state. The sheet is 223 px tall when empty and 253 px when the reason line shows.
- Reading state. The photo appears inside the slip shape with the scan sweep. Read state. The slip grows into the full receipt with the same torn edge. The flagged row (y 332) and the Total (y 553) sit above the sheet on the first screen.
- Desktop. The page left of a floating 380 px panel is one large drop zone with "Drop a receipt", "Anywhere here. Photo or PDF. Paste works too." The panel holds pay, names, and the action.
- Example receipt. A small "Example" text link with a receipt icon sits in the top right corner. It is muted and 14 px tall, with a 44 px hit area.

## Idea 3. Drop zone

Point of view. The upload is the familiar dashed drop zone from references 4 and 5, and the read progress is a file row under it, so the page looks like the upload screens people already know.

- The zone is 350 by 300 px, from y 84 to 384 on the phone. It has a paper fill, a 2 px dashed border, a 56 px upload circle, "Tap to add receipt" at 22 px, and "Photo or PDF". The phone has no "Browse" button because a tap on the zone already opens the system sheet with Take Photo, Photo Library, and Choose File. On desktop the zone says "Choose a receipt or drop it here" and "Photo or PDF. Paste works too." and has a "Browse" button.
- Reading state. The zone stays and a file row appears under it with the receipt thumbnail, the file name, "Reading", a progress bar, and a cancel button. Pay and names sit below.
- Read state. The zone is replaced by the same file row, now showing "5 items" and a replace button. The receipt card follows. The flagged row (y 400) and the Total (y 621) are on the first screen above the action bar (y 732).
- Desktop. The empty page is a 560 px column. The read page is two columns, with the file row and receipt on the left and pay, names, and the action in a sticky right column.
- Example receipt. None.
- The dashed border measures 3.13:1 against the zone fill in light and 3.39:1 in dark, which passes the 3:1 non-text contrast guideline.

Round 4 first had a different idea 3, a thumb tile (pay and names on top, one tile filling the rest of the screen in thumb reach, 12 words). It was replaced by the drop zone after the operator's new references. Pay and names came before the upload in reading order, which went against the brief. Its source and shots are in `dropped/`.

## Accessibility

`audit.mjs` ran over every idea, both widths, both themes, and all five states (60 pages). Every text element passes WCAG AA. The lowest ratio is 4.91, the muted link text in the link-ready state. Every button, label, input, and select is at least 44 by 44 px. The first audit pass found the item name and price inputs at 43 px and the flagged price at 39 px. Raising their `min-height` to 44 px fixed that, and the rerun is clean.

Other details carried over from the mobile baseline: 16 px inputs, `touch-action: manipulation`, no tap highlight, `viewport-fit=cover` with safe-area padding on the bars and sheet, `theme-color` per scheme, hover styles gated behind `(hover: hover) and (pointer: fine)`, and press feedback on `:active`. The file input accepts `image/*,application/pdf`. On a phone that opens the system sheet with Take Photo, Photo Library, and Choose File. The prototype does not wire drag, drop, or paste. They are only described in the desktop copy.

## Motion, specified but not built

- Press on the upload target. `scale(0.97)` on the camera circle or `scale(0.985)` on the whole card, 120 ms, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Desktop drag over. The drop zone border goes from hairline to ink and the slip lifts 4 px, 150 ms ease-out. It reverts on drag leave in the same time.
- Upload to reading to read. In idea 2 the slip is the shared element. The photo fades into the slip (200 ms), then the slip grows to the receipt's size with a critically damped spring (response 0.35 s, no bounce) while the rows fade in with a 40 ms stagger. With reduced motion this becomes a 200 ms cross-fade.
- Blocked to enabled action. The background color moves from off to orange over 180 ms ease. Nothing moves.
- The scan sweep is a linear loop and is off under reduced motion.

## What was cut from round 3, and why

- The tip section on the empty page. The tip is now an Adjustment line in the read state.
- The four stacked payment fields. They became one row with a picker. Extra apps go behind the "+" button.
- Section kickers ("Receipt", "Pay me on", "Who's there") and the "Optional" labels. The controls name themselves.
- "The photo stays on this phone." It is true and worth saying, but not on the empty page. It could go in the reading state or in a first-run note. This is an open decision.
- "Type it in instead." Manual entry still matters when the reader fails. I would offer it in the failure state and next to the retake button, not on the empty page. This is an open decision.

## Scope addition: accepting a PDF

The operator asked for an upload PDF button. The current plan reads photos with OCR. A PDF has to be rendered to an image (or have its text layer extracted) before OCR can run. That needs a PDF renderer such as pdf.js on the web, plus a choice of which page to read and how to handle a multi-page PDF. This is a scope addition that the root must raise with the operator before any of these ideas ships with "Photo or PDF" on it.

## Recommendation

I recommend idea 3, the drop zone, with two grafts from idea 2.

- It is the pattern the operator pointed to in references 4 and 5, and it is the most familiar upload screen of the three. People know a dashed box means "put a file here" without reading anything.
- The reading state is the clearest of the three. The file row with a thumbnail, a name, and a progress bar says what is happening without a sentence, and the cancel button sits where people expect it.
- Pay and names stay in the normal page flow. There is no bottom sheet taking 253 of 844 px in the read state, so the receipt scrolls like a normal page and a long receipt needs no extra sheet behavior.
- It costs 17 words on the empty phone screen, one or two more than the other ideas, and still well under 25.
- Graft 1 from idea 2. Replace the generic upload-arrow circle inside the zone with idea 2's small blank slip with a torn edge, and use the camera glyph on phones. A plain dashed box with an arrow is the most stock pattern here, and the slip makes it read as this product rather than a file uploader. It adds no words.
- Graft 2 from idea 2. Let the file row's thumbnail use the slip's torn edge too, so the zone, the file row, and the read receipt share one shape. That gives the upload, reading, and read states one element to animate between.

Idea 2 is the most distinctive and has the best thumb reach, but its bottom sheet is a real cost in the read state and needs collapse behavior on long receipts. Idea 1 is the plainest and the easiest to build. Its empty page leaves an unplanned-looking gap between the names and the action on a tall phone.
