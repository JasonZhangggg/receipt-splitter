# B2 design

B2 is the redesign of the Split page and home that the operator settled on 2026-10-14, on the claude.ai design canvas (artboards "B2 · Sheets" and "B2 · Start a split"). This folder is the spec the B2 plan builds from. It is a static mock, not app code.

- `split.dc.html` and `home.dc.html` are the mock sources. Each holds the markup, the CSS (every token, size and motion value) and a `class Component extends DCLogic` block with the behavior. They need the canvas runtime to render, so read them as source and use the screens to see them.
- `screens/` holds 390 x 844 renders at 2x of every state. `split-*` is the Split page, `home-*` is home.
- The `.mp4` files show the motion at real speed: icon motions, delete then revert, the Payments ring opening, and Revert in History.

## Decisions

The operator made these calls while iterating. They win over older design docs and over any numbered rule they contradict. The B2 plan updates those rules.

### Everywhere

1. Minimal black and white. Geist type, thin gray rules, underlined text links for secondary actions, black pill buttons for the main action. Hierarchy comes from weight, size and spacing.
2. Color carries state only. Red marks a problem (a split over or under its price, the reason Create is blocked) and the trash icon while pressed. Green marks "Paid" in Payments. The trash icon is gray at rest.
3. Icons come from heroicons-animated (MIT), outline, about 1.6 to 1.9 stroke. Each plays a short motion on tap on the phone and on hover with a mouse. A press right after a hover lets the hover's motion finish. Status icons (the tick, the warning) play when they appear. Reduced motion turns every icon motion off.
4. The theme toggle is a sun/moon button. The icons swap with a rotate and scale, and the new theme spreads from the button as a circle (View Transitions API, with a color wipe as the fallback, instant under reduced motion).
5. Sheets slide up from the bottom and can be dragged: pull up for a tall sheet (94% of the screen), pull down past about 110 px to close. Rounded top corners, a gray hairline border, and no dimming of the page behind.
6. In the app, an action applies the moment it is tapped. A button that leaves the screen finishes its icon motion as it exits. The mock's 0.4 to 0.56 s wait before delete and revert is a mock shortcut, not the spec.

### Split page

7. Header: the Split's name, then the theme toggle and the share icon on the right. Under it an intro line ("Sam paid $135.83 on Saturday, Oct 11. Tap the dot next to what you had. Tap a line to edit it or split it another way.").
8. Receipt, People, Payments and History are underlined text links under the intro. Each opens its own sheet. There is no menu button and no sideways row of people chips.
9. Item rows: the dot toggles the claim; the rest of the row opens the Edit item sheet. No arrow. The left column shows the name, the description, then who had it. The right column shows the full price, and under it the split line ("$4.67 yours", "$6.25 each").
10. The list reads like a receipt in three parts: the Items, then a muted charges section (Subtotal, Tax, Tip, discounts and fees) with "+ Add item, tax, tip or discount" under it, then the Total between gray rules.
11. A fixed footer shows "Your share" with the amount and a black "Pay Sam" pill. The pill opens the Pay sheet (decision 25).
12. Edit item sheet: the title "Edit item", a trash icon and an X at the top right. Fields for Item name, Price and Description. "Who had it" as dot toggles. "How to split" as underlined options (Evenly, By shares, By amount) with a one-line hint, then each person's part, then a status line with a tick or a warning.
13. Delete: the trash icon sits beside the X, drawn smaller so the two look the same size. Its lid lifts as it is pressed. After a delete an undo bar reads "Deleted Burrata · Undo" for 4 s. With one Item left the trash is disabled, and a tap says "A split needs at least one item."
14. Add sheet: an Item, Tax, Tip or Discount chooser as underlined options, Name and Amount fields, and an "Add <kind>" pill.
15. People sheet: everyone with their share. Tapping a person shows the list from their side ("Viewing as Priya. Dots tick for them. Back to you"). "Switch account" re-picks who this phone is.
16. Payments sheet: a monochrome ring with round caps. The selected person's arc is black, the rest gray. Tapping a row selects that person. The ring draws in, one arc after another, when the sheet opens. "Paid" rows read "✓ Paid" in green.
17. History sheet: every change with an underlined Revert (or Restore) link and an animated undo arrow. The arrow swings back, then the row settles to a gray "✓ Reverted".

25. Pay sheet (operator, 2026-10-14): "Pay Sam" opens a sheet with the person's Items and their part of each, their part of tax, tip and discounts, and their total. Below it, the Host's payment methods as a radio list, a Pay button for the chosen one (Zelle copies the handle), and "I already paid". The two buttons stay fixed at the bottom of the sheet. Marking paid closes the sheet, shows an undo bar, and turns the footer pill into a green "✓ Paid". Tapping it again shows "You paid $X" with "Mark as not paid". Screens `split-17` to `split-21`.

### Home

18. The operator chose the original start page over three variants (big receipt, viewfinder, one button).
19. Header: "SplitWith", a "Recent splits" link and the theme toggle. Intro: "Snap the receipt. Friends tap what they had and pay you back."
20. A large take-photo block: a paper drawing with a round black camera button, "Add the receipt", and "or choose a file". While reading it shows the stage ("Finding the text", "Matching prices", "Almost done"). When ready it shows a card with the name, total, Item count and "Replace".
21. "How friends pay you": an app select and a handle field with no visible labels, and "+ Add another way to get paid".
22. "Who's at the table": one list of names, the first tagged "you", with an inline "+ Add your name" field. Enter adds the name and keeps the field open.
23. A footer with a reason line (red while blocked, for example "Add a receipt first.") and a "Create split link" black pill, gray while blocked.

### Native sheets

24. Keep the custom JS sheet on the web. Revisit `@expo/ui` BottomSheet for the native apps when they are prioritized.
