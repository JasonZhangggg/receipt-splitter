# Pay

Your own breakdown on the Split page `/s/<id>` (frame G) shows one wide pay pill, whatever the number of Payment handles the Host entered. A Split made with no handle shows no pill and no handles line, only **I already paid**. With one handle the pill reads **Pay Jason $12.05 on Venmo**. With two or more it reads **Pay Jason $12.05 on** and ends in the app's name and a chevron on a lighter capsule. That capsule is a native select named `Pay with`, listing the handles in the Host's order, so iOS shows its own picker and a desktop its own menu. The pill starts on the first handle. The device keeps the last pick for that Split in its `receipt-splitter:split:<id>` record (`payWith`), so a reload opens on it. A link pill keeps the full accessible name, such as `Pay Jason $12.05 on Venmo`, and opens the app's payment page with your Share to the cent. Zelle has no link. With Zelle picked, the pill shows a copy icon, is a button named `Copy jason@example.com to pay Jason $12.05 on Zelle`, copies the handle, and reads **Copied** with a check for about 1.6 s. Nothing copies the amount. A muted line under the pill lists every handle, Zelle's too, such as `Venmo @jason-z · Cash App $jasonz · Zelle jason@example.com`, and a long line breaks after a dot, never inside a handle. The breakdown's list keeps the same height for any number of handles, apart from that line wrapping. **I already paid** records a Payment of your Share. Once paid, the button reads **I haven't paid** and clears it. Your own amount reads **Your share** on the phone and the desktop, and a Paid pill above the list shows once you paid. Someone else's breakdown (frame H) shows Paid or Not paid and no buttons, and "Priya paid $3.56" once they paid. Its share row's button names that person, such as "Priya owes $0.00, Hide Priya's breakdown". When a Share moves after a Payment, every browser shows the difference: "You paid $22.00. Jason owes you $8.00." for the payer, "Sam paid $22.00. You owe Sam $8.00." for the Host, and "Sam paid $22.00. Jason owes Sam $8.00." for anyone else. A Share that grew shows "You paid $22.00. You owe $4.00 more." with pills for the rest and **I paid the rest**. History lists Payments with no **Revert**.

Only the device that picked a name can record or clear that person's Payment. The server refuses anything else with `payerOnly`, and refuses an `undo` of a Payment change with `paymentNotRevertible`.

## Sub-features

- `pay-pills` shows the one pay pill, the `Pay with` picker that switches its app, the link carrying the Share to the cent, and the handles line.
- `pay-zelle` copies the Zelle handle from the pill when Zelle is picked.
- `pay-mark` records and clears your own Payment with **I already paid** and **I haven't paid**.
- `pay-status` shows Paid or Not paid with no buttons on everyone else's breakdown, live.
- `pay-difference` shows the difference in every browser after a Share moves.
- `pay-refused` refuses a Payment for a name from a device that did not pick it.
- `pay-history` lists Payments in History without **Revert**.

## How to get to it (user POV)

- Pick your name, check a line, and tap "Your share" or your own chip.
- Tap another person's chip to see their status.
- Tap **More**, then **History**.
- Tap **More**, then **Payments** to see who has paid.

## Driving it

Preconditions are the same as [claim.md](./claim.md). Create the Split over `POST /api/splits` with several handles, for example `"paymentHandles":[{"service":"venmo","handle":"jason-z"},{"service":"cashApp","handle":"jasonz"},{"service":"paypal","handle":"jasonzhang"},{"service":"zelle","handle":"jason@example.com"}]`. `e2e/pay.spec.ts` is the reference.

- **Pills (`pay-pills`).** Inside the test id `breakdown`, the pill is a link named `Pay <Host> $<amount> on <App>` whose `href` is the payment URL from `src/core/pay-links.ts` and whose `target` is `_blank`. Venmo on the web is `https://venmo.com/<user>?txn=pay&amount=14.20&note=Receipt%20split`. With two or more handles, switch the app with `getByRole("combobox", { name: "Pay with" }).selectOption("cashApp")`.
- **Zelle (`pay-zelle`).** Pick `zelle` in `Pay with` (or make it the only handle). The button `Copy <handle> to pay <Host> $<amount> on Zelle` is named "Copied" for about 1.6 s. Grant `clipboard-read` and `clipboard-write` to read the clipboard back.
- **Mark (`pay-mark`).** Tap **I already paid** inside `breakdown`. The button turns into **I haven't paid**, and the test id `share` shows the paid amount.
- **Status (`pay-status`).** In another browser, tap the payer's chip. The breakdown shows `Paid` and `<name> paid`, with no links, and on the phone no button but the share row that folds the sheet.
- **Difference (`pay-difference`).** After the payer marks paid, change a Claim from another browser so the Share moves. Both browsers show the difference sentence.
- **Refused (`pay-refused`).** From a page of another device, open `ws://<host>/parties/split-server/<id>` and send `{"ref":"forged","op":{"type":"recordPayment","by":"<id>","participantId":"<id>","device":"not-the-payer","amount":2200}}`. The answer is `{"type":"rejected","ref":"forged","rejection":{"reason":"payerOnly"}}`, and the payer stays Not paid.
- **History (`pay-history`).** Tap **More**, then **History**. The Payment row shows no **Revert**.

## Gotchas

- Device ids travel in every state frame, so a hand-made frame can present another phone's id. The check stops every other device in the app, and **That's me** already lets anyone take a name in the open. The cleanup PR owns this.
- `venmo://paycharge` is used only in the native app. The web, phones included, uses the https link.
- The note is always "Receipt split", because the Receipt keeps no merchant name and Venmo notes can be public. Cash App and PayPal.me take no note.
- **Payments (`pay-status`).** Tap **More**, then **Payments** (first in the menu). It is a bottom sheet (`payments-sheet`) on the phone and a popover under **More** from 1024 px, titled "Payments". The people chips carry no check or "!" and their names read plain, `<name>` or `<name>, you`. Under the title a gray line reads "N of M paid you" for the Host or "N of M paid" for everyone else (test id `payments-summary`). M counts people other than the Host who owe or paid anything, and N those with a payment recorded, so a person with a $0.00 share and no payment is not counted. The list (role `list`, name "Payments") has one row per person in chip order. The name is on the left, with the person icon after the viewer's, and the share is right-aligned. Under the name a gray line says "Paid $22.00", "Paid $22.00 · $4.00 still owed", "Paid $22.00 · $8.00 too much", "Not paid" or "Nothing to pay", and for the Host "You get paid" (their own phone) or "Gets paid". A tap on a row does nothing. The sheet updates when another phone pays or claims, and closes if its viewer is removed. The words come from `paymentStatus` in `src/ui/pay/model.ts`; `e2e/pay.spec.ts` drives the live updates, `e2e/people.spec.ts` the removal, and `e2e/desktop.spec.ts` the popover.
