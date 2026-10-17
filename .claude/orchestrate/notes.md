# Open notes
One line per note, true on main (d0cf6ce) as of 2026-10-02: what, file:line, fixer. Delete the line in the PR that fixes it.
Triage of the old 204 notes (evidence per note) is in `archive/notes-triage-2026-10-02.tsv`; the old file is `archive/notes-2026-10-02.md`.

## hardening-2 (worker, tools, CI, deps)
- ADR 0009 says an old page from before the signed-ids deploy "still holds and pays for its own name". True on the server, but its UI shows its name as picked elsewhere until a reload. Reword the bullet. Fixer: sonnet, docs only.
- After the migration window (old links expire 60 days after their last change), in one PR: stop routing 22-character ids, delete the 16-character device-id mapping, rotate the browser id, and move mint/check to Web Crypto, deleting src/core/hmac.ts. Fixer: opus.
- `decode-uri-component` 0.2.2 is in the web bundle through expo-router's query-string (`package.json`, no override); re-check when expo-router moves to query-string 9.
- `node-forge` 1.4.0 has no fixed release and ships in neither bundle; the operator dismisses or tracks the Dependabot alert.
- `e2e/motion.ts:157` divides each step by the frame gap, so the 4x lanes barely catch opacity pops; the flash census on `fix/flash-root` covers part of it.
- Copy is proven only in Chromium (`e2e/claim.spec.ts:129` skips WebKit).
- `sourceSha256` pins in `bench/labels` hash the pre-strip source (`bench/fetch.mjs:373-388`); add a committed-file hash so pins check without fetching.
- `public/ort/LICENSE:5-6` links ThirdPartyNotices.txt instead of bundling it.

## split-type crossfade (fixer: fix/split-type-crossfade, in progress)
- Item sheet split-type change shows outgoing steppers under incoming fields for about 2 frames (verify strip-type2-rows-f1-6.jpg).
- Mac only. A flick in the simulator needs a 5-point touch_path 16 ms apart and a 20 s recording; 2-point paths only work for taps. Note it in the census procedure.

## test tooling (fixer: next test-infra PR)
- `e2e/motion.spec.ts:10` "pick hands off to the bar" (@frame-timing, mobile-safari) fails about once per full local e2e run and passes alone. Find the timing assumption.
- `e2e/claim.spec.ts:231` ("the payer marks themselves paid, and another browser sees Paid") failed twice on Linux WebKit on main's merge of PR 52 (run 37206235929), though the same code passed on the PR head. Find the timing assumption and wait on state.
- The plan says all the home.spec keyboard tests fail on 629a862; only the panel and hero tests do.

## shared Modal sheets (fixer: next Split-page PR, V2-4)
- On the first claim in a Split, a collapsed Bundle's gray "N unclaimed" line appears instantly and pushes the rows below 16.5 px in one frame (seen in add-row). V2-4 rewrites BundleGroup; check it there.
- React Native Web's Modal wraps sheets in an unnamed role=dialog aria-modal around the named dialog, so the accessibility tree shows two dialogs (home Recent splits and likely the Split page's sheets).
- The Split page's Item and History sheets do not close on Escape: RNW Modal hears Escape only a frame or more after opening, and BottomSheet has no handler of its own. Recent splits added its own keydown listener; reuse that.
- Keyboard-started opens (Enter on an icon) still run the 200 ms entrance; motion review prefers none. Low priority.

## UI polish (fixer: a small separate PR)
- After Delete item inside a collapsed Bundle, focus falls to the page body because the next line is hidden; send it to the Bundle header instead. Check whether it predates V2-4.
- `dollars()` prints large amounts with no thousands separator ("$99980.52"). Use grouping for amounts of $1,000 and up, everywhere money shows.
- Header and sheet icons are data-URI Images that decode a frame late: the close button's circle is blank for one frame on the first open of a sheet. Inline the SVGs or preload the icon set.
- Chromium, and Safari with a hardware keyboard, draw the default rectangular focus outline on text fields, ignoring the rounded group. Style inputs' :focus-visible in src/ui/document.ts.

## home keyboard (fixer: fix/home-keyboard-a; operator chose design A on 2026-10-03)
- Home's keyboard-up moves in steps: iOS scrolls the window 166 before the resize, then the panel inset steps 330, 164, 330 as offsetTop arrives (fix/flash-root H-handle1 frames 24-27). The hero also switches to compact while the keyboard is up. Design A on home would fix it but drops the Create-above-keyboard assertion in e2e/home.spec.ts.

