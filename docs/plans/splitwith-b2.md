# SplitWith B2 plan

B2 rebuilds the Split page and home in the calm black-and-white design the operator settled on 2026-10-14 (`docs/design/b2/`). Every feature the app has today survives. Only its place and look change. The program also drops dead and style-pinned tests, fixes the pick sheet that keeps coming back, and brings the docs up to date. PRs in order are T1, BUG1, B2-1 to B2-9, DOCS1.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md` with the repo's process rules on top (`.claude/orchestrate/preferences.md` rules 39, 40, 41, 42, 47, 80 and 87). Owners commit locally. The root verifies, pushes, and opens each PR as a draft (rule 87). The operator reviews the screenshots and video of every UI PR in chat. On the operator's approval the root runs `gh pr ready`, then merges bottom-up on green CI (rule 40). T1, BUG1 and DOCS1 change no interaction. Every B2 PR is review-gated.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Intent

**Problem.** The Split page grew busy. A sideways row of people chips, a menu button, a folding breakdown, claimer marks and gray cards compete for attention, and the operator said it should feel cleaner and less busy. Home has the same weight. Some tests pin colors and pixel sizes (rule 43) or drive a desktop-only Example link from a phone-width browser, so they fail for the wrong reasons. Several docs describe a Mac checkout and PRs that merged weeks ago. People also report that "Which one are you?" keeps coming back after they picked, most likely when several people use a Split at once.

**Solution.** Build B2. One list that reads like a receipt, sheets for Receipt, People, Payments and History behind underlined links, a fixed footer with your share and a Pay pill, an Edit item sheet with a trash icon and an undo bar, animated icons, a theme toggle that spreads from the button, red only for problems and green only for Paid. Rebuild home as the B2 start page. Remove the style pins and dead scripts, move the e2e tests off the Example link, fix the pick bug at its root, and refresh the docs.

**User stories.**

1. As a friend opening a Split link, I want one quiet list with a dot per Item, so that I can tick what I had without reading a dashboard.
2. As a friend, I want to see the list from someone else's side, so that I can tick Items for a friend whose phone is dead.
3. As the Host, I want to edit, add or delete an Item and undo it right away, so that a misread receipt is easy to fix.
4. As anyone in the Split, I want a Payments ring and a History list a tap away, so that I can see who paid and undo a mistake.
5. As the Host on home, I want one big photo button, the payment handle and the names, so that I can make the link in a few taps.
6. As someone who already picked a name, I want the app to remember me, so that "Which one are you?" never asks twice.
7. As the next engineer, I want tests that fail only for real defects and docs that match the code, so that I can trust both.

**Out of scope.** Native iOS and Android sheets (`@expo/ui` BottomSheet stays a later spike, decision 24 in `docs/design/b2/README.md`). New money logic. Account mode. Any change to receipt reading except the optional merchant name in B2-9.

**Decisions.** The B2 decisions in `docs/design/b2/README.md` (1 to 25) are binding. The defaults in Appendix B fill the gaps the mock leaves. Domain terms follow `CONTEXT.md` (Split, Host, Item, Bundle, Claim, Share, Adjustment, Payment). ADRs 0004 (one Durable Object per Split), 0009 (signed Split ids and per-Split device ids) and 0003 (equal access) apply unchanged.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go. The operator's request "work on building and testing these changes" is that go for this program.
- [ ] On the operator's go, write this exact text into the standing objective and restate it in your todolist. "Run docs/plans/splitwith-b2.md. PRs T1, BUG1, B2-1 to B2-9, DOCS1 in the dependency order of Spawn owners. A PR is verified only when its unit, live and perf boxes are checked. Owners commit, the root verifies, pushes drafts, and merges bottom-up after the operator approves. Done when every PR is merged and deployed or parked with a reason."
- [ ] Read these at program start. Re-read them at every tick.
  - [ ] `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `~/.claude/skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify-receipt-splitter/SKILL.md`
  - [ ] `~/.claude/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `~/.claude/skills/emil-design-eng/SKILL.md`, `~/.claude/skills/apple-design/SKILL.md`, `~/.claude/skills/mobile-native/SKILL.md`, `~/.claude/skills/animate/SKILL.md`, `~/.claude/skills/review-animations/SKILL.md` and `~/.claude/skills/unslop/SKILL.md` (CLAUDE.md, rule 14)
  - [ ] Emil Kowalski's skills, read in full by every B2 owner and every B2 design reviewer (operator, 2026-10-14). `~/.claude/skills/emil-design-eng/SKILL.md`, `~/.claude/skills/review-animations/SKILL.md`, `~/.claude/skills/improve-animations/SKILL.md`, `~/.claude/skills/animation-vocabulary/SKILL.md`, `~/.claude/skills/find-animation-opportunities/SKILL.md`, and `~/.claude/skills/ask-sonner/SKILL.md` for the undo bars.
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Post to the operator only when something big changed since the last post, meaning a merge, a deploy, a FAIL verdict, a new operator gate, or a blocker. Otherwise stay quiet and log the tick in the trail. The full status (queue table of PR, owner, state, and head SHA, verdicts, merges, open gates, open notes and their fixers, blockers) is for when the operator runs `/status`."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once. The status message for a hold names each owner and its last local SHA.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner is a background `poteto-agent` with `isolation: "worktree"`, model `sonnet`, with a short-lived `opus` advisor before a data shape, architecture or money-logic choice (rule 47). At most `max parallel` (4) owners and app instances run at once. Queue the rest.
- [ ] Follow this dependency graph.
  - [ ] T1, BUG1 and DOCS1 are independent and branch from `main`.
  - [ ] B2-1 branches from `main`. B2-2 after B2-1. B2-3 after B2-2. B2-4 after B2-3.
  - [ ] B2-5, B2-6, B2-7 and B2-8 build in parallel on B2-4. The root appends them in that order and rebases each onto its parent.
  - [ ] B2-9 (home) builds on B2-2 in parallel with B2-3 to B2-8 and appends after B2-8.
- [ ] Hold the file boundaries. T1 touches only `e2e/`, `src/**/*.test.ts`, `src/ui/pay/` (one data attribute) and `.claude/skills/verify-receipt-splitter/`. BUG1 touches only the files its root cause names. DOCS1 touches only `*.md` and `.claude/orchestrate/`. B2-9 touches only home files (`app/index.tsx`, `src/ui/receipt-input/`, `src/ui/home-copy.ts`, `src/ui/recent-splits.tsx`, `src/ui/components/{payment-row,app-picker,name-chips,sheet}*`).
- [ ] Hold the review gate. B2-1 to B2-9 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. This cloud session has no `gh` or `origin` CLI, so the root uses the GitHub MCP tools (`mcp__github__create_pull_request`, `update_pull_request`, `pull_request_read`, `merge_pull_request`). Record that fallback. Never require `gt`.
- [ ] Open each PR as a draft against its parent branch (rule 87 wins over the playbook's "open ready"). Mark it ready only after the operator approves. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Write tests through `/tdd` at the PR's **Seams**.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Run `/spec-review` against this plan's PR section before the code-ready report. Fix every Spec finding.
- [ ] Triage every Bugbot and security-reviewer comment per `~/.claude/skills/poteto-mode/references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.
- [ ] Before the code-ready report the owner states how each item of rule 80a's recurring-failure list applies, with a test for each that does.
- [ ] Every B2 PR runs an Emil design pass before its code-ready report. The owner applies `emil-design-eng`, `review-animations` and `improve-animations` to its diff and lists each finding with the change made or the reason not. The verdict swarm adds one design lane on `opus` that reads the same skills and the screenshots, and returns findings under rule 41.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `~/.claude/skills/swarm/SKILL.md`. One gates lane. The live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body. Small changes skip the audit lane (rule 80e).
- [ ] Lanes return `PASS`, `PASS+NOTES`, or `FAIL` under rule 41. `FAIL` is a reproduced user-visible defect, wrong money or data, a broken numbered rule, or new code without a test that fails for it. Clean when no lane fails. `FAIL` findings go back to the owner. Fix rounds stop at two (rule 80d).
- [ ] Each note names its fixer, the next PR touching those files or DOCS1, and goes in `.claude/orchestrate/notes.md`. A PR sent back fixes its own notes too.
- [ ] The first verdict runs every lane. A fix round reruns gates, an audit of the new commits, and the lanes whose surface changed.
- [ ] A clean verdict appends the PR to the stack. After the operator approves, the root marks it ready, waits for green CI, and merges with a merge commit pinned to the head SHA (rule 39). A rebase that keeps the `git patch-id` keeps the verdict per `~/.claude/skills/poteto-mode/playbooks/shipping.md`. A changed patch-id goes back through the swarm.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head, with its own app instance and port per `verify-receipt-splitter`. Drive only through `verify-receipt-splitter`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run `npm ci` if `node_modules` is missing, then start the app and the worker with the skill's `verify.mjs` on a free port. Wait for its ready line.
- [ ] Seed Splits with the skill's `seed.mjs` or its API recipe, and drive the page with its Playwright helpers. Read the worker log and the browser console as read-only diagnostics.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Drop dead and style-pinned tests (T1)

