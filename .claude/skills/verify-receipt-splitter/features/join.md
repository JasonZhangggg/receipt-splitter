# Join

The Host creates a Split from the home sheet with **Create split link**. The site gets a Turnstile token, posts the draft to `POST /api/splits`, and shows the link in the sheet with **Share** and **Copy**, or **Copy** alone where the browser has no `navigator.share`. The receipt card locks, and the sheet stays live: its name chips show the Split's Participants, and a handle edit goes to the Split with the creator secret. Anyone who opens the link at `/s/<id>` is asked "Which one are you?". Names someone joined as on another device are marked "Picked on another device", and **Someone else** adds a new Participant. The device remembers the choice per Split and shows **Not <name>?** to clear it. An unknown or malformed id shows "This split has expired", and a stored Split the server cannot read shows "This split can't be opened".

## Sub-features

- `join-create` turns the ready home page into a link, with progress on the action while the request runs.
- `join-create-failure` shows one reason under the action when the create fails, and enables the action again.
- `join-share-copy` hands the link to `navigator.share`, and puts the exact link on the clipboard.
- `join-which-one` lists every Participant on `/s/<id>`, with names joined elsewhere marked.
- `join-someone-else` adds a Participant from the Split page, and the Host's sheet shows the new name.
- `join-remember` skips the question on a reload and offers **Not <name>?**.
- `join-handle-lock` lets only the creating browser change the Payment handles.
- `join-expired` shows the expired page for an unknown id, and the unreadable page for a socket closed with 4500.
- `join-no-ocr` loads nothing under `/models/` or `/ort/` on a share link.

## How to get to it (user POV)

- On `/`, read a Receipt or tap **Example**, type a Venmo handle, add names if you like, and tap **Create split link**.
- Tap **Share** or **Copy** in the sheet.
- Open the copied link in another browser, as a Participant does from a group chat.
- Open `/s/<id>` with an id that was never created.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`. The machine reaches `challenges.cloudflare.com`, because the page loads the real Turnstile script. The build uses the test site key `1x00000000000000000000BB` unless `EXPO_PUBLIC_TURNSTILE_SITE_KEY` is set, and `.dev.vars` holds the matching test secret.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

A single `drive` cannot tap through the sheet, so these flows run as Playwright specs or as a short Playwright script against the lane's port. `e2e/join.spec.ts` is the reference for every step below. To run it on its own port, use `PORT=<port> npx playwright test e2e/join.spec.ts`, which builds and starts its own `wrangler dev`. Do not point it at a port where `launch` already serves.

- **Create and join (`join-create`, `join-which-one`).** In a Pixel 7 context on `http://localhost:8811/`, tap **Example**, fill the textbox named `Venmo handle`, add names with the button named `Add a name` and the textbox named `Name` (exact), then tap **Create split link**. Within a few seconds the sheet shows `Link ready` and the link in the element with test id `split-link`. Open `http://` plus that text in a second browser context. The heading `Which one are you?` shows, and the list items read `Me` (marked `Picked on another device`), then each name. Save the screenshot of both pages as `<out>/join-end-to-end.png`.
- **Same name (`join-which-one`).** Tap a name in the second browser, then open the link in a third. That name's row reads `Picked on another device`.
- **Someone else (`join-someone-else`).** On a link made with no names, tap **Someone else**, fill `Your name`, and tap **Join**. The page shows the name as a heading with **Not <name>?**, and the Host's sheet group `People at the table` shows the name without a remove button.
- **Reload (`join-remember`).** Reload the joined browser. It skips the question and shows **Not <name>?**. Tapping it brings the question back, with that name no longer marked.
- **Share and Copy (`join-share-copy`).** Headless Chromium has no `navigator.share`, so the sheet shows **Copy** alone. Stub `navigator.share` in an init script to see **Share** beside **Copy**, then tap each. Grant `clipboard-read` and `clipboard-write` to read the clipboard back. **Copy** changes its label to **Copied** for 1.6 seconds.
- **Handle lock (`join-handle-lock`).** From a joined browser, open a WebSocket to `ws://localhost:8811/parties/split-server/<id>` and send `{"ref":"steal","op":{"type":"setPaymentHandles","by":null,"handles":[{"service":"venmo","handle":"thief-x"}]}}`. The answer is `rejected` with `creatorRequired`. Then change the Venmo handle in the Host's sheet. About 0.7 seconds later every socket gets a `state` with the new handle.
- **Failure (`join-create-failure`).** Route `**/api/splits` and replace `turnstileToken` with `""` before it continues. The action reads `Creating link` with `aria-busy="true"` while the request runs, then shows `Couldn't check this browser. Try again.` and is enabled again.
- **Expired (`join-expired`).** Run `verify.mjs drive --port 8811 --path /s/abc --expect-heading "This split has expired" --shot <out>/join-expired.png`. A well-formed id that was never created, such as `/s/q7Xv0Lr9_aZ-3mKpAbCdEf`, shows the same page. To see the unreadable page, close the socket with code 4500 through `page.routeWebSocket`.
- **No OCR on the link (`join-no-ocr`).** Record every request of the second browser context. None has a path under `/models/` or `/ort/`.
- **Turnstile under isolation.** `/` is served with COOP and COEP, and the test site key still returns a token there. A real site key is not provable locally.

## Gotchas

- Each IP may create 10 Splits a minute. A lane that creates more gets 429, and the action shows `Too many links from here. Try again in a minute.`
- `cleanup` deletes the Durable Object storage, so links from an earlier launch show the expired page.
- The home page keeps the link in its saved draft. Start each drive in a fresh browser context, or the sheet opens on the old link.
- The Host is the Participant named `Me`, joined from the creating device, so other browsers see `Me` as picked.
- Turnstile's error callback logs a console warning, not an error, so a drive does not fail on it.
