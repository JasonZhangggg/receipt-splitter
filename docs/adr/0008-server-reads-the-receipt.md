# The server reads the receipt with a third-party model, and the device reader stays as the fallback

On 2026-10-03 the operator ruled that receipt data may leave the device to be read (preferences 55 to 57), and approved the reading design the same day (preferences 60 to 62). This replaces ADR 0001's rule that OCR and parsing run only on the device. The on-device OCR reads characters well. The rule-based parser is what fails. The eval in `docs/research/receipt-extraction-eval.md` picked the design by price to performance on real receipts.

- The Host's device still runs OCR. It sends the photo, as a JPEG data URL, and the OCR text, as plain lines, to `POST /api/scan` on the site's own origin. The Worker forwards both to OpenRouter, which sends them to the pinned model hosts.
- The OpenRouter key is the Worker secret `OPENROUTER_API_KEY`. No client sees it. The route refuses a request from another origin with 403.
- The Worker never decodes or re-encodes the image's pixels, because Workers Free allows 10 ms of CPU a request. It refuses a body over 1 MiB with 413 and a photo that is not a JPEG data URL with 400. It reads only the JPEG's frame header, decoding a few bytes of base64 per segment, and refuses with 400 a photo whose longer side is over `SCAN_MAX_IMAGE_PX` (2,560) or that has no frame header. The device downsizes the photo to about 2,048 px and strips its EXIF data before it sends it.
- Pass 1 is GLM-5.3-Flash at `reasoning.effort` `minimal`, with `/nothink` at the start of the prompt, replying in the compact line format. Each call pins one host with `allow_fallbacks: false` and is never sorted by latency. A call that fails, runs past 25 s, or returns an empty reply is retried once on the next listed host.
- The Worker parses the reply into typed values and checks that the lines add up to the printed subtotal and total. A gap of up to 3 cents passes and is returned with the reading.
- Pass 2 runs only when pass 1's reading is malformed or fails the check. GPT-6 Luna at `reasoning.effort` `low`, on Azure then OpenAI, replies with edits against pass 1's numbered lines. A request never routes to `openai/flex`. The edits stand only when they leave no more problems than pass 1 had, and a `drop` of a fee or deposit line is refused.
- A reading that still fails the check is still returned. The client shows the quiet Total check note. The route answers 502 when no pass gives a usable reading.
- Every model setting is a var in `wrangler.jsonc`: the model, the hosts, the effort, the time limit, and the `max_tokens` of each pass. A model or host change is a config change. The on-device reader stays as the fallback that needs no paid model, so a 429, a 502, a network failure, or a slow answer still ends in a reading.
- The cost headers `x-scan-cost` and `x-scan-passes` are sent only when `SCAN_DEBUG_HEADERS` is `true`, which it is not in production. The Worker logs the time, tokens, cost, host, and check result of each scan. It never logs the image, the OCR lines, a reply's text, or the key.

## Limits and cost

Scans are limited apart from creates, in the same `CreateLimiter` Durable Object class as ADR 0005, under the names `scan:<address or /64>` and `scan-daily-cap`. One address may scan 6 times a minute and 30 times a UTC day, and all addresses together 2,000 times a UTC day. These are vars, `SCAN_PER_MINUTE`, `SCAN_PER_DAY`, and `SCAN_DAILY_CAP`, and they await the operator's OK before merge. A refused scan gets 429 with `retry-after` and costs no model call.

The eval measured about $0.001 per receipt for both passes together, so a day of normal scans at the cap costs about $2.

### The dollar budget is the bound

Two earlier versions of this section bounded spend by estimating tokens per input, and both were about 3 times low. Text and images cost far more tokens than an estimate predicts, and a host may price an image above its list rate. So the route bounds dollars directly, and the input caps stay as defense in depth.

