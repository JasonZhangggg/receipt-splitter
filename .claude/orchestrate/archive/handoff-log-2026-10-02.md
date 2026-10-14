# Receipt Splitter v1: handoff (2026-10-01, 19:40)

## How to resume

1. Run `/poteto-mode run docs/plans/receipt-splitter-v1.md`.
2. Read, in order:
   - this file;
   - `preferences.md`, which holds the standing objective (amended), every operator ruling, the verification budget, the context budget and the merge rules;
   - `notes.md`, the parked notes with their fixers;
   - the trail `docs/plans/receipt-splitter-v1.trail.tsv` in the main checkout. It is untracked, has about 305 rows, and gets committed with the last cleanup PR.
3. The playbook is `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`. The skills repo is `~/Code/agent-skills`, pushed to github.com/JasonZhangggg/agent-skills.
4. Re-arm the audit tick as a `/loop`, dynamic, about 30 min, if it is not running. Use `/status` (`~/.claude/skills/status`) for agent tokens and progress.

## State

**All features are merged.** main is at `6baf220`.

| PR | What | Merged as |
|---|---|---|
| RS-1 to RS-5, RS-8 | skeleton, Split model, bench, on-device OCR, parser, live server | earlier |
| RS-6 + RS-7 (PR 12) | home redesign; scan and fix the receipt | 7c5bdcb |
| RS-9 (PR 13) | create a Split and join by link | 538ccc0 |
| Plan PR 14 | split-page redesign amendment, design in `docs/design/split/` | a4825e9 |
| RS-10 (PR 15) | round 8 split page: picks, claims, per-unit quantity, split modes, History, restore | 5ba0cd1 |
| RS-11 (PR 16) | pay links (Venmo, Cash App, PayPal, Zelle copy), payer-only Payments | 6baf220 |

**What remains.**

