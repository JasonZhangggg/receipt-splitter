# Gemini reads the receipt, on Google's flex tier, with a deadline on each step

On 2026-10-04 the operator replaced the reading passes of ADR 0008 with Gemini (preferences 60). GLM-5.3-Flash then GPT-6 Luna got 20 of 24 readings of the hard receipts right, but GLM's reasoning sometimes ran for 20 s or more, and Luna's pass 2 added 4.6 to 11.8 s. The goal was a scan under 10 s at no loss in accuracy and no rise in cost. ADR 0008 still holds for the route, the input caps, the rate limits, the dollar budget, and privacy. This ADR replaces its pass bullets and its worst-case figure.

## The pipeline

`readReceipt` in `worker/scan/reader.ts` runs these steps. Every model, host, effort, resolution, deadline, per-call cost bound, and time budget is a var in `wrangler.jsonc`.

1. **Pass 1 on flex.** Gemini 3.1 Flash-Lite (`SCAN_PASS1_MODEL`) at `reasoning.effort` `minimal`, with `media_resolution` `MEDIA_RESOLUTION_MEDIUM`, pinned to `google-ai-studio/flex` with fallbacks off. It gets the pass-1 prompt, the OCR lines, and the photo. The prompt no longer starts with `/nothink`, which only GLM needed. The eval dropped it for Gemini too.
2. **Pass 1 on the standard tier.** When the flex call has no complete reply after 3.5 s (`SCAN_PASS1_FLEX_DEADLINE_MS`), the Worker aborts it. It also moves on when the call fails or the reply is empty. It then sends the same messages to `google-vertex/global`, then to `google-ai-studio`, one call each, until one answers. These calls use the model's default resolution, as the eval measured them. Each gets what remains of the pass-1 budget (step 8), so a slow Vertex call leaves AI Studio nothing.
3. **The check.** As before, the lines must add up to the printed subtotal and total within 3 cents.
4. **Pass 2, only when the total fails.** Gemini 2.5 Flash with reasoning off (`SCAN_PASS2_EFFORT` is `off`), on `google-ai-studio/flex`. It gets the pass-2 prompt with the arithmetic breakdown from `worker/scan/breakdown.ts` appended, and the photo. Its edits stand when they leave no more problems than pass 1 had. A malformed pass-1 reply also goes to pass 2. A reading whose total reconciles but whose subtotal misses goes back as it is. It still fails the check, and the client shows the gray note (preferences 6).
5. **The penny review, only when the total passes off by 1 to 3 cents.** Gemini 3.1 Flash-Lite at `minimal` and MEDIUM on flex gets the pass-2 prompt with the problem "all lines miss the printed total by $0.02 (short); a receipt adds up to the cent, so one amount is likely misread by a digit", plus the subtotal gap when there is one, and the breakdown. Its edits stand only when the reading then reconciles to the cent, which means a total gap of 0 and a subtotal gap of 0. An edit that fixes the total and leaves the subtotal 1 cent off is rejected, and so is the reverse (`reader.test.ts` pins each half). Otherwise pass 1's reading stands.
6. **Rule R.** `applyEdits` refuses an `add`, `after`, or `fix` from either review that writes an item, discount, fee, or service line whose name contains the word "total". Tax and tip lines are exempt, because some receipts print their only tax line as "Total tax". The other edits apply.
7. **The review deadline.** Pass 2 or the penny review must answer within 9.8 s of the scan's start (`SCAN_REVIEW_BY_MS`, a 10 s budget less 200 ms). The Worker aborts a late review and returns pass 1's reading. When pass 1 used up the time, no review runs. A review is also skipped when less than 1 s remains (`SCAN_REVIEW_MIN_MS`), because the call would be aborted before it could answer.
8. **The pass-1 budget.** Every pass-1 call ends by 8.5 s after the scan starts (`SCAN_PASS1_BY_MS`). The flex call runs for the shorter of 3.5 s and that budget, and each standard call gets what remains of it. A call with under 100 ms left is not made. A scan with no reading by then runs no review and answers 502, so the client reads on the device. A pass 1 that fails sooner, such as a 429 on every host, still goes to pass 2 as before. With the review deadline, the longest a scan runs is 9.8 s plus the Durable Object admission, where the earlier settings allowed about 53.5 s (3.5 s flex, 25 s Vertex, 25 s AI Studio). The client waits 15 s before it reads on the device (`SCAN_TIMEOUT_MS`): the 9.8 s bound, the upload, and a network margin.

