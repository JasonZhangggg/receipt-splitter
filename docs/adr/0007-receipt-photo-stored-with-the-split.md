# The receipt photo is stored with its Split, in the Split's Durable Object

On 2026-10-01 the operator ruled that everyone in a Split can view the receipt photo. This amends ADR 0001. OCR and parsing still run on the device and no LLM sees the photo, but the photo now leaves the device once, when the Host creates the link. We store one downscaled JPEG in its own table inside the Split's Durable Object, beside the `split` row, and not in R2 or in the Split's JSON.

- The Host's device downscales the photo to at most 1280 px on its long edge and re-encodes it as JPEG of at most 150 KB. Re-encoding through a canvas drops EXIF data, such as the GPS position.
- After `POST /api/splits` returns, the device sends the photo with `PUT /api/splits/<id>/photo` and the Creator secret. The link shows at once and does not wait for the upload. A failed upload leaves a Split without a photo, and nothing else changes.
- The Worker refuses a body over 150 KB, a body that does not start with the JPEG marker, and a JPEG with an EXIF segment. A second PUT replaces the photo, so a retry ends in the same state.
- `GET /api/splits/<id>/photo` serves it with `content-type: image/jpeg` and `x-content-type-options: nosniff`. The live snapshot tells clients whether a photo exists.
- The photo is deleted 14 days after the Split is created. The Split's one alarm fires first at that time, drops the photo, tells connected clients, and reschedules itself for the Split's expiry. The Split stays, and **View receipt** hides. If the Split expires first, `deleteAll()` deletes both.

## Why the Durable Object and not R2

The photo lives and dies with one Split, and the Split's object already owns its lifetime, its Creator secret check, and its deletion. R2 would add a binding, a second delete path that can fail on its own, and a lifecycle rule to keep in step with the alarm. A SQLite-backed Durable Object allows a row of up to 2 MB, so the 150 KB cap leaves room. The Split's JSON keeps its 32 KB budget, because the photo is not in it, and `parseSplit` and `schemaVersion` do not change.

## Cost

The account stays on the Workers Free plan, which allows 5 GB of stored data in total and 100,000 row writes a day. Each create with a photo writes about 4 more rows than today's 12, for its upload, its delete, and one more alarm, about 17 in total. The daily cap follows one rule. `DAILY_CREATE_CAP` is the floor of 25,000 over the budgeted writes per create, which keeps creates within a quarter of the daily row writes. At 17 the cap is 1,470, and `worker/create-cost.test.ts` asserts the rule, so a new write fails the test until the cap moves. At that cap, each create with a 150 KB photo kept 14 days, the photos hold at most about 3.1 GB. The Splits themselves live 60 days. The golden rows in `src/core/golden/` measure 2.4 to 3.9 KB, so about 88,000 of them at 4 KB hold about 0.4 GB, and photos plus Splits stay under 5 GB. If every Split reached its 32 KB budget, the Splits alone would hold about 2.8 GB and the total would pass 5 GB. If the 14-day delete stopped working, the photos would fill the 5 GB in about 22 days at the cap, and every write would then fail, creating Splits included.

## Privacy

The photo shows whatever the receipt prints, such as the last 4 digits of a card. The operator accepted that. Anyone with the link can open the photo for its 14 days, as they can open the Items. The home page adds no line about it, by the operator's ruling.
