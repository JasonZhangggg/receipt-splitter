# Receipt extraction: cheap LLM vs VLM

Every source was read on 2026-10-03. Links point to primary sources: provider APIs and pricing pages, official model cards, and official docs. "Unverified" means no primary source confirmed it. Benchmarks in model cards are self-reported by the model's authors unless stated otherwise.

## Summary

- Ling 3.0 Flash VL exists. It is an inclusionAI MIT-licensed 124B-total, 5.5B-active MoE VLM released 2026-09-10. DeepInfra serves it at $0.06/$0.18 per M tokens with JSON-schema output. Novita serves it at $0.021/$0.0616, which is a 72% discount and reads as a promotion.
- Output tokens, not image tokens, drive the cost. A 1280 px photo adds about 1,100 to 1,650 input tokens, so path 2 costs about 10 to 40% more than path 1 on the same model. In dollars that is $0.00001 to $0.00017 per receipt.
- Recommendation: path 2 (the photo) as the primary path, with the on-device OCR text in the same prompt as a hint. Then compare it with path 1 on the same 25 receipts before committing.
- Models: **Qwen3.5-9B on DeepInfra** ($0.10/$0.15, about $0.25 per 1,000 receipts), **Ling 3.0 Flash VL on DeepInfra** ($0.06/$0.18, about $0.20 per 1,000), and **Gemini 3.1 Flash-Lite** ($0.25/$1.50, about $1.14 per 1,000) as the first-party fallback with a data-use guarantee.
- Fix the schema before choosing a model. It needs subtotal, tax, tip, discounts, bundles, and quantity, plus a reconciliation check that flags hallucinations.

## Answers to the operator's questions

### A. "Ling 3.0 Flash VL"

