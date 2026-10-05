# Receipt extraction eval (2026-10-03)

This records what we measured when choosing how the server reads a receipt. It sits beside `receipt-extraction-models.md`, which covers model prices and providers from primary sources.

The operator ruled on 2026-10-03 that receipt data may go to a server and to a third-party model API (preferences 55-57). The on-device OCR reads characters well; the rule-based parser is what fails.

## Recommendation

The current recommendation is Gemini, and [ADR 0010](../adr/0010-gemini-reads-the-receipt.md) records it with its evidence. Gemini 3.1 Flash-Lite reads on Google's flex tier with a 3.5 s deadline and the standard tier behind it. Gemini 2.5 Flash repairs a failing total. A 2026-10-04 eval of that pipeline scored 20/24 with no silent errors, a 4.6 s worst case, and $5.58 per 10,000 scans. The GLM and Luna recommendation below is the 2026-10-03 one, kept for its history.

Two passes, with a free arithmetic check between them.

1. **Pass 1, every receipt:** GLM-5.3-Flash (`z-ai/glm-5.3-flash`) at `reasoning.effort = "minimal"`, with `/nothink` at the start of the prompt. The input is the photo, the on-device OCR text grouped into plain lines, and the compact line format below. Pin a fast host (`provider.order: ["parasail"]`) with fallbacks off, and retry on a second pinned host when pass 1 runs long (see **Guards to build**).
2. **Server check:** sum the lines and compare them with the printed subtotal and total that the model read.
3. **Pass 2, only when the check fails:** GPT-6 Luna (`openai/gpt-6-luna`) at `reasoning.effort = "low"`, via Azure (`provider.order: ["azure", "openai"]`). Luna replies with short edits (`fix`, `drop`, `add`) against pass 1's numbered lines, never a full rewrite.
4. **Still failing:** show the result with the rows that do not add up flagged, and let the user fix them.

Measured on 8 hard receipts × 3 runs with the old compact format: 20/24 fully correct, 94% of items right, 6.9 s median, 25.9 s worst, $0.00093 per receipt ($9.32 per 10,000). The `-` child format in **Compact formats** replaces it. It scored the same 20/24 and adds Bundles, detail lines, and per-item discounts (see **Format findings (2026-10-03)**). GLM is open weights on about 34 hosts, so pass 1 survives one host disappearing. Luna, a single vendor, runs on about 30-45% of receipts.

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

Pass 1 replies in the `-` child format. The first two lines are the printed subtotal and total. Every line after them follows the receipt's printed order.

```
SUB|<cents or ->[|pre]          pre: the subtotal is printed before discounts
TOT|<cents>
i|<name>|<cents>[|<qty>]        an Item; the cents cover every unit
+|<detail>                      supplementary text under an item
-|<name>|<cents>                a discount printed under an item
d|<name>|<cents>                a discount on the whole order
b|<header>                      opens a Bundle
>i|... and >d|...               a line inside the open Bundle; >d is its discount
t|<name>|<cents>                tax
p|<name>|<cents>                tip
s|<name>|<cents>                service charge
f|<name>|<cents>                fee or deposit
```

An invented receipt in this format:

```
SUB|3225
TOT|3525
i|Cold Brew|575
+|Large, oat milk
i|Club Sandwich|1250
-|Member discount|-200
b|Wing Bucket
>i|Hot Wings|900
>i|Garlic Fries|500
>d|Bucket discount|-300
i|Lemonade|600|2
d|Coupon|-100
t|Tax|290
f|Bag fee|10
```

- A `+` line holds supplementary information about the item above it: a size, a flavor, a weight, or an unpriced modifier. It has no amount.
- A `-` line is a discount printed under an item. The server folds it into that Item's price, so the Club Sandwich above becomes an Item at $10.50.
- A `d` line is always order-level, wherever it sits.
- `b|<header>` opens a Bundle. Lines that start with `>` belong to it, and `>d` is the Bundle's discount.
- No line carries a priced add-on (`+|<text>|<cents>`). Priced `+` lines come back only when a receipt with a priced add-on can test them.

The server parses every reply and applies these rules, carried over from the v2 round:

- The server makes every discount amount negative. A receipt can print a discount without a minus.
- A decimal after the amount (`i|Apples|189|1.35`) is a weight and goes to the detail. It is not a quantity.
- With `SUB|<cents>|pre`, the check compares the subtotal with the items before any `-`, `d`, or `>d` line.

Pass 2 replies with edits against pass 1's numbered lines: `fix|<n>|<line>`, `drop|<n>`, `after|<n>|<line>`, `add|<line>`, or `ok`. `after|<n>` inserts after line n and the `+` and `-` lines under it, so an edit never separates an item from its detail or its discount.

