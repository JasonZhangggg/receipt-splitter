# One Cloudflare Durable Object per Split, kept cheap by design

Live Splits are stored in one SQLite-backed Cloudflare Durable Object each, with updates pushed over hibernating WebSockets. The whole Split is one JSON record of at most about 32 KB, and it is deleted 60 days after its last change. We chose this over a shared database or polling because it costs nothing on the Workers Free plan at low volume and about $5–10 a month at 100,000 Splits a month, while claims still show up instantly. Four rules keep it that way, and breaking any of them multiplies the bill:

- Accept WebSockets with `ctx.acceptWebSocket()`, and answer heartbeats with `setWebSocketAutoResponse`, never timers.
- Set the expiry alarm once, and reschedule it when it fires.
- Never store Items as separate rows.
- Serve the site and OCR model as static assets, never through the Worker.

Free-plan limits fail with errors rather than bills, so the account moves to the $5 Paid plan before public launch.
