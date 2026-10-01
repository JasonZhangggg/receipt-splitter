# One Cloudflare Durable Object per Split, kept cheap by design

Live Splits are stored in one SQLite-backed Cloudflare Durable Object each, with updates pushed over hibernating WebSockets. The whole Split is one JSON record of at most about 32 KB, and it is deleted 60 days after its last change. We chose this over a shared database or polling because it costs nothing on the Workers Free plan at low volume and about $5–10 a month at 100,000 Splits a month, while claims still show up instantly. Four rules keep it that way, and breaking any of them multiplies the bill:

- Accept WebSockets with `ctx.acceptWebSocket()`, and answer heartbeats with `setWebSocketAutoResponse`, never timers.
- Set the expiry alarm once, and reschedule it when it fires.
- Never store Items as separate rows.
- Serve the site and OCR model as static assets, never through the Worker.

Free-plan limits fail with errors rather than bills, so the account moves to the $5 Paid plan before public launch.

## Stored Split versions

A stored Split outlives the Worker that wrote it. The record carries `schemaVersion: 1`, and `parseSplit` marks any row it refuses as unreadable (close code 4500), so a rule change can lock people out of a live Split. From launch, any change to `parseSplit` that a stored row could fail bumps `schemaVersion` and ships a migration from the old version in the same change, so a deploy never turns a live Split unreadable. `src/core/golden/` holds one row per shipped release, written by `node scripts/golden-splits.mjs`, and `src/core/parse.test.ts` reads each one. Add a row when a release changes the stored shape.

A Worker rolled back to an older release refuses a row with a newer `schemaVersion` as unreadable. It does not read the row with fields dropped and write the rest away.

Until launch no real Split exists, so `schemaVersion` stays 1 and the reads of older shapes stay in version 1.