There is no provider-enforced schema, so the server parses and validates every reply. A malformed reply counts as a failed check.

## Format findings (2026-10-03)

The operator asked for Bundles, item details, and per-item discounts in the reading. Three prompt rounds (v1, v2, v3), an ablation round, and a JSON-schema comparison tested how to get them without losing accuracy. The rounds ran GLM at `reasoning.effort = "low"` with `/nothink`, then Luna low on Azure, 3 runs on r1-r8. Preferences 60 sets `minimal` for pass 1, so the build's first harness run records the score at that setting.

t1 joined the set for Bundles. It is the synthetic Topgolf image `e2e/fixtures/topgolf-synthetic.png`, drawn from `src/parse/fixtures/topgolf.tsv`, so its OCR is perfect. The answer key gained nested lines with name and detail pairs, Bundle members, and Bundle discounts for r3, r4, r8, and t1.

### Results

The final arms, on r1-r8. Every count is out of 24 readings. Differences of 1-3 receipts between runs are noise, so read these numbers as tiers, not ranks.

| Arm | Final fully correct | Pass 1 fully correct | Items F1 | Wrong with a passing check | Pass 2 runs | Pass-1 output tokens (median) | r4 per-item split right |
|---|---|---|---|---|---|---|---|
| `-` child, ablation batch | 20/24 | 18/24 | 97.2% | 2 (r5) | 4 | 680 | 2/3 |
| `-` child, beside JSON | 20/24 | 17/24 | 97.2% | 2 (r5) | 5 | 803 | 3/3 |
| v3, batch A | 18/24 | 14/24 | 91.2% | 4 | 6 | 1,011 | 0/3 |
| v3, batch B | 18/24 | 13/24 | 91.1% | 4 | 7 | 845 | 0/3 |
| No fold | 20/24 | 17/24 | 95.4% | 2 (r5) | 5 | 1,016 | n/a |
| No Bundle rules | 20/24 | 16/24 | 97.2% | 1 (r5) | 7 | 799 | 2/3 |
| JSON schema | 19/24 | 15/24 | 94.3% | 0 | 9 | 1,194 | 1/3 |
| Old format | 19/24 | 16/24 | 96.0% | 0 | 11 | 661 | not scored |

- v3 folds a `d` line into the item above it by position. No fold keeps every discount order-level, so it cannot split r4's discounts by item. No Bundle rules is v3 without the `b|` line, the Bundle rule, and the Bundle part of the example.
- The old format ran earlier the same day, in a separate batch. Its scorer did not check per-item discounts, so its 0 readings wrong with a passing check do not compare with the other rows.
- "Fully correct" matches item amounts as a multiset. The r4 column checks which item gets which discount, which "fully correct" does not.
- On t1, the `-` child format found both Bundles with the right members and discounts in 3/3 readings. The old format listed each $0.00 Bundle header as an Item in every reading. No arm made a false Bundle on r1-r8.
- r5 fails in every arm. Its misread digits and a matching misread subtotal pass the check.

The `-` child format is the best per-item design measured. It tied the best final score, needed the fewest second passes, wrote the fewest output tokens of the new formats, and put r4's per-item discounts on the right items more often than any other arm. Bundle rules showed no harm on Bundle-free receipts and cost 93 input tokens.

### Dropped from the format

- **The printed unit price** (`i|<name>|<cents>|<qty>|<unit>`). Only r3 prints one. It caught nothing and raised one false alarm when the model put a weight in the unit field.
- **`CNT|<n>`, the printed item count.** Every count matched, so it cost tokens and caught nothing.
- **`?` for unreadable digits.** The model never used it in 54 readings, including r5's misreads. It does not reach a silent misread.
- **The rule that moves a size on the name line into the detail.** It had no effect. t1 kept the size in the name in 24 of 27 item readings with or without the rule.
- **Expanding abbreviations in names.** v1 and v2 wrote two wrong expansions and one guess on r1. Names as printed removed all three.
- **Fold by position (v3).** v3 folded a `d` line into the item above it. On r4 the model misread the two small per-item discounts but kept their sum, so the check passed and pass 2 never ran. Both v3 arms had 4 readings wrong with a passing check, against 1-2 for every other arm. A separate `-` kind lets the model say which discounts belong to an item, and `d` stays order-level.

### Names and details