Each scan logs one `"event":"scan"` line. Its `path` names the pass-1 tier that answered (`flex`, `standard`, or `failed`), the review that ran (`pass2` or `penny`), how the review ended (`kept`, `rejected`, `no time`, or `call failed`), and how many edits rule R refused. Each call logs its step, host, time, tokens, cost, and outcome. The line never holds the photo, the OCR lines, or a reply's text.

## Evidence

The eval harness is in `~/receipts-eval/hillclimb/`, outside the repo. Every row below is in `decision.tsv` there, and the numbers are measured. The test set is the operator's eight hard receipts, r1 to r8, scored 3 runs each (24 readings). "Silent" means a wrong reading that passes the check, which the user cannot see.

| Pipeline | Fully correct | Silent | Median | Worst | Over 10 s | $ per 10k scans |
|---|---|---|---|---|---|---|
| GLM then Luna, as shipped (first `C1`, 2026-10-04) | 20/24 | 4 | not logged | 17.7 s | 3 | $6.53 |
| Gemini, no rule R or P (`C1`, fresh batch A) | 14/24 | 3 | not logged | not logged | not logged | $5.41 |
| Gemini with rules R and P, this ADR (`C1`, fresh batch ARP) | 20/24 | 0 | 1.4 s | 4.6 s | 0 | $5.58 |

How the design got there, row by row:

- **Flex and its tail (first `I1`).** Pass 1 on `google-ai-studio/flex` costs half the standard price at equal accuracy. Its tail reached 15.7 s and 25.0 s, so a 3.5 s deadline with Vertex behind it keeps the worst case at 5.6 s and the cost 41% below Vertex alone. Vertex's own flex tier queued for about 16 s and was dropped.
- **No cheaper reader (first `I2`).** Fourteen cheaper vision models scored no better than Gemini 3.1 Flash-Lite. Every model under $2 per 10k scored 0 to 2 of 6.
- **MEDIUM resolution (first `I5`).** It cut pass-1 cost by 9% with equal accuracy. Low detail lost accuracy (9/24).
- **Pass 2 only on a failing total (first `I6`).** Skipping the subtotal-only misses saved $1.88 per 10k. The eval does not score the subtotal, so part of its accuracy gain is an artifact of the metric. The cost saving is real.
- **Gemini 2.5 Flash as pass 2 (first `I9`, first `C1`).** About $0.0002 a call. The first 18/24 with it as pass 2 is row `I9`, and the confirming batch (`C1`) scored 18/24 twice with a 3.2 s worst case.
- **Baseline for the rules (`H0`).** Pipeline A scored 15/24 with 3 silent errors on stored readings.
- **Rule R (`I3`).** On r6, pass 2 removed a repeated discount block and then added the printed deposit total as a new fee. Refusing such edits turned r6's repeat repair right on 3 of 3 runs, 18/24 in all. The check still flags a 12-cent subtotal gap on r6, so r6 fails loudly with the gray note and does not pass silently.
- **Rule P (`I4`).** On r3, pass 1 misread one digit by 2 cents, inside the tolerance. The penny review fixed it on 6 of 6 inputs, 21/24 with 0 silent errors. Gemini 2.5 Flash as the penny reviewer made bad edits that the exact-reconcile rule reverted.
- **Hold-out (`H1`).** On 14 synthetic receipts the tuning never saw, 3 runs each, A scored 39/42 with 0 silent errors, a 1.1 s median, and $4.60 per 10k. A 9.8 s worst case came from 3 flex fallbacks. Rules R and P left the score at 39/42, because no hold-out receipt triggered either rule.
- **Rejected ideas (`I1`, `I2`, `I5` to `I8`).** Prompt patches for repeated discounts, coupons, a printed savings total, and deposit totals did not help. A second reader of another model family, a smallest-passing-subset of edits, and a retried pass 2 did not help either, or cost too much.

