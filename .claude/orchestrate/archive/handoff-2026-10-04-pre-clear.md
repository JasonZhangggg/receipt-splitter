# Receipt Splitter: handoff (2026-10-03)

Repo `/Users/jason/Code/receipt-splitter`. The main checkout is on `main`. GitHub: https://github.com/JasonZhangggg/receipt-splitter. Production: https://app.splitwith.workers.dev. It deploys from `main` after CI.

Read first, in order:
1. This file.
2. `preferences.md`: numbered standing orders. These are binding and win over plan text.
3. `notes.md`: open follow-ups, by fixer.
4. `docs/research/receipt-extraction-eval.md` in the main checkout (untracked): the receipt-reading decision and its evidence.
5. `docs/plans/receipt-splitter-v2.md` on `main`. An updated copy is on `docs/plan-status`.

Older state is in `archive/`. Start no new work without the operator's go. Post only on a merge, a deploy, a FAIL, a decision needed, or a blocker.

## Production
`main` = `b3289cd` (PRs 36-54 merged; the OpenRouter key is set and server reading works in production), PR 36 deployed and confirmed (19c8e93); PR 37 (docs) merged. It contains v1, V2-1, V2-2, V2-3, V2-5, V2-6a, hardening (PR 34) and the sheet rebuild (PR 35).

PR 36 fixed the silent Create bug on production (2026-10-03).

## Unlanded work: local branches, none pushed

Each branch lives in its own worktree under `.claude/worktrees/`. Land them in this order.

