# SplitWith handoff (2026-10-14)

Repo: `/home/user/receipt-splitter` in cloud sessions. GitHub: https://github.com/JasonZhangggg/receipt-splitter. Production: https://app.splitwith.workers.dev. Every merge to `main` deploys after CI. Confirm the Deploy run for the tip.

The app is called SplitWith (rule 89). Older files say Splitwith. Identifiers, the repo and storage keys keep their old names.

## Read first, in order
1. This file.
2. `preferences.md`. The rules are binding. The newest are 87 (draft PRs), 88, 89 and 90.
3. `notes.md`. Each note names its fixer.
4. `docs/agents/dev-flow.md` and `.claude/memory/orchestrator-store.md`.

The store is `.claude/orchestrate/` in this checkout. Changes persist only when committed. PR evidence, audits and eval data stay on the operator's Mac and are not in git. Older handoffs are in `archive/`. The last Mac-era handoff is `archive/handoff-2026-10-11.md`.

## Current work
The B2 program, `docs/plans/splitwith-b2.md`. The design is in `docs/design/b2/`. The plan lists PRs T1, BUG1, B2-1 to B2-9 and DOCS1. Its boxes are the progress record.

## State of main
- The tip at the time of writing is e363522 (#99, cloud setup). No product change since #98.
- Merged since the Mac handoff was last current: #80 to #85 and #87 to #99 (see `git log --merges --oneline`). #96 renamed the app. #97 added pastel person colors and the donut ring. #98 muted them.
- Open: #100 (the B2 plan and mocks, draft) and #86 (a Dependabot bump of source-map-js, unreviewed).
- The entry bundle limit is in `scripts/size-budget.json`, and the first-load budget is in `e2e/size.spec.ts` (rule 79). Ask the operator before raising it.

## Open questions for the operator
- `src/core/pay-links.test.ts` still uses `venmo.com/jason-z`. The repo is public. Replace the handle if it is a real one.
- The desktop Example link (768 px and wider) still exists. B2 moves the e2e tests off it.
- Real-iPhone checks that no simulator covered are listed in `notes.md`.
- Dependabot's security job for `sharp` fails because the app does not install it. Low priority.

## Working rules that bite
- Owners commit locally and never push (rule 39). The root verifies, pushes and opens PRs as drafts (rule 87). Wait a few seconds after a push before `gh pr ready`, or the ready run can see a draft and skip.
- Never `git stash` (rule 76). Scratch goes in a gitignored `.verify/` (rule 65).
- A clear kills subagents (rule 74, `.claude/memory/clear-kills-agents.md`). Mark such agents "killed by clear" in a handoff.
- Fast review loop (rule 80). Light checks for simple changes (`.claude/memory/light-verification-small-changes.md`). Design iteration uses static mocks (`.claude/memory/design-iteration-mode.md`).
- Merge only after reading the run conclusion `success`. Never chain `gh pr merge` after `gh run view` with `&&`, because the view exits 0 on a failed run.
- Do not rebase a branch onto an older sibling branch. Base on `main` and merge the sibling.
- CI runs on Linux. Real OCR takes about 30 s, so give such tests `test.setTimeout`. Fonts set text a few px wider. Use `toBeCloseTo` for heights.

## History
Splitwith began as a receipt splitter with on-device OCR (ADR 0001) and moved to server reading with Gemini (ADRs 0008 and 0010). V2 (`docs/plans/receipt-splitter-v2.md`) rebuilt the Split page. The clarity, declutter and person-color rounds (#87 to #98) followed. B2 replaces that look with the calm black-and-white design.

## Mac only
- The main checkout was `/Users/jason/Code/receipt-splitter`. The iOS Simulator lessons, zsh refspec quoting, laptop power and worktree housekeeping are in `archive/handoff-2026-10-11.md`.
- Eval data lives in `~/receipts-eval/`. The census tools live in `~/.claude/orchestrate/receipt-splitter/`.
