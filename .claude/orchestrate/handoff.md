# Receipt Splitter: handoff (2026-10-06 evening, written before a context clear)

Repo: `/Users/jason/Code/receipt-splitter`, main checkout on `main`. GitHub: https://github.com/JasonZhangggg/receipt-splitter. Production: https://app.splitwith.workers.dev. Every merge to `main` deploys after CI. Confirm the Deploy run for the tip.

Read first, in order:
1. This file.
2. `preferences.md`, rules 1-78. They are binding. The newest rulings are 72, 75, 76, 77 and 78.
3. `notes.md` (older follow-ups).

The previous handoff, with the full log of 2026-10-05/06, is in `archive/handoff-2026-10-06-pre-clear.md`.

## Update 2026-10-07 (new session)
- #80 merged (a76969c, 03:41 UTC). CI + Deploy for it: check `gh run list --branch main`.
- Worktrees cleaned: 32 removed. 13 with unlanded local commits kept as `backup/agent-*` branches (all appear to be superseded drafts; delete when sure).
- #81 merged (56f9ddd): people chips scroll on one row on the phone and wrap on desktop. Anyone but the Host can be removed by long-press or right-click; removal is one compact `claimParts` write, revertible from History. The first-load budget is now 410 KB (rule 79). Worktree removed.
- #82 merged (6dda54a): an overpaid payer's chip shows "!" (PaidMark short|over), and checking or unchecking an Item for another selected person asks once per selection, closing itself if the person, Item or claim changes.
- #83 merged (cf841eb): the phone chip row clips 4 px outside the 22 px gutter on both sides (ring room), and the Remove menu always opens above its chip (Popover side="above", align="start"). Haiku 5.5 receipt eval done: keep Gemini (~/receipts-eval/haiku-55-eval.md); the same-window Gemini control drifted (98/123, 4 silent), not yet investigated. Rule 80 fast loop and the new pstack model routing are in force.
- #85 merged + deployed (b4f376e): light/dark toggle on home (rule 81), pre-paint head script in public/index.html.
- #84 merged + deployed (7ea37bd): phone chip row clips at the gutter and fades each side up to 20 px only where names are hidden (rule 2).
- The desktop Example link still exists (>=768 px, empty scan); the operator thought it was deleted and was offered its removal. No answer yet. No agents running.
- 2026-10-09: #89 and #90 merged. Open: #87 home, #88 share paid line, #91 header menu + chips + Payments sheet (draft, Sonnet implementer working), #92 CI minutes. Receipt-card cleanup (declutter sheet A) waits for #88; type scale (sheet D) last. PRs are drafts until approved (rule 87).
- Merging: run `gh pr merge N ...` as a standalone command (no `cd`/`&&`), so the allow rule in `.claude/settings.local.json` matches; compound commands go to the auto-mode classifier and get denied.

