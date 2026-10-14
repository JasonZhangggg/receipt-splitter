# SplitWith

**Status (2026-10-14).** The shipped product is Quick split only. Account mode below is a future idea and has no code. The reading design changed after this brief was written. The phone still runs OCR, but the server then reads the receipt with Gemini (ADR 0008 and ADR 0010).

A free website with two modes:

1. **Quick split (no sign-in, the landing page).** A one-time receipt splitter. Take a photo of a receipt, and the site reads the line items. Share a link, and each person claims what they ordered and pays their share by Venmo, Cash App, PayPal or Zelle. Nothing to install and no account.
2. **Account mode (optional sign-in).** For people who want more, signing in turns the site into a full expense-sharing app like Splitwise: groups for trips, roommates and utilities, running balances, and settling up. Everything in Quick split is still there, and receipts become one way to add an expense.

The products to beat are [Lily Split](https://www.lilysplit.com/) for Quick split and Splitwise for Account mode. See "Positioning" below.

## Two modes

### Quick split (landing page)

- The landing page is the tool. Nothing above it but a one-line pitch and a "Take photo" button.
- Flow: photo → items appear (the phone runs OCR and the server reads the receipt) → fix any rows the total check flags → share the link → friends open it and tap their items → each person pays their share.
- Works without an account. The split lives in a link and expires after 30–90 days.
- A quiet "Save this split / keep a running tab" prompt appears after the split is settled, the moment people are most receptive. It never blocks the flow.

### Account mode (sign in)

Signing in is optional and free. Sign-in should be an email link or Google or Apple sign-in, so there's no password to manage. A split made before signing in can be attached to the new account.

Feature list, matched against Splitwise. The Pro column comes from [Splitwise's own Pro page](https://kb.splitwise.com/pro/what-is-splitwise-pro), which lists these as Pro: unlimited expenses, transaction import, search, currency conversion, receipt scanning and itemization, charts, default splits. The other rows come from my knowledge of the app, so diff the list against the live app before planning.

| Area | Feature | Splitwise | Here |
|---|---|---|---|
| Groups | Groups for trips, households, couples; add members by name, email or invite link | Free | Free |
| Groups | People who don't have an account can join and take part | Partial | Free |
| Groups | Friends list and one-to-one balances outside a group | Free | Free |
| Groups | Archive or leave a group; delete and restore an expense | Free | Free |
| Adding expenses | Unlimited expenses per day | Pro | Free |
| Adding expenses | Split equally, by exact amounts, by percentages, by shares, or by adjustments | Free | Free |
| Adding expenses | Several payers on one expense | Free | Free |
| Adding expenses | Categories, notes, dates, attached photos, and comments on an expense | Free | Free |
| Adding expenses | Receipt scanning and itemized splitting | Pro | Free (the core of the product) |
| Adding expenses | Default splits per group or person | Pro | Free |
| Adding expenses | Recurring expenses (rent, utilities, subscriptions) | Free | Free |
| Adding expenses | Utility bills prorated by days lived or days away | No | Free |
| Balances | Who owes whom, per group and overall | Free | Free |
| Balances | Simplify debts (fewest payments) | Free | Free |
| Balances | Settle up: record a payment, full or partial | Free | Free |
| Balances | Settle in one tap through Venmo, Cash App, PayPal or a Zelle copy card | Limited | Free |
| Money | Multiple currencies with automatic conversion | Pro | Free |
| Money | Search across expenses | Pro | Free |
| Money | Charts and spending by category | Pro | Free |
| Money | Import transactions from a bank | Pro, some countries | Later. Needs a paid data provider, so a candidate for Pro. |
| Money | Export to CSV | Free | Free |
| Keeping people informed | Activity feed showing who added or changed what | Free | Free |
| Keeping people informed | Email and push notifications; reminders to pay | Free | Free |
| Everywhere | Web and mobile that stay in sync | Free | Free (web first, installable as an app) |
| Everywhere | Works offline at a restaurant or on a trip, syncing when you're back online | No | Free |
| Trips | Trip mode: a group with dates, currencies, a single "who's in the car or room" view | Trip Pass | Free |

Items with no Splitwise equivalent, which are the reasons to switch:
- Items are assigned by each friend tapping their own items, not by the payer entering everything.
- The total check on every scan.
- The server reads the photo and the OCR lines with a third-party model, and a downscaled copy of the photo is stored with the Split for 14 days so everyone in it can view the receipt (ADR 0007, ADR 0008).
- Prorated utilities: enter each person's dates lived, and the bill splits by days.
- Offline entry.
- No daily limit and no ads.

### Data and sync for accounts

- The database holds users, groups, memberships, expenses (with per-person shares), payments and comments. Balances are always computed from expenses and payments, never stored, so they can't drift.
- Money is stored as integer minor units (cents) with a currency code. Splits that don't divide evenly assign the leftover cents in a fixed order, so every device gets the same answer.
- Offline edits are queued on the device and merged when it reconnects. Expenses are edited last-write-wins per field; deletes are soft, so nothing is lost.

## Positioning

Don't pitch it as "replace Splitwise". Pitch it as **the fastest way to split a bill at the table**, which is where Splitwise is weakest (the daily limit, the ads, and itemizing locked behind Pro). Account mode is the reason people stay after they've tried it.

Evidence from 2026-09-28: 24 of Splitwise's 50 most recent App Store reviews were 1–2 stars, and the top complaints were the daily expense limit (8) and ads (6). Splitwise's free plan allows about 3–5 expenses a day, and third-party write-ups report a 10-second wait and unskippable ads. Tricount is free and unlimited, but it can't assign receipt items to people.

## Sustainability

The design keeps cost close to zero however many people use it, because the phone runs OCR, a downscaled photo is stored with each Split for only 14 days, scans are capped at $3 a day, and the site is static on Cloudflare.

| Usage | Monthly cost |
|---|---|
| 1,000 quick splits | About $0 plus a domain (about $10/year) |
| 100,000 quick splits | About $5 (Cloudflare's paid plan) plus whatever the AI fallback uses |
| Accounts | A database and sign-in. Cloudflare D1 or Supabase free tiers cover the first thousands of users. Recheck the limits before launch. |

The AI fallback is the only cost that grows with use. Leave it off at launch, or give it a hard monthly budget so the app falls back to manual correction when the budget runs out.

Ways it earns money, without the things people hate about Splitwise:
1. An optional tip jar on the "all settled" screen.
2. A one-time Pro unlock (for example $5–10), not a subscription, sold on the web to avoid Apple's 15–30% cut. Candidates: bank import, unlimited history beyond a year, receipt image storage (opt-in, encrypted), and custom categories.
3. Never ads, and never limits on the core split or on the number of expenses.

Risks: being found (many competitors, so make the page friends land on excellent, with a "Split your own receipt" button), and the cost of a bank-import provider if you add it.

## Goals

- **Reading is cheap and bounded.** The phone runs OCR. The server reads the photo and OCR lines with a third-party model at about $0.001 a receipt, capped at $3 a day (ADR 0008). A downscaled copy of the photo is stored with the Split for 14 days (ADR 0007).
- **Every scan is checked against the receipt.** The items must add up to the subtotal, and the subtotal plus tax plus tip minus discounts must equal the total. When a check fails, the site highlights the rows that don't add up so the user can fix them with a tap.
- **No friction.** No accounts, and no entering names before you see the items. Friends can claim items whenever they open the link, not only while the creator is online.
- **Payment in one tap** for Venmo, Cash App, PayPal and Zelle.
- **Near-zero running cost.** About $0 a month at 1,000 splits a month, and about $5–80 a month at 100,000.

## Build order

1. **Quick split** first: photo, OCR, total check, share link, live claiming, payment links. This is the whole first release.
2. **Account mode** second: sign-in, groups, expenses with every split type, balances, settle up.
3. **Account extras** after that: recurring expenses, multiple currencies, charts, search, export, offline queue, notifications.

Debt simplification uses the greedy method: settle the largest creditor against the largest debtor, repeatedly, which needs at most n−1 payments. Finding the true minimum number of payments is NP-hard.

## Later (not in the first version)

- Bank transaction import (needs a paid provider).
- Photos of long receipts (such as from Costco) taken in several parts and stitched together.
- A native app wrapper (Capacitor) to use iOS Live Text and Android ML Kit OCR.

## Proposed stack (from the feasibility research, 2026-09-27)

| Concern | Choice |
|---|---|
| App | Static site built with Vite and React (or Svelte), hosted with Cloudflare Workers static assets |
| OCR | PaddleOCR run with onnxruntime-web in a Web Worker, as built. The phone reads the characters and keeps the rule-based parser as the fallback. Gemini does the reading that decides the Items (next row). |
| Parsing | Rule-based, using the layout. Group text boxes into rows by their vertical position. The rightmost price on a row is that item's price. Recognize quantity lines (`2 @ 4.50`), modifier lines, discounts and the SUBTOTAL, TAX, TIP and TOTAL lines. Then run the total check. |
| Reading | Shipped. `POST /api/scan` sends the photo and the OCR lines through OpenRouter to Gemini. Pass 1 is Gemini 3.1 Flash-Lite. Pass 2 runs only when the total check fails, on Gemini 3.8 Flash. A penny review uses Flash-Lite again. Every model is a var in `wrangler.jsonc`. The on-device reader is the fallback when a scan is refused, fails or runs slow. Scans are rate-limited per address and capped at $3 a day (ADR 0008, ADR 0010). |
| Live claiming | One Cloudflare Durable Object per split (with `partyserver`). Each split expires after 30–90 days, and its JSON is capped at about 32 KB. |
| Read-only share | Encode the split into the URL fragment (lz-string), with no server. |
| Abuse control | A per-IP rate limit and a global daily cap on creating a split (ADR 0005), and a per-IP rate limit on the LLM fallback. |

## How each payment app is handed off

| Service | Link | Notes |
|---|---|---|
| PayPal | `https://paypal.me/<user>/<amount>USD` | Documented. |
| Cash App | `https://cash.app/$<tag>/<amount>` | Documented. The note can't be pre-filled. |
| Venmo | `https://venmo.com/<user>?txn=pay&amount=<amt>&note=<note>` (web) and `venmo://paycharge?...` (app) | Undocumented, so it could change. Use the web link where the app isn't installed. |
| Zelle | none | Zelle has no link format, and its QR codes can't carry an amount. Show a card that copies the payee's email or phone and the amount. |

## Lessons from Lily Split

- Lily Split stores receipt photos in a **public** storage bucket, which exposes the last 4 card digits, server names, locations and times. Upload only the parsed JSON.
- It requires the list of names before the user sees any items. Let people add their names as they claim.
- It supports only Venmo, through a `venmo://` link that does nothing on desktop.
- It shows no check against the receipt's total.
- One thing worth copying: it starts OCR the moment the upload finishes, while the user is still entering details.

## Hardest problems

1. **Parsing accuracy on real receipts:** modifiers, quantities, discounts, automatic gratuity, handwritten tips, faded thermal paper and several tax lines. The total check and one-tap correction do most of the work here.
2. **First run on phones:** downloading a 20–30 MB model over cellular, differences in WebGPU and WASM support between iOS Safari and Android, and memory limits on low-end phones.
3. **Staying free without abuse:** protecting the LLM fallback and the shared rooms without accounts.

## Competitors

- Splitwise: receipt scanning requires Pro, about $40 a year.
- splitty: iOS only, with 3 free scans.
- Tab: requires a login.
- split-the-bill.app: OCR on the server, and no payment links.
- Lily Split.

The gap: no competitor combines OCR on the phone with a server reading, the total check, account-free claiming at any time, and payment links for all four services.

## Open questions

- Which OCR model to use: PP-OCRv5-mobile or PP-OCRv6-small. Benchmark both on a set of real receipts first.
- Whether to use an LLM fallback at all, and whether to ship it on or off by default.
- The UI framework: React or Svelte.
- The domain name.
- Which sign-in provider and database to use for Account mode. Compare Cloudflare D1 with an auth library against Supabase, on free-tier limits and how well each handles offline sync.
- Whether Quick split links stay independent of accounts, or are stored in the same database once Account mode exists.
- Which Splitwise features to leave out of the first Account release. The table above is the full list.
