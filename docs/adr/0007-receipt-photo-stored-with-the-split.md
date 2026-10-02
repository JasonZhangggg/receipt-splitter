# The receipt photo is stored with its Split, in the Split's Durable Object

On 2026-10-01 the operator ruled that everyone in a Split can view the receipt photo. This amends ADR 0001. OCR and parsing still run on the device and no LLM sees the photo, but the photo now leaves the device once, when the Host creates the link. We store one downscaled JPEG in its own table inside the Split's Durable Object, beside the `split` row, and not in R2 or in the Split's JSON.

- The Host's device downscales the photo to at most 1600 px on its long edge and re-encodes it as JPEG. Re-encoding through a canvas drops EXIF data, such as the GPS position.
- After `POST /api/splits` returns, the device sends the photo with `PUT /api/splits/<id>/photo` and the Creator secret. The link shows at once and does not wait for the upload. A failed upload leaves a Split without a photo, and nothing else changes.
- The Worker refuses a body over 300 KB, a body that does not start with the JPEG marker, and a JPEG with an EXIF segment. A second PUT replaces the photo, so a retry ends in the same state.
- `GET /api/splits/<id>/photo` serves it with `content-type: image/jpeg` and `x-content-type-options: nosniff`. The live snapshot tells clients whether a photo exists.
- The expiry alarm's `deleteAll()` deletes the photo with the Split, 60 days after the last change.

## Why the Durable Object and not R2

The photo lives and dies with one Split, and the Split's object already owns its lifetime, its Creator secret check, and its deletion. R2 would add a binding, a second delete path that can fail on its own, and a lifecycle rule to keep in step with the 60-day alarm. A SQLite-backed Durable Object allows a row of up to 2 MB, so the 300 KB cap leaves room. The Split's JSON keeps its 32 KB budget, because the photo is not in it, and `parseSplit` and `schemaVersion` do not change.

## Cost

Cloudflare bills the photo as stored data, at $0.20 per GB-month past the 5 GB the Paid plan includes. The Free plan allows 5 GB in total. At the daily cap of 1,500 creates, each with a 300 KB photo kept 60 days, the photos hold about 27 GB, or about $4.40 a month on the Paid plan. On the Free plan, writes start to fail after about 11 days at the cap, and that includes creating Splits. These figures assume every day reaches the cap. Each upload adds one row write, and the expiry delete adds one more. `worker/create-cost.test.ts` counts them, and the daily cap arithmetic in ADR 0005 is checked again against the new count.

## Privacy

The photo shows whatever the receipt prints, such as the last 4 digits of a card. The operator accepted that. Anyone with the link can open the photo, as they can open the Items. The home page says so before the Host creates the link.
