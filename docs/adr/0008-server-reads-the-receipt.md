# The server reads the receipt with a third-party model, and the device reader stays as the fallback

On 2026-10-03 the operator ruled that receipt data may leave the device to be read (preferences 55 to 57), and approved the reading design the same day (preferences 60 to 62). This replaces ADR 0001's rule that OCR and parsing run only on the device. The on-device OCR reads characters well. The rule-based parser is what fails. The eval in `docs/research/receipt-extraction-eval.md` picked the design by price to performance on real receipts.

- The Host's device still runs OCR. It sends the photo, as a JPEG data URL, and the OCR text, as plain lines, to `POST /api/scan` on the site's own origin. The Worker forwards both to OpenRouter, which sends them to the pinned model hosts.
- The OpenRouter key is the Worker secret `OPENROUTER_API_KEY`. No client sees it. The route refuses a request from another origin with 403.
- The Worker never decodes or re-encodes the image, because Workers Free allows 10 ms of CPU a request. It refuses a body over 1 MiB with 413 and a photo that is not a JPEG data URL with 400. The device downsizes the photo and strips its EXIF data before it sends it.
- Pass 1 is GLM-5.3-Flash at `reasoning.effort` `minimal`, with `/nothink` at the start of the prompt, replying in the compact line format. Each call pins one host with `allow_fallbacks: false` and is never sorted by latency. A call that fails, runs past 25 s, or returns an empty reply is retried once on the next listed host.
- The Worker parses the reply into typed values and checks that the lines add up to the printed subtotal and total. A gap of up to 3 cents passes and is returned with the reading.
- Pass 2 runs only when pass 1's reading is malformed or fails the check. GPT-6 Luna at `reasoning.effort` `low`, on Azure then OpenAI, replies with edits against pass 1's numbered lines. A request never routes to `openai/flex`. The edits stand only when they leave no more problems than pass 1 had, and a `drop` of a fee or deposit line is refused.
- A reading that still fails the check is still returned. The client shows the quiet Total check note. The route answers 502 when no pass gives a usable reading.
- Every model setting is a var in `wrangler.jsonc`: the model, the hosts, the effort, the time limit, and the `max_tokens` of each pass. A model or host change is a config change. The on-device reader stays as the fallback that needs no paid model, so a 429, a 502, a network failure, or a slow answer still ends in a reading.
- The cost headers `x-scan-cost` and `x-scan-passes` are sent only when `SCAN_DEBUG_HEADERS` is `true`, which it is not in production. The Worker logs the time, tokens, cost, host, and check result of each scan. It never logs the image, the OCR lines, a reply's text, or the key.

## Limits and cost

Scans are limited apart from creates, in the same `CreateLimiter` Durable Object class as ADR 0005, under the names `scan:<address or /64>` and `scan-daily-cap`. One address may scan 6 times a minute and 30 times a UTC day, and all addresses together 2,000 times a UTC day. These are vars, `SCAN_PER_MINUTE`, `SCAN_PER_DAY`, and `SCAN_DAILY_CAP`, and they await the operator's OK before merge. A refused scan gets 429 with `retry-after` and costs no model call.

The eval measured about $0.001 per receipt for both passes together, so a day of normal scans at the cap costs about $2.

One scan is bounded apart from that. The route refuses OCR text over 8,000 characters in all with 400, and `max_tokens` is 3,000 for pass 1 and 1,500 for pass 2 (`SCAN_PASS1_MAX_TOKENS`, `SCAN_PASS2_MAX_TOKENS`). At OpenRouter's list prices on 2026-10-03, GLM-5.3-Flash is $0.15 in and $0.50 out per million tokens, and GPT-6 Luna is $0.10 in and $0.50 out. The worst case assumes 7,000 input tokens a call, which is the 8,000 characters at two characters a token plus the prompt and the photo. It also assumes pass 1 runs on both hosts and pass 2 runs once. Pass 1 then costs 7,000 x $0.15 + 3,000 x $0.50 per million, or $0.00255 a call, twice. Pass 2 costs 7,000 x $0.10 + 1,500 x $0.50 per million, or $0.00145. The worst scan is **$0.00655**, and 2,000 of them in a UTC day are **$13.10**. Without the text cap, one request with 400 lines of 300 characters sent about 24.9k input tokens in pass 1, 18 times a normal scan. Azure or another host may price Luna differently from the list, so recompute these numbers when `SCAN_PASS2_HOSTS` changes. An admitted scan writes at most 4 Durable Object rows: the address's times and its first alarm of the day, and the cap's tally and its first alarm of the day. That is at most 8,000 of the free plan's 100,000 daily row writes at the cap, beside the 25,000 that ADR 0005 budgets for creates.

## Privacy

The photo and the OCR text now reach OpenRouter and the model host that serves the call. The pinned hosts are the ones the eval measured. The Worker stores neither. The photo a Host chooses to share with the Split is still the separate downscaled copy of ADR 0007.

## Evidence

The eval and its numbers are in `docs/research/receipt-extraction-eval.md`. The regression harness in `bench/scan/` scores the route against synthetic fixtures, and against the operator's receipts outside the repo.
