# Claim

The Split page `/s/<id>` shows the Receipt as a card and a bottom sheet. A device with no name stored opens the tall sheet "Which one are you?" over the card. It shows the invite line, such as "Jason invited you to split $28.04", or "Link ready." on the device that made the link. Names another device holds read **Picked**, and tapping one shows "Picked on another phone." with **That's me** and **Cancel**. **Not here? Add yourself** adds a name. After a pick the row shows a check for 80 ms and the sheet springs down to the people chips, with your chip marked "you". The ✕ or a flick down closes the tall sheet without a pick, and the page browses (frame K). The circle on the left of each line checks the line for the selected chip, and the rest of the line opens the Item sheet: name, price, quantity, **Who had it** per unit with **+**, and **Evenly**, **By shares**, and **By amount**. Edits save as you go. Unclaimed lines turn yellow once claiming starts, the Unclaimed figure sits under the Total, and "Items are $0.25 over." shows while the Items disagree with the printed subtotal. Tapping a chip shows that person's breakdown, your own with "You owe", **Pay <Host> ... on <app>**, and **I already paid**. The clock icon opens History, which lists Payments and Receipt changes with **Revert**, asks first before reverting another device's change, and offers **Restore** on "Created the split".

## Sub-features

- `claim-pick` picks a name on the tall sheet and collapses it to the chips, with "Link ready." for the creating device.
- `claim-take` moves a name picked on another phone with **That's me**, and drops the other phone back to browsing.
- `claim-browse` closes the tall sheet without a pick, and a tap on a circle asks again.
- `claim-check` checks a line for the selected chip, and every browser shows the claimers and Shares.
- `claim-item` edits the name, price, quantity, who had each unit, and the split mode in the Item sheet.
- `claim-breakdown` shows a person's Items, their parts of each Adjustment, their total, and Paid or Not paid.
- `claim-paid` marks the payer paid with **I already paid**.
- `claim-history` lists Payments and Receipt changes, reverts one with a confirmation for another device's change, and restores the Receipt.
- `claim-mismatch` warns while the Items disagree with the printed subtotal.

## How to get to it (user POV)

- Open a Split link, or tap **Create split link** on `/`, which opens the Split page for the Host.
- Tap a name on the tall sheet, or **Not here? Add yourself**, or the ✕.
- Tap a line's circle, or the rest of the line.
- Tap a chip, or "You owe".
- Tap the clock icon in the header.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

One `drive` opens one browser and cannot pick or tap, so every step below runs as a Playwright spec or a short Playwright script against the lane's port. `e2e/claim.spec.ts` is the reference. Run it with `PORT=<port> npx playwright test e2e/claim.spec.ts`, which builds and starts its own `wrangler dev`.

- **A Split with a known Receipt.** `POST http://localhost:8811/api/splits` with `{"turnstileToken":"XXXX.DUMMY.TOKEN.XXXX","split":{"receipt":...,"participants":[{"id":"jason","name":"Jason"},{"id":"sam","name":"Sam"}],"paymentHandles":[{"service":"venmo","handle":"jason-z"}]}}` returns 201 with the `id`. An Item may carry `"quantity": 2`. Send a different `cf-connecting-ip` header on each create, because each IP may create 10 Splits a minute.
- **Pick (`claim-pick`).** Open the link in a fresh context. The dialog named `Which one are you?` lists the names. Tap the button with the exact name. The chip `<name>, you` shows within half a second. Save `<out>/claim-pick.png`.
- **That's me (`claim-take`).** In a second context, tap `<name>, picked on another phone`, then **That's me**. The second page shows `<name>, you`, and the first shows "Pick your name to check off what you had."
- **Browse (`claim-browse`).** Tap **Close, just look**. The prompt and the pill **Which one are you?** show. Tapping a circle, named `Who had <Item>`, reopens the tall sheet.
- **Check (`claim-check`).** A circle is a toggle button named `<Item>, check for <name>` with `aria-pressed`. The rest of the line is a button named `Open <Item>, $<price>, had by <names>` or `..., nobody had it`. The test ids are `owe` for your total on the chips sheet, `unclaimed` and `total` on the card, `share` and `breakdown` in a breakdown, and `line-<id>` for a line.
- **Item sheet (`claim-item`).** The dialog named `Item` has the textboxes `Item name` and `Price`, the buttons **Less** and **More** for the quantity, a group `Who had it` (or `Who had it, <n> of <q>` per unit) of toggle buttons per person, and the toggle buttons **Evenly**, **By shares**, and **By amount**. Shares have **More shares for <name>** and **Fewer shares for <name>**. Amounts have the textbox `<name>'s amount`. A burst of edits goes 600 ms after the last one, or when the sheet closes, as one History row.
- **History (`claim-history`).** Tap the button **History**. Each row is a list item with **Revert <Item>**. A change sent under another name asks `Revert <name>'s change?` in an alertdialog. **Restore** on "Created the split" asks "Put the receipt back as it was created?".
- **Live flow.** `PORT=8811 OUT=<out> node .claude/skills/verify-receipt-splitter/split-flow.mjs` drives the main flow with four browsers at 390 px: the Host creates a Split, two browsers pick, claim, split Tostones 2:1, take the second unit of a line, change Sprite to $2.75 while a third browser's socket is down for 10 seconds, the payer marks paid, the Host reverts the price after the confirmation, a reload keeps the pick, and a fourth browser takes Sam with **That's me**. It saves each board frame as `<out>/<frame>.png` and writes `<out>/report.json` with the checks, the claim-to-other-browser time, the reconnect times, the properties animating mid-collapse, and console errors. Add `SCHEME=dark`, `REDUCE=1`, or `VIDEO=1` for dark mode, reduced motion, or a recording in `<out>/video/`.

## Gotchas

- The page shows no merchant name, because the Receipt keeps none.
- Claims are not recorded in History, so a cleared Claim comes back only by checking it again.
- The pick sheet stays tall, with its top 170 px from the top of the window, even when it lists few names.
- A device keeps its pick per Split in local storage with its own device id. A fresh browser context is a new device, so a reload in the same context keeps the pick and a new context does not.
- `context.setOffline(true)` does not close an open WebSocket. Use `page.routeWebSocket` to drop one, as [live.md](./live.md) says.