## State at clear (2026-10-06)
- **No agents running and nothing queued.** The operator asked for no more changes until after the clear.
- **One PR open: #80**, "Stack a Bundle's claimer marks and let a chip tap switch without opening the sheet". Head is 9397869. Auto-merge is armed, pinned to that SHA. After the clear, confirm it merged and deployed. If CI failed, read the log and fix only what failed. The operator approved this change.
- **Merged and deployed in this session (#63-#79):**
  - Gemini 3.8 Flash reviewer.
  - Share-breakdown fold.
  - Reading-stage line.
  - OCR long/rotated receipts with a 5 s budget.
  - Sheet overstretch cover.
  - Adjustments scroll with Items.
  - Editing adjustments (with a `totalFollows` core op).
  - Focus return on keyboard/AT close.
  - Item price caret fix.
  - Deleted-row collapse.
  - Pay pill with picker, then method-only (app mark + name, chevron end opens a native select; Zelle copies the handle).
  - Unclaimed count on the total line, plus the empty-breakdown row "Check off what you had.".
  - Items counted one per row; Bundles show "N claimed".
  - Deflaked e2e tests.
  - Long names ellipsize in chips (160 px cap).
  - Paid marks on chips: ✓ paid, bare "!" short.

## Open follow-ups (do only when the operator asks)
- **Real long receipt:** the operator could AirDrop a real long receipt photo at full resolution, to time OCR and the 5 s cap on their phone. Their r1-r9 photos are pre-downscaled.
- **Rotated photos:** send Gemini an upright crop for rotated photos. Silent errors moved receipts in the rotated eval.
- **Parser:** PLU-prefixed lines fold into the Item above (r3-270).
- **iOS By amount:** with the keyboard up in the Item sheet's By amount fields, iOS pans Close off-screen. This is design A behavior.
- **Undo during collapse:** an undo inside a deleted row's 150 ms collapse jumps from partial height. Deleting the only row drops the "Add item" hairline early.
- **Edge cases accepted:**
  - A photo just over 2:1 tall with sideways text isn't turned.
  - An upright receipt on a canvas wider than 3:1 is always turned.

## Lessons (also encoded in rules and READMEs)
- **Rule 74: a clear kills subagents.** Never write "in flight" for an agent that a clear will kill.
- **Rule 73: one heavy job at a time.** The iPhone Simulator is shared and counts as a heavy job.
- **Rule 76: never `git stash`.** It collided across worktrees on 2026-10-06.
- **Simulator gestures:** the tool ignores `dt_ms` on a path's first point. Send the tap and the gesture as separate calls with a real `sleep` (see `tools/flash/sim/census/tool/README.md`).
- **CI vs macOS (Linux runners):**
  - Real OCR takes about 30 s, so give such tests `test.setTimeout`.
  - Fonts set text a few px wider.
  - Heights can be 53.9999: use `toBeCloseTo`.
- **Pushing in zsh:** quote refspecs, `git push origin "${H}:refs/heads/<branch>"`. An unquoted `$H:r` is a zsh modifier.
- **Auto-merge:**
  - Arm it with `gh pr merge N --auto --merge --match-head-commit <full sha>`. The operator allowed `gh pr merge` in `.claude/settings.local.json`.
  - After pushing a new head, wait a few seconds before re-arming.
  - When the operator is still deciding on a design, run `gh pr merge N --disable-auto` first.
- **Rebasing:** don't rebase a branch onto an older sibling branch, because it replays merged commits. Base on main and merge the sibling instead.
- **Laptop power:** the laptop died on battery at 01:53 on 2026-10-06. Ask the operator to keep it on AC while agents run, and discard any results that span a hibernate.

## Housekeeping
- About 33 worktrees under `.claude/worktrees/` (merged branches). 44 GB free.
- All of them can be removed once #80 merges: `git worktree list`, then `git worktree remove` each merged one and `git worktree prune`. Check `git status` in each first.

## 2026-10-10 update
- Merged and deployed: #88, #91 (⋯ menu, Payments sheet, person icon), #93 (.env guard), #94 (declutter sheet A), #95 (sheet D type scale + gray). All approved declutter work is done.
- Repo is now PUBLIC (operator). History scan: no real secrets. Open question to operator: replace `venmo.com/jason-z` in src/core/pay-links.test.ts if it's their real handle. Suggested: protect main; require approval for outside-contributor workflow runs.
- #86 (dependabot source-map-js) open, unreviewed. Dependabot security job for `sharp` fails (not installed in app); low priority.
- Lesson: wait after pushing before `gh pr ready`, or the ready_for_review run sees draft=true and skips; fix by toggling draft off/on.
- Leftover worktree agent-a6a61b42d97a6f3fd (main, untracked ui-proposals) left in place; worktree-agent-* local branches left.
- 2026-10-10: #96 merged + deployed (d8e0867): Splitwith rename, + box restored with more field padding, PayPal hint "username" (+ paypal.me prefix stripped), "*optional" caption under payment field (10px gap; 4px broke fit checks), hamburger Menu top-right on Split (Payments, Receipt photo, History, Dark/Light) and home (History, Dark/Light). Operator said no approval needed for that merge.
- Guard: never chain `gh pr merge` after `gh run view` with && — view exits 0 on failure and main has no required checks. Merge only after reading conclusion=success.

## 2026-10-11
- #97 merged (bb55153) and deployed; prod title is "SplitWith". It covers: P4 pastel person colors (dark mode is pastel too, with dark text via onPastel), the selected chip ring (outer ring with a gap), Payments donut tap-to-select, list-only scroll, the entry sweep, a pie menu icon, the viewer's initial in the claimer marks, and Share on home. Size limit is 301,928.
- Review PASS+NOTES; the notes are in notes.md under "From PR #97".
- Lesson: #97 nearly merged without the rule-80b review. Always run the independent review for non-small PRs.
- Still open with the operator: split the grouped field cards into separate pills, the pstack-in-cloud setup, the Venmo handle in tests, Dependabot #86.