## V2-4 (desktop Split page and Split-view polish)
- Closed on v2-4-desktop (pending merge): the gliding-sheet freeze, the Bundle CSS transition, the h1 wordmark, reduced-motion easeOut.

## V2-6b follow-ups (fixers named)
- The cleaned photo copy lives in a component ref (app/index.tsx), so going Back before Create loses it and the Split silently gets no photo. Keep it beside `pageDraft`, keyed to the scan. Fixer: next home PR.
- Code nits: `isPhoto =(` in src/ui/receipt-input/photo.ts:4, the import order in header.tsx, and the stale "fades in" comment. Fixer: final-cleanup.

## bar-after-pick
- None.

## add-item
- None.

## history
- `src/ui/history/describe.ts:58` still emits "×N to ×M" for a unit-count edit, against the one-row-per-unit ruling (19); say "Removed one Guinness" or "Added one".
- Deleting an Item inside a Bundle reads "Removed X and 1 more" because the delete also edits the Bundle (`src/ui/history/describe.ts:49`).
- After Enter in "Add a person", return focus to the field (PressTarget needs ref forwarding); not re-verified on main.

## final-cleanup
- Bench Item price match sits at 90.3%, one Item over the 90% bar, and two Walmart receipts (docjay131-147, -111) lose the price column; rerun the bench on any `src/parse` change.
- `src/draft.test.ts` has no case that a Draft created from a "reading" state comes back fresh (pref 36).

## On branches, not yet merged
- `fix/create-silent` (f5a5123): every Create tap acts (pref 34), the home panel is one non-collapsible piece (pref 33), keyboard inset on home (pref 17). Closes no note above.
- `fix/flash-root` (91fe313): item-sheet inflight edit, Bundle close height, keyboard inset on Split sheets, fade-through swap, "+" name box focus ring, flash census tool and `e2e/flash.spec.ts`. Partly overlaps the `e2e/motion.ts` note; closes none outright.

## Operator report 2026-10-03. Fixer: next home PR.
- Mac only. (see rule 71: handles are optional now) Home after a long idle or reload: the payment field shows a handle but Create reports it missing until the user types. Suspect the browser (Safari form restore or autofill) fills the input without firing onChange, so React state stays empty. Reproduce on iOS Simulator Safari before fixing.

## Server-side receipt reading. Fixer: the receipt-reading PR.
- Use per-item promos, not the summary "Discount" block (Dollar General prints both).
- Accept a few cents of mismatch on long receipts; keep and flag instead of a second pass.
- Pass 2 must not delete fee or deposit lines.
- The check must accept subtotals printed before discounts, and receipts with no tax line.
- Send the model a sharper image (about 2048 px, cropped), not the 1280 px storage copy.
- Extend the compact format and test each addition in one eval round, keeping it only if it raises the score or catches errors without slowing replies (operator asked 2026-10-03): `b|<header>` opens a Bundle and `>`-prefixed lines belong to it, including its discount; `+|name|cents` is a priced modifier folded into the item above; the printed unit price as `i|name|cents|qty|unit` with a qty x unit check; `CNT|n` for a printed item count; a marker for a subtotal printed before discounts; lines in printed order; two name variants (as printed vs expanded abbreviations). No description field, no confidence score, no JSON schema.
- Items get a model-supplied `detail` line under the name (operator, 2026-10-03). The name holds everything needed to identify the item, and the detail is only supplementary (size, flavor, modifiers). Define Detail in CONTEXT.md. That needs an optional `detail` on Item in `src/core/split.ts`, with parse, storage and editing support, and it replaces the `nameParts` size regex in `src/ui/split-view/model.ts:49`. The on-device fallback keeps the regex.
- Mac only. Add receipts with Bundles and priced modifiers (Topgolf plus 2-3 more) to `~/receipts-eval/` with nested truth before trusting the scores. None of r1-r8 has a Bundle.
- Mac only. Format eval 2026-10-03 (`~/receipts-eval/format-eval.md`, $0.12 spent): v2 16/24, v3 15/24 against old format 19/24 + 5/8 same day. Bundles work on t1 (synthetic only). v3 had 4 readings that were wrong but passed the check: 2 are r4's per-item discount split, which the check can't see, 1 is an invented priced add-on on r8, and the scorer did not check per-item discounts for the old format. Root recommendation: ship v3 without priced `+` lines, with a retry on another host when pass 1 runs long. Needs a real Bundle photo and item-level truth for r6/r7 before trusting it.
- Ablation 2026-10-03 ($0.11): the `-` child format (item discounts as `-|name|cents` under the item, server folds them; `d` is order-level only; Bundles, detail lines and the summary-block rule kept; no priced `+`) scored 20/24, pass 1 18/24, items F1 97.2%, 680 output tokens, the best arm. Bundle rules cost 93 input tokens and showed no harm. A swapped per-item split passes every check, so the UI must make item discounts easy to inspect. JSON schema compared 2026-10-03 ($0.05): both hosts enforce it, but it scored 19/24 vs 20/24, ran about 9x slower at the median, cost 43% more, and got t1's Bundle headers wrong. Use the compact `-` child format.
- Mac only. V2-7a follow-ups: the `|pre` subtotal flag comes back reversed on t3/t5, sending them to pass 2 every time; a guard that accepts the flipped reading when both sums fit would save a Luna call. `~/receipts-eval/truth.json` lacks per-item `under` flags, so r4's split is unscored. ADR 0008's "at most 4 DO row writes per scan" is unmeasured. Leftover worktree `agent-a3b74977caad8d802` (`v2-7a-harness`) can go after 7a lands.
- `wrangler.jsonc` comment still says the scan limits await the operator's OK; they were approved 2026-10-03 (rules 63). Fix in the next worker PR.
- A detail is stored in both `receipt` and `original`; worst case about +24 KB against the 32 KB Split budget (createSplit then drops `original`).
- Silent misreads (wrong digits plus a matching wrong subtotal) are not caught; consider an independent total read on long receipts.

