# Receipt Splitter: handoff (2026-10-05, written before a context clear)

Repo: `/Users/jason/Code/receipt-splitter`, main checkout on `main`. GitHub: https://github.com/JasonZhangggg/receipt-splitter. Production: https://app.splitwith.workers.dev. Every merge to `main` deploys after CI; confirm the Deploy run for the tip.

Read first, in order:
1. This file.
2. `preferences.md` (rules 1-73, binding). Newest rulings: 6, 34, 60, 70, 71, 72, 73.
3. `notes.md` (follow-ups, each with a fixer).
4. `docs/plans/receipt-splitter-v2.md` and `docs/adr/0010-gemini-reads-the-receipt.md` on `main`.

Previous handoffs: `archive/` (latest `handoff-2026-10-05-pre-clear.md` has the full day's log).

## How the root works (short)
- Owners build in their own worktree and commit locally, never push. An independent verifier returns PASS / PASS+NOTES / FAIL; fix rounds get a delta audit. The root pushes the exact verified SHA, opens the PR, and arms `gh pr merge N --auto --merge --match-head-commit <sha>`; confirms the deploy.
- In zsh, quote refspecs: `git push origin "${H}:refs/heads/<branch>"` (`$H:r` is a zsh modifier).
- **Rule 73 (after a crash on 2026-10-05):** one heavy local job at a time (build, dev server, e2e suite, simulator recording, local model); check `df -h /` >= 20 GB free before downloads/model runs; local models over ~2 GB of memory need the operator's OK. Network-only eval agents may run alongside.
- Scratch in `.verify/` or `~/receipts-eval/`, never the session scratchpad. Delete throwaway worktrees and node_modules/dist when done (rule 69).
- The operator wants terse resumes: do only the remaining steps, don't redo finished work.

## Production (main = 7c70c07, all deployed)
- PR 60: Gemini receipt reading (ADR 0010). Pass 1 `gemini-3.1-flash-lite` minimal, MEDIUM resolution, AI Studio flex with a 3.5 s deadline then standard tier, pass-1 budget 8.5 s; pass 2 only when the total fails, `gemini-2.5-flash` reasoning off + arithmetic breakdown; rule R (no edits to lines named "total"), rule P (penny review by 3.1 FL, kept only if it reconciles to the cent); 10 s scan cap; phone falls back to on-device OCR parse after 15 s.
- PR 61: home keyboard, only the panel rises (rule 17).
- PR 62: Create is gray with an exact reason when blocked (rule 34); handles optional (rule 71); Venmo/Cash App reasons name the failure; odd receipts always split (rule 6), coupons bigger than their Item clamp the Item to $0 and move the excess to a whole-receipt discount; negative tips dropped.
- No open PRs.

## In flight when the context was cleared
1. **`polish/share-breakdown`** (rule 72: Your share sheet; fixed header/footer, scrolling list, amount glides into place, arrow flips, 20 px gap, 14 px items, "N items unclaimed"). First version e3e2963 FAILED verification (quick swipe after open scrolled the receipt behind). Fix round (uncommitted) in worktree `.claude/worktrees/agent-a28904e29135270e1`: page scroll lock while the sheet is open, pay-block fade tied to progress, 16 px edge fade, pill spacing, desktop "Your share", accessible names per person. Its owner agent was resumed to finish: rebuild, quick census + swipe check, gates, commit, `git branch -m polish/share-breakdown`. If no report arrives, check that worktree's `git log`/`git status` and `.verify/handoff.md`. Next: delta audit (focus on the quick-swipe fix and that the page lock causes no hitch), push, PR, merge.
2. **OCR eval follow-up** (network only, cap $0.25): ARP with the PP-OCRv6 small hint, and pass 1 with no OCR at all composed with both reviewers (2.5 Flash and 3.8 Flash low detail), vs the v5 control (103/123, 0 silent). Results go to `~/receipts-eval/ocr-v6-eval.md` and `hillclimb/decision.tsv`.

## Waiting on the operator
1. Switch the production reviewer from 2.5 Flash to 3.8 Flash low detail (config-only PR): 105/123 vs 101/123, 0 silent, +$0.91/10k; 2.5 Flash returned HTTP 502 on 12% of calls and will be deprecated. Watch: 3.8 turned a flagged reading into a silent wrong one 4/62 raw calls on long receipts.
2. Cheap ideas from the OCR eval, untested: strip misread "$"->"5" and non-ASCII from the hint, add an orientation step (w04 rotated 90 degrees), raise the 960 px detection limit for long receipts (w01).

## Receipt eval state (~/receipts-eval/, outside the repo)
- Test set v2: 41 receipts = r1-r9 (operator's real; r9 = the Dollar General upload), w01-w19 minus w05 (online, licensed, double-labeled; sources in `online/SOURCES.md`; w01 is CC BY-NC), h01-h14 (synthetic hold-out). Manifest `testset-v2.md`, results `testset-v2-results.md`.
- Shipped ARP: 101/123 (fresh control 103/123), 0 silent, worst 9.8 s, $5.72/10k. Misses are long receipts (w01 100 lines, w02 crumpled, w04 rotated) and r7/r9 coupon logic, all flagged.
- Rejected (all measured): GLM->Luna (20 silent, 67 s worst; Parasail serves GLM fp4), Qwen3.8-27B, MiMo, DeepSeek, Gemini 3.5/3.8 as readers, 3.5 FL reviewer, Luna no-think reader, Donut, PaddleOCR-VL (55-71 s and 10 GB per receipt, wrong), PP-OCRv6 medium as hint (96/123, 3 silent), LlamaParse (not tested: price/latency/vendor).
- Harness: `hillclimb/` (arms.mjs, hc-run.mjs, hc-report.mjs, hc5-report.mjs, detail-report.mjs, decision.tsv rows through I15, spend.tsv). Real photos hold payment data: never commit them.

## Housekeeping
- 16 worktrees left under `.claude/worktrees/` (pre-rebase copies of merged work plus the breakdown WIP); build folders cleared. ~56 GB free.
- OpenRouter account limit observed: 20 requests/min per model (production shares the key).
- After old Split links expire (60 days after their last change): one PR drops 22-character ids and the legacy device-id mapping.

## Update 2026-10-05 ~15:00 (session 8dadc419; per rule 74 these die if that session is cleared)
- The 13:58 clear killed both in-flight agents. Restarted. Breakdown fix committed 38c3835 on polish/share-breakdown (not pushed); delta audit running. Operator call pending: list ignores swipes in first ~200 ms of the open glide (owner recommends keep).
- OCR eval done: keep v5 hint (v6s 95/123, no-hint 86/123 with 8 silent). I16, I17 in decision.tsv.
- Operator approved (2026-10-05): reviewer -> 3.8 Flash low detail (owner running, branch model/reviewer-3-8-flash, light gates only); OCR fixes: long receipts (DET_MAX_SIDE 960 shrinks w01 969x5047 to 19%), orientation step (w04), hint cleanup ("$" read as 5, non-ASCII). OCR owner queued until the audit's simulator job ends (rule 73).
- ~16:30: PR 63 (reviewer -> 3.8 Flash low detail, e475e50) and PR 64 (share breakdown, 9249f31, audit PASS+NOTES) open with auto-merge pinned. Operator allowed `gh pr merge` in .claude/settings.local.json. OCR owner running on branch ocr/long-and-rotated (heavy job; nothing else heavy until it ends).
- Queued after OCR (simulator): investigate first swipe after opening Your share not scrolling the list (audit 9249f31: 5/5 at 0.7-3 s, also at 38c3835; earlier audit had 10/10 scroll); sheet dragged above open rest shows page beneath for ~3 frames (pre-existing, rule 18 candidate).
- ~17:10: operator: OCR time budget 5 s (OCR owner adding it on ocr/long-and-rotated); keep the server read at upload (not on Split). New: status text under the home progress bar (owner running, branch polish/scan-status-text). Heavy-job order: OCR verifier -> OCR cap build -> status text build -> share-sheet first-swipe/overstretch investigation.
- ~evening: PR 65 (status line) merged. PR 66 (OCR long+rotated+5 s cap, 34f6e16, two audits PASS+NOTES; accepted edge limits: >2:1 tall sideways text not turned, >3:1 wide upright always turned) open with auto-merge. Next on the simulator: share-sheet first-swipe + overstretch investigation.
- PR 66 (OCR) merged. PR 67 (sheet overstretch cover, a5b5ce8, audit PASS+NOTES; first-swipe was a test artifact, lesson in census tool README) open with auto-merge. Queue empty; nothing heavy running.
- 2026-10-06 ~09:55: PR 68 merged. PR 69 (adjustment editing, be7431a, final audit PASS+NOTES) open with auto-merge. Next: after 69 merges, rebase polish/item-row-exit (3de087b, worktree item-exit) onto main, audit, PR. Follow-ups: Item price field caret typing gives 12.0013 and doesn't save; mobile close by keyboard/AT leaves focus on body; 3-pay-method list 122px at 375x667. Laptop hibernated 01:53-09:27 (battery).
- ~10:00: operator: fix all three follow-ups. Owners running from be7431a: fix/item-price-caret (worktree item-price), fix/sheet-focus-return (focus-return), fix/three-pay-methods (three-pay). Each: independent audit then PR. polish/item-row-exit waits for #69 merge then rebase+audit. Keep laptop on AC.
- ~10:40: #69 CI failed once on e2e/home-pan.spec.ts:11 [mobile-safari] (receipt not visible in 60 s; unrelated); re-run. Flaky-test watch: home-pan.spec.ts:11 (CI), scan.spec.ts:544 (local, three-pay run). fix/three-pay-methods done at 943bdd3 (merged main into the #69 stack as ad91f3e) — rebase onto main after #69 merges, then audit. Operator Q pending: Zelle pill copies handle only (amount on share row).
- ~11:30: #69 CI failed TWICE on e2e/home-pan.spec.ts:11 [mobile-safari] (receipt not visible 60 s); main CI 953ad57 passed it -> investigating on the merge tree (no more reruns). fix/sheet-focus-return done e0f17c9, audit running. Rule 76 added (no git stash) after a stash collision. three-pay owner reworking to one pay pill with a method picker (operator 2026-10-06, rule 75 updated).
- fix/sheet-focus-return e0f17c9: audit PASS+NOTES (add Escape + on-screen-keyboard-then-touch tests as follow-up). Ready; waits for #69 base. Flaky: scan.spec.ts:544 stage-line timing failed once more (mobile-chrome), passes on rerun.
- fix/item-price-caret 5a3ec30: audit PASS+NOTES. Ready; waits for #69. Follow-up: on iOS with keyboard up, Item sheet By amount pans Close off-screen (user taps keyboard Done first) — design A behavior, compare with base later.
- #69 CI root cause: e2e/home-pan.spec.ts had Playwright's default 30 s test timeout while waiting 60 s for a real OCR read that takes ~29.5 s on the Linux runner. Fixed with test.setTimeout(90_000) (622a73f, test-only) pushed to #69; auto-merge re-armed on 622a73f. Same latent budget was on main.
- ~16:00: #69 merged (a056600). PRs open with auto-merge: #70 focus-return (1fab01b), #71 item-price (ca827b1), #72 item-row-exit (4a0fc6e). Pay picker rebuilt on main as fix/three-pay-methods a5007b2 (audits PASS+NOTES on 8f304a4/fb4379a; same tree) — conflicts with #71 only in e2e/sheet.spec.ts: after #71 merges, rebase, keep both tests, push, PR, auto-merge. Follow-ups: pay pill name cap 112 px truncates even with room; long Host name at 375x548 leaves list 109/92 px (pre-existing, cause unknown); flaky scan.spec.ts:544 and frame-timing sheet.spec:194/220 when run in parallel.
- #70, #71, #72 merged. Pay pill one-line ellipsis done c18a273 on fix/three-pay-methods (audit running); after audit: rebase onto main (sheet.spec conflict with #71: keep both tests), push, PR. polish/unclaimed-inline owner running (unclaimed count to total line; center Add item).
- PR #73 (pay pill + picker, 2224e68, rebased on main after #71) open with auto-merge. Remaining in flight: polish/unclaimed-inline owner. Follow-ups: long Host name at 375x548 list shortfall (pre-existing), flaky scan.spec.ts:544 and frame-timing sheet tests in parallel.
- polish/unclaimed-inline: d30a1a6 follow() easing FAILED audit (list lags sheet up to 5 frames). Second fix round: revert follow(), give empty breakdown real content + min list height (attack the premise). Pending operator Qs: Add item horizontal centering; bundle units vs total lines count.
- 2026-10-06 20:12: #73 merged (pay pill). #74 (unclaimed-inline 30d57d4, audit PASS+NOTES) open, auto-merge re-armed after operator OK on the empty-row wording. Open operator Qs: Add item centered across card?; bundle units vs total lines. Follow-ups: long Host name list shortfall at 375x548; flaky scan.spec.ts:544 + sheet.spec pick-share sampling test.
- 2026-10-06 20:51: #74 merged. Open with auto-merge: #75 deflake tests (e7b3f81), #76 SE long name chips (fbef526), #77 Item counts one per row + Bundle 'N claimed' + breakdown header rows (ac4bef5). No agents running. Queue empty after these.
- #79-ish paid chips (6e52409, includes #76 merge) open with auto-merge; #75 #76 #78 open. Queue otherwise empty.
- 2026-10-06 22:15: #77 #78 merged. #76 fixed test (claims enough Items to scroll; red 92 w/o fix) ebcb078, re-armed. #79 paid chips with crossed-out check, merged #76 branch in, 1c9b695, re-armed. #75 failed job re-run (createSplit non-201 in focus-return, infra). Queue empty.
- #79 paid chips (! for short, c95d5ab) re-armed after operator OK.
