# Receipt Splitter: handoff (2026-10-04, written before a context clear)

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

## Production

`main` = `b3289cd` (PR 54 merge), deployed and confirmed at 16:03 UTC on 2026-10-04.

Merged this session, all live:
- **36:** every Create tap acts.
- **37, 38:** plans, research and the receipt format.
- **39:** a home reload keeps only the handles.
- **40:** Split page flash fixes, and keyboard design A.
- **41, 43:** server receipt reading (V2-7a, V2-7b), with the Item `detail` field and "$X off".
- **42:** Item sheet crossfade.
- **44:** "Your share" bar after a pick.
- **45:** design A on home.
- **46, 50:** Recent splits, now behind a clock icon top right; the dashed box fills home, with 44 px above and 48 px below.
- **47, 48:** photo upload and View receipt as an icon.
- **49:** quantities: "3x" rows, Split into N, storage version 4.
- **51:** test tooling (`SLOW_RAF=<ms>` slow-frame e2e mode).
- **52:** Add Item.
- **53:** home editor dropped; bad reads are repaired and still create the link.
- **54:** V2-4 desktop: a centered pair from 1024 px, with anchored popovers.

Secrets on the Worker are `OPENROUTER_API_KEY`, set by the operator; server reading works in production. The unused `TURNSTILE_SECRET_KEY` was deleted with the operator's OK.

## Branches not merged

1. **`hardening/ids` @ 19a0023**, worktree `.claude/worktrees/agent-a95640900f009a5c5`.
   - What it does: signed Split ids (an HMAC tag, 24 characters; old 22-character ids still route and write 0 rows), and per-Split device ids (an HMAC of the device id with the Split id, so the raw id never leaves the client). It also adds ADR 0009.
   - The security verifier returned PASS+NOTES. The evidence is in `review/hardening-ids/verify/`.
   - **Blocked on the operator.** They must run `openssl rand -base64 32 | npx wrangler secret put SPLIT_ID_SECRET` before this merges. Without it, creates answer 503.
   - Then: rebase onto `main`, check the patch-id, push, open the PR, merge on green, and confirm the deploy. Rebase conflicts are likely, because main changed `app/s/[id].tsx` and core since 8100b59. If the patch changes, run a delta audit.
   - Before merging, fold in the small doc fix to the ADR 0009 old-page bullet (in `notes.md`).
2. **`polish/ui-notes`**, worktree `.claude/worktrees/agent-a4b4f729aae231718`. An owner agent was building it at the time of the clear. The work:
   - icon first-frame flicker;
   - the input focus ring;
   - thousands separators in amounts;
   - focus after deleting inside a collapsed Bundle;
   - the cleaned photo copy lost on Back before Create;
   - V2-6b code nits.
   Its report may arrive in the new session. If it doesn't, read `git log origin/main..polish/ui-notes` in that worktree and its `.verify/`. Then run the independent verifier and merge.
3. **`chore/flaky-tests`**, worktree `.claude/worktrees/agent-a569f7fd67f8d0843`. An owner agent was working on it at the time of the clear. It covers `e2e/claim.spec.ts` ("the payer marks themselves paid…", which failed on Linux WebKit in CI run 37206235929) and `e2e/motion.spec.ts:10` ("pick hands off to the bar"). The brief says to stop and report if either turns out to be a real product race. It is test-only, so the root reviews the diff, then merges on green.
4. Stale merged worktrees (feat/quantities, v2-4-desktop, v2-4-trunk and others) can be pruned with `git worktree remove` after confirming each branch is merged. Ask the operator before deleting any whose branch is not merged.

## Waiting on the operator

1. `SPLIT_ID_SECRET`, for the hardening merge (command above).
2. **Add Item product call.** An added Item keeps the printed Subtotal and Total, so everyone's Shares shrink to absorb it. That is right for an Item the reading missed, and surprising for one never on the receipt. Should the sheet ask which case it is? It is asked; no answer yet.
3. Optional: a daily spending limit on the OpenRouter key. The Worker already caps spend with a $3 daily budget, 20 scans per day per IP, and 2,000 a day overall.

## After those

- When old links expire (60 days after their last change), one PR does all of this:
  - stop routing 22-character ids;
  - delete the 16-character device-id mapping;
  - rotate the browser id;
  - move to Web Crypto and delete `src/core/hmac.ts` (details in `notes.md`).
- Remaining `notes.md` items, each with a fixer named there.

## Evidence and tools

- `review/<feature>/`: verdicts, screenshots and probes for every PR.
- `tools/flash/`: the iOS census, the flash diagnosis, the keyboard premise and the probe kit. `tools/quantities-handoff.md`: the storage history and design of quantities, version 4 and fromLegacy.
- The receipt eval harness is in `~/receipts-eval/` (outside the repo; the photos hold payment data). The format findings are in `docs/research/receipt-extraction-eval.md`.
- Model choice is in `~/.agents/pstack-models.md` (no fable access; opus by default, sonnet for small fixes). Max 4 agents in parallel.

## Resume log (2026-10-04 12:10 EDT)
- No owner survived the clear. Fresh opus owners restarted on `polish/ui-notes` (3 commits + WIP) and `chore/flaky-tests` (no commits, scratch only) in their existing worktrees.
- An orphaned `wrangler dev` (PID 44719, port 9310) from the dead polish owner is still running. The auto-mode classifier denied killing it. Owners use other ports.
- 12:2x: SPLIT_ID_SECRET confirmed present (`wrangler secret list`). `hardening/ids` rebase onto b3289cd conflicts in `app/s/[id].tsx` (old patch-id ce73bb16). Queued: an opus owner resolves the rebase + folds the ADR 0009 wording fix, then an opus delta audit (security PR), as soon as one of the 4 slots frees.
- 12:5x OPERATOR: finish the in-flight tasks, then PAUSE and trigger nothing new. In flight = flaky-tests (owner), fix/item-detail-field (verifier), polish/ui-notes (verifier), hardening/ids (owner, then delta audit), fix/home-scroll-stuck 4bcaab3 (needs verifier). Each goes verdict -> push -> PR -> merge on green -> deploy confirm. Fix rounds for these count as in flight. NOT to start: pipeline timing run, Gemini compact re-test, any notes.md follow-up. After the last merge, write a pause handoff and stop.
