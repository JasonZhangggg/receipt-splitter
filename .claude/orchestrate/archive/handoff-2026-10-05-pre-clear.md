# Receipt Splitter: handoff (2026-10-04, PAUSED by the operator)

Repo: `/Users/jason/Code/receipt-splitter`. The main checkout is on `main`. GitHub: https://github.com/JasonZhangggg/receipt-splitter. Production: https://app.splitwith.workers.dev. Every merge to `main` deploys after CI. The Deploy workflow skips any commit that is no longer the tip of `main`, so confirm the deploy that follows the tip's own CI run.

Read first, in this order:
1. This file.
2. `preferences.md`, rules 1-69. They are binding and win over plan text. The newest rulings are 37, 58, 59, 61-69.
3. `notes.md`: open follow-ups, each with a fixer.
4. `docs/plans/receipt-splitter-v2.md` on `main`. Its sections are the spec for each PR.

Older handoffs are in `archive/`. The last one before this clear is `archive/handoff-2026-10-04-pre-clear.md`.

## How the root works (rules 39-69, short form)

- Owners build in their own worktree and commit locally. They never push. Owners write the code themselves, with no writer helpers (rule 64).
- An independent agent verifies each PR and returns PASS, PASS+NOTES or FAIL. A fix round is checked by a delta audit. UI PRs also get an iOS census, run only on the **iPhone 18 Pro** simulator, which is the only device with access granted (udid `09F77986-7EE8-4F86-903F-6EAF1E5EBF8E`). Tools are in `tools/flash/sim/census/tool/`. Use 2-point touch_paths and record 12 s. Check `ps` for another agent's recording first.
- The root rebases onto `main` and compares patch-ids, then pushes. It opens the PR and merges with `gh pr merge N --merge --match-head-commit <sha>` once CI is green and the verdict is clean. No operator screenshot review is needed (rule 40 superseded). The root then confirms the deploy.
- Scratch goes in `.verify/` or `review/<feature>/`, never in `/tmp` scratchpads (rule 65). Throwaway worktrees delete `node_modules` and `dist` when done (rule 69). If free disk drops under 10 GB, prune `node_modules` and `dist` from merged, idle worktrees, and never from a worktree a process is using.
- Storage only rolls forward: always write schemaVersion 4 (rule 68).
- Post to the operator on a merge, deploy, FAIL, decision or blocker.

## PAUSED (operator, 2026-10-04 ~13:20 EDT)

The operator said: finish the in-flight tasks, then pause and trigger nothing new. Do not start any agent or task until the operator says to resume.

## Production

Merged 2026-10-04 afternoon, pinned to verified heads:
- **55** polish/ui-notes -> `2435ea4`: inline SVG icons, grouped amounts >= $1,000, focus ring, focus to Bundle header after Delete, cleaned photo kept across Back.
- **56** hardening/ids -> `fc4531c`: signed 24-char Split ids, per-Split hashed device ids, ADR 0009. SPLIT_ID_SECRET is set.
- **57** chore/flaky-tests -> `6a46297`: close leaked test contexts; `npm run e2e` runs @frame-timing in a second pass on one worker.

Armed with GitHub auto-merge (`--match-head-commit`), merging on green CI:
- **58** fix/home-scroll-stuck @ 4bcaab3: home glides back to top after the iOS keyboard closes.
- **59** fix/item-detail-field @ 69eb7bc: Detail field shows the row's gray line, placeholder "Add detail (optional)", split icon, History wording, no-op save skip.

**Status 2026-10-04 ~13:50 EDT:** 55-57 deployed (6a46297, Deploy success). 58 and 59 merged (main tip 16b387b); their CI/Deploy were still running. **First thing on resume:** confirm the Deploy workflow succeeded for the tip of main (`gh run list --branch main`). The last confirmed deploy was b3289cd at 16:03 UTC. If a PR's CI failed, it stays open: read the failure and run a fix round.

## Waiting on the operator

1. Add Item product call: an added Item keeps the printed Subtotal/Total, so Shares shrink to absorb it. Should the sheet ask "missed by the scan" vs "not on the receipt"? Root recommends asking, defaulting to missed.
2. Optional OpenRouter daily spend limit.
3. Gemini evals done ($0.56 total): ~/receipts-eval/gemini-35-eval.md and gemini-reasoning-eval.md. Single-pass Gemini Flash-Lite (3.1 or 3.5) is ~1.5-2 s worst-case but 12/24 vs shipped 20/24; more reasoning made it worse (token cap) and never fixed r3/r5. Untested idea: Gemini 3.1 Flash-Lite minimal as pass 1, then Luna. Offered, not started: (a) a per-step timing run of the scan pipeline plus Workers Logs in wrangler.jsonc; (b) re-testing Gemini 3.1 Flash-Lite and Flash in the compact format.
4. An orphaned `wrangler dev` (PID 44719, port 9310) from a dead owner; the auto-mode classifier denied killing it. The operator may `kill 44719`.