## Operator report 2026-10-04 12:1x. Fixers running.
- Mac only. Home scrolls down after a photo upload on iOS Safari and stays stuck (card cut off at top, empty band at bottom). Fixer: `fix/home-scroll-stuck` (opus owner, reproduce on simulator first).
- Item sheet detail field shows empty even for Items with a detail; empty ones need the placeholder "Add detail (optional)". The Split button in a quantity line's detail gets a split icon. Fixer: `fix/item-detail-field` (opus owner).

## polish/ui-notes follow-ups (owner report 2026-10-04). Fixer: next home PR.
- Leaving home while a scan is still reading loses that scan: its final "read" dispatch goes to the unmounted reducer, so pageDraft stays "reading".
- After Back, the home photo viewer is gone (the `photo` state and its URI are released on unmount) though the thumbnail stays.

## fix/home-scroll-stuck follow-ups (owner report 2026-10-04)
- `iosKeyboard` in `e2e/motion.ts` pans `offsetTop`, but iOS 27 scrolls the window into real room and leaves it there on blur. Emulated keyboard tests can pass changes that break rule 17 on a device. Fixer: next test-infra PR.
- Home's field reveal on iOS 27 depends on the Sheet's `below` fill hanging past #root (the room iOS scrolls into). Make that room deliberate (a named spacer) so a cleanup doesn't remove it. Fixer: next home PR.
- Mac only. Check the Split page reveals focused fields on iOS 27 at all: it has no window room (714/714), and iOS 27 did not reveal a field without room in the clip experiment. Fixer: a simulator check, then a Split-page PR if broken.
- `e2e/scan.spec.ts:408` ("a touch while the sheet settles") failed once under load, passed 4/4 alone. Fixer: next test-infra PR.
- eslint lints the gitignored `.verify/`; add it to the ignores. Fixer: next test-infra PR.

## polish/ui-notes verifier notes (PASS+NOTES on bc2954b)
- The focus ring media query in `src/ui/document.ts` is `(any-pointer: fine)`, which matches the iOS Simulator and an iPad with a trackpad, so a tap draws the ring there. Use `(pointer: fine)`. Fixer: sonnet, next UI PR.
- verify-receipt-splitter `drive --shot` at 390 uses a full-page capture that seems to drop Chromium's touch media emulation, so focus shots at 390 show a ring the page doesn't draw. Clip the screenshot or document it. Fixer: the verify skill's maintainer.

## chore/flaky-tests follow-ups
- The claim:231 fix (closing leaked contexts) is unproven on Linux. If a test times out in `open()` on CI again, set `trace: "retain-on-failure"` and upload test-results as a CI artifact (CI uploads none today). Fixer: next test-infra PR.
- A bare `npx playwright test` still mixes @frame-timing with functional tests; only `npm run e2e` and the motion feature map enforce one worker. Fixer: next test-infra PR.