**It exists.** The official card names it Ling-3.0-flash-VL ([HF card](https://huggingface.co/inclusionAI/Ling-3.0-flash-VL), 2026-10-03). OpenRouter lists it as `inclusionai/ling-3.0-flash-vl`, endpoint version `-20260910` ([OpenRouter endpoints API](https://openrouter.ai/api/v1/models/inclusionai/ling-3.0-flash-vl/endpoints), 2026-10-03). It belongs to the Ling family, not Ming.

- **Architecture**: a ViT encoder with a two-layer MLP projector feeds a 42-layer hybrid backbone that alternates KDA and Gated MLA layers 5:1. The MoE has 124B total parameters and 5.5B active per token, with a 256K context on the card ([HF card](https://huggingface.co/inclusionAI/Ling-3.0-flash-VL), 2026-10-03). The card does not state the expert count. The "512 routed experts, 8 active" figure appears only in third-party listings, so it is unverified.
- **Image tokens**: patch 16 with merge 2, so 1 token per 32×32 px, with `max_pixels` 4,194,304 ([preprocessor_config.json](https://huggingface.co/inclusionAI/Ling-3.0-flash-VL/raw/main/preprocessor_config.json), 2026-10-03). A 1280×960 photo is 40×30 = **1,200 tokens**.
- **License**: MIT ([HF card](https://huggingface.co/inclusionAI/Ling-3.0-flash-VL), 2026-10-03).
- **Who serves it** ([OpenRouter endpoints API](https://openrouter.ai/api/v1/models/inclusionai/ling-3.0-flash-vl/endpoints), 2026-10-03):

| Provider | In $/M | Out $/M | Quant | Context | JSON schema | Uptime, last day |
|---|---|---|---|---|---|---|
| DeepInfra | 0.06 | 0.18 | fp16 | 131K | yes | 99.92% |
| Novita | 0.021 | 0.0616 (`discount: 0.72`) | bf16 | 262K | no | 99.54% |

  DeepInfra's own page confirms $0.06/$0.18 and lists JSON mode and zero data retention ([DeepInfra model page](https://deepinfra.com/inclusionAI/Ling-3.0-flash-VL), 2026-10-03). The OpenRouter catalog has no free `:free` VL variant today ([OpenRouter models API](https://openrouter.ai/api/v1/models), 2026-10-03), so a free tier is unverified.
- **Document benchmarks** (self-reported, table image on the [HF card](https://huggingface.co/inclusionAI/Ling-3.0-flash-VL), 2026-10-03): OmniDocBench 1.5 is 91.35, against 89.25 for Gemini 3.5 Flash-Lite and 91.10 for Qwen3.8-27B. CharXiv-RQ is 81.30 and CountBench is 97.33. The card reports no CORD, SROIE, DocVQA, OCRBench, or KIE scores, so its accuracy on receipts is unverified.
- **Why so cheap**: compute per token scales with the 5.5B active parameters, not the 124B total, so serving costs about what a 5 to 6B dense model costs once the weights fit in memory. The Novita price carries a 72% discount flag. That points to a list price near $0.075/$0.22, which is my inference, and the discount looks promotional.

**Why any model can be priced low, and how to judge it.**

| Reason | Example here | What to check |
|---|---|---|
| MoE with few active parameters | Ling (5.5B of 124B), Qwen3.5-35B-A3B, Gemma 4 26B-A4B | Real and durable |
| Promotion or subsidy | Novita Ling `discount 0.72`; StreamLake DeepSeek V4 Flash `discount 0.8` ([endpoints API](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash/endpoints)) | Can end without notice, so budget at list price |
| Quantization | fp8 or fp4 endpoints (Darkbloom Qwen3.5-9B is fp4) | The `quantization` field per endpoint; `unknown` means undisclosed |
| Low demand, new entrant | Ling launched 2026-09-10 | Uptime history, rate limits |
| Free tier traded for data | Gemini free tier: "Used to improve our products: yes" ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)) | Never send user photos to a training tier |

Before trusting a provider, check four things. First, its retention policy: DeepInfra does not store inputs or outputs to disk and does not train on them ([DeepInfra data privacy](https://docs.deepinfra.com/account/data-privacy), 2026-10-03). Novita's retention policy is unverified ([Novita privacy policy](https://novita.ai/legal/privacy-policy)). Second, quantization disclosure. Third, uptime from the endpoints API. Fourth, whether any benchmark is independent. Every document score in this report comes from the model's own authors, so our own eval is the only independent number.

### B. LLM vs VLM of the same size

**Cost.** On the same provider, a VLM charges the same per-token price for text and image. Ling, the Qwen VLMs, and Gemini all bill images at the input rate ([OpenRouter models API](https://openrouter.ai/api/v1/models), 2026-10-03). Ling 3.0 Flash text-only and Ling 3.0 Flash VL even share the DeepInfra price of $0.06/$0.18 ([Ling text endpoints](https://openrouter.ai/api/v1/models/inclusionai/ling-3.0-flash/endpoints)). The only difference is token count: about 1,000 input tokens for OCR text with boxes against 1,200 + 400 = 1,600 for image plus prompt (see Cost per receipt). Both paths emit the same roughly 600-token JSON. Output usually costs 2 to 6 times as much per token as input, so the image raises the total cost per receipt by only 10 to 40%.

**Accuracy.** The two paths fail differently.

- **LLM on OCR text (path 1)**: it cannot recover what OCR dropped or misread. If PP-OCRv5 splits "3 Guinness 21.00" across two boxes, or reads 8 as B, the LLM sees only that. Boxes with coordinates help: rows can be rebuilt by y-coordinate and prices matched by right alignment. Even so, indentation under "Beer Bucket" survives only as an x-offset the LLM must interpret.
- **VLM on the photo (path 2)**: it sees indentation, columns, and the $0.00 header directly. It can still misread a digit on a blurry or creased photo, or invent a plausible line ("hallucinate"). The published scores show how much this varies by model: GPT-5-Nano scores 75.3 on OCRBench and 55.9 on OmniDocBench 1.5, against 89.2 and 87.7 for Qwen3.5-9B ([Qwen3.5-9B card](https://huggingface.co/Qwen/Qwen3.5-9B), 2026-10-03).
- **Both**: arithmetic reconciliation (items + adjustments = printed total) catches most errors on either path, because a misread digit or an invented line almost never sums to the printed total.

The operator reports that the OCR text is mostly fine and that the parser is what fails. That makes path 1 a sound baseline. Path 2 with the OCR text as a hint gives the model both signals for a fraction of a cent.

## Candidate models

Unless a row cites another source, prices, quantization, context, and JSON-schema support come from the [OpenRouter models API](https://openrouter.ai/api/v1/models) and its per-model `/endpoints` API (2026-10-03). "JSON schema" means the endpoint lists `structured_outputs`/`response_format`. OpenRouter routes structured outputs per endpoint and fails the request when the chosen provider lacks support. `require_parameters: true` forces routing to a provider that supports it ([OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), 2026-10-03). The APIs report no latency figures (`latency_last_30m: null`), so latency is unverified for every model. Doc scores: OCRBench (0 to 1000 or %), OmniDocBench 1.5 (ODB), CC-OCR, and DocVQA. All are self-reported. No candidate publishes CORD, SROIE, or KIE scores, so those are unverified.

**Vision models (path 2; each also works on text for path 1)**

| Model (provider) | In / Out $/M | Image tokens, 1280×960 | JSON schema | Quant | Doc scores | License |
|---|---|---|---|---|---|---|
| Ling 3.0 Flash VL (DeepInfra) | 0.06 / 0.18 | 1,200 (32 px cells) | yes | fp16 | ODB 91.35 ([card](https://huggingface.co/inclusionAI/Ling-3.0-flash-VL)) | MIT |
| Ling 3.0 Flash VL (Novita, discounted) | 0.021 / 0.0616 | 1,200 | no | bf16 | as above | MIT |
| Qwen3.5-9B (DeepInfra) | 0.10 / 0.15 | 1,200 ([preprocessor](https://huggingface.co/Qwen/Qwen3.5-9B/raw/main/preprocessor_config.json)) | yes | bf16 | OCRBench 89.2, ODB 87.7, CC-OCR 79.3 ([card](https://huggingface.co/Qwen/Qwen3.5-9B)) | Apache-2.0 |
| Qwen3.5-35B-A3B (OpenRouter list price) | 0.15 / 1.00 | 1,200 | yes | — | OCRBench 91.0, ODB 89.3, CC-OCR 80.7 ([card](https://huggingface.co/Qwen/Qwen3.5-35B-A3B)) | Apache-2.0 |
| Qwen3.5-Flash 02-23 (Alibaba) | 0.065 / 0.26 | unverified | yes | unknown | unverified | proprietary API |
| Qwen3-VL-8B Instruct (Alibaba) | 0.117 / 0.455 | 1,200 | yes | unknown | DocVQA 96.1, OCRBench 896, CC-OCR 79.9 ([card](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)) | Apache-2.0 |
| Qwen3-VL-30B-A3B Instruct (DeepInfra) | 0.15 / 0.60 | 1,200 | yes | fp8 | DocVQA 95.0, OCRBench 903, CC-OCR 80.7 ([card](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct)) | Apache-2.0 |
| Qwen2.5-VL-72B | 0.80 / 1.00 | 1,564 (28 px) | yes | — | DocVQA 96.4, OCRBench 885 (Qwen3-VL card) | unverified |
| Gemma 4 26B-A4B (DeepInfra) | 0.07 / 0.34 | 70 to 1,120, chosen per request ([card](https://huggingface.co/google/gemma-4-26b-a4b-it)) | yes | fp8 | ODB edit distance 0.149 (lower is better) | Apache-2.0 |
| Gemini 2.5 Flash-Lite (Google) | 0.10 / 0.40 ([pricing](https://ai.google.dev/gemini-api/docs/pricing)) | 4 tiles × 258 = 1,032 ([tokens doc](https://ai.google.dev/gemini-api/docs/tokens)) | yes | n/a | DocVQA 92.0, OCRBench 813 (Qwen3-VL-8B card) | proprietary |
| Gemini 3.1 Flash-Lite (Google) | 0.25 / 1.50 ([pricing](https://ai.google.dev/gemini-api/docs/pricing)) | 1,120 default, 560 at `medium` ([media resolution](https://ai.google.dev/gemini-api/docs/media-resolution)) | yes | n/a | unverified | proprietary |
| gpt-5.6-luna (OpenAI) | 0.20 / 1.20 ([pricing](https://developers.openai.com/api/docs/pricing)) | 1,200 patches × 1.2 = 1,440 ([vision guide](https://developers.openai.com/api/docs/guides/images-vision)) | yes | n/a | unverified | proprietary |
| gpt-5-nano (OpenAI) | 0.05 / 0.40 | 1,200 × 1.5 = 1,800 | yes | n/a | OCRBench 75.3, ODB 55.9 (Qwen3.5-9B card) | shuts down 2026-12-11 ([deprecations](https://developers.openai.com/api/docs/deprecations)) |
| Mistral Small 3.2 24B (DeepInfra) | 0.075 / 0.20 | 46 × 35 = 1,610 + 35 row breaks ≈ 1,645 ([params.json](https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506/raw/main/params.json)) | yes | fp8 | unverified | Apache-2.0 |
| Mistral Small 4 (Mistral; OpenRouter id `mistral-small-2603`, mapping unverified) | 0.15 / 0.60 ([Mistral pricing](https://mistral.ai/pricing/api)) | unverified | yes | n/a | unverified | proprietary API |
| Mistral OCR 4.1 | $4 per 1,000 pages ([Mistral pricing](https://mistral.ai/pricing/api)) | per page | Document AI $5/1,000 | n/a | unverified | proprietary |
| Llama 4 Scout (DeepInfra) | 0.10 / 0.30 | unverified (gated config) | yes | fp8 | unverified | Llama 4 license |
| InternVL, MiniCPM-V | not on OpenRouter, DeepInfra, or Together today | — | — | — | InternVL2.5-8B DocVQA 93, OCRBench 822 (Qwen2.5-VL card) | — |

**Text-only models (path 1)**

| Model (provider) | In / Out $/M | JSON schema | Quant | Note |
|---|---|---|---|---|
| DeepSeek V4 Flash (DeepInfra) | 0.09 / 0.18 | yes | fp8 | StreamLake lists 0.028 / 0.056 with `discount 0.8` (promotional) |
| Ling 3.0 Flash (DeepInfra) | 0.06 / 0.18 | no | bf16 | no structured outputs, so use the VL model on the same provider instead |
| Qwen3-30B-A3B Instruct 2507 (Nebius) | 0.10 / 0.30 | yes | fp8 | |
| Ministral 3 8B (Mistral) | 0.15 / 0.15 ([Mistral pricing](https://mistral.ai/pricing/api)) | yes | n/a | also accepts images |
| gpt-4.1-nano (OpenAI) | 0.10 / 0.40 | yes | n/a | shuts down 2026-10-23 ([deprecations](https://developers.openai.com/api/docs/deprecations)) |

**Limits and data policy.** Context is 128K to 1M on every row, far beyond a receipt's needs. Gemini paid tiers are "not used to improve our products". The free tiers are ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). Google now limits access to the 2.5 models to "users who have actively used them in the past" and points new projects to 3.5 Flash-Lite ([Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations)). A new key may therefore be unable to reach Gemini 2.5 Flash-Lite; this is unverified for this account. DeepInfra keeps no inputs or outputs and does not train on them ([DeepInfra data privacy](https://docs.deepinfra.com/account/data-privacy)). Retention for Novita, Alibaba, and StreamLake was not checked, so it is unverified.

## Cost per receipt

Assumptions. A receipt has about 30 printed lines. Path 1 sends the PP-OCRv5 boxes as compact `text|x|y|w|h` rows, about 600 tokens, plus about 400 tokens of instructions and schema, for **T = 1,000 input tokens**. Path 2 sends the image tokens plus the same 400-token prompt. Both return about **600 output tokens** of JSON with thinking off. Thinking must be off: Qwen3.5 "operate[s] in thinking mode by default" ([Qwen3.5-9B card](https://huggingface.co/Qwen/Qwen3.5-9B)), and reasoning tokens bill as output. The photo is 1280×960, a 4:3 phone shot. Tokenizers differ, so text counts are approximate.

Cost = (input tokens × input price + 600 × output price) / 1,000,000.

| Model | Path 1: text | Path 2: image | Per 1,000 receipts (P1 / P2) |
|---|---|---|---|
| Ling 3.0 Flash VL, DeepInfra | 1000×0.06 + 600×0.18 = $0.000168 | (1200+400)×0.06 + 600×0.18 = $0.000204 | $0.17 / $0.20 |
| Ling 3.0 Flash VL, Novita (discount) | 1000×0.021 + 600×0.0616 = $0.000058 | 1600×0.021 + 600×0.0616 = $0.000071 | $0.06 / $0.07 |
| Qwen3.5-9B, DeepInfra | 1000×0.10 + 600×0.15 = $0.000190 | 1600×0.10 + 600×0.15 = $0.000250 | $0.19 / $0.25 |
| Qwen3.5-Flash, Alibaba (image tokens assumed 1,200) | $0.000221 | $0.000260 | $0.22 / $0.26 |
| Mistral Small 3.2, DeepInfra | 1000×0.075 + 600×0.20 = $0.000195 | 2045×0.075 + 600×0.20 = $0.000273 | $0.20 / $0.27 |
| Gemma 4 26B-A4B, DeepInfra (1,120 budget) | 1000×0.07 + 600×0.34 = $0.000274 | 1520×0.07 + 600×0.34 = $0.000310 | $0.27 / $0.31 |
| Gemini 2.5 Flash-Lite | 1000×0.10 + 600×0.40 = $0.000340 | 1432×0.10 + 600×0.40 = $0.000383 | $0.34 / $0.38 |
| Qwen3-VL-8B, Alibaba | 1000×0.117 + 600×0.455 = $0.000390 | 1600×0.117 + 600×0.455 = $0.000460 | $0.39 / $0.46 |
| Qwen3-VL-30B-A3B, DeepInfra | 1000×0.15 + 600×0.60 = $0.000510 | 1600×0.15 + 600×0.60 = $0.000600 | $0.51 / $0.60 |
| gpt-5.6-luna | 1000×0.20 + 600×1.20 = $0.000920 | 1840×0.20 + 600×1.20 = $0.001088 | $0.92 / $1.09 |
| Gemini 3.1 Flash-Lite (`medium`, 560) | 1000×0.25 + 600×1.50 = $0.001150 | 960×0.25 + 600×1.50 = $0.001140 | $1.15 / $1.14 |
| DeepSeek V4 Flash, DeepInfra (text only) | 1000×0.09 + 600×0.18 = $0.000198 | — | $0.20 / — |
| Qwen3-30B-A3B 2507, Nebius (text only) | 1000×0.10 + 600×0.30 = $0.000280 | — | $0.28 / — |
| Mistral OCR 4.1 + any LLM | $0.004 per page before the LLM | — | over $4 |

Every candidate except Mistral OCR stays under about $1.30 per 1,000 receipts. Accuracy matters more than price in this range: one wrong total costs more in user trust than a year of API fees. Sending path 2 together with the OCR text adds about 600 tokens, or $0.00004 to $0.00015 per receipt.

## Path comparison

| | Path 1: OCR text to LLM | Path 2: photo to VLM (with OCR text as a hint) |
|---|---|---|
| Cost per receipt | $0.00006 to $0.0003 | 10 to 40% more on the same model |
| Upload | about 3 KB of text | about 150 KB JPEG |
| Layout | rebuilt from box coordinates | seen directly: indentation, columns, the $0.00 bundle header |
| Failure modes | OCR misses are fatal; merged or split lines | misread digits on blur; invented lines |
| Privacy | text only | the whole photo, which may show a card's last 4 digits or a name |
| Model choice | any text model | VLM only |

Pick path 2 with the OCR hint by default. It is the only path that can recover from an OCR miss, and the margin is fractions of a cent. Keep path 1 as the fallback when the photo upload fails. The eval decides; if path 1 ties on accuracy, it wins on privacy and payload.

## Proposed schema

The operator's proposal was not available to this research, so this section critiques it against the app's own model. A schema shaped like `items: [{name, price}], total` has five gaps:

1. **No subtotal, tax, tip, or service charge.** Without them the totals cannot reconcile, and tax and tip cannot be shared out ([src/core/split.ts](../../src/core/split.ts) `RECEIPT_LEVEL_KINDS = ["tax","tip","serviceCharge","discount"]`).
2. **No discounts.** A printed negative line gets dropped or turned into a negative item.
3. **No discount scope.** "Beer Bucket Discount (10%)" applies only to the drinks under the header ([ADR 0006](../adr/0006-bundle-discount-is-a-scoped-adjustment.md)).
4. **No quantity.** "3 Guinness 21.00" needs `quantity: 3` with `price` as the line total, matching `Item.price` "covers every unit".
5. **No unreadable or confidence marker.** The model is forced to guess instead of flagging.

Proposed JSON Schema (strict mode: every field required, `null` allowed). Money is integer cents, so floats never meet a strict decimal:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["currency", "lines", "subtotal", "total", "unreadable"],
  "properties": {
    "currency": { "type": ["string", "null"], "description": "ISO 4217, e.g. USD" },
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "name", "quantity", "amountCents", "group", "printedText"],
        "properties": {
          "kind": { "enum": ["item", "groupHeader", "tax", "tip", "serviceCharge", "discount", "groupDiscount"] },
          "name": { "type": "string" },
          "quantity": { "type": ["integer", "null"], "minimum": 1 },
          "amountCents": { "type": "integer", "description": "Line total as printed; negative for discounts" },
          "group": { "type": ["string", "null"], "description": "Header name for items and discounts inside a group, e.g. Beer Bucket" },
          "printedText": { "type": "string", "description": "The receipt line verbatim, for audit" }
        }
      }
    },
    "subtotal": { "type": ["integer", "null"] },
    "total": { "type": ["integer", "null"] },
    "unreadable": { "type": "array", "items": { "type": "string" } }
  }
}
```

A flat, ordered `lines` list mirrors the printed receipt, which small models follow more reliably than nested bundles. The server then maps it to the domain. A `groupHeader` at $0.00 becomes the Bundle's name, not an Item. Each `groupDiscount` becomes a `bundleDiscount` Adjustment whose items share its `group`. Following ADR 0006's conservative rule, a `groupDiscount` with no matching items falls back to a receipt-wide `discount`. `printedText` costs about 30% more output tokens. Drop it if the eval shows it adds nothing.

**Reconciliation**, computed on the server and never trusted from the model:
- sum of items + group discounts + discounts = `subtotal` (when printed);
- `subtotal` + tax + tip + service charge = `total`;
- every `group` on an item has a matching `groupHeader`.

On mismatch, retry once at temperature 0, then show the draft with the mismatch flagged for the user to fix.

## Eval plan

1. **Set**: 25 real receipts photographed on phones. Include at least 3 with bundles (the Topgolf receipt), 5 with quantities, 5 with tips, 3 with discounts, 3 blurry or creased, and 3 long ones (over 30 lines). Hand-write the truth in the schema above and store it next to the photos.
2. **Runs**: every model × {path 1, path 2 + hint} × 3 runs at temperature 0, on the same photos and the same PP-OCRv5 output.
3. **Metrics per receipt**:
   - item recall and precision with name fuzzy match (normalized edit distance ≤ 0.2) and exact `amountCents`;
   - exact `quantity`;
   - exact tax, tip, discount, and bundle membership;
   - **reconciles**: the model's lines sum to the printed total (truth), which is the hallucination detector;
   - schema-valid on the first try;
   - **stable**: all 3 runs produce identical JSON;
   - cost from the provider's `usage` field, and wall-clock latency (p50, p95).
4. **Bar to ship**: at least 90% of receipts reconcile exactly, at least 95% item F1, no invented item on a receipt that reconciles, and at least 2 of 3 runs stable. Pick the cheapest model that clears the bar. Ties go to the provider with zero retention.
5. Run it as a script in the repo against the providers' APIs, so it reruns on a model change. That makes it the lever, not a one-off.

## Risks

- **Promotional prices end.** Budget at DeepInfra list prices, not Novita or StreamLake discounts.
- **Model churn.** gpt-4.1-nano shuts down 2026-10-23 and gpt-5-nano on 2026-12-11. Gemini 2.5 access is limited to existing users. Keep the model ID in config and rerun the eval on every switch.
- **Self-reported benchmarks.** No candidate publishes CORD, SROIE, or KIE scores. Ling's document scores come from its own card. Only the eval above is independent.
- **Thinking tokens.** A Qwen3.5 or Ling endpoint left in reasoning mode can multiply output tokens. Set thinking off explicitly and assert on `usage`.
- **Privacy.** Path 2 uploads a photo that may hold card digits or names. Use providers with zero retention (DeepInfra) or a paid tier without training (Gemini paid, OpenAI API). Retention for Novita, Alibaba, and StreamLake is unverified.
- **Structured-output drift.** Support varies per endpoint. Set `require_parameters: true` on OpenRouter, and validate on the server anyway.

## Sources

All read 2026-10-03.

- inclusionAI Ling-3.0-flash-VL model card, benchmark image, preprocessor config: https://huggingface.co/inclusionAI/Ling-3.0-flash-VL , https://huggingface.co/inclusionAI/Ling-3.0-flash-VL/raw/main/preprocessor_config.json
- DeepInfra Ling page: https://deepinfra.com/inclusionAI/Ling-3.0-flash-VL ; DeepInfra data privacy: https://docs.deepinfra.com/account/data-privacy
- OpenRouter models API: https://openrouter.ai/api/v1/models ; endpoints API per model: https://openrouter.ai/api/v1/models/{id}/endpoints ; providers API: https://openrouter.ai/api/v1/providers ; structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing ; tokens: https://ai.google.dev/gemini-api/docs/tokens ; media resolution: https://ai.google.dev/gemini-api/docs/media-resolution ; deprecations: https://ai.google.dev/gemini-api/docs/deprecations
- OpenAI pricing: https://developers.openai.com/api/docs/pricing ; vision guide: https://developers.openai.com/api/docs/guides/images-vision ; deprecations: https://developers.openai.com/api/docs/deprecations
- Mistral API pricing: https://mistral.ai/pricing/api ; Mistral Small 3.2 params: https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506/raw/main/params.json
- Qwen cards: https://huggingface.co/Qwen/Qwen3.5-9B , https://huggingface.co/Qwen/Qwen3.5-35B-A3B , https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct , https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct , https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct
- Gemma 4 card: https://huggingface.co/google/gemma-4-26b-a4b-it
- Repo: src/core/split.ts, docs/adr/0006-bundle-discount-is-a-scoped-adjustment.md