- A name stays as printed, apart from casing. The name holds everything needed to identify the item.
- The detail is supplementary: a size, a flavor, a weight, or an unpriced modifier. It works when the receipt prints the modifier on its own line. r8's modifiers came out right in 18 of 18 readings per version.
- A size printed on the name line stays in the name. The model does not move it, so the app keeps `nameParts` in `src/ui/split-view/model.ts` as the fallback for an Item with no detail.
- A weighed item comes out as one Item with its weight in the detail.

### Why not a JSON schema

Both hosts enforce a strict JSON schema. A probe asked Parasail's GLM and Azure's Luna to fill a required field that the prompt never mentions, and both did, which only constrained decoding produces.

The schema still lost. In one run beside the compact format, with both pinned to Parasail:

- JSON wrote at about 43 tokens/s against about 279 tokens/s for compact in the same minutes, about 6x slower. It also wrote about 50% more output tokens.
- The median reading took 26.0 s with JSON against 2.9 s compact, about 9x slower.
- JSON cost about 43% more per receipt ($0.00106 against $0.00074).
- JSON scored 19/24 against 20/24 and sent 9 readings to pass 2 against 5.
- JSON listed t1's $0.00 Bundle headers as Items inside their Bundles in every reading.

A schema would not have prevented any compact failure seen so far. Every unparseable compact reply was an empty reply after the reasoning cap, and JSON calls fail the same way. Earlier "invalid JSON" failures came from other models and hosts, never from GLM or Luna on the pinned hosts. The server validates every reply either way.

### Guards to build

- **Retry pass 1 on another pinned host when it runs long.** One v3 reading ran away to the 8,000-token reasoning cap after 228 s. With fallbacks on, Parasail handed 8 of 27 v3 readings to InferenceNet at 15-56 s each. With hosts pinned, no ablation reading needed a retry.
- **Make item discounts visible.** A swapped per-item split passes every check, and r4's split was right in only 2 of 3 ablation readings. Preferences 62 shows the folded discount in the Item's detail line, such as "$2.00 off", so a discount on the wrong Item is easy to spot.
- **Accept a penny gap.** On long receipts, accept a gap of a few cents: keep the reading and flag the difference instead of sending it to pass 2. Luna's penny fixes were wrong 2 times out of 3.
- **Accept a subtotal printed before discounts** (`SUB|<cents>|pre`). It removed the old check's false alarm on r4 and t1.
- **Accept a receipt with no tax line.** The old check raised a false alarm on tax-free receipts.
- **Never let pass 2 delete a fee or deposit line** to make the sums fit.
- **Send a sharper image.** Send about 2048 px on the long edge, cropped to the receipt, not the 1280 px, 150 KB copy stored for **View receipt**. The tiny Dollar General test images are the main reason their digits were misread.
- **Prefer per-item promos over a summary block.** Dollar General prints per-item promos and a summary "Discount" block. Pass 1 uses the per-item promos and skips the summary, because only per-item discounts can be assigned to people. v1 read both and counted the savings twice.

### Gaps

- The only Bundle receipt is t1, and it is synthetic with perfect OCR. Its Bundle scores are an upper bound until a real Bundle photo is tested.
- No receipt in the set has a priced add-on or a void, so those rules are untested.
- r6 and r7 have no item-level truth. They are scored on total and tax only, so per-item promos there are unchecked.
- Silent misreads like r5's are not caught. An independent read of the total on long receipts may catch them. That is untested.

## Harness

The harness, results and the operator's receipt photos live outside the repo in `~/receipts-eval/`, because the photos hold payment data. The API key lives in `~/.config/receipt-eval/env`. Preferences 61 keeps that key in use, and it becomes the Worker secret for the receipt-reading build. Never print it or commit it.

| File | Purpose |
|---|---|
| `eval.mjs` | Single-pass runs |
| `compact.mjs` | Old-format two-pass runs (`TAG`, `R1`, `R2`, `PREFIX`, `SINGLE`, `OCR1`, `P1`, `ONLY`, `RUNS`) |
| `compact2.mjs` | Format rounds: format, parser, server check, pass-2 edits, and scorer (`V3=1`, `ARM=child`, `ARM=nofold`, `ARM=json`, `PIN=1`) |
| `rescore.mjs` | Re-applies saved replies after a server-side fix, with no new calls |
| `probe-json.mjs` | Checks that each host enforces a JSON schema |
| `report.py`, `report2.py`, `report3.mjs`, `arms-report.mjs`, `cmp-report.mjs` | Tables |
| `format-eval.md` | Full notes from the format rounds |
| `truth.json` | Answer key |
| `ocr/` | On-device OCR boxes from `bench/run-ocr.mjs` |

Total API spend was about $0.88 for the model eval and $0.28 for the format rounds.