1. **`fix/create-silent` @ `f5a5123`** (worktree `agent-a42876220f126011f`), 6 commits on `d0cf6ce`.
   - What it fixes: every Create tap acts; the home panel never collapses, is one piece with Create, and springs back after a drag; the keyboard never covers a home field; 12 names fit with the keyboard up; the WebKit flick test harness.
   - Verified PASS+NOTES, including a real-iOS simulator lane.
   - Operator approved 2026-10-03. Pushed as PR 36 (https://github.com/JasonZhangggg/receipt-splitter/pull/36). Next: merge with `--match-head-commit` on green CI, confirm the deploy.
   - Notes for a follow-up home PR:
     - `overflows` goes stale when the keyboard changes `maxContent` (`sheet.tsx:56,101`).
     - The page stays scrolled about 64 pt after the name field (pre-existing).
     - The panel holds about 0.3 s before snapping back when the keyboard closes.
2. **`fix/flash-root` @ `91fe313`** (worktree `agent-aac091d10a2d142b5`), 3 commits: census tool, red tests, fix.
   - What it fixes on the Split page:
     - the item-sheet inflight edit (old split type flash);
     - Bundle close height;
     - a keyboard inset on Split sheets;
     - a fade-through content swap (no doubled text on a bar flick);
     - focus-ring room for the "+" name box.
   - Done: Playwright census 94/180 flashes → 0/180 before the last two fixes; lint and typecheck green.
   - Not run yet: unit, worker, full e2e, size, Chromium motion lanes, a census rerun, and the real-iOS simulator census (the deciding gate, rule 44). The fade-through look needs the operator's review.
   - Rebased onto 19c8e93 as e3e7ff8 (2026-10-03). Every gate passes except the real-iOS census on keyboard-up (item-sheet Price 3/3, "+" name 3/3). Premise check done (`tools/flash/fix/keyboard-premise.md`): the app and iOS both make room for the keyboard, and `innerHeight` is not the layout height on iOS 27. Root recommends prototype A (the app ignores the keyboard, iOS moves the page; patch in `keyboard-premise/prototypes.patch`) and a keyboard-up gate that counts only the band above the keyboard, measured against the static reference page. The operator approved both on 2026-10-03; an owner is building A. Fade-through look sent to the operator for review.
   - After both land: dedupe the keyboard code between `src/ui/split-view/viewport.ts` and `src/ui/components/sheet.tsx`.
3. **`docs/plan-status` @ `ab6684a`** (updated 2026-10-03 for rulings 34 and 55-59, research docs added with one redaction, root-reviewed; push after PR 36 merges and rebase onto main) (worktree `agent-af57ce886aee7a301`).
   - What it does: the v1 and v2 plans updated to what shipped, a v2 status block, amendments, corrected V2-4 and V2-6b specs, and queued intent for the bar-after-pick change, Add Item and History.
   - It also carries the trail rows. The main checkout has the same trail rows as an uncommitted edit; discard it with `git checkout docs/plans/receipt-splitter-v1.trail.tsv` before pulling. A backup is in `.verify/`.
   - Stale: its V2-4 spec still says one row per unit. Rule 58 (quantities follow the receipt, with a Split button) replaced that after this branch was written. Fix it before opening the PR.
   - Add `docs/research/receipt-extraction-models.md` and `receipt-extraction-eval.md` (untracked in the main checkout) to this docs PR.
4. `diag/flash-census` @ `506beec`: the diagnosis tool, already cherry-picked into `fix/flash-root`. Delete it after that branch lands.

## Operator go (2026-10-03)
The operator said: keep building the remaining features, and fold the eval findings into the docs before the receipt-reading build. `fix/home-reload` MERGED as PR 39 (658e39a). Was PR 39 (https://github.com/JasonZhangggg/receipt-splitter/pull/39) at 1d95372, verified PASS+NOTES by an independent agent; it waits for the operator's review (rule 40) and the iOS lane, which needs the operator to approve simulator access. The prefilled-handle bug did not reproduce (form restore, bfcache and plain load all refuted on iOS 27 Safari); suspect AutoFill or a password manager, untested because the simulator access prompt went unanswered. Format decided: the compact `-` child format (JSON schema rejected). PR 38 (docs) merged as a6879d7 with the findings and the V2-7a/V2-7b specs. V2-7a built on `v2-7a-scan-worker` @ 5091144 (gates green, harness 18/24 real and 21/21 synthetic, evidence in review/v2-7a/); independent verifier: PASS+NOTES at 5091144 (evidence review/v2-7a/verify/). Medium note: the daily cap bounds scans, not dollars (a crafted scan costs 18x). Fix round 1 (3a4de35) failed its delta audit: the token-based worst case was 3x low (real about $0.019/scan, $38/day; big JPEGs cost about 65k tokens on Luna). Premise changed (rule 46): fix round 2 bounds dollars directly with a daily budget from usage.cost (default $3, operator to confirm), plus a server image-dimension cap (2560 px). Then another delta audit. The real-receipt score sits exactly at the 18/24 floor. V2-7b built at 16a6283 (stacked on 7a 68e0c63), verifier PASS+NOTES (evidence review/v2-7b/verify/). After PRs 40 and 41 land: restack onto main, make the Detail value ink (not muted), re-pin the golden SHA, rerun gates plus the iOS keyboard census on the Detail field under design A, then merge. Follow-ups: re-pin the golden row SHA in scripts/golden-splits.mjs after the restack; the 60 s timeout test waits for real. The operator must set the production secret themselves (`npx wrangler secret put OPENROUTER_API_KEY`) before 7a merges. Scan limits (6/min, 30/day per IP, 2,000/day global) await the operator's OK before V2-7a merges.

## In flight (2026-10-04)
- PR 40 MERGED as 629a862 (test now waits on state; Linux runner frames are 150-330 ms).
- PR 42 (crossfade, c0efcda): CI failed flash.spec:146 (180 ms double tap) on Linux WebKit; a sonnet fixer is root-causing it.
- PR 42 MERGED (d557df9). PR 43 (V2-7b) MERGED (d65f146). Server reading is fully shipped; it activates when the operator sets OPENROUTER_API_KEY.
- PR 44 (bar after a pick) MERGED as df4a6f2.
- fix/home-keyboard-a df6ce8d: all gates green; the iOS census is pending until the iPhone 18 Pro is free, then an independent verifier runs it.
- feat/quantities a7d6b6e (fix round 3 on c4110d4, not pushed): premise changed (rule 46). The stored version is now the lowest whose reader gives the Split back unchanged (round trip in `storedVersion`, src/core/parse.ts); versions 1-3 read with their release limits incl. 32 KB, so v1-3 rows also read in trunk. Limits moved to src/core/limits.ts. Revert of a Split now answers conflict unless every row still has its split-time price and claims and one shared name and detail. Gates green: lint, typecheck, unit 730, worker 137, e2e 221 passed/1 skipped. Levers in the worktree .verify/: round-trip property 25,406 checks, 0 failures; break lever: 0 lost edits (326 at c4110d4). drift.test search case fails by design (asserts drift > 0, finds 0). Next: delta audit.
- feat/quantities ce9d3ff: delta audit FAIL (Revert of a Split drops row 2..N edits; the leaving snapshot predates in-flight edits; the fallback drifts 1 cent). Fix round 2 changes the premise: no folding, group units by claim set, caps only on growth writes. Earlier: 7ddb775 verifier FAIL (two deleted e2e tests; a by-amount Split changes Shares by up to $4). Migration is clean: 0 Share differences over 1500 random legacy Splits. An opus fix round covers both blockers plus notes 1-6, with levers in review/quantities/verify/levers. Then a delta audit.
- PR 47 (V2-6b photo upload) MERGED as d59243e.
- PR 46 (Recent splits on home) MERGED as 0e323f1. Open question for the operator: shrink the hero so 3 rows fit in iPhone Safari (it shows 2 today).
- PR 45 (home keyboard design A) MERGED as 74932fe.
- Old running line: V2-7b restack (in its worktree, iPhone 18 Pro), fix/home-keyboard-a (own sim rs-homekb), feat/bar-after-pick (own sim rs-bar), crossfade delta audit.
- fix/split-type-crossfade 133b2ea (on 2f82af2): verifier running.
- V2-7a: delta audit 2 PASS+NOTES; final commit (20/day, $0.016 worst case, single-SOF, no '1 ' strip) reviewed by root; rebased onto 658e39a as 719956c (make-fixtures.py conflict kept both blocks, fixtures reproduce byte for byte). PR 41 MERGED as c30a854. V2-7b must restack onto main.

- PR 52 (Add Item) MERGED as 8100b59.
- v2-4-desktop 537d9fb: built (all 7 notes closed, +1.4 KB, LCP not worse). Restacking onto add-item 68e2b24 with the two-h1 and remote-delete fixes; then an independent verifier with iOS.
- PR 50 (Recent splits icon, box fills home) MERGED as 404eb5e.
- PR 49 (quantities) MERGED as 6658ce6. Storage now writes schemaVersion 4 only (rule 68).

- hardening/ids 19a0023: security verifier PASS+NOTES (no holes; hash matches Node 10,005/10,005). BLOCKED on the operator setting SPLIT_ID_SECRET before merge, or creates answer 503.

- PR 54 (V2-4 desktop) MERGED as b3289cd.
- PR 53 (drop the home editor) MERGED as e8bdcf2.

## Next to start (2026-10-03, operator go)
- After PR 40 merges: `fix/home-keyboard-a` (design A on home, rule 17) and the bar after a pick (rule 26), in parallel within max parallel.
- Then quantities follow the receipt (rule 58), Add Item (rule 30, anyone, outside Bundles), History on home (rule 37), V2-4, V2-6b, notes.
- Merge each PR on a clean independent verdict plus green CI (rule 40 as superseded).

## Queue after those land, in order
1. **Server-side receipt reading.** The design is in `receipt-extraction-eval.md`: GLM-5.3-Flash with `/nothink`, photo plus OCR, compact lines; a server check; GPT-6 Luna low edits on failures; flagged rows.
   - The operator approved the design on 2026-10-03, with the format additions in notes.md.
   - Needs: a new ADR replacing ADR 0001's OCR rule (preferences 55-57); a Worker route with the OpenRouter key as a secret; a scan rate limit and daily cap; the eval harness as a regression check.
   - Build in the listed fixes: per-item promos over summary blocks, a penny tolerance, no deletion of fees in pass 2, the check accepting pre-discount subtotals and tax-free receipts, and a sharper image (about 2048 px) for the model.
   - Keep the current OpenRouter key for now (rule 61); no rotation first. The first key had about $9.24 of $10 left.
2. The bar after a pick (rule 26): "Your share" with an up-arrow and no link row. Build it on `fix/flash-root`.
3. Quantities follow the receipt, with a Split button on rows (rule 58).
4. Reloading home resets the receipt, photo and names but keeps payment handles (rule 59). Also fix the prefilled-handle-treated-as-empty bug (`notes.md`, operator report 2026-10-03). Reproduce it in the iOS Simulator first.
5. Add Item (rule 30). Still open: who may add. The recommendation is anyone, outside Bundles.
6. History on home (rule 37).
7. V2-4 desktop, then V2-6b photo upload and View receipt.
8. The open notes in `notes.md`.

## Tools and evidence
- Real-iOS census: `tools/flash/sim/census/tool/` in this store (`rec.sh`, `census`, `strip.sh`). `/tmp/flash` was wiped on 2026-10-03; the tools are being recovered from transcripts into `tools/flash/`. Never keep durable files in `/tmp`. Xcode and ffmpeg are installed. The simulator is an iPhone 18 Pro on iOS 27. Drive it with a 2-point `touch_path`, not `tap`.
- Playwright flash diagnosis: `tools/flash/diagnosis.md` in this store.
- Receipt eval harness and photos: `~/receipts-eval/` (outside the repo; the photos hold payment data).
- Production test Splits use the handle @test-debug. They expire on their own.