The earlier write-ups in `~/receipts-eval/` (`pipeline-eval.md`, `gemini-2pass-eval.md`, `gemini-reasoning-eval.md`, `nothink-breakdown-eval.md`, `timing-breakdown.md`) show the same cause from the other side. GLM's reasoning cannot be switched off through OpenRouter. In `nothink-breakdown-eval.md`, which tried to stop GLM from reasoning, GLM pass 1 alone ran over 10 s on 6 to 8 of 27 readings in each GLM arm. The shipped GLM then Luna pipeline in the table above had 3 readings over 10 s in the later hill-climb batch, so the two counts come from different evals and do not conflict. In the live timing run, the slow scans waited 24 to 25 s on GLM's pass 1.

## One vendor, against preferences 57

Preferences 57 asks for open-weight models served by several providers. Every model call now goes to Google. The operator chose that for speed and recorded the exception. A Google price rise or a model removal now hits every pass at once. Three things limit the damage:

- **A config swap.** A model, host, effort, or resolution change is a var change in `wrangler.jsonc` and a deploy, with no code change. `scanConfig` refuses a missing or invalid var with a 503, so a bad swap fails closed and the client reads on the device.
- **The device reader.** The on-device OCR and parser need no paid model. Any status but 200, a network failure, or no reply in 15 s falls back to it with no message (`src/scan/client.ts`).
- **Two Google products.** The standard fallback tries Vertex and then AI Studio, so one Google product's outage does not stop pass 1.

## Flex tail handling

Flex is Google's discount tier. It is usually as fast as the standard tier and sometimes queues for many seconds. The Worker does not wait. `callModel` passes `AbortSignal.timeout` to `fetch`, and the signal covers reading the body, so a reply still arriving at 3.5 s is dropped with it. In the live check on 2026-10-04, with the flex deadline set to 1 ms, the Worker aborted the flex call after 7 ms and Vertex read the receipt in 1.9 s.

An abandoned, timed-out, or failed call reports no cost, and Google may still bill it. So the route counts that call at its own worst-case bound (see Cost), not the whole scan at `SCAN_WORST_CASE_USD`. A flex call abandoned at its deadline followed by a Vertex call counts about $0.0049 plus the Vertex call's reported cost, near $0.005, not $0.03. The reservation of `SCAN_WORST_CASE_USD` at admission stays, so concurrent scans still cannot overshoot the budget. An HTTP error counts $0.

## The OpenRouter rate limit

In the 2026-10-04 eval, OpenRouter allowed this account 20 requests a minute per model (observed, and possibly a limit on a new account that a later limit raises). One run hit it on 121 of 162 calls (observed in the same eval). Production uses the same key as the evals (preferences 61). Pass 1 and the penny review both call Gemini 3.1 Flash-Lite, so the whole site gets about 20 scans a minute, fewer while an eval runs. The per-address limit of 6 a minute does not raise that.

When the limit hits, OpenRouter answers 429 with no completion. Pass 1 tries flex, Vertex, and AI Studio, which all refuse at once, because the limit is per model. Pass 2 then runs on Gemini 2.5 Flash, which has its own limit, with the "first reading could not be parsed" problem, and builds a reading from add lines. When pass 2 is refused too, the route answers 502 and the client reads on the device. A refused request costs nothing, so the route counts a 429 at $0 and the budget does not drain during the limit (inferred from OpenRouter billing only completions).

## Cost

Measured on 2026-10-04 with OpenRouter calls at `max_tokens` 16:

