# No Turnstile: a per-IP limit and a daily cap guard Split creation

On 2026-10-01 the operator removed Cloudflare Turnstile from creating a Split. In production the real-key widget never rendered under the home page's `Cross-Origin-Embedder-Policy: require-corp`, so nobody could create a bill. The same widget rendered on a page of the same host without isolation. Cross-origin isolation stays, because OCR needs `SharedArrayBuffer` to run on 4 threads. Turnstile also added a step to the one action that should take no effort.

Two limits in `worker/rate-limit.ts` now guard `POST /api/splits`, both stored in the `CreateLimiter` Durable Object:

- Each client address may create 10 Splits a minute. An IPv6 address counts as its /64. A create without `cf-connecting-ip` gets 503, because it cannot be limited. `wrangler dev` fills that header from the socket, so local development needs no exception.
- All clients together may create `DAILY_CREATE_CAP` (1,500) Splits per UTC day. The instance named `daily-cap` keeps the count with its UTC day and clears it with an alarm at the next UTC midnight. Over the cap a create gets 429 with `refused: "dailyLimit"`, and the home page says when new splits open in the viewer's own time. Existing Splits keep working.

The cap protects Cloudflare's free-plan budget of 100,000 Durable Object row writes a day. `worker/create-cost.test.ts` measures 12 row writes per create, counted from the POST through the first connect to expiry. A budget of 15 per create covers the table drop at expiry, which the test cannot see. 1,500 creates use 22,500 writes, under a quarter of the day, which leaves the rest for claims and edits on live Splits. If the create path gains a write, that test fails, and the cap needs new arithmetic.

The trade-off is that a distributed script can use up a day of creates for everyone. It cannot run up a bill or exhaust the writes that live Splits need. If that happens in practice, the next step is a challenge that works under COEP, not a lower cap.
