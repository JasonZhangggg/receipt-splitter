# Receipt photo

The Host's device sends one downscaled JPEG of the receipt after the Split is created, and everyone with the link can open it for 14 days. The Worker stores it in a `photo` table in the Split's Durable Object, beside the `split` row. Every `state` frame carries `"photo":true` or `"photo":false`, and the Worker broadcasts a `state` frame when the photo lands or goes. Fourteen days after the create, the Split's alarm deletes the photo and the Split stays. ADR 0007 has the rules.

## Sub-features

- `photo-put` stores a JPEG sent with the Creator secret by `PUT /api/splits/<id>/photo`. A second PUT replaces it, and a third gets 429.
- `photo-get` serves it with `GET /api/splits/<id>/photo`.
- `photo-refusals` answers 403 without the Creator secret, 413 over 150 KB, 415 for a `content-type` other than `image/jpeg`, 400 for bytes that do not start with the JPEG marker, that hold any segment other than APP0, DQT, DHT, SOFn, DRI, COM, and SOS (so no EXIF, XMP, or IPTC), or that carry bytes after the end marker, 404 for a Split that does not exist, and 410 from 14 days after the create.
- `photo-flag` turns the snapshot's `photo` flag on for every connected client when the photo lands, and off when it goes.
- `photo-upload` sends the Host's copy after **Create split link**. Home makes the copy when the scan reads the photo. It crops the photo to the OCR boxes, scales it to at most 1280 px on its long edge (960 px if 1280 cannot fit), lowers the JPEG quality from 0.8 to 0.3 until the copy fits 150 KB, and keeps only the image segments, so no EXIF, GPS, ICC profile, or comment goes up. The PUT carries `authorization: Bearer <creatorSecret>`. A network error or a 5xx gets one retry, and any 4xx ends the upload without a message. The link shows at once and does not wait for the upload. The copy is kept at page scope beside the Draft, keyed to the scan, so leaving home and coming Back before Create still sends it.
- `view-receipt` shows **Receipt photo** in the Split page header's **Menu** menu (the hamburger icon at the top right, after **Share link**) while the flag is on, on every device with the link. It opens the photo viewer on `GET /api/splits/<id>/photo`, and closing the viewer hands focus back to **Menu**. A photo that lands while the menu is open adds the row. The row leaves when the flag turns off, and the menu then holds only **History**.
- `photo-delete` deletes the photo 14 days after the create, then sets the alarm for the Split's 60-day expiry. From day 14 the GET answers 404 and the flag is false even if the alarm has not run.

## How to get to it (user POV)

- Scan a receipt on home, fill the payment handle and a name, and tap **Create split link**. The Host's device sends the PUT right after the link opens.
- On any browser with the link, close "Which one are you?", tap **Menu** in the header, then **Receipt photo**. **Close photo** closes the viewer.
- **Example** is a link on an empty home at 768 px and wider (`breakpoints.exampleFrom` in `src/ui/theme.ts`). It does not exist at phone width, so a phone-width drive cannot click it. A Split made with it, or before V2-6b, has no photo, so **Menu** holds **Payments** and **History**.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `live-clients create --port 8811` printed an `id` and a `creatorSecret`, as [live.md](./live.md) describes.

- **Put (`photo-put`).** Run `curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'content-type: image/jpeg' -H "authorization: Bearer <creatorSecret>" --data-binary @<file.jpg> http://localhost:8811/api/splits/<id>/photo`. It prints `204`. Any JPEG that a canvas wrote works. `e2e/fixtures/srd-1040-exif-rotated.jpg` carries EXIF, so it prints `400`. To make a clean one, run `node -e 'process.stdout.write(Buffer.from([0xff,0xd8,0xff,0xda,0,2,0x11,0xff,0xd9]))' > /tmp/clean.jpg`.
- **Get (`photo-get`).** Run `curl -sD - -o <out>/photo.jpg http://localhost:8811/api/splits/<id>/photo`. The status is 200, and the headers include `content-type: image/jpeg`, `cache-control: private, max-age=3600`, `cross-origin-resource-policy: same-origin`, and `x-content-type-options: nosniff`. `cmp` of the saved file and the sent file prints nothing. To save a screenshot, run `verify.mjs drive --port 8811 --path /api/splits/<id>/photo --shot <out>/photo-get.png`.
- **Refusals (`photo-refusals`).** Repeat the Put command without the `authorization` header to get `403`, with a 200 KB file to get `413`, and with `-H 'content-type: text/plain'` to get `415`.
- **Flag (`photo-flag`).** Run `live-clients idle --port 8811 --id <id> --clients 1 --idle-s 20 --log <out>/photo-flag.json`, and send the Put command during the idle seconds. The transcript shows a `state` frame with `"photo":false` on connect and one with `"photo":true` after the PUT.
- **Delete (`photo-delete`).** `wrangler dev` runs alarms on the real clock, and no command moves it 14 days. `worker/split-server.test.ts` proves the delete with `runDurableObjectAlarm` at a fake time. Run `npm run test:worker -- split-server` and read the `the receipt photo's 14-day delete` cases.

- **Upload and View receipt (`photo-upload`, `view-receipt`).** Run `PORT=<port> npx playwright test e2e/photo.spec.ts`. It scans `e2e/fixtures/topgolf-synthetic.png`, creates the link, checks the PUT body, and opens **Receipt photo** from **Menu** on a second browser. The case per width (390 and 1440 px, both engines) opens History and then the photo from **Menu**, checks focus goes back to **Menu** after each, and checks a resize across 1024 px closes the menu. Its last case runs the copy pipeline in Chromium and WebKit on a 12 MP photo and on `e2e/fixtures/srd-1040-exif-rotated.jpg`, and the Worker stores both copies.

## Gotchas

- The Worker checks the `content-type`, the size, and the JPEG segments before it reaches the Durable Object, so a request with bad bytes and no secret gets 400 or 413, not 403.
- `GET` answers 404 for a missing photo and for a missing Split alike.
- Each create with a photo and its one replace costs 19 row writes. `DAILY_CREATE_CAP` follows from that count, as ADR 0005 explains. A new write on the create path fails `worker/create-cost.test.ts` until the cap moves.
- WebKit and Chromium may write an ICC profile (APP2) into a canvas JPEG, and the Worker refuses any APP2 with 400. The home copy drops every segment but the image's own before the upload, so the Worker's allowlist stays as it is.
