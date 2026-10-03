# Receipt extraction eval (2026-10-03)

This records what we measured when choosing how the server reads a receipt. It sits beside `receipt-extraction-models.md`, which covers model prices and providers from primary sources.

The operator ruled on 2026-10-03 that receipt data may go to a server and to a third-party model API (preferences 55-57). The on-device OCR reads characters well; the rule-based parser is what fails.

## Recommendation

Two passes, with a free arithmetic check between them.

1. **Pass 1, every receipt:** GLM-5.3-Flash (`z-ai/glm-5.3-flash`) at `reasoning.effort = "minimal"`, with `/nothink` at the start of the prompt. The input is the photo, the on-device OCR text grouped into plain lines, and the compact line format below. Route to a fast host (`provider.order: ["parasail"]`, fallbacks on).
2. **Server check:** sum the lines and compare them with the printed subtotal and total that the model read.
3. **Pass 2, only when the check fails:** GPT-6 Luna (`openai/gpt-6-luna`) at `reasoning.effort = "low"`, via Azure (`provider.order: ["azure", "openai"]`). Luna replies with short edits (`fix`, `drop`, `add`) against pass 1's numbered lines, never a full rewrite.
4. **Still failing:** show the result with the rows that do not add up flagged, and let the user fix them.

Measured on 8 hard receipts × 3 runs: 20/24 fully correct, 94% of items right, 6.9 s median, 25.9 s worst, $0.00093 per receipt ($9.32 per 10,000). GLM is open weights on about 34 hosts, so pass 1 survives one host disappearing. Luna, a single vendor, runs on about 30-45% of receipts.

## Test set

Eight receipts the operator chose as hard. Truth was read from the photos. For the six with item detail, items sum exactly to the printed subtotal and total.

| id | Receipt | What makes it hard |
|---|---|---|
| r1 | Costco self-checkout | Faded, angled, "3.00-" trailing-minus discounts, CA redemption fee |
| r2 | Home Depot | Long, items wrap to a second line, tax easy to miss |
| r3 | Acme POS demo | Quantity column, weighed item, payment lines that are not charges |
| r4 | Cider Cellar (GBP) | Line discounts, a transaction discount, then a "Discount Total" summary |
| r5 | Walmart Canada | Crumpled, 24 items, faint "1" digits in an item price and in the tax |
| r6 | Dollar General #1 | Per-item "less promo" lines and a bottom "Discount" block that repeats them |
| r7 | Dollar General #2 | Promos and two tax rates |
| r8 | Jelly Cafe | Modifiers, a service charge, suggested tips to ignore |

r6 and r7 are scored on total and tax only. Their test images are tiny (480×640 and 415×738 px), so they understate real phone photos.

"Fully correct" means every item amount, the tax, and the total are right and the lines reconcile. Items are scored by amount as an F1 score.

## Results, in order of discovery

**Single models, photo only, JSON schema output.** Gemini 3.1 Flash-Lite led in a 1-run check (4/8, 97% items, 4 s, $0.0019 per receipt). Qwen3.5-9B scored 5/24, Mistral Small 3.2 3/24, Gemma 4 31B 2/24. Ling 3.0 Flash VL was dropped because most calls failed at its provider.

**OCR text only.** Every model did worse than with the photo, for example Qwen3.5-9B scored 0/24 and gpt-oss-120b 1/24. Models cannot rebuild rows from loose text.

**Photo plus OCR text.** The effect depends on the model. It helped Qwen3.8-Flash (8 → 12/24), was neutral for Qwen3.7-Flash, and hurt Qwen3.5-9B.

**GLM-5.3-Flash and GPT-6 Luna, single pass at low reasoning.** Luna scored 14-15/24, GLM 13/24. GLM was the only model to solve the Dollar General promos.

**Two passes.** Cross-model passes reached 17-21/24. Same-model retries reached 13-17/24, because a model repeats its own misreads. GLM then Luna beat Luna then GLM: Luna fixed 8/8 of GLM's errors, while GLM fixed 3-4 of Luna's. With two passes, OCR helps because it turns GLM's silent errors into loud ones that the check catches.

