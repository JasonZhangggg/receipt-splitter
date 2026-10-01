# Pay

Your own breakdown on the Split page `/s/<id>` (frame G) shows one pay pill for each Payment handle the Host entered, in the Host's order. The first is black and the rest are gray, such as **Pay Jason $12.05 on Venmo**. Each pill is a link that opens the app's payment page with your Share to the cent. A muted line under the pills lists the Host's handles, such as `Venmo @jason-z · Cash App $jasonz`. Zelle has no link, so it shows a card, **Pay Jason on Zelle**, with the handle and the amount, each with a copy button. **I already paid** records a Payment of your Share. Once paid, the button reads **I haven't paid** and clears it. Someone else's breakdown (frame H) shows Paid or Not paid and no buttons, and "Priya paid $3.56" once they paid. When a Share moves after a Payment, every browser shows the difference: "You paid $22.00. Jason owes you $8.00." for the payer, "Sam paid $22.00. You owe Sam $8.00." for the Host, and "Sam paid $22.00. Jason owes Sam $8.00." for anyone else. A Share that grew shows "You paid $22.00. You owe $4.00 more." with pills for the rest and **I paid the rest**. History lists Payments with no **Revert**.

Only the device that picked a name can record or clear that person's Payment. The server refuses anything else with `payerOnly`, and refuses an `undo` of a Payment change the same way.

## Sub-features

- `pay-pills` shows a link per handle, each carrying the Share to the cent, and the handles line.
- `pay-zelle` shows the Zelle card and copies the handle and the amount (the amount copies without the `$`).
- `pay-mark` records and clears your own Payment with **I already paid** and **I haven't paid**.
- `pay-status` shows Paid or Not paid with no buttons on everyone else's breakdown, live.
- `pay-difference` shows the difference in every browser after a Share moves.
- `pay-refused` refuses a Payment for a name from a device that did not pick it.
- `pay-history` lists Payments in History without **Revert**.

## How to get to it (user POV)

- Pick your name, check a line, and tap "You owe" or your own chip.
- Tap another person's chip to see their status.
- Tap the clock icon for History.

## Driving it

Preconditions are the same as [claim.md](./claim.md). Create the Split over `POST /api/splits` with several handles, for example `"paymentHandles":[{"service":"venmo","handle":"jason-z"},{"service":"cashApp","handle":"jasonz"},{"service":"paypal","handle":"jasonzhang"},{"service":"zelle","handle":"jason@example.com"}]`. `e2e/pay.spec.ts` is the reference.

- **Pills (`pay-pills`).** Inside the test id `breakdown`, each pill is a link named `Pay <Host> $<amount> on <App>` whose `href` is the payment URL from `src/core/pay-links.ts` and whose `target` is `_blank`. Venmo on the web is `https://venmo.com/<user>?txn=pay&amount=14.20&note=Receipt%20split`.
- **Zelle (`pay-zelle`).** The card holds the buttons `Copy <handle>` and `Copy $<amount>`, which read "Copied" for about 1.6 s.
- **Mark (`pay-mark`).** Tap **I already paid** inside `breakdown`. The button turns into **I haven't paid**, and the test id `share` shows the paid amount.
- **Status (`pay-status`).** In another browser, tap the payer's chip. The breakdown shows `Paid` and `<name> paid`, with no links or buttons.
- **Difference (`pay-difference`).** After the payer marks paid, change a Claim from another browser so the Share moves. Both browsers show the difference sentence.
- **Refused (`pay-refused`).** From a page of another device, open `ws://<host>/parties/split-server/<id>` and send `{"ref":"forged","op":{"type":"recordPayment","by":"<id>","participantId":"<id>","device":"not-the-payer","amount":2200}}`. The answer is `{"type":"rejected","ref":"forged","rejection":{"reason":"payerOnly"}}`, and the payer stays Not paid.
- **History (`pay-history`).** Tap **History**. The Payment row shows no **Revert**.

## Gotchas

- Device ids travel in every state frame, so a hand-made frame can present another phone's id. The check stops every other device in the app, and **That's me** already lets anyone take a name in the open. The cleanup PR owns this.
- `venmo://paycharge` is used only in the native app. The web, phones included, uses the https link.
- The note is always "Receipt split", because the Receipt keeps no merchant name and Venmo notes can be public. Cash App and PayPal.me take no note.
