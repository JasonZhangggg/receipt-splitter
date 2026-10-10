# Pay

Your own breakdown on the Split page `/s/<id>` (frame G) shows one wide pay pill, whatever the number of Payment handles the Host entered. A Split made with no handle shows no pill and no handles line, only **I already paid**. With one handle the pill reads **Pay Jason $12.05 on Venmo**. With two or more it reads **Pay Jason $12.05 on** and ends in the app's name and a chevron on a lighter capsule. That capsule is a native select named `Pay with`, listing the handles in the Host's order, so iOS shows its own picker and a desktop its own menu. The pill starts on the first handle. The device keeps the last pick for that Split in its `receipt-splitter:split:<id>` record (`payWith`), so a reload opens on it. A link pill keeps the full accessible name, such as `Pay Jason $12.05 on Venmo`, and opens the app's payment page with your Share to the cent. Zelle has no link. With Zelle picked, the pill shows a copy icon, is a button named `Copy jason@example.com to pay Jason $12.05 on Zelle`, copies the handle, and reads **Copied** with a check for about 1.6 s. Nothing copies the amount. A muted line under the pill lists every handle, Zelle's too, such as `Venmo @jason-z · Cash App $jasonz · Zelle jason@example.com`, and a long line breaks after a dot, never inside a handle. The breakdown's list keeps the same height for any number of handles, apart from that line wrapping. **I already paid** records a Payment of your Share. Once paid, the button reads **I haven't paid** and clears it. Your own amount reads **Your share** and anyone else's reads **Priya's share**, on the phone and the desktop, folded or open. Its share row's button names that person, such as "Priya's share $0.00, Hide Priya's breakdown". Under the label one gray line (`share-note`) says the paid state once there is one: "Paid $22.00", "Paid $22.00 · $8.00 too much" after the Share fell, "Paid $22.00 · $4.00 still owed" after it grew (with pills for the rest and **I paid the rest**), and for the Host on their own share "1 of 2 paid you" once anyone has paid. With no payment state there is no line. What is left to claim is the separate bar under the share row (see [claim.md](./claim.md)). The line sits inside the share row's height, so the folded sheet never changes height for it. `e2e/share-note.spec.ts` drives every state. History lists Payments with no **Revert**.

Only the device that picked a name can record or clear that person's Payment. The server refuses anything else with `payerOnly`, and refuses an `undo` of a Payment change with `paymentNotRevertible`.

## Sub-features

- `pay-pills` shows the one pay pill, the `Pay with` picker that switches its app, the link carrying the Share to the cent, and the handles line.
- `pay-zelle` copies the Zelle handle from the pill when Zelle is picked.
- `pay-mark` records and clears your own Payment with **I already paid** and **I haven't paid**.
- `pay-status` shows the paid line under everyone else's share with no buttons, live.
- `pay-difference` shows "Paid $X · $Y too much" or "still owed" in every browser after a Share moves.
- `pay-refused` refuses a Payment for a name from a device that did not pick it.
- `pay-history` lists Payments in History without **Revert**.

## How to get to it (user POV)

- Pick your name, check a line, and tap "Your share" or your own chip.
- Tap another person's chip to see their status.
- Tap the clock icon for History.

## Driving it

Preconditions are the same as [claim.md](./claim.md). Create the Split over `POST /api/splits` with several handles, for example `"paymentHandles":[{"service":"venmo","handle":"jason-z"},{"service":"cashApp","handle":"jasonz"},{"service":"paypal","handle":"jasonzhang"},{"service":"zelle","handle":"jason@example.com"}]`. `e2e/pay.spec.ts` is the reference.

- **Pills (`pay-pills`).** Inside the test id `breakdown`, the pill is a link named `Pay <Host> $<amount> on <App>` whose `href` is the payment URL from `src/core/pay-links.ts` and whose `target` is `_blank`. Venmo on the web is `https://venmo.com/<user>?txn=pay&amount=14.20&note=Receipt%20split`. With two or more handles, switch the app with `getByRole("combobox", { name: "Pay with" }).selectOption("cashApp")`.
- **Zelle (`pay-zelle`).** Pick `zelle` in `Pay with` (or make it the only handle). The button `Copy <handle> to pay <Host> $<amount> on Zelle` is named "Copied" for about 1.6 s. Grant `clipboard-read` and `clipboard-write` to read the clipboard back.
- **Mark (`pay-mark`).** Tap **I already paid** inside `breakdown`. The button turns into **I haven't paid**, and the test id `share` shows the paid amount.
- **Status (`pay-status`).** In another browser, tap the payer's chip. The breakdown shows `Paid` and `<name> paid`, with no links, and on the phone no button but the share row that folds the sheet.
- **Difference (`pay-difference`).** After the payer marks paid, change a Claim from another browser so the Share moves. Both browsers show "Paid $X · $Y too much" under the share.
- **Refused (`pay-refused`).** From a page of another device, open `ws://<host>/parties/split-server/<id>` and send `{"ref":"forged","op":{"type":"recordPayment","by":"<id>","participantId":"<id>","device":"not-the-payer","amount":2200}}`. The answer is `{"type":"rejected","ref":"forged","rejection":{"reason":"payerOnly"}}`, and the payer's share shows no paid line.
- **History (`pay-history`).** Tap **History**. The Payment row shows no **Revert**.

## Gotchas

- Device ids travel in every state frame, so a hand-made frame can present another phone's id. The check stops every other device in the app, and **That's me** already lets anyone take a name in the open. The cleanup PR owns this.
- `venmo://paycharge` is used only in the native app. The web, phones included, uses the https link.
- The note is always "Receipt split", because the Receipt keeps no merchant name and Venmo notes can be public. Cash App and PayPal.me take no note.