## After those

- When old links expire (60 days after their last change), one PR: stop routing 22-character ids, delete the 16-character device-id mapping, rotate the browser id, move to Web Crypto and delete `src/core/hmac.ts`.
- `notes.md` follow-ups, each with a fixer. New today: iosKeyboard emulation vs iOS 27, deliberate home room, Split page reveal on iOS 27, names pill sliver, focus-ring media query, verify-skill full-page focus shots, scan lost when leaving home mid-read, CI trace artifacts.
- Stale worktrees under `.claude/worktrees/` from merged branches can be pruned after confirming each branch merged.

## Evidence and tools

- `review/<feature>/`: verdicts, screenshots and probes for every PR.
- `tools/flash/`: the iOS census, the flash diagnosis, the keyboard premise and the probe kit. `tools/quantities-handoff.md`: the storage history and design of quantities, version 4 and fromLegacy.
- The receipt eval harness is in `~/receipts-eval/` (outside the repo; the photos hold payment data). The format findings are in `docs/research/receipt-extraction-eval.md`.
- Model choice is in `~/.agents/pstack-models.md` (no fable access; opus by default, sonnet for small fixes). Max 4 agents in parallel.


## Receipt-reading hillclimb (started 2026-10-04 ~15:00 EDT, operator-requested)
Goal: worst <= 10 s, <= $8/10k, wrong-but-passing <= production, maximize fully correct (target >= 18/24, >= 8 iterations, $2 cap). Agent runs in ~/receipts-eval/hillclimb/ (decision.tsv, report.md, handoff.md if it hits its context limit). Prior evals: ~/receipts-eval/{timing-breakdown,gemini-35-eval,gemini-reasoning-eval,pipeline-eval,gemini-2pass-eval,nothink-breakdown-eval}.md.
Found along the way, not yet acted on: (1) production Luna turns caught errors into silent ones (9/27 failing readings); (2) OpenRouter limits this account to 20 requests/min per model, which production shares; (3) the $3 daily scan budget would bind before the 2,000 cap at > $0.0015/scan.
- Hillclimb result (root reproduced the table offline): c4S = Gemini 3.1 FL minimal, MEDIUM media resolution, AI Studio flex with a 3.5 s deadline then Vertex/AI Studio standard; server summary-discount guard; pass 2 only when the total fails; Gemini 2.5 Flash (reasoning off, low-detail image, breakdown) with a deadline at 10 s. 18/24 both batches, wrong-but-passing 3, worst 3.2 s, $4.72/10k. Production same minutes 20/24, worst 17.7 s, $6.53/10k. Losses: r3 (digit, every Gemini) and r7 (MEDIUM reading). Spent $0.257. Next ideas: two-step fixer (2.5 Flash then 3.5 Flash low-detail), 2048 px photos. Single vendor (Google) needs an ADR against rule 57.
- Hillclimb follow-ups (total spend $0.37): MiMo v2.6 Flash and DeepSeek v4.1 Flash 2/8 as pass 1, rejected. Unguarded leaders: GLM->3.1 FL reviewer 20/24, 2 silent, $6.26, worst 17.7 s; race GLM+3.1FL@4s>2.5 Flash 17/24, 0 silent, 7.6 s, $7.26-9.07 (cut-off billing unmeasured); 2.5 FL (Vertex)->3.1 FL MEDIUM 14/24, 0 silent, 4.0 s, $4.60. Reverse 3.1FL->2.5FL: 2.5 FL fixes nothing. The guard's whole effect is r6 (operator sees it as test-set tuning). Root recommendation: stop tuning until new test receipts exist; swap Luna for a cheap reviewer; show-now/update-later for GLM's tail (needs the operator's late-update call).
- Gemini 3.8 Flash flex (rows W0-W4, $0.16): rejected. As pass 1 5/8 at $12.48/10k (no better than 3.1 FL at 3x cost); as reviewer of 2.5 FL same fixes as R31fM at 2x cost, and hid GLM errors. Vertex flex queued 12-40 s on every call. Reasoning cannot be disabled; minimal still reasons on ~1/4 of reviewer calls.
- GLM thinking-control tests (rows G0-G8, $0.11): nothing reliably shortens r6's chain; abort/retry, hedges, prompt placement, smaller image, JSON schema all fail; budgets ignored on Baseten/Together. Only lead: two overlapping image halves in parallel (2.7-4.8 s) but merging is unreliable. NEW RISK: production's pinned GLM host now shows as `parasail/fp4` and read r6 wrong 3/3 today (right 6/6 earlier). Re-run the GLM baseline on all receipts and check Parasail's quantization before trusting GLM numbers or production accuracy.
- Gemini-only hillclimb round 2 (operator 2026-10-04): 3.1 FL / 2.5 FL (2.5 Flash reviewer allowed), no hardcoding, unguarded, <= $6/10k, <= 10 s. Target >= 18/24 confirmed twice. A separate agent builds a synthetic hold-out set in ~/receipts-eval/holdout/ that the hillclimb may score against but never read; kept changes must not hurt it. Logs in ~/receipts-eval/hillclimb/decision.tsv, outputs ~/receipts-eval/out/hc3-*.
- Gemini hillclimb round 2 result (root reproduced on fresh batch hc3c1): ARP = 3.1 FL flex MEDIUM (fallback standard @3.5 s) > 2.5 Flash reviewer when the total fails, + rule R (pass 2 may not add/edit lines named "total", tax/tip exempt) + rule P (a reading that passes only within the 3-cent tolerance goes to a 3.1 FL MEDIUM reviewer told the gap; edits kept only if it then reconciles to the cent). 20/24 fresh (21/24 stored), 0 silent, 99.8-100% items, worst 4.6 s, $5.39-5.58/10k, hold-out 39/42 same as baseline. Unguarded, no prompt change. Remaining miss: r7 (repeat Discount lines + dropped coupons). Caveats: each rule's gain is one receipt (r6, r3); hold-out never triggers them; P's firing rate on real receipts unmeasured. Spend $0.21.
- 2026-10-05 02:3x UTC: PR 60 (feat/gemini-reading, d0ecddf) merged as 5af19de; tip CI running, Deploy follows. CONFIRM the deploy, then watch the scan logs for path counts (flex vs standard fallback, pass 2 rate, penny fires). fix/home-keyboard-panel at 728592e is in delta audit (prior FAIL on 5609cc1).
- 2026-10-05 03:27 UTC: Gemini pipeline (PR 60, 5af19de) deployed, Deploy success 02:51. PR 61 (home keyboard lift, 728592e) merged as a4f35d5; CI green, Deploy in progress. No agents running. Next: confirm a4f35d5 deploy; operator to try a real scan and the keyboard on a real iPhone.
- Evals I9-I12 ($0.057): 3.5 Flash-Lite as reviewer 15/24 (vs ARP 20-21) and as penny reviewer adds silent errors; Luna effort none as pass 1: 3/24 alone, 2.8-3.4 s median, worst 8-12 s; race with 3.1 FL adds no accuracy. ARP stays.
- Test set v2 (41 receipts: r1-r9, w01-w19 minus w05, h01-h14; ~/receipts-eval/testset-v2-results.md, $0.68): ARP 101/123, 0 silent, worst 9.8 s, $5.72/10k (r1-r8 75%, online 83%, hold-out 90%: no harmful overfit; rules R/P only fire on r3/r6). ARP with 3.8 Flash low-detail reviewer 105/123, 0 silent, $6.63 (drop-in for 2.5 Flash; 4/62 stored calls turned a flagged reading into a silent wrong one). G25f returned HTTP 502 on 12% of calls. Old GLM>Luna 89/123, 20 silent, 56 runs over 10 s; Parasail endpoint confirmed fp4. Qwen3.8-27B 68/123 at $16/10k. All ARP online misses are long receipts (w01 100 lines, w02, w04), all flagged; the 10 s limit cuts the fallback+review path on 100-line receipts.

## 2026-10-05 crash and cleanup
The operator's Mac crashed: PaddleOCR-VL (local, ~10 GB RSS, ~60 s per receipt, 5.3 GB download) ran while the breakdown fix round built and recorded; disk hit 98%. All agent processes ended with the crash; none were resumed (operator: stop everything). Cleanup with the operator's OK: 83 merged worktrees removed, build folders cleared from the rest, paddlevl/ and donut/ deleted (small results kept in ~/receipts-eval/paddlevl-probe/ and donut-results/), old census videos/frames and labeling crops deleted. Free space 371 MB -> 57 GB. New rule 73 (one heavy local job at a time, disk check before downloads).
- PaddleOCR-VL: dropped (probe r3/r8 both wrong, 55-71 s and 10 GB per receipt). Route B never ran.
- polish/share-breakdown: worktree agent-a28904e29135270e1 holds UNCOMMITTED fixes (page scroll lock, pay-block fade, edge fade, pill spacing, desktop "Your share", accessible names). Not committed, gates and census not run. Branch head e3e2963. Resume only when the operator says.
- Pending operator decision: switch the production reviewer from 2.5 Flash to 3.8 Flash low detail (config-only).
- PP-OCRv6 eval (I15, $0.16, ~/receipts-eval/ocr-v6-eval.md): don't swap. v6 medium finds more amounts (66% vs 59%) but ARP with its hint scored 96/123 with 3 silent vs v5 control 103/123, 0 silent; 7x slower (5.5 s warm on a Mac), ~100 MB download. v6 small = v5 on amounts. Cheaper ideas instead: strip misread "$"->"5" and non-ASCII from the hint, add an orientation step (w04 rotated), raise the 960 px detection limit for long receipts (w01).
