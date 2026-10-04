# Join

The Host types their own name first among the names on the home sheet, then creates a Split with **Create split link**. The site posts the draft to `POST /api/splits`, and opens the Split page at `/s/<id>` with the tall sheet "Link ready." and "Which one are you?". The tall sheet shows the link with **Copy** and **Share**, or **Copy** alone where the browser has no `navigator.share`. The Host picks their name like everyone else, and the chips sheet then shows **Your share** with an up-arrow and no link; the header's **Share link** button shares it. Creating clears the draft's Receipt, photo and names, so `/` opens empty with only the Payment handles kept. The wordmark on the Split page, **Split a receipt**, opens `/`, and the Split stays saved on the device. Anyone who opens the link gets the same tall sheet with "<Host> invited you to split $<total>". [Claim](./claim.md) covers the pick sheet and the page after it. An unknown or malformed id shows "This split has expired", and a stored Split the server cannot read shows "This split can't be opened".

## Sub-features

- `join-create` turns the ready home page into a link, with progress on the action while the request runs.
- `join-create-failure` shows one reason under the action when the create fails, and enables the action again.
- `join-share-copy` hands the link to `navigator.share`, and puts the exact link on the clipboard.
- `join-which-one` lists every Participant on `/s/<id>`, with names picked on another phone marked **Picked**.
- `join-someone-else` adds a Participant with **Not here? Add yourself**, and the Host's sheet shows the new name.
- `join-remember` skips the question on a reload.
- `join-handle-lock` lets only the creating browser change the Payment handles.
- `join-expired` shows the expired page for an unknown id, and the unreadable page for a socket closed with 4500.
- `join-no-ocr` loads nothing under `/models/` or `/ort/` on a share link.
- `join-isolated` creates a Split from the cross-origin isolated home page with no request to another host.

## How to get to it (user POV)

- On `/`, read a Receipt or tap **Example**, type a Venmo handle, type your name and any others, and tap **Create split link**.
- Pick your name, then tap **Share** or **Copy** in the sheet.
- Open the copied link in another browser, as a Participant does from a group chat.
- Open `/s/<id>` with an id that was never created.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

A single `drive` cannot tap through the sheet, so these flows run as Playwright specs or as a short Playwright script against the lane's port. `e2e/join.spec.ts` is the reference for every step below. To run it on its own port, use `PORT=<port> npx playwright test e2e/join.spec.ts`, which builds and starts its own `wrangler dev`. Do not point it at a port where `launch` already serves.

- **Create and join (`join-create`, `join-which-one`).** In a Pixel 7 context on `http://localhost:8811/`, tap **Example**, fill the textbox named `Venmo handle`, tap the button `Your name` and fill the textbox `Your name` with the Host's name, add more with the button `Add a name` and the textbox `Name` (exact), then tap **Create split link**. Within a few seconds the page moves to `/s/<id>` and shows "Link ready." over "Which one are you?", whose list items read each name with its initial. Open the same URL in a second context. Its invite line reads "<Host> invited you to split $<total>". Save both pages as `<out>/join-end-to-end.png`.
- **Same name (`join-which-one`).** Tap a name in one browser, then open the link in another. That name's row reads **Picked**.
- **Someone else (`join-someone-else`).** Tap **Not here? Add yourself**, fill `Your name`, and tap **Join as <name>**. The chip `<name>, you` shows. Back on `/`, the Host's home is empty except for the Venmo handle.
- **Reload (`join-remember`).** Reload the browser that picked. It skips the tall sheet and shows `<name>, you`.
- **Share and Copy (`join-share-copy`).** Pick the Host's name on the Split page first. Headless Chromium has no `navigator.share`, so the sheet shows **Copy** alone. Stub `navigator.share` in an init script to see **Share** beside **Copy**, then tap each. Grant `clipboard-read` and `clipboard-write` to read the clipboard back. **Copy** changes its label to **Copied** for 1.6 seconds.
- **Handle lock (`join-handle-lock`).** From a joined browser, open a WebSocket to `ws://localhost:8811/parties/split-server/<id>` and send `{"ref":"steal","op":{"type":"setPaymentHandles","by":null,"handles":[{"service":"venmo","handle":"thief-x"}]}}`. The answer is `rejected` with `creatorRequired`. Then send the same op from the Host's browser with `creatorSecret` from `localStorage` key `receipt-splitter:split:<id>`. Every socket gets a `state` with the new handle.
- **Failure (`join-create-failure`).** Route `**/api/splits` and add an unknown key such as `"note":""` to the body before it continues. The server refuses it with 400. The action reads `Creating link` with `aria-busy="true"` while the request runs, then shows `Couldn't create the link. Try again.` and is enabled again.
- **Expired (`join-expired`).** Run `verify.mjs drive --port 8811 --path /s/abc --expect-heading "This split has expired" --shot <out>/join-expired.png`. A well-formed id that was never created, such as `/s/q7Xv0Lr9_aZ-3mKpAbCdEf`, shows the same page. To see the unreadable page, close the socket with code 4500 through `page.routeWebSocket`.
- **No OCR on the link (`join-no-ocr`).** Record every request of the second browser context. None has a path under `/models/` or `/ort/`.
- **Create under isolation (`join-isolated`).** `/` is served with COOP and COEP, so `self.crossOriginIsolated` is `true` there, and **Create split link** still reaches `/s/<id>`. No request leaves the host while the Split is created.

## Gotchas

- Each IP may create 10 Splits a minute. A lane that creates more gets 429, and the action shows `Too many links from here. Try again in a minute.`
- Each IP may create 50 Splits per UTC day. The 51st gets 429 with `refused: "dailyLimit"` and the same message as the global cap below. The count lives in the run's Durable Object storage, so `cleanup` resets it for a `launch` port, and deleting `.wrangler/state/` resets it for `npm run e2e`, whose specs reuse the same addresses on every run.
- All IPs together may create 1,000 Splits per UTC day. Past that a create gets 429 with `refused: "dailyLimit"`, and the action shows `Too many new splits today. Try again after <time>.`, where `<time>` is the next UTC midnight in the browser's time zone. When that falls on the browser's next calendar day, it reads `Try again tomorrow after <time>.` `cleanup` resets the count.
- `cleanup` deletes the Durable Object storage, so links from an earlier launch show the expired page.
- The home page keeps the link in its saved draft. Start each drive in a fresh browser context, or the sheet opens on the old link.
- The Host is the first name typed on `/`. Creating the Split picks no name, so other browsers see the Host's name as free until a device picks it. One device at a time holds a name, and **That's me** moves it.
