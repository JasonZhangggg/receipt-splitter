# Split page, round 8

This is a throwaway mockup board, not app code. `board.html`, `board.css` and `board.js` draw every frame from one Split model with `render(state)`. Serve the folder with `python3 -m http.server 8981` and open `/board.html`. `node capture.mjs` takes the screenshots. Round 7 in `../split7/` is untouched.

The board applies the operator's answers to round 7. The colors are still the approved home tokens. Spacing and type changed everywhere (see below).

## Numbers

| Person | Items | Tax | Service fee | Tip | Total |
| --- | --- | --- | --- | --- | --- |
| Jason | Chicken Fried Rice 7.99, half of Tostones 0.50 | 0.59 | 1.27 | 1.70 | 12.05 |
| Sam | California Tropic 7.99, half of Tostones 0.50 | 0.59 | 1.27 | 1.70 | 12.05 |
| Priya (paid) | Sprite 2.50 | 0.18 | 0.38 | 0.50 | 3.56 |
| Unclaimed | Perrier 3.50 | 0.25 | 0.53 | 0.70 | 4.98 |

Together they make $32.64. Nobody pays the unclaimed $4.98. It sits under the Total in yellow until someone checks Perrier. I2 shows Tostones split 2:1 ($0.67 and $0.33) and by amount ($0.75 and $0.25). Both add up to the $1.00 price because of largest-remainder rounding. I3 shows Sprite at $2.75, so the Items are $0.25 over the printed $22.98 subtotal and the warning shows.

## Spacing and type (possible app-wide token change)

Inputs stay at 16 px, because iOS zooms the page into any input under 16 px.

| Token | Round 7 | Round 8 |
| --- | --- | --- |
| Page side gutter | 20 px | 22 px |
| Header height | 56 px | 60 px |
| Receipt card padding | 14 / 18 / 18 px | 18 / 20 / 20 px |
| Receipt card radius | 20 px | 22 px |
| Item row height | 48 px | 52 px |
| Tax, fee and tip row height | 32 px | 34 px |
| Sheet padding (top / sides / bottom) | 8 / 20 / 28 px | 10 / 22 / 30 px |
| Gap between sheet blocks | 12 px | 14 px |
| Name row in the pick sheet | 56 px tall, 8 px apart | 58 px tall, 10 px apart |
| Fields | 52 px, radius 14 | 54 px, radius 16 |
| Gap between paired buttons and wrapped chips | 8 px | 10 px |
| Headline ("Which one are you?") | 28 px | 26 px |
| Total and "You owe" amount | 28 px | 26 px |
| Wordmark | 18 px | 17 px |
| Merchant name | 17 px | 16 px |
| Body, Items, button labels | 16 px | 15 px |
| Chips | 15 px | 14 px |
| Secondary text, tax/fee/tip rows | 15 px | 14 px |
| Hints, meta lines | 13 px | 12.5 px |
| Inputs | 16 px | 16 px (unchanged) |

The chip row on the split page keeps an 8 px gap. At 10 px, four names plus "+" no longer fit on a 390 px phone.

## Decisions

**Tapping a line opens the Item. The circle on its left checks it off.** The operator asked for a tapped line to open its detail. Making people open a sheet for every claim would slow claiming down. So the left 44 px of each line is a checkbox circle, the way Reminders works. It toggles the line for the selected chip. Everything else on the line opens the Item sheet. The hint reads "Check what you had".

**The Item sheet** (I1, I2) holds the name, the price, a quantity stepper, and "Who had it" as chips with a "+" to add a person. A three-way control sets the split: Evenly, By shares (a stepper per person), and By amount (a dollar field per person). Under By amount, a line says "Adds up" or how much is left. Edits save as you go, with no Save button. The ✕ closes the sheet.

**History opens from a clock icon in the header**, beside Share. It is a sheet listing each change with who made it and when. Each change can be reverted once. Reverted changes stay in the list, dimmed, marked "Reverted". "Created the split" can't be reverted.

**Losing a pick.** A picked name can't be tapped straight through. Tapping it opens "Picked on another phone." with "That's me" and Cancel (C2). "That's me" moves the name to this phone, and the old phone drops back to browsing. The move is a History entry, so a wrong takeover is one Revert away. That is the only protection. There are no accounts, so anyone could press "That's me".

**Closing without picking.** The tall sheet has a ✕, and a flick down also closes it. The page then shows K: no chip selected, no "you" mark, and the sheet asks "Pick your name to check off what you had." with a "Which one are you?" pill that reopens the tall sheet. Lines still open their Item. Tapping a circle reopens the tall sheet.

**The mismatch warning** uses home's exact style. It is a yellow mark under the Items: "Items are $0.25 over." The Subtotal row keeps the printed $22.98.

**Who can do what.** Participants can add people (the "+" chip), not remove or rename them. Only you can mark yourself paid, with "I already paid" on your own breakdown. Other people's breakdowns show Paid or Not paid with no buttons.

**The creator** types their own name on home with the others. In B, Jason picks Jason. "Not here? Add yourself" stays at the bottom of the shared sheet for guests the creator didn't list. The creator doesn't need it.

## New details in round 8 (veto any)

1. The circle on the left of each line is the claim checkbox. The rest of the line opens the Item.
2. The hint text changed from "Tap what you had" to "Check what you had".
3. The clock icon for History sits in the header, left of Share.
4. Reverted History entries stay in the list, dimmed, with a "Reverted" label. Each change reverts once. "Created the split" has no Revert.
5. "That's me" with Cancel, inline in the picked row, plus a History entry for the move.
6. In K, the line "Pick your name to check off what you had." and a "Which one are you?" pill.
7. Tapping a circle in K reopens the pick sheet.
8. In the Item sheet: "Who had it" chips with a "+", the split labels "Evenly", "By shares" and "By amount", a share count line, and the "Adds up" or "$X left" line.
9. Item edits save as you go. ✕ closes the sheet, with no Save button.
10. The Unclaimed figure includes the item's share of tax, fee and tip ($4.98, not $3.50), so the people and Unclaimed add up to the Total.
11. A shares split shows its ratio beside the line name on the receipt (for example "2:1"). An amount split shows "split".
12. Motion for the new parts: the segment slides in 200 ms ease-out, split rows cross-fade in 150 ms, and Revert dims its row in 150 ms. All sheets use the same 0.35 s critically damped spring. Reduced motion turns every sheet into a 200 ms cross-fade.

Round 7 details that remain: the share icon in the header, "Link ready." for the creator, the 80 ms check before collapse, the "you" tag in the chip, outlined chips for people nobody has picked, initial dots, "½ of 1.00" in breakdowns, Paid and Not paid pills, and the creator sorting first.

## Open questions

1. Quantity. With quantity 2 and two people, should "Who had it" split per unit (one each) or split the line total? The board only draws quantity 1.
2. Should a Revert ask anything when the change came from someone else? The board reverts with one tap.
3. When an amount split doesn't add up ("$0.10 left"), should that remainder count toward Unclaimed? The board doesn't draw that state.

## Not done

- The Figma `html-to-design/capture.js` tag is not in `board.html`. Round 7's attempt to add it was refused by the sandbox.
- Nothing animates. These are static frames, and no motion was tried on a phone.