1. **Close the program: the cleanup PRs.** Triage is done. Its output is in `/tmp/cleanup/` (security S1-S10, tests T1-T25, docs D1-D9, needs-operator O1-O12, closed). Three owners were dispatched at 19:55 from main 6baf220, each committing locally on its own branch:
   - `cleanup/security` (opus). Defaults: O1 `ALLOWED_HOSTNAMES`, O2 no change, O3 keep v1. PR body at `/tmp/cleanup/security-pr.md`, handoff at `security-handoff.md`.
   - `cleanup/tests` (sonnet). T11 parked. It avoids the security files. Body at `tests-pr.md`.
   - `cleanup/docs` (sonnet). Defaults: O4 define "creator secret", O11 by design. Body at `docs-pr.md`.
   **2026-10-01 later.** The session restarted and all three owners died with nothing committed. Tests and docs were re-dispatched (sonnet) into their old worktrees (agent-a561f24b8fd9612de, agent-a0dcbde77934057f9) to finish the uncommitted work. Security is held. "That's me" (pick with takeOver, `src/core/operations.ts:226-232`) lets any device take any name with no check, so the hash fix alone does not stop forged Payments. The operator was asked how "That's me" should be gated. The operator answered that open takeover is expected between friends (see preferences.md, Trust model ruling). S1 is dropped. Security was re-dispatched (opus) for S2-S10 in worktree agent-a9dfbb4cdee306bf0.
   Docs: audit PASS+NOTES at 3e3db1f, 7 notes fixed in bacc92d (root-reviewed), MERGED as PR 17, main 7461900.
   CD: the operator asked for continuous deploys. A sonnet owner is building `.github/workflows/deploy.yml` (workflow_run after CI succeeds on a main push, skipped until the repo var EXPO_PUBLIC_TURNSTILE_SITE_KEY is set) plus `docs/deploy.md` on branch cd/deploy. Root-reviewed at eee58a1 (stale-tip skip, both vars gate, wrangler-action v4), MERGED as PR 18, main c45ca37. After security merges, update docs/deploy.md with the ALLOWED_HOSTNAMES format.
   Security: STACK-READY at e867a55 (13 commits, S2-S10 done, 25 mutants killed). Gates+live lane (sonnet) and opus audit running; outputs /tmp/cleanup/sec-gates/, /tmp/cleanup/sec-audit.md. Fold into the fix round: uncaught openURL fallback rejection (button.tsx), worker-test 60-day alarms that fall due ~2026-11-30. ALLOWED_HOSTNAMES format is comma-separated hostnames (worker/create.ts:80). Show the operator before merging.
   Security verdict at e867a55: FAIL. Gates and live passed; the opus audit (/tmp/cleanup/sec-audit.md) found F1 (name key misses Cf and default-ignorable characters), F2 (test clock time bomb), F3 (a deploy with ALLOWED_HOSTNAMES unset counts as local). The owner was resumed with F1-F4, F6 (document only), F7 and the silent draft-repeat copy. F5 and the Referrer scope were accepted. Round 2 is at 6232eca (6 commits; gates 542 unit, 62 worker, 105 e2e). The owner is at 334k, so after that the rebase onto PR 19 and any fix round go to a fresh fixer. Opus delta audit running at 6232eca, writing /tmp/cleanup/sec-audit2.md. A fresh sonnet fixer is rebasing onto daa5f98 (conflicts in ADR 0004 and vitest.config.ts to .mts) and running full gates into /tmp/cleanup/sec-rebase/. Delta audit PASS+NOTES. Rebased to a37d3f0 with gates green, and pushed as PR 21 (https://github.com/JasonZhangggg/receipt-splitter/pull/21). MERGED as PR 21 after the operator approved. The N1-N5 notes are in notes.md and go to the follow-up. Follow-up PR (T7, T8, T14, T17, T20 + N1-N5) dispatched to an opus owner on branch cleanup/follow-up from 96c81aa; body /tmp/cleanup/followup-pr.md. It is the last cleanup PR: commit the trail TSV with it, then send the final report. Also: the Worker rename to `app` (production app.splitwith.workers.dev) is being built by a sonnet owner on branch deploy/worker-name, with its body at /tmp/cleanup/name-pr.md. MERGED as PR 20 (8e05692). The first deploy succeeded (run 36947792977), and https://app.splitwith.workers.dev serves 200. The operator set all 4 GitHub settings. The operator still needs to run `npx wrangler secret put TURNSTILE_SECRET_KEY --name app`.
   Tests: STACK-READY at 72e3232 (15 commits; parked T7, T8, T14, T17, T20 for the security files, T11 UI). Owner at 285k, so fix rounds go to a fresh sonnet fixer. Verdict at 72e3232: FAIL (/tmp/cleanup/tests-audit.md). The scan.spec settle-catch test flakes 5 of 30 after the T4 change. A fresh sonnet fixer in the owner's worktree is fixing it plus the ci.yml concurrency group, join.spec per-test IPs and the shares.bench headroom. T20 is orphaned and moves to the follow-up. The fixer got ddabbc1 (root-reviewed), rebased it onto c45ca37 as 591eff3 (same patch-id outside the features/README.md conflict, which now matches main), and the root pushed it as PR 19 (https://github.com/JasonZhangggg/receipt-splitter/pull/19). MERGED as PR 19, main daa5f98. Tests and security share 6 files (ci.yml, package.json, vitest.config.ts, verify.mjs, operations.test.ts, parse.test.ts). The second to merge gets rebased and its gates rerun. After both merge, a small follow-up takes the parked T7, T8, T14, T17 and T20.
   **PROD INCIDENT.** Creating a bill fails on production: real-key Turnstile can't render under COEP require-corp. The operator chose to remove Turnstile. An opus owner is on branch remove-turnstile (global daily create cap, deploy.yml gates removed, docs updated); body /tmp/cleanup/noturnstile-pr.md. Top priority: verify (gates, live create, sonnet audit), push, merge, and check the deploy. The follow-up owner was told to drop N2, N5 and T17 and to avoid the Turnstile files; rebase it after.
   Follow-up: being rebased onto 9a074b8 by a fresh sonnet fixer (gates to /tmp/cleanup/fu-rebase/); earlier STACK-READY at 5acf48d (T7, T8, T20, N1, N3, N4; T14 declined with a reason; T17 parked as a patch). Sonnet verifier writes /tmp/cleanup/fu-audit.md. It merges AFTER remove-turnstile, rebased.
   **Operator redesign requests**: /tmp/redesign/tasks.md (R1-R3 need a design choice; B1-B5 build directly). The design boards agent serves /tmp/redesign/boards on :8982; capture to Figma rUCjp4g9qO5erLgaXSe5pO for the operator to pick. The parser agent is on branch fix/discount-total (B5), body /tmp/redesign/parse-pr.md. B1-B4 get one UI owner after remove-turnstile and the follow-up merge (they share app/index.tsx).
   Parser B5: STACK-READY at dc575f7 on fix/discount-total (cause: 'Discount Total' summary line read as a third discount; quantity 'Nx' parsed; draft.ts carries quantity). The fixture was checked clean of payment lines. A sonnet verifier (load-gated) writes /tmp/redesign/parse-audit.md. Bundle proposal: optional `items?: NonEmpty<ItemId>` on Adjustment.
   Load rule: at most 2 agents running full test suites at once (load hit 28 on 10 cores and caused false timeouts).
   Follow-up at f3a2b5c (N1 regression fixed); worker gate pending, rerun after the rebase.
   Figma redesign boards are captured: receipt node 29-2, web home 30-2, names 31-2. WAITING on the operator's picks. Then write a plan amendment, then the build PRs.
   Remove-turnstile: STACK-READY at f1ba1fc (cap 1500/UTC day, 12 writes per create measured). Opus verifier writes /tmp/cleanup/nt-audit.md; the key question is whether the cap is incremented by per-IP-refused requests. Verdict PASS+NOTES; pushed as PR 23 (https://github.com/JasonZhangggg/receipt-splitter/pull/23). CI failed: the 1500-create cap tests time out at 60 s on the ubuntu runner. A fresh sonnet fixer in the owner's worktree is seeding the count, plus adding the ordering probe. The fixer seeded the counts at 3610121. The root rebased onto main after PR 24 (patch-id unchanged) to d68e334 and pushed it. MERGED as PR 23 (9a074b8). Watching the deploy, then a live create on prod. The follow-up notes are in notes.md.
   Parser B5: MERGED as PR 22 (6fdcde7).
   CI flake: the shares.bench 0.1 ms bound failed on the ubuntu runner (0.112). PR 22 was rerun. Fixer done: bd92093, a claim/JSON.stringify ratio with k=13, measured 4.0, mutant 18. MERGED as PR 24. On ubuntu the ratio was 4.2 (claim 0.112 ms).
   Round 3 board captured to Figma node 50-2, WAITING on operator approval. Follow-up PR 25 MERGED (df790d5), including the trail. Production fix verified live: a create on app.splitwith.workers.dev reached /s/<id>. Photo ruling: everyone views it, stored with the Split (DO storage, not R2). Agents run at medium effort.
   v2: plan MERGED as PR 26 (docs/plans/receipt-splitter-v2.md, 7 PR sections: V2-1, V2-2, V2-3, V2-4, V2-5, V2-6a, V2-6b). The daily cap becomes floor(25000/writes), 1470 at 17. V2-1 STACK-READY at 5438361 (owner at 324k, so fix rounds go to a fresh fixer). Deviation: storedVersion() writes 2 only when a Bundle exists; amend the plan text. Both lanes PASS+NOTES. A fresh opus fixer in the owner's worktree is fixing N1 (restoreReceipt kind change locks out a Split), the seed docs and the plan text, then rebasing. Output in /tmp/v2/v2-1/fix/. Order: V2-1, V2-2, V2-3, V2-4; V2-5 after the bug-fix PR; V2-6 photo.
   Bug-fix MERGED as PR 27 (pay note, flash, copy/share; verifier PASS+NOTES). V2-3 and V2-5 are unblocked. Mismatch: the operator said yes and the root committed c0b20d1. Verifier PASS+NOTES. PR 28 MERGED (1440d94) after a flake fix: the test now waits for the pick sheet to hide (a stale Copy on the exiting sheet). V2-1 MERGED as PR 29. V2-2: PR 30 (https://github.com/JasonZhangggg/receipt-splitter/pull/30) at d1d1cc8, percent-run rule, 6/6 mutants killed. MERGED. Opus verifier writes /tmp/v2/v2-2/verify/report.md (full e2e, a false-positive diff over 82 receipts, rollback). Root todo: repin golden v2-2 to the rebased SHA. Note for V2-3: Priya's breakdown shows the other Bundle's discount as $0.00. /tmp/v2/v2-2/live/ holds real-photo OCR, never share it. V2-5 STACK-READY at bca5cbf (owner 367k, so fix rounds go to a fresh fixer). Verifier PASS+NOTES, but it found WEAKENED tests (the deleted scan.spec Example-fixing block). A fresh opus fixer in the owner's worktree is restoring them plus the parseScan legacy fixOnHome, the listener cleanup, the PR body and a rebase. Output in /tmp/v2/v2-5/fix/. 5 interpretation calls went to the operator (file-name title, fixOnHome editor fallback, hero text dropped, in-memory photo, fixture). review-animations is for the operator. Then V2-5 can start. @jason-z is not real.
   V2-3 opus owner on v2-3-split-phone (output /tmp/v2/v2-3/), includes the exiting-sheet taps, blurOnSubmit inputs and the breakdown $0.00. V2-6a opus owner on v2-6a-photo-worker (output /tmp/v2/v2-6a/). V2-5 MERGED as PR 31 (f5e5b8e); the operator confirmed layout A. V2-3 MERGED as PR 33 (2da1e47). Still pending: drop '1 of 3' in breakdowns? V2-6a STACK-READY at 01a36b8 (cap 1136, 2 PUTs max, APP1 refused). Verifier PASS+NOTES (report saved at /tmp/v2/v2-6a/verify/report.md). MERGED as PR 32 (cap 1000/day). Then V2-4, then V2-6b.
   Sheet fix: STACK-READY at 0e7c8d1 (owner 352k, so fix rounds go to a fresh fixer); the sheet was replaced with a CSS-transition BottomSheet; the RNW inline keyframes bug was fixed; the Host can no longer edit handles after create (asked the operator). Restart 2026-10-02: the verifier and round-2 agents died. 848d3b8 (no yellow) and 326de3b (no row tag) are committed. An opus agent is on the motion suite (/tmp/v2/sheet/round2/). The creator handle edit is DROPPED (operator). Then a full verify on the final head, push, merge. Was: an opus owner on fix/sheet-ios (premise check of SpringSheet, iPhone WebKit repro, one-line link row, Home button, fresh home after create). Output /tmp/v2/sheet/. Then V2-4 (desktop) builds on it.
   Queued: a hardening PR (Turnstile-removal notes, T17 patch, Dependabot triage), and the redesign build after the round-2 pick (plan amendment first).
   On each STACK-READY: verify (gates, a live check where relevant, an audit; security gets an opus audit), push, open a PR against main, and merge after green CI. Show the operator the security PR before merging it. Commit the trail TSV with the last one. The O1-O12 questions went to the operator; their defaults are in `needs-operator.md`.
2. **Must fix before launch (security cleanup).**
   - Turnstile production key guard and the siteverify hostname check (N6 from RS-9).
   - Unicode name normalization.
   - The legacy-pick payer copy.
   - The sw.js kill switch.
3. **Final report to the operator.** Give links to the stack, a one-line verdict for each PR, and the parked items with reasons.
4. **Operator's own steps, outside the program.**
   - Test on a real iPhone: scanning, HEIC photos, memory over 20 scans, the WebKit paint observer.
   - Set the production Turnstile site key and secret.
   - Deploy. Production deploy is out of the plan's scope.

## Rules in force (details in preferences.md)

**Push and merge.**
- Owners commit locally and never push.
- The root pushes a verified SHA once and opens the PR.
- The root merges with a merge commit and `--match-head-commit`, after a clean verdict and green CI.
- RS-6, RS-7, RS-10 and RS-11 needed the operator's review. Today the operator said "merge them both in". Tests are never weakened to get CI green.

**Verification budget.**
- About 30 minutes of test runs per PR.
- Logic-only mutants run against unit and worker tests, at most about 15.
- No tests that pin style values.
- One live pass plus screenshots.
- Perf is size plus LCP over 3 interleaved loads.
- A fix round is checked by the root, or by a small fresh fixer.

**Context budget.**
- PRs are sized under about 300k tokens.
- Long output goes to files.
- Helpers do the heavy checks.
- Past about 400k, write a handoff and continue with a fresh agent.
- Small fix rounds go to fresh, cheaper agents.

**CI robustness.**
- No action before hydration, and no assertion on a value already on screen.
- Specs that don't scan block the OCR models (`e2e/without-ocr.ts`).
- New e2e runs under a 4x CDP CPU throttle three times. A wrapper is at `/tmp/swarm-RS-10/v1/gates/wrapper/`.

**UI work.** Load emil-design-eng, apple-design and mobile-native first, and log the load. Use animate for motion. Run review-animations by hand and unslop.

**Shell.** Never `cd ...;`. Use `git -C` or `&&`. The root never edits product code itself.

## Machine

- 55 GB free.
- The mockup servers are stopped.
- Worktrees left:
  - the main checkout, on `plan/receipt-splitter-v1` (the operator restored it);
  - the triage agent's;
  - `agent-a5f24f006107ab7bb` (rs-7-scan). It is locked by a claude pid; remove it with `git worktree unlock` once it is stale.
- The Figma file is rUCjp4g9qO5erLgaXSe5pO: home round 6 is node 10-2, split round 7 is 14-2, split round 8 is 17-2.