## fix/home-scroll-stuck verifier notes (PASS+NOTES on 4bcaab3)
- After iOS pans 166 px for the handle, only a sliver of the "Your name" pill shows above the accessory bar; tapping it closes the keyboard instead of focusing names. Give the names row room above the accessory bar when the handle is focused. Fixer: next home PR.
- Rotation and Safari toolbar resizes were reasoned about, not exercised on device. Fixer: a lane with rotation control.

## Add Item (rule 70, 2026-10-04). Fixer: next Split-page PR.
- Today an added Item keeps the printed Subtotal and Total, so other Shares shrink. Change it so the Split's total is the sum of its lines (rule 70): an added Item raises the total by its price, with no question asked. Check how Shares, the gray Total-check note (rule 6) and History read after an add.

## feat/gemini-reading audit notes (PASS+NOTES on d0ecddf)
- reader.test/route.test only loosely pin "standard calls get the remainder of SCAN_PASS1_BY_MS" (mutant M2 survives; would allow 12 s). Tighten the elapsed assertions. Fixer: next scan PR.
- On a slow uplink (1 MiB under ~1.8 Mbps) upload plus 9.8 s exceeds the 15 s client wait; the phone reads on the device while the server may still bill. Accepted.
- Rule R's word match misses "Totals", "TTL", "Tot."; a 429 storm sends an unparsed pass 1 to pass 2 with photo only (unmeasured). In ADR 0010 known limits.

## fix/home-keyboard-panel audit notes (PASS+NOTES on 728592e). Fixer: next home PR.
- Raise-only while focused leaves the panel too high when the keyboard gets shorter (emoji -> letters: 60 pt high until blur); a shorter-keyboard iPhone may sit too high on a fresh 330 estimate. Block lowering only until the first settle of an open, then allow later settled resizes to lower it.
- A no-keyboard focus with a stored height lifts and drops the panel once; the next cold real open covers the field ~0.4 s (hardware keyboard or script only).
- No unit or e2e test covers the keyboard-lift state machine (0 never stored, lift only while focused, missed flag). Add them.
- First tap places the caret by focus, not at the tap point.

## fix/create-blocked audit notes (PASS+NOTES on cc2d6c6). Fixer: sonnet, next home PR.
- The client negative-tip filter in sendable is redundant with the outer readable(tip) for a lone negative tip; add a case with tips 500 and -112 expecting 500, or drop it.
- Merge boundary: no test for exactly 20 adjustments (18 taxes + 2 discounts); a lone discount at the limit gets renamed "Discounts".
- 20+ taxes or service charges still gray Create (judged unreachable; rule 6 structural exception).
- Gemini reads Dollar General "REGULAR PRICE 4.00" lines as Items (reads vary 18-24 items). Eval/prompt work.

## From PR #81 (2026-10-07), open
- Remove has no visible keyboard path (only the Context Menu key or Shift+F10). Fixer: next UI owner.
- The person menu's gray "unchecks N items" line is read once at open and goes stale if they claim while it's open (person-menu.tsx:20).
- A removal's Revert re-adds the person to the head row only if the line was split into rows after the removal.
- Old Splits (up to 2,000 rows): a person on more than about 160 claimed rows would still exceed the 5 KB change cap on removal.
- The first-load size is about 400.3 KB of the 410 KB budget.

## From PR #85 (2026-10-08), open
- Toggle feel and the status-bar colour have not been checked on a real iPhone (mobile-native section 11). Real-notch landscape insets have not been exercised.

## From the clarity round (2026-10-09), open
- #90: clearing an amount field now saves $0.00 for that person (they stay a claimer and the remainder stays unclaimed, rule 4). Before, the sheet held open on "Add an amount". Operator should know.
- #90: the "Give <name> the rest" hit area uses `outsideScroll` with a -8 margin, not tested on a real touch device. With the keyboard up on an amount field there are only 8 px to spare (simulated keyboard), so it needs a real iPhone check.
- The entry bundle has about 1.9 KB left under scripts/size.mjs's 299,928 B limit. The next UI work needs a raise; ask the operator first.

## From PR #97 (2026-10-11), open (review PASS+NOTES)
- "Show the total" button sits inside the ring's role="img", so screen readers may hide it. Move it beside the img. Row re-tap still deselects. Fixer: next UI owner.
- Home Share falls back silently: it copies with no feedback, and does nothing without navigator.clipboard (same pattern as app/s/[id].tsx). Fixer: next UI owner.
- Native donut-ring.tsx uses an SVG data URI in RN Image, which won't draw on iOS/Android. Latent while web-only.
- The selected chip ring's gap uses c.sheet; check the desktop layout, where chips may sit on paper.