- Prices per million tokens, input then output. Gemini 3.1 Flash-Lite is $0.125 and $0.75 on `google-ai-studio/flex`, and $0.25 and $1.50 on `google-vertex/global` and on `google-ai-studio`. Gemini 2.5 Flash is $0.15 and $1.25 on `google-ai-studio/flex`.
- Pass 1's prompt with 8,000 characters of random BMP text is 19,862 tokens. Astral characters (4,000 of them) are 7,234 tokens, and digits 8,302.
- A 2,560 by 2,560 px JPEG is about 1,087 tokens on 3.1 Flash-Lite at the default resolution, 528 at MEDIUM, and 258 on 2.5 Flash.

The worst scan runs all three pass-1 calls at the input cap and 3,000 output tokens each, then pass 2:

- Flex: 20,390 tokens in at $0.125 and 3,000 out at $0.75 is $0.00480. The Worker may abort it, but it may still bill.
- Vertex and AI Studio: 20,950 tokens in at $0.25 and 3,000 out at $1.50 is $0.00974 each, $0.01948 for both.
- Pass 2: at most about 6,000 tokens in (the prompt, up to 3,000 tokens of numbered pass-1 lines, the breakdown, and the image) at $0.15, and 1,500 out at $1.25, is $0.00278. The penny review costs less, $0.00194, and never runs with pass 2.
- The worst scan is **$0.0271**. `SCAN_WORST_CASE_USD` is $0.03, about 10% above it, up from $0.016. The $3 budget holds 100 worst-case reservations at once.

**Per-call bounds.** Each call that reports no cost, because it was abandoned at a deadline, timed out, or failed after it may have been billed, counts at its own bound, which is a var: `SCAN_PASS1_FLEX_BOUND_USD` $0.0049 (the flex figure above, rounded up), `SCAN_PASS1_STANDARD_BOUND_USD` $0.0098, `SCAN_PASS2_BOUND_USD` $0.0028, and `SCAN_PENNY_BOUND_USD` $0.0020. The route settles the day's tally at the sum of each call's reported cost or its bound. A call that returned an HTTP error counts $0, and the reservation holds only until the settle. Recompute each bound with `SCAN_WORST_CASE_USD` when a target's model, host, `max_tokens`, or the text or image cap changes.

A normal scan costs much less. The live check read four receipts for $0.0003 to $0.0008 each, and the eval's mean is $5.58 per 10k scans.

## Where this setup differs from what the eval measured

- **No streaming.** The eval streamed every call to log its first token. The Worker makes one plain call and reads the whole JSON body under the abort signal. The deadline means a complete reply in both, so the measured fallback rate carries over.
- **The penny review fires on the total alone.** The harness's `pennyProblems` also fired when only the subtotal was off by 1 to 3 cents. Preferences 60 says the total, so the Worker sends a subtotal-only penny gap to no review. On r1 to r8 and the hold-out, the penny review fired on r3 only, where the total was off.
- **A refused call counts as free.** The eval charged a call whatever OpenRouter reported. The Worker counts an HTTP error at $0, as described above.

## Known limits

- Rule R matches the word "total" only. A model that labels a summary line "Totals", "TTL", or "Tot." gets past it. Follow-up: widen the match, and measure it on a receipt that prints such a label.
- When the OpenRouter limit returns 429 on every pass-1 host, an unparsed pass 1 goes to pass 2 with the photo and no OCR-based reading to edit. That path is unmeasured. Follow-up: run the eval with pass 1 forced to fail, and decide whether a 429 storm should skip pass 2.
- A receipt that prints repeated discount lines and item-naming coupons after the items still fails, as r7 does on 3 of 3 runs. The check catches it, so the user sees the gray note, not a silent error.
- Rule R and rule P each rest on one receipt, r6 and r3. The hold-out shows that neither rule did harm, and it does not show that they help.
- How often rule P fires on real receipts is not measured. Each firing adds one Flash-Lite call, which cost $0.00016 on r3.
- Gemini is deterministic per host and resolution, so 3 runs of one receipt are close to one sample. A one-receipt difference between pipelines is noise.