**Reasoning level.** Luna with no reasoning fixed 0 of 11 errors, so pass 2 needs `low`. GLM mostly ignores `effort`; its reasoning depends on the receipt (0 tokens on Acme, up to 4,600 on Dollar General). Parasail ignored `reasoning.max_tokens`. A prompt prefix does work. `/nothink` roughly halved GLM's reasoning and removed runaways. "Think very briefly" cut reasoning further but dropped accuracy to 0/6 on the hard receipts.

**Final comparison, run concurrently, all compact format, photo plus OCR, 24 runs each:**

| Pass 1, then Luna low | Final fully correct | Items | Median | Worst | $/10k receipts |
|---|---|---|---|---|---|
| GLM minimal + `/nothink` | 20/24 | 94% | 6.9 s | 25.9 s | $9.32 |
| GLM minimal | 19/24 | 96% | 6.2 s | 21.4 s | $6.46 |
| GLM low | 18/24 | 92% | 7.9 s | 39.9 s | $8.75 |
| GLM medium | 17/24 | 95% | 11.8 s | 65.8 s | $10.91 |

The same "GLM low then Luna low" setup scored 21/24 on another day. Differences of 1-3 receipts between runs are normal variation.

## Latency

- Time is mostly output tokens divided by writing speed. Luna writes at about 120 tokens/s on OpenAI standard and at about 400 tokens/s on Azure or OpenAI priority (`openai/fast`). OpenAI flex (`openai/flex`) is a discount tier and must not be used. Luna takes about 2-3 s before its first token.
- GLM writes at about 100-300 tokens/s depending on host and load, and starts in about 0.3 s. Parasail swung from 66 to 149 tokens/s between runs. Sorting providers by `latency` routed GLM to Together, which starts fast but writes slowly, and one receipt took 99 s. Pin hosts instead.
- The compact line format cut GLM's answer from about 660 tokens to about 220. A receipt line went from about 38 tokens of JSON to about 10.
- A tight pass-1 timeout with a Luna fallback is a bad idea. Luna is slower and weaker than GLM on long receipts. Use a generous limit (about 25-30 s) only to catch runaways, and retry GLM on another host.

## Compact formats

Pass 1 reply:
```
SUB|<cents or ->
TOT|<cents>
<k>|<name>|<cents>[|<qty>]      k: i item, d discount, t tax, p tip, s service charge, f fee/deposit
```
Pass 2 reply: `fix|<n>|<k>|<name>|<cents>[|<qty>]`, `drop|<n>`, `add|<k>|<name>|<cents>[|<qty>]`, `SUB|`, `TOT|`, or `ok`.

There is no provider-enforced schema, so the server parses and validates every reply. A malformed reply counts as a failed check.

## Known weak spots and fixes to build

- **Silent misreads.** A model can misread faint digits and the matching subtotal so the check passes. This happened on the crumpled Walmart receipt in most runs.
- **Duplicate savings blocks.** Dollar General prints per-item promos and a summary "Discount" block. Tell pass 1 to use the per-item promos and skip the summary block, because only per-item discounts can be assigned to people.
- **Penny gaps on long receipts.** Accept a gap of a few cents: keep the reading and flag the difference instead of sending it to pass 2. Luna's penny fixes were wrong 2 times out of 3.
- **Pass 2 must not delete deposit or fee lines** to make sums fit.
- **The check raises false alarms** on subtotals printed before discounts and on tax-free receipts. It must accept both.
- **Image resolution.** Send the model a sharper image (about 2048 px, cropped to the receipt), not the 1280 px, 150 KB copy stored for "View receipt". The tiny Dollar General test images are the main reason their digits were misread.

## Harness

The harness, results and the operator's receipt photos live outside the repo in `~/receipts-eval/`, because the photos hold payment data. The API key lives in `~/.config/receipt-eval/env`.

| File | Purpose |
|---|---|
| `eval.mjs` | Single-pass runs |
| `compact.mjs` | Compact two-pass runs (`TAG`, `R1`, `R2`, `PREFIX`, `SINGLE`, `OCR1`, `P1`, `ONLY`, `RUNS`) |
| `report.py`, `report2.py` | Tables |
| `truth.json` | Answer key |
| `ocr/` | On-device OCR boxes from `bench/run-ocr.mjs` |

Total API spend was about $0.88 across two OpenRouter keys. Both keys appeared in chat and must be rotated.