## From PR #98 (2026-10-11), open (review PASS+NOTES)
- Dark-mode self badge (#F2F2F3) is only about 1.2:1 from the lighter M1 dark fills. Operator to confirm in dark screenshots of a 3-claimer row.

## From the B2-1 Emil design review (2026-10-14)

- Dark `lift` and `cardLift` keep 0.4 and 0.35 black shadows that halo the home receipt drawing. Drop them when home loses its fills. Fixer: B2-9 owner.
- A second theme flip within 600 ms restarts the reveal from a snapped page. Reverse the running animation or ignore taps until it ends. Fixer: B2-4 owner, when the toggle moves to the header.

## From the B2 merges (2026-10-15)

- Two reviewers' local e2e runners were killed from outside partway through on 2026-10-15. Agents kill only processes they started, by PID (rule 51), and run e2e on their own `PORT` because playwright.config.ts defaults to 8787. Fixer: every owner brief.

## From the home sentence review (2026-10-15)

- The motion scenarios in `e2e/motion.ts` that the home rewrite left stale are fixed in the motion-audit PR (`fix/motion-audit-1`). `chip-entrance`, `desk-pane-handoff` (and its reduced twin) and `desk-chip-swap` are deleted. `desk-popover-*` now drives the claim popover (People, view as Sam, tap Rice's dot). `keyboard-name-*` and `keyboard-price-*` target the People sheet and the Description field, `reduced-item-open` probes the sheet's fade, and `item-close` is renamed. `theme-flip`, `reduced-theme-flip` and `loader-leave` are new. All scenarios pass on the Chromium lanes at 1x and 4x. Still open: run `motion.mjs --lanes webkit-iphone` on the Mac, since the WebKit lane has not run with the repointed scenarios. Fixer: the operator's Mac run.

## From the photo-only scan route (PR #122, 2026-10-15)

- When the OCR model files are not in within 5 s of the pick, home sends the photo with `ocrLines: []`, and the reader gets the full uncropped frame with no OCR text. An uncropped frame is a known misread cause (`receipt-extraction-eval.md`, the crop findings). Nobody has measured how often this route reads wrong. Run the rule 56 eval on the Mac with `ocrLines: []` and compare it with the OCR route. Fixer: the operator's Mac eval.

## From the deep review (PRs #137 to #141, 2026-10-17)

- At 320 px the Split page's offline notice ellipsizes. Let it wrap or shorten the copy. Fixer: next Split-page PR.
- `data-icons-live` still turns on at the first keydown rather than at first paint. Fixer: next overlays PR.
- Review findings M9 (icon stroke widths differ) and M12 (type tokens) were not done in #137 to #141. M9 waits on operator decision 12 below. Fixer: a design-tokens PR.
- On home, the reading step's changing words reflow the sentence around them (review finding H10, low). Skipped in #141. Fixer: next home PR.
- "I paid the rest" shows "Marked $30.20 as paid", the cumulative total. The remainder would read more naturally. One-line change if the operator wants it. Fixer: sonnet.
- On someone else's Pay sheet, a person who has settled or overpaid shows no payment line. Show "Paid" there too. Fixer: next Split-page PR, with an opus check on the money display.
- On home, if the friend field is open when the last name is removed, focus has no fallback and drops to the body. Fixer: next home PR.
- `maxLength` on names counts UTF-16 units, so emoji names hit the cap early. Fixer: next home PR.
- `metro.config.js` stubs expo-router `Sitemap.js` and react-native-web list modules by path (#139). An Expo or RNW upgrade can move them and silently grow the bundle or break a screen. Re-check the stub list and the size budget on every upgrade. Fixer: the upgrade PR.
- `e2e/sheet.spec.ts:95` (pick-sheet flick, `settled` timeout) failed once on Linux WebKit on #137 and passed on the next run. `e2e/boot.spec.ts:68` (loader fade 187.5 ms against a 190 ms floor) failed once on mobile-safari on #141. Neither reproduces locally (no WebKit here). Fixer: next test-infra PR, if either fails again.
- Operator decisions sent 2026-10-17, unanswered, current behavior kept: (1) the unreadable-receipt dead end, (2) auto-pick the Host after Create, (3) Recent rows saying "With Sam", (4) Create pill 48 vs 44 px, (5) fade only the new amount after a read, (6) pinned sheet titles and pull-down to close, (7) folding $0 Payments rows, (8) the Host ring's "paid you of", (9) photo zoom, (10) prefill By amount evenly, (11) only the selected app's handle in the Pay sheet, (12) one icon stroke weight.
