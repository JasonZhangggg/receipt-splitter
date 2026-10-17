/** An invented receipt. Never put a real receipt here. */
const EXAMPLE = `SUB|3235
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
f|Bag fee|10
t|Tax|290`;

const BUNDLE_RULE = `- Bundle: when items are printed under a header with no price or $0.00 and followed by a discount that covers only those items, write b|<header>, then that group's items and its discount with > in front (>i|..., >d|...). The header is not an item. + lines under a bundle item need no >.`;

const OCR_HINT = "The OCR text of the same receipt is below as a hint; it is usually right about characters but can misread faint digits, so trust the photo when they disagree.";
const NO_OCR_HINT = "No OCR text is available, so read every character from the photo.";

/** Pass 1's prompt, for a request that carries OCR text or none. */
export const pass1Prompt = (hasOcr: boolean) => `Read this receipt photo. ${hasOcr ? OCR_HINT : NO_OCR_HINT}

If the photo is clearly not a receipt or bill (a person, a landscape, a screenshot of something else), answer only: none. A blurry, cropped or partial receipt is still a receipt: return what you can read.

Otherwise answer in this exact plain-text format, nothing else:
SUB|<printed subtotal in cents, or - if none>[|pre]
TOT|<printed total (amount due) in cents>
then one line per charge, in the order printed:
<k>|<name>|<amount in cents>[|<quantity if more than 1>]
+|<detail>            (under an item)
-|<name>|<cents>      (a discount printed under an item, negative cents)
b|<bundle header>

k is one letter: i item, d discount (negative cents), t tax, p tip actually charged, s service charge, f fee or deposit.
Example:
${EXAMPLE}

Rules:
- Name: the item name as printed, apart from casing. Do not expand abbreviations or add words. The name holds everything needed to identify the item.
- Detail: a + line under its item holds only supplementary information, such as size, volume, flavor, weight and modifiers without a price (SMALL, ADD 2 EGGS). Write one + line per printed modifier line.
- A discount, coupon, promo or price override printed under an item is a -|<name>|<cents> line under that item (after its + lines). A d line is only for a discount on the whole order.
- When the receipt lists the same savings twice, once under each item and again in a summary block, keep the per-item lines and skip the summary block.
${BUNDLE_RULE}
- Amount is the price printed on that line. Never multiply quantity by price yourself.
- Add |pre to SUB when the printed subtotal is before discounts are taken off.
- Leave SKU, UPC and PLU numbers, department codes, and tax-flag letters printed beside a price out of names.
- Weighed item (1.23 lb @ 2.99/lb): one item line at the printed amount, with the weight in its detail.
- Voided or refunded item: skip it together with its void line.
- "3.00-" with a trailing minus is a discount of -300. "$X less promo $Y" under an item is the item at X and a -|promo|-Y line under it.
- Skip payment and tender lines (cash, card, EBT, gift card), change, item counts, savings summaries, suggested tips, and every summary or total line (SUBTOTAL, TOTAL, Discount Total, Instant Savings, Total Bottle Deposit). Each charge appears exactly once.
- Do not skip any priced product line.
`;

/** The OCR text message, or null when the device sent no lines. */
export const ocrText = (lines: readonly string[]) => (lines.length === 0 ? null : `OCR text:\n${lines.join("\n")}`);

/** Pass 2's prompt. It asks for edits against pass 1's numbered lines, never a rewrite. */
export function pass2Prompt(problems: readonly string[], lines: readonly string[]): string {
  const bundleRules = lines.length === 0 ? `\nThere is no usable first reading, so build the whole reading with add lines, each in the first reading's line format. Rules for lines you add:\n${BUNDLE_RULE}\n` : "";
  const numbered = lines.length === 0 ? "(none)" : lines.map((line, at) => `${at + 1}. ${line}`).join("\n");
  return `A first reading of this receipt photo failed its arithmetic check: ${problems.join("; ")}.

First reading, numbered (SUB subtotal[|pre = before discounts], TOT total; k|name|cents[|qty] with k: i item, d discount, t tax, p tip, s service charge, f fee; +|detail is a detail of the item above; -|name|cents is a discount of the item above; b|header opens a bundle and > marks its items and discount):
${numbered}
${bundleRules}
Look at the photo and reply ONLY with the edits that fix it, one per line, nothing else:
fix|<line number>|<corrected line>
drop|<line number>
after|<line number>|<new line>
add|<new line>
SUB|<cents>[|pre]   TOT|<cents>   (only to correct them)
Common causes: a faint or misread digit, a missed tax line, a missed or doubled line, a summary line (discount total, savings, total deposit) counted as a charge, a trailing minus (3.00-) that means a discount, payment lines counted as charges. Never drop a fee or deposit line to make sums fit. A -|name|cents line is a discount of the item above it; a d line is a discount on the whole order. If nothing is wrong, reply: ok`;
}