**Depends on.** None.

**Files.**

- [ ] Edit `e2e/home.spec.ts`, `e2e/theme.spec.ts`, `e2e/pay.spec.ts`, `e2e/press.spec.ts`, `e2e/files.ts` and the specs that call `openExample`.
- [ ] Edit `src/ui/pay/donut-model.test.ts`, `src/ui/colors.test.ts`, `src/ui/home-copy.test.ts`.
- [ ] Edit `.claude/skills/verify-receipt-splitter/split-flow.mjs`, `SKILL.md`, `features/join.md`, `features/claim.md`.
- [ ] Delete `.claude/skills/verify-receipt-splitter/reading-shots.mjs`.

**Build.**

- [ ] Rewrite or delete each style pin the census found (home.spec 107, 391, 488, the box-shadow test near 530, 685, theme.spec 38 and 83, the pay.spec arc width, donut-model 120, colors 114, press.spec 102).
- [ ] Delete the hollow `readingStage` copy test and the duplicate "Example lines up with the wordmark" test.
- [ ] Replace every `openExample` call with an API seed helper, so no e2e test depends on the Example link.
- [ ] Rewrite `split-flow.mjs` to seed through the API and fix the Example steps in the feature map.

**You see.**

- [ ] `grep -rn openExample e2e/` prints only the helper's own definition or nothing.

