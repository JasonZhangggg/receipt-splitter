# Signed Split ids, write-free misses, and per-Split device ids

Two leaks came out of the hardening-2 review on 2026-10-04.

**Probes spent the write budget.** Any socket request to a well-formed Split id woke that id's Durable Object. partyserver stores the object's name on its first fetch, and the object then deleted everything when no Split was there, so each probe of a random id wrote 2 rows. About 50,000 probes used the free plan's 100,000 daily row writes, the same budget live Splits need (ADR 0005).

**Picks linked phones across Splits.** Every state frame carries each Pick's device id, and a browser kept one id for every Split. Anyone holding two links could tell that the same phone picked a name in both.

## Decision

### Split ids carry a tag

A new Split id is 24 characters: 16 random characters, then the first 8 base64url characters of HMAC-SHA256 of those 16 under the Worker secret `SPLIT_ID_SECRET`. `worker/split-id.ts` mints and checks them. The Worker checks the tag before it routes a socket or a photo request, and ends a 24-character id with a wrong tag as `notFound` (close code 4404) itself, the same ending a missing Split gets. No Durable Object wakes. Guessing a tag takes about 2^47 tries on average.

### Old ids keep routing, and a miss writes nothing

Ids minted before this are 22 random characters with no tag. Their links are already shared, and there is no list of them to check against, because Cloudflare cannot enumerate Durable Objects. So a 22-character id still routes to its Durable Object. `SplitServer.fetch` now answers before partyserver runs: if the object holds no `split` table, it returns the `notFound` socket (or 404 for a photo request) after one read of `sqlite_master`. `worker/probe.test.ts` measures the rows a probe writes. Before this change it measured 2 for a socket probe and 2 for a photo GET. Now it measures 0 for both.

The trade-off is that a 22-character probe still costs one Durable Object request and one row read. It no longer costs writes, and a Worker request is spent either way. A Split under an old id lives until 60 days after its last change, like any other. Once production logs show no traffic to 22-character ids, a follow-up can stop routing them and close the last wake.

### The secret fails safe

If `SPLIT_ID_SECRET` is unset or shorter than 32 characters, `POST /api/splits` answers 503 `unavailable`, and the home page says the network failed. Old 22-character ids keep working, and every 24-character id ends as `notFound`, because none can be checked. The operator sets the secret once:

```sh
openssl rand -base64 32
npx wrangler secret put SPLIT_ID_SECRET --name app
```

Changing the secret afterwards breaks every link signed with the old one. Rotation would need a list of accepted secrets, which nothing needs yet.

### A Pick stores a per-Split device id

`pickDevice` in `src/core/pick-device.ts` turns the browser's 16-character id into the first 22 base64url characters of HMAC-SHA256 of the Split id, keyed by the browser's id. The Split page computes it and sends only that, so the server never sees the browser's id. The HMAC is a small synchronous implementation in `src/core/hmac.ts`, because parsing and applying operations are synchronous on both sides and Web Crypto is async. It is tested against the RFC 4231 vectors.

The same function migrates old data, on the rule that a 16-character device id is a browser's own id and any other length is already per Split:

- `parseSplit` maps every stored 16-character pick to its per-Split id, so a stored pick reaches clients hashed, and the next write stores it hashed (rule 68, roll forward).
- `applyOperation` maps a 16-character device in `pick`, `recordPayment` and `clearPayment`, so on the server a page loaded before the deploy still holds and pays for its own name. That page's UI compares the stored pick against its raw device id, so it shows its own name as picked elsewhere until a reload.
- A browser computes the same id from the same stored browser id, so its old pick still matches it after the deploy.

Tests used other device lengths, such as `phone-one`, and those pass through unchanged.

## Consequences

- New links are 24 characters after `/s/`. The client accepts 22 or 24, and the Worker decides which ones open.
- `wrangler dev` needs a secret to create Splits. The Playwright config and the verify skill pass a local one with `--var`, and `.dev.vars.example` names it.
- The device id is a convenience, not a credential (preferences 1). A per-Split id still lets anyone holding one link send a Payment as that device. That was true before, and this decision does not change it.