`scan-daily-cap` keeps the day's spend in dollars beside the scan count, in the same tally. Each admission checks that the spend plus `SCAN_WORST_CASE_USD` fits under `SCAN_DAILY_BUDGET_USD` ($3), and reserves that worst case in the same storage write that counts the scan. A refusal is the same 429 `dailyLimit` as the scan cap, with `retry-after` at the next UTC midnight, and the client reads on the device. After the model calls, the route swaps the reservation for the sum of each call's `usage.cost` as OpenRouter reported it. A call with no `usage.cost`, such as one that timed out, may still be billed, so a scan with such a call keeps its full worst case. A scan that ends after midnight leaves the new day's tally alone.

Because every admission reserves its worst case inside the Durable Object before its first model call, concurrent scans cannot overshoot the budget. The scans in flight hold their reservations. The spend passes $3 only when one scan's real cost passes `SCAN_WORST_CASE_USD`, which the caps below rule out at today's prices. A day's spend is at most **$3**. Normal scans cost about $0.001, so the budget does not bind before the 2,000-scan cap does.

### One scan's worst case

Measured on 2026-10-03 with direct OpenRouter calls at `max_tokens` 16:

- Text. Pass 1's prompt alone is 740 tokens on GLM-5.3-Flash. With 8,000 characters of OCR text it is 6,385 tokens for letters and digits, 15,475 for CJK, 16,277 for characters outside the BMP, and 19,531 for random BMP characters. The worst is about 2.35 tokens a character, not the 0.5 this section once assumed.
- Images at the cap. A 2,560 by 2,560 px JPEG is 7,936 prompt tokens on GLM on Parasail and 7,937 on BaseTen, and 7,688 on GPT-6 Luna on Azure, against 13 and 7 for the same text with no image. A 1,440 by 2,560 px JPEG is 4,799 on GLM and 4,328 on Luna. GLM scales a larger image down itself (7,936 at 7,400 by 7,400), but Luna does not: 64,596 tokens at 7,400 by 7,400, which is why the route now caps the size.
- Prices. GLM-5.3-Flash is $0.15 in and $0.50 out per million tokens on Parasail and BaseTen. GPT-6 Luna is $0.10 in and $0.50 out on `azure`, and $0.11 in and $0.55 out on `azure/us` and `azure/eu`. Azure billed the 2,560 px image call $0.000968 for 7,688 tokens, which is $0.125 a million, so the image costs a quarter more than the list input price.

The worst scan runs pass 1 on both hosts and pass 2 once:

- Pass 1, each call: 19,531 tokens of prompt and text plus 7,923 of image is 27,454 in, at $0.15, and 3,000 out (`SCAN_PASS1_MAX_TOKENS`) at $0.50. That is $0.00562, and **$0.01124** for two calls.
- Pass 2: the image at Azure's measured rate raised to `azure/us` prices is $0.00106. The prompt, the problems, and pass 1's numbered lines are at most about 10,000 tokens, since pass 1 wrote at most 3,000, which is $0.00110 at $0.11. Then 1,500 out (`SCAN_PASS2_MAX_TOKENS`) at $0.55 is $0.00083. That is **$0.00299**.
- The worst scan is **$0.0142**. `SCAN_WORST_CASE_USD` is $0.015. Without the budget, 2,000 of them in a UTC day would be $28.44. The budget holds that day to $3, about 200 worst-case scans.

Recompute `SCAN_WORST_CASE_USD` when a pass's model, hosts, or `max_tokens` changes, or when the image cap does.

### Durable Object writes

An admitted scan writes at most 5 Durable Object rows: the address's times and its first alarm of the day, the cap's tally and its first alarm of the day, and the tally again when the real cost replaces the reservation. That is at most 10,000 of the free plan's 100,000 daily row writes at the cap, beside the 25,000 that ADR 0005 budgets for creates.

## Privacy

The photo and the OCR text now reach OpenRouter and the model host that serves the call. The pinned hosts are the ones the eval measured. The Worker stores neither. The photo a Host chooses to share with the Split is still the separate downscaled copy of ADR 0007.

## Evidence

The eval and its numbers are in `docs/research/receipt-extraction-eval.md`. The regression harness in `bench/scan/` scores the route against synthetic fixtures, and against the operator's receipts outside the repo.