**Seams.**

- [ ] The e2e page objects and the existing unit test files. No new seam.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `npx vitest run` passes with the rewritten donut, colors and home-copy tests.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run every touched e2e spec on Chromium and WebKit at trunk and head. Save `t1-specs.png` of the run summary. Pass when head passes every spec trunk passes and runs no fewer behavioral assertions.
- [ ] Lane 2. Run the rewritten `split-flow.mjs` with four browsers at 390 px (`features/claim.md`). Save `t1-split-flow.png`. Pass when all four clients claim and see each other's claims.

**Feature map.**

- [ ] Update `features/join.md` and `features/claim.md` to seed through the API.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of the touched e2e specs on Chromium.
- [ ] Probe. `npx playwright test <touched specs> --project=chromium`, at trunk then head, twice each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head may not be more than 10% slower than trunk.

**Review gate.** None. T1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root marks it ready, waits for green CI and merges.

## Keep a device's pick across sessions and concurrent edits (BUG1)

**Depends on.** None.

**Files.**

- [ ] Edit the files the confirmed mechanism names (pick storage, the pick sheet trigger or the Durable Object's name holding). Recorded in the trail before the fix starts.

**Build.**

- [ ] Fix the root cause the bug-fix investigation confirms with runtime evidence. No guard that only hides the sheet.

**You see.**

- [ ] The repro script in the trail prints FAIL at trunk and PASS at head.

**Seams.**

- [ ] The test layer the investigation names (unit for a pure reducer, worker test for the Durable Object, e2e with two browsers for the page). The failing test lands in its own commit before the fix (rule bug-fix step 5).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The new failing-first test is red at its own commit and green at the fix. Run `npx vitest run` and the worker tests.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the investigation's repro script with several clients at trunk and head (`features/join.md`, `features/live.md`). Save `bug1-repro.png`. Pass when trunk shows the pick sheet again and head does not.
- [ ] Lane 2. Two devices pick two names at nearly the same moment. Save `bug1-race.png`. Pass when each device keeps its own name after a reload.
- [ ] Lane 3. A device picks, the socket drops and reconnects. Save `bug1-reconnect.png`. Pass when no pick sheet shows.
- [ ] Lane 4. Device B takes over device A's name with "That's me" (rule 1). Save `bug1-takeover.png`. Pass when A is asked to pick again and B is not, which is the intended behavior.

**Feature map.**

- [ ] Add the repro scenario to `features/join.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First-load transfer and the entry chunk size.
- [ ] Probe. `e2e/size.spec.ts` and `scripts/size.mjs`, at trunk and head.
- [ ] Baseline. Record the trunk bytes first. They are deterministic at one trunk SHA.
- [ ] Rule. Head stays within the rule 79 budgets and grows by no more than 1 KB.

**Review gate.** None. BUG1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root marks it ready, waits for green CI and merges.

## Adopt the B2 tokens, Geist and the theme reveal (B2-1)

**Depends on.** None.

**Files.**

- [ ] Edit `.claude/orchestrate/preferences.md`. Edit in place, with the date, every rule B2 supersedes (2, 16, 20, 21, 26, 27, 28, 31, 33, 37, 66, 67, 72, 75 pay row, 78, 82d, 82e, 84a, 84b, 84e, 85, 86, 88) and add rule 91 pointing to `docs/design/b2/README.md`. Keep rules 3 and 29 (Appendix B).
- [ ] Edit `src/ui/colors.ts`, `src/ui/theme.ts`, `src/ui/document.ts`, `src/ui/use-appearance-flip.ts`, `public/index.html`.
- [ ] Create the self-hosted Geist 400 and 500 files under `public/fonts/` and regenerate `src/ui/fonts.generated.ts` with the repo's font generator.

**Build.**

- [ ] Replace the light and dark color tokens with the B2 set (bg, fg, muted, faint, line, underline, warn red, ok green) in `colors.ts`.
- [ ] Switch `theme.ts` `type` to Geist 400 and 500 at the B2 sizes, `layout.gutter` to 24, and add `motion.easeDrawer` `cubic-bezier(.32,.72,0,1)`.
- [ ] Make `use-appearance-flip.ts` reveal the new theme as a circle from the toggle's center over 600 ms, with `document.ts` turning off the default cross-fade. Instant under reduced motion and without the View Transitions API.

**You see.**

- [ ] Home and the Split page render in Geist with the B2 grays. A toggle in the existing menu spreads the new theme from the menu row.

**Seams.**

- [ ] `src/ui/theme.ts` `useColors` and `setAppearance`, through `e2e/theme.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/theme.spec.ts` gains "a flip under reduced motion swaps the theme in one frame". `src/ui/fonts.test.ts` passes with the regenerated fonts. Run `npx vitest run` and the spec on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open home and a seeded Split at 390 px in light and dark at trunk and head (`features/home.md`, `features/receipt.md`). Save `b2-1-home.png` and `b2-1-split.png`. Pass when head shows Geist and the B2 tokens with no layout overflow and no wrong-theme frame on load (rule 81).
- [ ] Lane 2. Flip the theme with a mouse and record frames (`features/motion.md`, `motion.mjs`). Save `b2-1-reveal.png`. Pass when the circle grows from the toggle and no frame shows a half-themed page (rule 18).

**Feature map.**

- [ ] Update `features/motion.md` with the reveal.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First-load transfer in `e2e/size.spec.ts` and the entry size in `scripts/size.mjs`.
- [ ] Probe. Both scripts at trunk and head.
- [ ] Baseline. Record the trunk bytes first.
- [ ] Rule. Head stays under the rule 79 ceilings (about 440 KB first load, about 310,000 B entry). Put before and after bytes in the PR body.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and 2 screenshots into `.claude/ui-proposals/b2-1/b2-1-review-*.png`.
- [ ] Record a 30 to 60 second video of home and the Split page with a theme flip as `.claude/ui-proposals/b2-1/b2-1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Animate the icons (B2-2)

**Depends on.** B2-1.

**Files.**

- [ ] Edit `src/ui/components/icon-glyphs.ts`, `src/ui/components/icon.web.tsx`, `src/ui/components/icon.tsx`, `src/ui/motion.ts`.

**Build.**

- [ ] Replace the glyphs with heroicons outline paths and add the motions of `docs/design/b2/split.dc.html` (the `ai-*` CSS) as CSS keyframes on the inline SVG. No new package.
- [ ] Add one replay hook in `icon.web.tsx`. A press plays the motion, a mouse hover plays it, a press right after a hover lets it finish, and appear-motions (tick, warning) play on mount. Reduced motion plays nothing.

**You see.**

- [ ] Tapping the share icon lifts its arrow. The tick in a status line draws in.

**Seams.**

- [ ] `Icon` props through a component test in `src/ui/components/icon.test.tsx`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `icon.test.tsx` gains "a press sets the play state once and a hover then press does not restart it". Run `npx vitest run`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. On a seeded Split, press every icon button at trunk and head and read `document.getAnimations()`. Save `b2-2-icons.png`. Pass when head runs one icon animation per press and trunk ran none.
- [ ] Lane 2. Repeat with `prefers-reduced-motion: reduce`. Save `b2-2-reduced.png`. Pass when no icon animation runs.

**Feature map.**

- [ ] Add an icons entry to `features/motion.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Entry size in `scripts/size.mjs`.
- [ ] Probe. The script at trunk and head.
- [ ] Baseline. Record the trunk bytes first.
- [ ] Rule. Head grows the entry by no more than 6 KB and stays under the rule 79 ceiling.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 screenshots into `.claude/ui-proposals/b2-2/b2-2-review-*.png`.
- [ ] Record a 30 to 60 second video of the icon motions as `.claude/ui-proposals/b2-2/b2-2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Give every sheet the B2 chrome (B2-3)

**Depends on.** B2-2.

**Files.**

- [ ] Edit `src/ui/split-view/bottom-sheet.tsx`, `src/ui/components/sheet-motion.ts`.
- [ ] Create `src/ui/split-view/sheet-header.tsx`.

**Build.**

- [ ] Drop the scrim dim, round the top corners, add the gray border, a 94% tall snap on pull-up and a close past 110 px on pull-down, in `BottomSheet`.
- [ ] Add `SheetHeader` with a title, an X, and an optional trailing action, and move every existing overlay onto it unchanged.

**You see.**

- [ ] Every overlay (Item, Add, Adjustment, Payments, History) slides up undimmed with a grab handle, drags tall, and drags closed.

**Seams.**

- [ ] `BottomSheet` through `e2e/sheet.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/sheet.spec.ts` gains "a pull past 110 px closes the sheet" and "a pull up snaps to tall". Run it on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the Item sheet at trunk and head, drag it up then down (`features/claim.md`). Save `b2-3-drag.png`. Pass when head snaps tall and closes past the threshold.
- [ ] Lane 2. Focus a field in a tall sheet with the keyboard up in WebKit (rule 17 design A). Save `b2-3-keyboard.png`. Pass when the field stays visible.
- [ ] Lane 3. Frame-step the open and close with `motion.mjs` (rule 18). Save `b2-3-frames.png`. Pass when no frame shows stale content.
- [ ] Lane 4. Open each overlay at 1280 px. Save `b2-3-desktop.png`. Pass when desktop keeps working popovers or sheets with no overlap.

**Feature map.**

- [ ] Update `features/motion.md` with the drag thresholds.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from tap to the sheet's last open frame.
- [ ] Probe. `motion.mjs` on the Item sheet, five runs at trunk and head, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head's median is within 40 ms of trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and 4 screenshots into `.claude/ui-proposals/b2-3/b2-3-review-*.png`.
- [ ] Record a 30 to 60 second video of the drags as `.claude/ui-proposals/b2-3/b2-3-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Build the Split page shell (B2-4)

**Depends on.** B2-3.

**Files.**

- [ ] Edit `app/s/[id].tsx`, `src/ui/split-view/header.tsx`, `src/ui/split-copy.ts`.
- [ ] Delete the phone use of `src/ui/split-view/people-chips.tsx` and `src/ui/split-view/breakdown.tsx`'s fold.

**Build.**

- [ ] Header with the wordmark as the Home button (Appendix B), the theme toggle and the share icon. The menu button goes.
- [ ] The intro line ("Sam paid $135.83. Tap the dot next to what you had. Tap a line to edit it or split it another way.") and the Receipt, People, Payments and History links that open their existing sheets.
- [ ] A fixed footer with "Your share" (or "Priya's share"), the amount, the Items count line, and a "Pay Sam" pill.
- [ ] The pill opens the Pay sheet (decision 25, `docs/design/b2/screens/split-17-pay.png` to `split-21-pay-dark.png`). It lists the viewed person's Items with their part, their part of each Adjustment, and their total, in regular weight, then today's pay pill from `PayBlock` unchanged in behavior (app mark and name, the chevron switcher, Zelle copy, the handles line) and "I already paid". The pill and "I already paid" sit in a bar fixed to the bottom of the sheet. Marking paid closes the sheet, turns the footer pill into a green "✓ Paid", and shows an undo bar. The Pay sheet replaces the folding breakdown and keeps every behavior of `Breakdown` and `PayBlock`.
- [ ] Desktop renders the same single column, centered (Appendix B).

**You see.**

- [ ] A seeded Split at 390 px matches `docs/design/b2/screens/split-01-top.png` in structure, with today's Item rows.

**Seams.**

- [ ] The route through `e2e/receipt.spec.ts`, `e2e/pay.spec.ts`, `e2e/desktop.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Update the specs that opened the menu or chips to use the links. `pay.spec.ts` gains "the Pay sheet lists the viewer's Items and Adjustment parts and its total equals the footer share" and "I already paid marks the viewer paid and Undo reverts it". Run the touched specs on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Seed a Split, pick a name, open each of the four sheets and pay at trunk and head (`features/pay.md`). Save `b2-4-flow.png`. Pass when every action trunk can do, head can do.
- [ ] Lane 2. Open the Pay sheet with two methods, pick Zelle, then mark paid and undo. Save `b2-4-pay.png`. Pass when Zelle copies the handle and says "Copied", the sheet total equals the footer share to the cent, and Undo restores "Not paid".
- [ ] Lane 3. 12 people with long names (rule 80a). Save `b2-4-long.png`. Pass when nothing overflows.
- [ ] Lane 4. Resize across 1024 px. Save `b2-4-resize.png`. Pass when the page reflows with no lost state.

**Feature map.**

- [ ] Update `features/receipt.md`, `features/pay.md` and `features/routes.md` for the links and footer.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First-load transfer and entry size.
- [ ] Probe. `e2e/size.spec.ts` and `scripts/size.mjs` at trunk and head.
- [ ] Baseline. Record the trunk bytes first.
- [ ] Rule. Head stays under the rule 79 ceilings. Removing the chips and fold should shrink it.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and 3 screenshots into `.claude/ui-proposals/b2-4/b2-4-review-*.png`.
- [ ] Record a 30 to 60 second video of the shell as `.claude/ui-proposals/b2-4/b2-4-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Rebuild the Item list and charges (B2-5)

**Depends on.** B2-4.

**Files.**

- [ ] Edit `src/ui/split-view/receipt-card.tsx`, `src/ui/split-view/model.ts`, `src/ui/split-view/dot.tsx`.

**Build.**

- [ ] Each row is a dot button (claim) and a main button (Edit item). Left column name, description, who had it. Right column the full price and the split line ("$4.67 yours", "$6.25 each").
- [ ] Bundles collapse with the chevron in the dot column. Quantity lines show "3x".
- [ ] The charges section (Subtotal, Tax, Tip, fees, discounts) is muted and each row stays tappable to edit (rule 75). "+ Add item, tax, tip or discount" sits under it. Total sits between gray rules with the Unclaimed line under it (rule 72).

**You see.**

- [ ] The list matches `split-01-top.png` and `split-02-bottom.png`.

**Seams.**

- [ ] `receiptRows` in `model.ts` through `src/ui/split-view/model.test.ts`, and the page through `e2e/claim.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `model.test.ts` gains "the split line reads yours for the viewer and each for others". Run `npx vitest run` and `claim.spec.ts` on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Claim, unclaim and open an Item at trunk and head (`features/claim.md`). Save `b2-5-claim.png`. Pass when shares match trunk to the cent.
- [ ] Lane 2. A Bundle and a "3x" line. Save `b2-5-bundle.png`. Pass when both behave as rules 5, 22 and 58 say.
- [ ] Lane 3. Tap a tax row and a discount row. Save `b2-5-charges.png`. Pass when each opens its edit sheet.
- [ ] Lane 4. Another device claims while this one looks (`features/live.md`). Save `b2-5-live.png`. Pass when the row updates within a second.

**Feature map.**

- [ ] Update `features/claim.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Render time of a 60-Item Split.
- [ ] Probe. Seed 60 Items, measure from navigation to the last row painted, five runs at trunk and head, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head's median is within 15% of trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 to 3 screenshots into `.claude/ui-proposals/b2-5/b2-5-review-*.png`.
- [ ] Record a 30 to 60 second video of claiming as `.claude/ui-proposals/b2-5/b2-5-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Rebuild Edit item and Add, with delete and undo (B2-6)

**Depends on.** B2-4 (built in parallel with B2-5, appended after it).

**Files.**

- [ ] Edit `src/ui/item-sheet/index.tsx`, `src/ui/item-sheet/add.tsx`, `src/ui/adjustment-sheet/index.tsx`.
- [ ] Delete `src/ui/split-view/add-menu.tsx`.
- [ ] Create an undo bar on the Split page from `src/ui/components/toast.tsx`.

**Build.**

- [ ] Edit item in the B2 layout. The trash icon sits beside the X, red only while pressed, disabled with one Item left. Keep the Split (quantity) button under the price and the By amount fill-the-rest shortcut.
- [ ] One Add sheet with an Item, Tax, Tip, Fee or Discount chooser (Fee stays, rule 75).
- [ ] After a delete, the undo bar reads "Deleted <name> · Undo" for 4 s. Undo sends `undo` with the delete's revision. The delete applies at once and the trash finishes its motion as the sheet leaves (decision 6).

**You see.**

- [ ] Delete an Item, tap Undo, and the Item returns in place with the same Total.

**Seams.**

- [ ] The `undo` operation through `src/core/operations.test.ts`, the sheets through `e2e/add-item.spec.ts` and `e2e/adjustments.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `operations.test.ts` gains "undo of a delete restores the Item at its index after another device's edit" (rule 80a item 3). Run `npx vitest run` and the touched specs on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Edit, add and delete an Item at trunk and head (`features/claim.md`). Save `b2-6-edit.png`. Pass when the Totals match trunk.
- [ ] Lane 2. Delete then Undo while another device edits a different Item. Save `b2-6-undo.png`. Pass when both edits survive.
- [ ] Lane 3. Another device deletes the Item while this sheet is open (rule 80a item 1). Save `b2-6-gone.png`. Pass when the sheet closes itself.
- [ ] Lane 4. Add a tax, a tip, a fee and a discount. Save `b2-6-add.png`. Pass when each lands in the charges section and the Total is the sum of the lines (rule 70).

**Feature map.**

- [ ] Update `features/claim.md` and `features/receipt.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Entry size.
- [ ] Probe. `scripts/size.mjs` at trunk and head.
- [ ] Baseline. Record the trunk bytes first.
- [ ] Rule. Head stays under the rule 79 ceiling.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 to 4 screenshots into `.claude/ui-proposals/b2-6/b2-6-review-*.png`.
- [ ] Record a 30 to 60 second video of edit, delete and undo as `.claude/ui-proposals/b2-6/b2-6-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA, with an `opus` audit lane for the undo path.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Turn the people row into the People sheet (B2-7)

**Depends on.** B2-4 (built in parallel, appended after B2-6).

**Files.**

- [ ] Edit `src/ui/split-view/pick-sheet.tsx`, `src/ui/split-view/person-menu.tsx`, `src/ui/split-view/claim-confirm.tsx`, `src/ui/split-view/link-line.tsx`, `app/s/[id].tsx`.
- [ ] Delete `src/ui/split-view/people-chips.tsx` when nothing imports it.

**Build.**

- [ ] The People sheet lists everyone with their share. Tapping a person views the list from their side, with the line "Viewing as Priya. Dots tick for them. Back to you." The confirm-once of rule 78 stays.
- [ ] "Switch account" re-picks with the existing `pick` takeover. With no pick, the same sheet opens as "Which one are you?" with "Add yourself" and the link row (rule 25).
- [ ] Add a person and Remove anyone but the Host from the sheet (rule 2), undoable from History.

**You see.**

- [ ] Tap People, tap Priya, and the list shows Priya's dots with the viewing line.

**Seams.**

- [ ] The page through `e2e/people.spec.ts` and `e2e/join.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `people.spec.ts` gains "viewing as another person ticks under their name after one confirm". Run the touched specs on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Pick, view another person, claim for them, and go back at trunk and head (`features/join.md`). Save `b2-7-view.png`. Pass when the claims land under the right names.
- [ ] Lane 2. Switch account to a name another device holds. Save `b2-7-switch.png`. Pass when the other device is asked to pick and this one is not.
- [ ] Lane 3. Remove a person while another device views them (rule 80a item 1). Save `b2-7-remove.png`. Pass when the other device returns to its own view.
- [ ] Lane 4. 12 people with long names. Save `b2-7-many.png`. Pass when the sheet scrolls and nothing overflows.

**Feature map.**

- [ ] Update `features/join.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Entry size.
- [ ] Probe. `scripts/size.mjs` at trunk and head.
- [ ] Baseline. Record the trunk bytes first.
- [ ] Rule. Head stays under the rule 79 ceiling.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and 2 screenshots into `.claude/ui-proposals/b2-7/b2-7-review-*.png`.
- [ ] Record a 30 to 60 second video of the People sheet as `.claude/ui-proposals/b2-7/b2-7-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Restyle Payments, History and Receipt (B2-8)

**Depends on.** B2-4 (built in parallel, appended after B2-7).

**Files.**

- [ ] Edit `src/ui/pay/payments-sheet.tsx`, `src/ui/pay/donut-ring.web.tsx`, `src/ui/pay/pay-block.tsx`, `src/ui/history/index.tsx`, `src/ui/photo-viewer/index.tsx`.

**Build.**

- [ ] The Payments ring is monochrome with round caps and draws in, one arc after another, when the sheet opens. Paid rows read "✓ Paid" in green. "I already paid" moves to your own row (Appendix B).
- [ ] History rows get the animated Revert and Restore links. The confirm for someone else's change stays (rule 3). History keeps its current scope (rule 29).
- [ ] The Receipt link opens a sheet with the photo, which opens `PhotoViewer` full screen on tap, and keeps the Host's Replace.

**You see.**

- [ ] Open Payments and the ring sweeps in. Revert a change in History and the row settles to "✓ Reverted".

**Seams.**

- [ ] `donut-model.ts` through `donut-model.test.ts`, the sheets through `e2e/pay.spec.ts`, `e2e/history.spec.ts` and `e2e/photo.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `history.spec.ts` gains "Revert of another person's change asks first, then applies". Run the touched specs on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Mark paid, view Payments, revert in History and view the photo at trunk and head (`features/pay.md`, `features/photo.md`). Save `b2-8-flow.png`. Pass when every action works as on trunk.
- [ ] Lane 2. Frame-step the ring opening (rule 18). Save `b2-8-ring.png`. Pass when no frame shows a stale selection.
- [ ] Lane 3. Another device edits between this device's change and its Revert (rule 80a items 2 and 3). Save `b2-8-revert.png`. Pass when the later edit survives.
- [ ] Lane 4. Reduced motion. Save `b2-8-reduced.png`. Pass when the ring and links appear without motion.

**Feature map.**

- [ ] Update `features/pay.md` and `features/photo.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from tap to the Payments sheet's last open frame.
- [ ] Probe. `motion.mjs` five runs at trunk and head, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head's median is within 40 ms of trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and 2 screenshots into `.claude/ui-proposals/b2-8/b2-8-review-*.png`.
- [ ] Record a 30 to 60 second video of the three sheets as `.claude/ui-proposals/b2-8/b2-8-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Rebuild home as the B2 start page (B2-9)

**Depends on.** B2-2 (built in parallel with B2-3 to B2-8, appended after B2-8).

**Files.**

- [ ] Edit `app/index.tsx`, `src/ui/receipt-input/reading.tsx`, `src/ui/receipt-input/receipt-summary.tsx`, `src/ui/home-copy.ts`, `src/ui/recent-splits.tsx`, `src/ui/components/payment-row.tsx`, `src/ui/components/name-chips.tsx`, `src/ui/components/sheet.tsx`.
- [ ] Delete the Example link and its tests (`src/draft.test.ts` "the Example", `e2e/home.spec.ts` "Example shows from 768 px").

**Build.**

- [ ] Header "SplitWith", a "Recent splits" link shown only when there are any (rule 37), and the theme toggle. The menu and share buttons go.
- [ ] The take-photo block, the three reading stages mapped onto today's real stages, and the ready card with Replace and the photo thumbnail.
- [ ] "How friends pay you" rows and "Who's at the table" as one list with the Host tagged "you" (rule 85 accessible name kept) and an inline add field that stays open on Enter (rule 35).
- [ ] A footer with the reason line, red while blocked, and the Create pill, gray while blocked. A tap on the gray pill focuses the field that blocks it (rule 34). The focused field is never under the keyboard (rule 17).

**You see.**

- [ ] Home at 390 px matches `docs/design/b2/screens/home-01-empty.png` to `home-04-names.png`.

**Seams.**

- [ ] `src/draft.ts` `reduceDraft` and `readiness` through `src/draft.test.ts`, the page through `e2e/home.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `home.spec.ts` gains "Enter adds a name and keeps the field open" and "a tap on the gray Create focuses the blocking field". Run `npx vitest run` and the touched specs on both engines.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Read the synthetic receipt, add a handle and two names, create the link at trunk and head (`features/home.md`, `features/scan.md`). Save `b2-9-create.png`. Pass when both reach the Split page with the same Items.
- [ ] Lane 2. Focus each field with the keyboard up in WebKit (rule 17). Save `b2-9-keyboard.png`. Pass when no focused field is covered.
- [ ] Lane 3. Blocked states, an invalid Venmo handle and no names. Save `b2-9-blocked.png`. Pass when the reason names the field and the tap focuses it.
- [ ] Lane 4. 1280 px wide. Save `b2-9-desktop.png`. Pass when home is one centered column with drop and paste still working (rule 32).

**Feature map.**

- [ ] Update `features/home.md` and remove its Example steps.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First-load transfer of home.
- [ ] Probe. `e2e/size.spec.ts` at trunk and head.
- [ ] Baseline. Record the trunk bytes first.
- [ ] Rule. Head stays under the rule 79 first-load ceiling.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 to 3 screenshots into `.claude/ui-proposals/b2-9/b2-9-review-*.png`.
- [ ] Record a 30 to 60 second video of creating a Split as `.claude/ui-proposals/b2-9/b2-9-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the stack and merges bottom-up after approval.

## Bring the docs up to date (DOCS1)

**Depends on.** None. Its B2-specific feature map changes ride with each B2 PR.

**Files.**

- [ ] Edit `.claude/orchestrate/handoff.md` (rewrite for the cloud checkout and rules 1 to 91, move the dated sections to `archive/`), `.claude/orchestrate/notes.md` (drop notes fixed in code, tag Mac-only ones).
- [ ] Edit `CLAUDE.md` (the verification skill exists), `docs/agents/dev-flow.md` (skills that exist, draft PRs, the fast loop, design-iteration mode), `CONTEXT.md` (Recent splits wording).
- [ ] Edit `docs/adr/0001-on-device-ocr-no-llm-for-anonymous-use.md` and `docs/adr/0008-server-reads-the-receipt.md` with superseded-by lines.
- [ ] Edit `docs/plans/receipt-splitter-v2.md` status, `description.md` (shipped status and the Gemini reading rows), and add a superseded banner to `docs/design/{home,split,receipt-v2}/README.md` pointing at `docs/design/b2/`.

**Build.**

- [ ] Fix every stale statement in the census, each against its code or git evidence.

**You see.**

- [ ] `grep -rn "/Users/jason" .claude/orchestrate/handoff.md CLAUDE.md docs/agents` prints nothing outside a marked Mac-only line.

**Seams.**

- [ ] None. Docs only.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Every relative link in the touched files resolves. Run a link check script saved in the trail.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Follow `docs/agents/dev-flow.md` and `.claude/skills/verify-receipt-splitter/SKILL.md` literally at head to launch and screenshot the app. Trunk lacks the rewritten flow, so record that and gate the head run. Save `docs1-run.png`. Pass when every command in the docs runs as written.
- [ ] Lane 2. An audit lane reads each changed claim against the code. Save `docs1-audit.md` as the report. Pass when no claim is false.

**Feature map.**

- [ ] None. DOCS1 changes no user-facing feature.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable to runtime. Measure the CI minutes the PR spends.
- [ ] Probe. Read the PR's workflow runs.
- [ ] Baseline. Rule 87 says docs-only changes skip CI, so trunk's figure is 0.
- [ ] Rule. Head spends 0 CI minutes on e2e.

**Review gate.** None. DOCS1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root marks it ready and merges.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] A cleanup PR at the tip closes every open note in `notes.md`. One gates lane and one audit.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

The B2 canvas is the prototype. Its sources and renders are in `docs/design/b2/`, built and screenshotted in this session. The motion clips there were recorded from the running mock. Two things stay unproven until their PR runs. Geist's effect on the first-load budget is measured in B2-1. The sheet's keyboard behavior with a 94% tall snap is measured in B2-3.

## Appendix B. Alternatives rejected

These are the root's defaults where the mock is silent. The operator can override any of them.

- **Title.** The mock shows the merchant ("Casa Lupa"), but no Split stores one. The header shows the SplitWith wordmark, which also keeps the Home button of rule 28. Reading the merchant name is a later PR, not part of B2.
- **Date.** The intro omits the date until the worker sends `created_at`. Same later PR.
- **Revert confirm and History scope.** Kept (rules 3 and 29). The mock reverts on one tap and lists claims only for illustration.
- **Claimer marks.** Replaced by the "who had it" line, which the operator asked for ("move the people back to the left").
- **Desktop.** One centered column with the same sheets, not the side-by-side pair. Two layouts would double every B2 PR's verification.
- **Pay sheet.** The operator asked for it on 2026-10-14 (decision 25). It replaces the folding breakdown and the pill-side method picker.
- **Home panel.** The drag-to-spring panel (rule 33) goes with the panel. Rule 17's promise, a focused field never under the keyboard, stays.
- **Example link and home share button.** Removed, as in the mock. The operator believed the Example link was gone already.
- **Format line.** "JPEG, PNG, or WebP" goes, per "reduce text in general".
- **New packages.** No `motion`, Reanimated or `react-native-svg`. CSS keyframes on inline SVG keep the size budget.

## Appendix C. Risks

- **Size budget.** Geist and the icon keyframes add bytes (B2-1, B2-2). The owner measures before and after and asks before raising a ceiling.
- **Many e2e specs touch the menu and chips.** B2-4 and B2-7 rewrite them. The owner runs every spec that imports `e2e/header.ts`.
- **Parallel PRs on one route file.** B2-5 to B2-8 all touch `app/s/[id].tsx`. The root rebases each onto its parent in order and reruns the lanes whose patch-id changed.
- **Pick bug cause unknown.** BUG1's file list is fixed only once the investigation confirms the mechanism.
- **No iOS Simulator in the cloud.** Rule 44's census cannot run here. WebKit in Playwright stands in, and the operator checks on a phone before approving.

## Appendix D. Links and reading list

- `docs/design/b2/README.md` and its screens, before any B2 PR.
- `.claude/orchestrate/preferences.md`, `CONTEXT.md`, `docs/adr/0004`, `0009`.
- `.claude/skills/verify-receipt-splitter/SKILL.md` and `features/README.md`.
- B2-3, B2-6 and BUG1 get `/how` before building and `/interrogate` before the verdict.
- The trail per `/show-me-your-work` goes in `docs/plans/splitwith-b2.trail.tsv`.
