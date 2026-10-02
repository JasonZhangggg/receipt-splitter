# Receipt photo

The Host's device sends one downscaled JPEG of the receipt after the Split is created, and everyone with the link can open it for 14 days. The Worker stores it in a `photo` table in the Split's Durable Object, beside the `split` row. Every `state` frame carries `"photo":true` or `"photo":false`, and the Worker broadcasts a `state` frame when the photo lands or goes. Fourteen days after the create, the Split's alarm deletes the photo and the Split stays. ADR 0007 has the rules. No page sends or shows a photo until V2-6b.

## Sub-features

- `photo-put` stores a JPEG sent with the Creator secret by `PUT /api/splits/<id>/photo`. A second PUT replaces it, and a third gets 429.
- `photo-get` serves it with `GET /api/splits/<id>/photo`.
- `photo-refusals` answers 403 without the Creator secret, 413 over 150 KB, 415 for a `content-type` other than `image/jpeg`, 400 for bytes that do not start with the JPEG marker, that hold any segment other than APP0, DQT, DHT, SOFn, DRI, COM, and SOS (so no EXIF, XMP, or IPTC), or that carry bytes after the end marker, 404 for a Split that does not exist, and 410 from 14 days after the create.
- `photo-flag` turns the snapshot's `photo` flag on for every connected client when the photo lands, and off when it goes.
- `photo-delete` deletes the photo 14 days after the create, then sets the alarm for the Split's 60-day expiry. From day 14 the GET answers 404 and the flag is false even if the alarm has not run.

## How to get to it (user POV)

- None until V2-6b. The Host's device will send the PUT after **Create split link**, and the Split page will show **View receipt** while the flag is on.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `live-clients create --port 8811` printed an `id` and a `creatorSecret`, as [live.md](./live.md) describes.

- **Put (`photo-put`).** Run `curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'content-type: image/jpeg' -H "authorization: Bearer <creatorSecret>" --data-binary @<file.jpg> http://localhost:8811/api/splits/<id>/photo`. It prints `204`. Any JPEG that a canvas wrote works. `e2e/fixtures/srd-1040-exif-rotated.jpg` carries EXIF, so it prints `400`. To make a clean one, run `node -e 'process.stdout.write(Buffer.from([0xff,0xd8,0xff,0xda,0,2,0x11,0xff,0xd9]))' > /tmp/clean.jpg`.
- **Get (`photo-get`).** Run `curl -sD - -o <out>/photo.jpg http://localhost:8811/api/splits/<id>/photo`. The status is 200, and the headers include `content-type: image/jpeg`, `cache-control: private, max-age=3600`, `cross-origin-resource-policy: same-origin`, and `x-content-type-options: nosniff`. `cmp` of the saved file and the sent file prints nothing. To save a screenshot, run `verify.mjs drive --port 8811 --path /api/splits/<id>/photo --shot <out>/photo-get.png`.
- **Refusals (`photo-refusals`).** Repeat the Put command without the `authorization` header to get `403`, with a 200 KB file to get `413`, and with `-H 'content-type: text/plain'` to get `415`.
- **Flag (`photo-flag`).** Run `live-clients idle --port 8811 --id <id> --clients 1 --idle-s 20 --log <out>/photo-flag.json`, and send the Put command during the idle seconds. The transcript shows a `state` frame with `"photo":false` on connect and one with `"photo":true` after the PUT.
- **Delete (`photo-delete`).** `wrangler dev` runs alarms on the real clock, and no command moves it 14 days. `worker/split-server.test.ts` proves the delete with `runDurableObjectAlarm` at a fake time. Run `npm run test:worker -- split-server` and read the `the receipt photo's 14-day delete` cases.

## Gotchas

- The Worker checks the `content-type`, the size, and the JPEG segments before it reaches the Durable Object, so a request with bad bytes and no secret gets 400 or 413, not 403.
- `GET` answers 404 for a missing photo and for a missing Split alike.
- Each create with a photo and its one replace costs 19 row writes. `DAILY_CREATE_CAP` follows from that count, as ADR 0005 explains. A new write on the create path fails `worker/create-cost.test.ts` until the cap moves.
