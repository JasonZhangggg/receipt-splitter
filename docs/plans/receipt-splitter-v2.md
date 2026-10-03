# Receipt Splitter v2 plan

This program rebuilds how the live site shows a Receipt, after launch, from round 3 of the operator's mockups.
Friends read a receipt by quantity and Bundle instead of a flat list, the Host's home page asks only for what the link needs, and everyone can view the Receipt photo.
The rules it enforces are that no deploy makes a live Split unreadable and that a failing Total check blocks nothing.
The PRs, in stack order, are V2-1, V2-2, V2-3, V2-4, V2-5, V2-6a, and V2-6b.

**Status at `main` = `d0cf6ce`.**

- Merged and deployed, in this order: V2-1 as PR 29 (`9e3a34d`), V2-2 as PR 30 (`ade639d`), V2-5 as PR 31 (`f5e5b8e`), V2-6a as PR 32 (`461b37a`), and V2-3 as PR 33 (`2da1e47`).
- Merged beside them: PR 27 (`96abf06`), the bug-fix PR on `fix/pay-note-sheet-flash`. PR 28 (`1440d94`), the quiet Total check note. PR 34 (`967c9aa`), the per-IP daily create limit. PR 35 (`d0cf6ce`), the Split page sheet rebuilt for iOS with the link row, the Home button, and a fresh home after create.
- In flight on local branches, not pushed. `fix/create-silent` makes every Create tap act and keeps the home panel open. `fix/flash-root` fixes the Split page flashes at their causes.
- Queued, in order: the bar after a pick, Add Item on the Split page, History on home, V2-4, V2-6b, then the open notes in `notes.md`. V2-4 and V2-6b are amended below to the rulings since approval. The first three have short sections before **Close the program**.
- "Preferences N" means ruling N in `~/.claude/orchestrate/receipt-splitter/preferences.md`.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`, as v1 did. The root builds and verifies one linear stack on `main`, bottom-up, and merges each PR on a clean verdict at its exact head plus green CI. Every merge to `main` deploys to production at `app.splitwith.workers.dev`, so the root confirms each deploy before the next merge. V2-3, V2-4, V2-5, and V2-6b change an interaction and stop at merge-ready for the operator's review gate. The bug-fix PR on `fix/pay-note-sheet-flash` is not part of this plan, and it merges before V2-3 and V2-5.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Intent

**Problem.** The operator used the live site on a Topgolf receipt on 2026-10-01. The Split page lists every drink flat, with "3×" inside the name and an × on every row, so the receipt is hard to read and easy to break. The two Beer Bucket discounts spread over everyone, Gameplay included. The home page shows the whole Item list before the link exists, the web home sits off center, and the phone home offers an **Example** button nobody needs. Adding names takes a click per name. Nobody but the Host can see the receipt photo, and even the Host cannot open it from its thumbnail.

**Solution.** The Split page starts each row with its quantity and groups a Bundle's Items under its header, collapsed by default, with its discount nested inside. A Bundle's discount goes only to the people who had its Items. Tapping a row opens its detail, a bottom sheet on the phone and a popover on desktop, where the split modes and **Delete item** live. The home page is one centered column with a compact receipt card, the Payment handle, and the names. Names go in with type, Enter, type, Enter. The Host's photo goes up with the link, and **View receipt** opens it for everyone until the Split expires.

**User stories.**

1. As a Participant, I want each row to start with its quantity, so that I can count what I had at a glance.
2. As a Participant, I want a Beer Bucket's drinks grouped under it and collapsed until I open it, so that the receipt reads like the paper one.
3. As a Participant who skipped the beer, I want the Beer Bucket discount to go only to the people who drank it, so that my Share does not move when they Claim.
4. As a Participant, I want to delete an Item only from its detail, so that a stray tap on a row never removes it.
5. As a desktop user, I want the receipt and my Share side by side in the middle of the page, so that I do not scroll between them.
6. As a Host, I want home to ask only for the photo, my Payment handle, and the names, so that I create the link in seconds.
7. As a Host, I want to type names and press Enter between them, so that I never reach for the mouse.
8. As a Participant, I want to open the receipt photo from the Split page, so that I can check a line against the paper.

**Out of scope.** Native iOS and Android builds. Claiming a whole Bundle from its header, because the operator ruled the header has no control. Adding an Item to a Bundle or making a Bundle by hand. Bundles without a discount. Editing or cropping the photo. Storing the photo in R2. Detecting Bundles on receipts that print no $0.00 header. A photo for a Split created before V2-6b.

**Decisions.**

- `docs/design/receipt-v2/README.md` and `round3.html` are the approved design. The README's indent rule and operator picks win over the board.
- `docs/adr/0006-bundle-discount-is-a-scoped-adjustment.md` models a Bundle as an Adjustment of kind `bundleDiscount` that names its Items.
- `docs/adr/0007-receipt-photo-stored-with-the-split.md` stores one downscaled JPEG in the Split's Durable Object and amends ADR 0001.
- `docs/adr/0004-one-durable-object-per-split.md`, section **Stored Split versions**, makes the `schemaVersion` bump and migration mandatory. V2-1 ships the reader of version 2 one deploy before V2-2 writes it.
- `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md` sets the row-write budget that V2-6a measures again.
- `CONTEXT.md` gains **Bundle** and **Receipt photo** and redefines **Adjustment** and **Share**.
- A failing Total check blocks nothing, not creating the link and not any operation. Home and the Split page show it as a quiet note with no highlight. The bug-fix PR on `fix/pay-note-sheet-flash` builds that rule and the **Copy** and **Share** buttons on the pick sheet, and every PR here keeps both.
- The operator's rulings of 2026-10-01 in `~/.claude/orchestrate/receipt-splitter/preferences.md`, from "Turnstile removed" on, bind every PR.

## Amendments since approval

The operator approved this plan with PR 26. The rulings below changed its spec after that, and each wins over the text in this file where they disagree. Rulings that only restate this plan are not listed.

- **Preferences 7, 2026-10-02.** Creates are limited to 10 a minute and 50 a UTC day per IP, plus a global cap of 1,000 a UTC day. PR 34 added the daily per-IP limit. V2-6a's cap of 1,000 stands.
- **Preferences 10, 2026-10-02.** Payment handles cannot change after create. The Split page has no handle-edit control.
- **Preferences 12, 2026-10-01.** The Host may upload the Receipt photo at most twice. PR 32 replaces the photo on the second PUT and answers a third with 429.
- **Preferences 15, 2026-10-02.** Nothing is highlighted in yellow. Unclaimed rows, flagged rows, and reasons use secondary gray text. This replaces V2-3's yellow flag.
- **Preferences 17, 2026-10-02.** The keyboard never covers a focused text field, on any page.
- **Preferences 18, 2026-10-02.** No animation shows a stale or wrong state for any frame. That includes an old selection, a flash of the open state, doubled content, and a jump when the keyboard opens or closes.
- **Preferences 19, 2026-10-02.** One row per unit, with no quantity column. Name and price edits apply to the whole Item, and Delete removes one unit. This is V2-3's amendment.
- **Preferences 20, 2026-10-02.** Rows use about 14 px text and a 16 px select circle with a 44 px tap target.
- **Preferences 22, 2026-10-02.** The Bundle header's chevron sits in its leading slot, with its tip on the light vertical rule beside the children.
- **Preferences 23, 2026-10-02.** Rows carry no "Unclaimed" tag, because the missing person icon shows it. A collapsed Bundle shows a quiet gray "N unclaimed".
- **Preferences 24, 2026-10-02.** A person's breakdown lists one line per unit, with no "1 of 3".
- **Preferences 25, 2026-10-02.** "Which one are you?" is the tall pick sheet, and it closes without a pick. It shows the invite line, the people, "Not here? Add yourself", and one link row with the link, **Copy**, and **Share**.
- **Preferences 26, 2026-10-02.** After a pick, the collapsed bar shows "Your share" with an up-arrow and no link row. It is queued.
- **Preferences 27, 2026-10-02.** The pay button stays in the expanded breakdown, not in the collapsed bar.
- **Preferences 28, 2026-10-02.** The Split page header has a Home button that starts a new split. PR 35 built it.
- **Preferences 30, 2026-10-02.** Anyone in the Split can add a fully new Item. This brings a new Item into scope, though not one inside a Bundle. Who may add is still open. It is queued.
- **Preferences 33, 2026-10-02.** The home panel with the payment row, the names, and **Create split link** is always shown, never collapses, and is one surface with Create. A drag moves it and it springs back. `fix/create-silent` builds it.
- **Preferences 34, 2026-10-02.** A tap on an enabled Create always acts. It creates, or it focuses what is missing and says so. `fix/create-silent` builds it, and the wording "Add how to pay you." waits for the operator's OK.
- **Preferences 36, 2026-10-02.** After a Split is created, home is fresh. The receipt, the photo, and the names clear, and the payment handles stay. PR 35 built it.
- **Preferences 37, 2026-10-02.** History on home lists past Splits stored on this device only. It is queued.
- **Preferences 44, 2026-10-02.** The real-iOS census in the iOS Simulator is the deciding gate for UI fixes. Every flagged interaction counts 0 on the fix head.
- **Preferences 45, 2026-10-02.** CI runs WebKit for the functional sheet and claim specs only. WebKit frame timing runs locally through `motion.mjs` on macOS before every UI PR, and Chromium frame timing runs in CI.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go. *Not recorded.*
- [ ] On the operator's go, write this exact text into the standing objective and restate it in your todolist. "Run docs/plans/receipt-splitter-v2.md under autopilot-stack. Build V2-1, V2-2, V2-3, V2-4, V2-5, V2-6a, and V2-6b as one linear stack on main, in that order, after the bug-fix PR on fix/pay-note-sheet-flash merges. A PR is verified only when its unit, live, and perf boxes are all checked, and tests alone are not sufficient verification. The root merges each PR bottom-up on a clean verdict at its exact head plus green CI, and confirms the production deploy before the next merge. V2-3, V2-4, V2-5, and V2-6b also wait at merge-ready for the operator's review gate. Each PR's test runs fit in 30 minutes. Done when every PR is verified, rebased on current main, merged, and deployed." *Not recorded.*
- [ ] Read these at program start. Re-read them at every tick. *Not recorded.*
  - [ ] `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `~/.claude/skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify-receipt-splitter/SKILL.md`
  - [ ] `~/.claude/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `~/.claude/skills/tdd/SKILL.md`
  - [ ] `~/.claude/skills/spec-review/SKILL.md`
  - [ ] `~/.claude/skills/emil-design-eng/SKILL.md`, `~/.claude/skills/apple-design/SKILL.md`, and `~/.claude/skills/mobile-native/SKILL.md` for V2-3 to V2-6b
  - [ ] `~/.claude/skills/animate/SKILL.md` and `~/.claude/skills/review-animations/SKILL.md` for V2-3 to V2-6b
  - [ ] `~/.claude/skills/unslop/SKILL.md` for the UI text of V2-3 to V2-6b
  - [ ] `~/.claude/skills/principle-model-the-domain/SKILL.md` and `~/.claude/skills/principle-type-system-discipline/SKILL.md` for V2-1 and V2-2
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode. Never leave the cadence to memory. *Not recorded.*
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a status message to the operator in chat, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, open notes and their fixers, and blockers." *Not recorded.*
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once. *Not recorded.*

### Spawn owners

- [x] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner is a background `poteto-agent` with `isolation: "worktree"` on the model `~/.agents/pstack-models.md` names for its role, at medium effort per the operator's ruling. At most `max parallel` owners run at once. Queue the rest.
- [x] Follow this dependency graph. Each PR branches from the PR above it in the stack. Start dependent work only after its parent reaches a verified head.
  - [x] V2-1 is first and branches from `main`.
  - [x] V2-2 after V2-1. V2-2 merges only after V2-1's deploy is live in production.
  - [x] The bug-fix PR on `fix/pay-note-sheet-flash` merges before V2-3 and V2-5. It is not part of this plan.
  - [x] V2-3 after V2-2 and the bug-fix PR.
  - [ ] V2-4 after V2-3. *Not done: V2-4 is not built.*
  - [ ] V2-5 needs only the bug-fix PR on `main`. Its owner may start once that merges, and the root restacks it onto V2-4. *V2-5 merged before V2-3 and V2-4, as PR 31, with no restack.*
  - [ ] V2-6a needs only `main`. Its owner may start at once, and the root restacks it onto V2-5. *V2-6a merged before V2-3, as PR 32, with no restack.*
  - [ ] V2-6b after V2-4, V2-5, and V2-6a. *Not done: V2-6b is not built.*
- [ ] Hold the file boundaries. *Not held for every PR. See each child.*
  - [ ] V2-1 touches only `src/core/**`, `scripts/golden-splits.mjs`, `worker/**` tests, and the one switch in `src/ui/split-view/receipt-card.tsx` that the new kind breaks. *Not held: its PR body lists the files outside this list.*
  - [ ] V2-2 touches only `src/parse/**`, `src/draft.ts`, `src/draft.test.ts`, `src/core/parse.ts`, `src/core/split.ts`, `src/core/golden/**`, `src/ui/receipt-editor/**`, `e2e/fixtures/**`, and `bench/**`. *Not held: its PR body lists the files outside this list.*
  - [ ] V2-3 touches only `app/s/[id].tsx`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `src/ui/split-copy.ts`, `src/ui/components/**`, `e2e/claim.spec.ts`, `e2e/receipt.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not held: its PR body lists the files outside this list.*
  - [ ] V2-4 touches only `app/s/[id].tsx`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `e2e/desktop.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not built.*
  - [ ] V2-5 touches only `app/index.tsx`, `src/ui/home-copy.ts`, `src/ui/receipt-input/**`, `src/ui/receipt-editor/**`, `src/ui/components/**`, `src/ui/photo-viewer/**`, `e2e/home.spec.ts`, `e2e/scan.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not held: its PR body lists the files outside this list.*
  - [x] V2-6a touches only `worker/**`, `src/core/operations.ts` and `src/live/**` for the snapshot's photo flag, `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md`, `docs/adr/0007-receipt-photo-stored-with-the-split.md`, `CONTEXT.md`, and `features/photo.md`, `features/README.md`, `features/claim.md`, and `features/join.md` in `verify-receipt-splitter`.
  - [ ] V2-6b touches only `src/draft.ts`, `src/ui/receipt-input/**`, `src/ui/photo-viewer/**`, `src/ui/split-view/**`, `app/index.tsx`, `app/s/[id].tsx`, `src/ui/split-copy.ts`, `e2e/photo.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not built.*
- [ ] Hold the review gate. V2-3, V2-4, V2-5, and V2-6b change an interaction. They wait for the operator's review in chat with screenshots and a video before merge. *Held for V2-3 and V2-5. V2-4 and V2-6b are not built.*

### PR mechanics, for every PR

- [x] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [x] Commit locally and never push. A verifier checks out the owner's local SHA, which every worktree reaches through the shared object store.
- [ ] Draft the PR body at `/tmp/swarm-<PR>/owner/pr-body.md`. *Not recorded.*
- [x] On a clean verdict, the root pushes that exact SHA once. The root then opens the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [x] CI runs once, on the verified commit. A CI failure goes back to the owner like a lane `FAIL`.
- [x] Run `npm run lint` and `npm run typecheck` before the verdict. Commit with hooks on.
- [ ] Write tests through `/tdd` at the PR's **Seams**. *Not recorded.*
- [ ] Hold the CI-robustness rule from v1 in every new e2e case. Take no action before the page hydrates. Never assert a value that is already on screen before the action that should change it. Run each new case under a 4x CPU throttle before the verdict. *Recorded for PR 30 and PR 33 only.*
- [x] Test logic, not looks. No test pins a style value. The screenshot matrix and the operator's review prove the UI.
- [x] Never commit `topgolf-receipt.webp` or any real receipt photo. Tests and lanes use `src/parse/fixtures/topgolf.tsv` and `e2e/fixtures/topgolf-synthetic.png`, which V2-2 draws from that file's text.
- [ ] Run `/deslop` before each commit and `/no-comments` before review. *Not recorded.*
- [ ] Run `/spec-review` against this plan's PR section before the code-ready report. Fix every Spec finding. *Not recorded.*
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`. *Not done: no Bugbot review ran on this repo.*
- [x] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [x] Hold the verification budget of 2026-10-01. Each PR gets 30 minutes of test runs at most. Gates are lint, typecheck, unit, worker, and e2e. Mutants cover logic only, at most about 15 per PR. The live check is the PR's two lanes in one pass of 15 minutes or less. Perf is `npm run size` plus LCP over 3 loads each at trunk and head, interleaved, unless the PR names another metric.
- [x] At the owner's merge-ready local head SHA, run the swarm per `~/.claude/skills/swarm/SKILL.md`. One gates and perf lane. One live lane that runs the PR's **Verify, live** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [x] Lanes return `PASS`, `PASS+NOTES`, or `FAIL`. `FAIL` is a real defect or new logic without a test that fails for it. Clean when no lane fails. `FAIL` findings go back to the owner.
- [x] Each note names its fixer, the next PR touching those files or the cleanup PR, and goes in `~/.claude/orchestrate/receipt-splitter/notes.md`.
- [x] Append each clean PR to the stack on `main` in order. After any restack, compare `git patch-id` of each PR's diff against its value at the verdict SHA, per `~/.claude/skills/poteto-mode/playbooks/shipping.md`. An unchanged patch-id keeps the verdict. A changed one gets a fresh swarm.
- [x] Merge bottom-up with `--match-head-commit` pinned to the verified head. After each merge, wait for the deploy job on `main` to pass, then load `https://app.splitwith.workers.dev/` and one live Split. A failed deploy or an unreadable Split stops the program and goes to the operator.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head, with its own app instance and port per `verify-receipt-splitter`. Drive only through `verify-receipt-splitter`.

- [x] `git checkout <head SHA>`.
- [x] Run `npm ci`, then the `verify-receipt-splitter` launch command, which exports the web build and starts `npx wrangler dev` on the lane's own port. Wait for its doctor command to report ready.
- [x] Deliver input only through the verification skill's drive commands. Read-only diagnostics are the doctor command, the browser console log, the network log, and `npx wrangler dev` output.
- [x] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Read Bundles in the Split model (V2-1)

**Depends on.** None.

V2-1 adds the Bundle to the domain and teaches every reader of a stored Split to read `schemaVersion: 2`. It writes nothing new. The stored version is derived in `storedVersion()`, which returns 2 only while the receipt, the original, or the history holds a Bundle, and 1 otherwise. No Split can hold a Bundle until V2-2, so in production the Worker keeps writing version 1. V2-2 does not change `storedVersion()`. A rollback of V2-2 lands on a Worker that still reads version 2. A rollback past V2-1 strands only the Splits that hold a Bundle, because every other Split is still stored as version 1.

**Files.**

- [x] Edit `src/core/split.ts`, `src/core/parse.ts`, `src/core/shares.ts`, and `src/core/operations.ts`.
- [x] Edit `src/core/shares.test.ts`, `src/core/operations.test.ts`, and `src/core/parse.test.ts`.
- [x] Edit `scripts/golden-splits.mjs`, and create `src/core/golden/v2-1.json`.
- [ ] Edit `src/ui/split-view/receipt-card.tsx` only where the new kind fails to compile. *Not needed: it compiled unchanged (PR 29).*

**Build.**

- [x] In `src/core/split.ts`, add `bundleDiscount` to `ADJUSTMENT_KINDS`. Make `Adjustment` a union where only `kind: "bundleDiscount"` carries `bundle` with a `name` and `items` of type `NonEmpty<ItemId>`, per ADR 0006. No other kind can carry `bundle`.
- [x] In `src/core/parse.ts`, read `schemaVersion` 1 and 2. Version 1 migrates to the in-memory Split unchanged. Refuse a `bundleDiscount` whose Items are missing, repeated, or in another Bundle, and refuse a positive Bundle discount. Refuse `bundleDiscount` in a version 1 row and in a create request, because nothing writes one yet.
- [x] Derive the stored version in `storedVersion()` in `src/core/split.ts`. It returns 2 only while the receipt, the original, or the history holds a Bundle, and 1 otherwise. In production every Split stays at version 1 until V2-2 lets a Split hold a Bundle.
- [x] In `src/core/shares.ts`, divide each Bundle discount among the claimers of its Items' units, in proportion to the unit prices. Divide the other Adjustments in proportion to each Participant's Items after Bundle discounts. Cents of a Bundle discount on an unclaimed unit count as Unclaimed. The Shares plus Unclaimed still equal the total to the cent.
- [x] In `src/core/operations.ts`, make deleting an Item drop it from its Bundle in the same Change, and make deleting a Bundle's last Item remove the Bundle discount in the same Change. One Revert restores both.
- [x] Add `v2-1.json` to `src/core/golden/` through `node scripts/golden-splits.mjs`, holding the Topgolf Receipt with two Bundles at version 2.
- [x] Let the current Split page show a Bundle discount as a plain discount row. V2-3 draws the Bundle.

**You see.**

- [x] `npm test -- src/core` passes, and `src/core/parse.test.ts` reads every golden row, `v2-1.json` included. For the Topgolf Split with Priya on all of Bundle 1 and Jason on Gameplay and Bundle 2, Priya's Share is $49.52 and Jason's is $157.77. The same Claims under v1's math give Priya $52.21.

**Seams.**

- [x] `parseSplit`, `computeShares`, `shareBreakdown`, and `applyOperation`, through `src/core/parse.test.ts`, `src/core/shares.test.ts`, and `src/core/operations.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/core/shares.test.ts` gains the Topgolf case above with literal cents, a Bundle with an unclaimed unit, and a property check that Shares plus Unclaimed equal the total over random Claims. Run `npm test -- src/core`.
- [x] `src/core/operations.test.ts` gains deleting a Bundle Item, deleting the last one, and reverting each. Run `npm test -- src/core`.
- [x] `src/core/parse.test.ts` gains each refusal above and reads every file in `src/core/golden/`. Run `npm test -- src/core` and `npm run test:worker`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Create a Split with `POST /api/splits` from the Receipt that `parseReceipt` reads from `src/parse/fixtures/topgolf.tsv`, Claim three Items from two browsers, and reload, citing `features/claim.md`, at trunk and head. Save `claim-flow.png`. Pass when head shows the same Shares as trunk to the cent, because no Split holds a Bundle yet, and no connection closes with code 4500.
- [x] Lane 2. Load the `v2-1.json` golden row into a local `SplitServer` through the worker test harness and open it in a browser, citing `features/live.md`. Save `bundle-row.png`. Pass when the Split opens, both Bundle discounts show as discount rows, and Priya's Share reads $49.52.

**Feature map.**

- [x] Update `features/live.md` in `verify-receipt-splitter` with how to seed a golden row into a local Split.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Time per `computeShares` call from `src/core/shares.bench.ts`, and brotli bytes of every script `dist/index.html` loads.
- [x] Probe. `npm run bench:core` and `npm run size` at trunk and head, interleaved three times.
- [x] Baseline. Record the trunk numbers first.
- [x] Rule. Fail if the median `computeShares` time is more than 10 percent over trunk's, or the scripts grow by more than 2 KB brotli.

**Review gate.** None. V2-1 is not review-gated.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done. *Not done: no Bugbot review ran on this repo.*
- [x] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-1, confirms the deploy, and opens three live Splits made before it in production. *Merged as 9e3a34d and deployed. Opening three older live Splits is not recorded.*

## Detect Bundles when reading a receipt (V2-2)

**Depends on.** V2-1, deployed to production.

**Files.**

- [x] Edit `src/parse/index.ts`, `src/parse/lines.ts`, and `src/parse/index.test.ts`.
- [x] Edit `src/draft.ts` and `src/draft.test.ts`.
- [x] Edit `src/core/parse.ts`, `src/core/split.ts`, and `src/core/parse.test.ts`.
- [x] Create `src/core/golden/v2-2.json`.
- [ ] Edit `src/ui/receipt-editor/index.tsx` only to keep Bundles whole through a home edit. *Not needed: the editor already kept Bundles whole (PR 30).*
- [x] Edit `e2e/fixtures/make-fixtures.py`, and create `e2e/fixtures/topgolf-synthetic.png`.

**Build.**

- [x] In `src/parse/index.ts`, open a Bundle at an Item line with words and a price of $0.00. Collect the Items under it. Close it at a receipt-level discount that echoes the header's name (the existing `echoes` token match) and prints a percent, when a run of Items starting right under the header sums to an amount whose percent is within 1 cent of the discount. The Bundle holds that run only. The discount becomes a `bundleDiscount` Adjustment, and the header line becomes the Bundle's name, not an Item.
- [x] Leave the reading as it is when no discount closes the group. The $0.00 header stays an Item, as today.
- [x] Keep the Total check deciding between readings, as PR 22 does. Bundles change no amount, so a passing reading still passes.
- [x] In `src/draft.ts`, carry Bundles through a read, a price edit, a reload, and `splitRequest`. Deleting a Bundle Item on home follows the rule from V2-1.
- [x] Draw `e2e/fixtures/topgolf-synthetic.png` with `e2e/fixtures/make-fixtures.py` from the lines of `src/parse/fixtures/topgolf.tsv`. It holds no payment lines. Confirm that scanning it on home reads the same Receipt as the TSV, or report the difference.
- [x] In `src/core/parse.ts`, accept `bundleDiscount` in a create request. Leave `storedVersion()` as V2-1 wrote it. It already stores a Split with a Bundle as version 2 and every other Split as version 1, so Splits without a Bundle stay readable by older Workers. Write `v2-2.json` through `node scripts/golden-splits.mjs`.

**You see.**

- [x] `parseReceipt` on `src/parse/fixtures/topgolf.tsv` returns Gameplay, two Bundles named "Beer Bucket" with four Items each, the discounts -$4.51 and -$4.63 as `bundleDiscount`, Tax $4.94, Tip $32.26, Subtotal $179.23, Total $207.29, and a passing Total check.

**Seams.**

- [x] `parseReceipt` in `src/parse/index.test.ts`, the draft through `src/draft.test.ts`, and `parseCreateSplitRequest` in `src/core/parse.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/parse/index.test.ts` gains the full Topgolf Receipt with literal values, a $0.00 header with no echoing discount that stays an Item, and two Bundles with the same name that stay apart. Run `npm test -- src/parse`.
- [x] `src/draft.test.ts` gains Bundles carried through a reload and into `splitRequest`. Run `npm test -- src/draft`.
- [x] `src/core/parse.test.ts` reads `v2-2.json` and every older golden row. Run `npm test -- src/core`.
- [x] Run `npm run bench -- --parser=app` and report each category against trunk. No category drops.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Scan `e2e/fixtures/topgolf-synthetic.png`, create the link, and Claim Bundle 1's Items as Priya, citing `features/scan.md` and `features/claim.md`, at trunk and head. Save `topgolf-split.png`. Pass when trunk shows the discounts spread over everyone and head shows Priya's Share at $49.52 with Jason on Gameplay and Bundle 2.
- [x] Lane 2. Create a Split with no Bundle at head and open it with a Worker built from V2-1's merge commit, citing `features/live.md`. Save `rollback-read.png`. Pass when the head writes the Split without a Bundle as version 1, and the V2-1 Worker reads it and a version 2 row with no close code 4500.

**Feature map.**

- [x] Update `features/scan.md` in `verify-receipt-splitter` with the Topgolf fixture and its expected Bundles.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Total `parseReceipt` time over the bench set, and brotli bytes of every script `dist/index.html` loads.
- [x] Probe. `npm run bench -- --parser=app` with its timing, and `npm run size`, at trunk and head, interleaved three times.
- [x] Baseline. Record the trunk numbers first.
- [x] Rule. Fail if the median parse time is more than 10 percent over trunk's, or the scripts grow by more than 2 KB brotli.

**Review gate.** None. V2-2 is not review-gated.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done. *Not done: no Bugbot review ran on this repo.*
- [x] Rebased onto current trunk after the verdict, patch-id unchanged.
- [x] The root merges V2-2 after V2-1's deploy is live, then confirms its own deploy.

## Show the receipt by quantity and Bundle on the Split page (V2-3)

**Depends on.** V2-2.

Build from the phone frames in `docs/design/receipt-v2/round3.html`, and read its `README.md` first. The README's indent rule wins over the board. Desktop keeps today's layout until V2-4.

**Amendment: one row per unit.** The operator dropped the quantity column after round 3. An Item with quantity N shows N rows, one per unit, each with its own circle, the Item's name, and the unit price. The README's "Amendment: no quantity column" wins over the Build and You see lines below where they mention quantity.

**Files.**

- [x] Edit `src/ui/split-view/receipt-card.tsx`, `src/ui/split-view/model.ts`, and `src/ui/split-view/model.test.ts`.
- [x] Edit `src/ui/item-sheet/index.tsx`, `src/ui/split-copy.ts`, and `app/s/[id].tsx`.
- [x] Create `e2e/receipt.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`. Build motion with `animate`. Run `review-animations` and `unslop` before the PR. *Not recorded.*
- [x] Show one row per unit, with no quantity column. Guinness x3 at 21.87 reads as three "Guinness Draught 14.9oz Can" rows at 7.29. Uneven lines split by `unitPrices`, the first rows taking the extra cents, so the rows and the Shares agree to the cent. A circle claims that unit only.
- [x] Remove the × from every row. A row tap opens the Item sheet.
- [x] Draw a Bundle as C's card with B's collapse. Its header shows the Bundle's name, a summary such as "6 items · 10% off", and its net price. The header has no claim circle. Closed, it shows who had what inside it. Open, it lists its Items and then its discount.
- [x] Draw the Bundle card on the same surface as the rows, per round 3.
- [x] Hold the indent rule. Each child's circle lines up with the left edge of the header's name text. A light vertical line runs from under the header's leading slot down beside the children.
- [x] Make the header a button with `aria-expanded` and `aria-controls` naming the region of its Items. Its label reads the name, the summary, and the state, such as "Beer Bucket, 6 items, 10% off, collapsed". Enter and Space toggle it. Focus stays on the header.
- [x] Animate the open and close with the sheet's spring from v1, and cross-fade under reduced motion.
- [x] Build C's Item sheet on the phone for the unit tapped, with the name, the unit price marked "each" when the Item has more than one, a line such as "In Beer Bucket. Its 10% off takes $0.73 off this line." for a Bundle Item, **Who had it** for that unit, **Evenly**, **By shares**, **By amount**, and **Delete item**, which removes that unit only. Name and price edits apply to the whole Item. No quantity stepper.
- [x] Keep **Copy** and **Share** on the pick sheet, as the bug-fix PR on `fix/pay-note-sheet-flash` builds them.
- [x] Set the default states. The pick sheet opens first, every Bundle is collapsed, and nothing is selected.
- [ ] Show the yellow flag on an unclaimed unit inside an open Bundle, and on a closed Bundle's summary when it holds one. *Superseded by preferences 15 and 23.*

**You see.**

- [x] On a 390 px phone, the Topgolf Split shows Gameplay and two collapsed rows reading "Beer Bucket, 6 items · 10% off" and "Beer Bucket, 6 items · 10% off". Tapping one opens it in place, with three "Guinness Draught 14.9oz Can" rows at 7.29 indented under "Beer Bucket".

**Seams.**

- [x] The row model in `src/ui/split-view/model.test.ts`, which turns a Receipt into rows and Bundles, and the page through Playwright in `e2e/receipt.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/ui/split-view/model.test.ts` gains the Topgolf rows, a Bundle's summary with its unit count, and the flag state of a Bundle with one unclaimed unit. Run `npm test -- src/ui`.
- [x] `e2e/receipt.spec.ts` gains opening a Bundle by keyboard, checking `aria-expanded`, opening a Bundle Item's sheet, and deleting it from there. The case holds the CI-robustness rule. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Open the Topgolf Split at 390 px, pick Sam, open Bundle 1, Claim the Guinness, and delete one Item from its sheet, citing `features/claim.md`, at trunk and head. Save `bundle-claim.png`. Pass when trunk shows the flat list and head shows Sam's Share matching `shareBreakdown` to the cent, the deleted Item gone from both browsers, and a Revert bringing it back.
- [x] Lane 2. Shoot the screenshot matrix at 390 px, citing `features/claim.md`. Capture phone frames 1 to 5 in light and dark, plus VoiceOver's or the accessibility tree's reading of a Bundle header. Save `receipt-matrix/<frame>.png`. Pass when each frame matches the board and the indent rule, no text overflows, and every target is at least 44 px.

**Feature map.**

- [x] Create `features/receipt.md` in `verify-receipt-splitter` with how to open, close, and read a Bundle, and add it to `features/README.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Brotli bytes of every script `dist/index.html` loads, LCP on `/s/<id>`, and the frame time of opening a Bundle under a 4x CPU throttle.
- [x] Probe. `npm run size` at trunk and head, 3 loads of `/s/<id>` at trunk and head, interleaved, and a Performance trace of 5 Bundle toggles at head.
- [x] Baseline. Record the trunk sizes and LCP first. Trunk has no Bundle, so the toggle gets an absolute budget.
- [x] Rule. Fail if the scripts grow by more than 10 KB brotli, the head LCP median is more than 10 percent over trunk's, or any toggle frame takes over 16 ms at the throttle.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2's screenshots into `/tmp/receipt-splitter-review/V2-3-review-<frame>.png`. *Not kept: `/tmp/receipt-splitter-review/` holds no copy.*
- [ ] Save a 30 to 60 second video of opening a Bundle, claiming in it, and deleting from the Item sheet as `/tmp/receipt-splitter-review/V2-3-review.mp4`. *Not kept: `/tmp/receipt-splitter-review/` holds no copy.*
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done. *Not done: no Bugbot review ran on this repo.*
- [x] Rebased onto current trunk after the verdict, patch-id unchanged.
- [x] The root merges V2-3 after V2-2 and confirms the deploy.

## Center the Split page on desktop with a popover and a right pane (V2-4)

**Depends on.** V2-3, `fix/flash-root`, and the bar after a pick. The last two change the phone sheet that this layout replaces from 1024 px.

**Amended after approval.** This section follows **Amendments since approval**. Where the desktop frames in `docs/design/receipt-v2/round3.html` disagree with a ruling, the ruling wins. Build from those frames otherwise.

**Files.**

- [ ] Edit `app/s/[id].tsx` and `src/ui/split-view/**`.
- [ ] Create `src/ui/item-sheet/popover.tsx`, and share the detail fields with `src/ui/item-sheet/index.tsx`.
- [ ] Create `e2e/desktop.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] From 1024 px up, lay out the centered pair. The receipt sits on the left and the right pane on the right (preferences 31).
- [ ] With no pick, fill the right pane with the pick content: the invite line, the people, "Not here? Add yourself", and one link row with the link, **Copy**, and **Share** (preferences 25). A visitor can browse the receipt without picking.
- [ ] After a pick, show "Your share" in the right pane with the breakdown open, the pay button inside it, and the people (preferences 26 and 27). The pane has no link row, because the header's **Share** button covers sharing.
- [ ] Keep the header's Home button and **Share** button (preferences 28).
- [ ] Draw the rows as the phone does. Each unit is its own row at the unit price, with about 14 px text, a 16 px circle, a 44 px tap target, and no × (preferences 19, 20, and 21).
- [ ] Draw Bundles as the phone does. They start closed, the chevron sits in the header's leading slot, and a closed Bundle shows a gray "N unclaimed" (preferences 22 and 23). Nothing on the page is yellow (preferences 15).
- [ ] Open a row's detail as a popover anchored to its line. It holds the phone sheet's fields: the unit price, **Who had it** for that unit, **Evenly**, **By shares**, **By amount**, and **Delete item**, which removes that unit only. Name and price edits apply to the whole Item. The popover flips above the line when there is no room below. Escape and a click outside close it, and focus returns to the line.
- [ ] Show a person's breakdown one line per unit, with no "1 of 3" (preferences 24).
- [ ] Offer no control that edits a Payment handle (preferences 10).
- [ ] Show no stale or wrong frame when the popover opens, closes, or moves to another line, or when the right pane changes from the pick content to "Your share" (preferences 18).
- [ ] Keep the phone layout under 1024 px as `main` has it.

**You see.**

- [ ] At 1440 px, the Topgolf Split shows the receipt and the pick content side by side in the middle of the page. After picking Sam, clicking a Gameplay row opens a popover under its line while "Your share" stays in view in the right pane.

**Seams.**

- [ ] The page at 1440 px and 1024 px through Playwright in `e2e/desktop.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/desktop.spec.ts` gains opening the popover by click and by Enter, closing it with Escape with focus back on the line, a Claim in the popover that updates the right pane, and **Delete item** on one unit of a quantity-3 Item. The cases hold the CI-robustness rule. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At 1440 px, pick Sam, open Bundle 2, and Claim a can from the popover, citing `features/receipt.md`, at trunk and head. Save `desktop-claim.png`. Record how trunk lays out the page. Pass when head shows the centered pair and Sam's Share in the right pane matches `shareBreakdown` to the cent.
- [ ] Lane 2. Shoot desktop frames 1 to 3 at 1440 px and 1024 px in light and dark, citing `features/receipt.md`. Save `desktop-matrix/<frame>.png`. Pass when the page is centered, the popover stays inside the viewport, nothing overlaps, nothing is yellow, and every target is at least 44 px.
- [ ] Run the WebKit frame-timing checks through `motion.mjs` on macOS for the popover and the right pane change (preferences 45). Pass when no frame shows a stale state.

**Feature map.**

- [ ] Update `features/receipt.md` in `verify-receipt-splitter` with the desktop layout and the popover.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads, and LCP on `/s/<id>` at 1440 px.
- [ ] Probe. `npm run size` at trunk and head, and 3 loads of `/s/<id>` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk sizes and LCP first.
- [ ] Rule. Fail if the scripts grow by more than 8 KB brotli or the head LCP median is more than 10 percent over trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2's screenshots into `/tmp/receipt-splitter-review/V2-4-review-<frame>.png`.
- [ ] Save a 30 to 60 second video of the desktop Split page as `/tmp/receipt-splitter-review/V2-4-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-4 and confirms the deploy.

## Ask only for what the link needs on the home page (V2-5)

**Depends on.** None. It branches from `main`, and the root restacks it onto V2-4.

Build from the home frames in `docs/design/receipt-v2/round3.html`.

**Files.**

- [x] Edit `app/index.tsx`, `src/ui/home-copy.ts`, and `src/ui/components/name-chips.tsx`.
- [x] Edit `src/ui/receipt-input/**` and `src/ui/receipt-editor/index.tsx`.
- [x] Create `src/ui/photo-viewer/index.tsx`.
- [x] Edit `e2e/home.spec.ts` and `e2e/scan.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR. *Not recorded.*
- [x] Center the web home in one column, per A, at 1024 px and 1440 px. Give the 1024 px upload box room around its content, per round 3.
- [x] After a scan, show the compact receipt card with the thumbnail, the file name, the Item count, and the total. The parser reads no merchant, so PR 31 shows the file name. Remove the Item list from home.
- [x] Keep the quiet Total check note and the enabled **Create split link** from the bug-fix PR on `fix/pay-note-sheet-flash` when the card replaces the Item list. Items are fixed on the Split page by tapping a line, so home has no **Fix items** button. Home keeps the editor only after a read that leaves an Item problem, through `Scan.fixOnHome` (PR 31), because the Split page has no **Add item** yet.
- [x] Remove the **Example** button under 768 px.
- [x] After a name is added, open a new name input with focus, so that type, Enter, type, Enter adds names with no click. With no names and the first input focused, the next chip says **+ Add**.
- [x] Open the photo viewer when the thumbnail is tapped. The camera button replaces the photo. The viewer closes on Escape, a tap on the scrim, and its close button. Build it in `src/ui/photo-viewer/` so that V2-6b reuses it.

**You see.**

- [x] At 1440 px, the scanned home shows the compact card in the middle of the page, then the Payment handle and the names, and no Item list. Typing "Sam", Enter, "Priya", Enter adds two chips with focus in a third input.

**Seams.**

- [x] The home page through Playwright in `e2e/home.spec.ts` and `e2e/scan.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `e2e/home.spec.ts` gains the names flow by keyboard alone, the **+ Add** chip, and no **Example** button at 390 px. The cases hold the CI-robustness rule. Run `npm run e2e`.
- [x] `e2e/scan.spec.ts` gains a scan that fails the Total check, which shows the quiet note and still creates the link, and the thumbnail opening the viewer. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. At 390 px and 1440 px, scan `e2e/fixtures/srd-1040-exif-rotated.jpg`, enter a Venmo handle and three names by keyboard, and create the link, citing `features/home.md` and `features/scan.md`, at trunk and head. Save `home-flow.png`. Pass when head reaches the link with no click between names and the Split page shows the same Receipt trunk would create.
- [x] Lane 2. Shoot the web home frames and the phone home frames in light and dark, plus a failing Total check with its quiet note, citing `features/home.md`. Save `home-matrix/<frame>.png`. Pass when the column is centered at 1024 px and 1440 px, every frame matches the board, and every target is at least 44 px.

**Feature map.**

- [x] Update `features/home.md` and `features/scan.md` in `verify-receipt-splitter` with the compact card, the quiet Total check note, the names flow, and the viewer.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Brotli bytes of every script `dist/index.html` loads, and LCP on `/` at 390 px and 1440 px.
- [x] Probe. `npm run size` at trunk and head, and 3 loads of `/` at each width at trunk and head, interleaved.
- [x] Baseline. Record the trunk sizes and LCP first.
- [x] Rule. Fail if the scripts grow by more than 5 KB brotli or either head LCP median is more than 10 percent over trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2's screenshots into `/tmp/receipt-splitter-review/V2-5-review-<frame>.png`. *Not kept: `/tmp/receipt-splitter-review/` holds no copy.*
- [ ] Save a 30 to 60 second video of the home flow by keyboard as `/tmp/receipt-splitter-review/V2-5-review.mp4`. *Not kept: `/tmp/receipt-splitter-review/` holds no copy.*
- [x] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done. *Not done: no Bugbot review ran on this repo.*
- [x] Rebased onto current trunk after the verdict, patch-id unchanged.
- [x] The root merges V2-5 after V2-4 and confirms the deploy.

## Store the Receipt photo in the Split's Durable Object (V2-6a)

**Depends on.** None. It branches from `main`, and the root restacks it onto V2-5.

Read ADR 0007 first. It sets the size, the checks, the 14-day delete, and the daily cap rule. V2-6a changes the Worker only. No client sends a photo until V2-6b.

**Files.**

- [x] Create `worker/photo.ts` and `worker/photo.test.ts`.
- [x] Edit `worker/index.ts`, `worker/split-server.ts`, `worker/split-server.test.ts`, `worker/rate-limit.ts`, and `worker/create-cost.test.ts`.
- [x] Edit `src/core/operations.ts` and `src/live/client.ts` for the snapshot's photo flag.
- [x] Edit `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md`.

**Build.**

- [x] In `worker/photo.ts`, take `PUT /api/splits/<id>/photo`. Refuse a missing or wrong Creator secret with 403, a body over 150 KB with 413, and a body without the JPEG start marker or with an EXIF segment with 400. Store the bytes in a `photo` table in the Split's Durable Object. A second PUT replaces the first.
- [x] Serve `GET /api/splits/<id>/photo` with `content-type: image/jpeg`, `x-content-type-options: nosniff`, and `cache-control: private, max-age=3600`. Return 404 when there is no photo or no Split.
- [x] Add a photo flag to the live snapshot, and broadcast it when the photo lands or goes.
- [x] Delete the photo 14 days after the Split is created. The Split's one alarm fires first at that time, deletes the `photo` table, clears the flag, broadcasts it, and then reschedules itself for the Split's expiry. The Split stays.
- [x] Measure the row writes of a create with a photo in `worker/create-cost.test.ts`, about 4 more than today's 12. Set the budgeted writes per create from that count, about 17.
- [x] Set `DAILY_CREATE_CAP` in `worker/rate-limit.ts` to the floor of 25,000 over the budgeted writes per create, 1,000 at the measured 19 plus 3 for each of the 2 tables dropped at expiry. `worker/create-cost.test.ts` asserts that rule, which keeps creates within a quarter of the 100,000 free daily row writes.
- [x] Update ADR 0005 with the new count, the budget, and the cap.

**You see.**

- [x] `npm run test:worker` passes. A `PUT` with a wrong Creator secret returns 403, a 200 KB body returns 413, and a GET after the 14-day alarm returns 404 while the Split still opens. `DAILY_CREATE_CAP` equals the floor of 25,000 over the budgeted writes per create.

**Seams.**

- [x] The photo routes through the worker test harness in `worker/photo.test.ts`, the 14-day delete and expiry in `worker/split-server.test.ts`, and the row writes and the cap rule in `worker/create-cost.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `worker/photo.test.ts` gains each refusal with its status, a replace, and a GET of the stored bytes. Run `npm run test:worker`.
- [x] `worker/split-server.test.ts` gains the alarm deleting the photo at 14 days while the Split stays readable, and the expiry alarm after it. Run `npm run test:worker`.
- [x] `worker/create-cost.test.ts` gains the row writes of a create with a photo as a literal count, and asserts that `DAILY_CREATE_CAP` is the floor of 25,000 over the budgeted writes per create. Run `npm run test:worker`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [x] Lane 1. Regression lane against trunk. Create a Split through the home page and Claim one Item from a second browser, citing `features/join.md`, at trunk and head. Save `create-claim.png`. Pass when both behave the same, because no client sends a photo yet, and the head snapshot carries the photo flag as false.
- [x] Lane 2. Send a PUT of `e2e/fixtures/srd-1040-exif-rotated.jpg`, one of a 140 KB JPEG with the Creator secret, and one without it, then advance the alarm past 14 days, citing `features/photo.md`. Save `photo-api/<case>.png` from each GET opened in a browser. Pass when the EXIF photo gets 400, the forged PUT gets 403, the good PUT stores the bytes and a connected browser sees the flag turn on, and after 14 days the GET returns 404, the flag turns off, and the Split still opens.

**Feature map.**

- [x] Create `features/photo.md` in `verify-receipt-splitter` with the photo routes and how to advance the alarm, and add it to `features/README.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Row writes per create, and the latency of `GET /api/splits/<id>/photo` for a 150 KB photo.
- [x] Probe. `worker/create-cost.test.ts` at trunk and head, and 10 GETs of a stored photo against the lane's `wrangler dev` at head.
- [x] Baseline. Record trunk's 12 row writes per create first. Trunk has no photo route, so the GET gets an absolute budget.
- [x] Rule. Fail if a create with a photo writes more rows than the budget the test sets, if `DAILY_CREATE_CAP` times that budget passes 25,000, or if the median local GET takes over 150 ms.

**Review gate.** None. V2-6a is not review-gated.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done. *Not done: no Bugbot review ran on this repo.*
- [x] Rebased onto current trunk after the verdict, patch-id unchanged.
- [x] The root merges V2-6a after V2-5 and confirms the deploy.

## Send the Receipt photo and show View receipt (V2-6b)

**Depends on.** V2-4, V2-5, and V2-6a. V2-5 (PR 31) and V2-6a (PR 32) are merged.

**Amended after approval.** This section follows **Amendments since approval** and the Worker that PR 32 shipped.

**Files.**

- [ ] Edit `src/ui/receipt-input/photo.web.ts`, `src/draft.ts`, and `app/index.tsx`.
- [ ] Edit `src/ui/split-view/header.tsx`, `src/ui/split-view/receipt-card.tsx`, and `app/s/[id].tsx`.
- [ ] Create `e2e/photo.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] In `src/ui/receipt-input/photo.web.ts`, downscale the photo at scan time to at most 1280 px on its long edge. Encode it as a JPEG through a canvas, so it carries no APP1 segment, which the Worker refuses with 400. Lower the quality in steps until it fits 150 KB.
- [ ] Keep the copy with the draft, so that after a reload before **Create split link** the photo is still sent and the thumbnail still opens the viewer. PR 31 keeps the photo in memory only.
- [ ] After `POST /api/splits` returns, send the copy with `PUT /api/splits/<id>/photo`, `content-type: image/jpeg`, and the Creator secret in `authorization: Bearer <creatorSecret>`. Show the link at once. Take the copy before home clears for its fresh state (preferences 36).
- [ ] Retry a failed upload at most once. The Worker accepts two PUTs per Split (preferences 12), so a further retry gets 429. Give up without a message on any 4xx status.
- [ ] Show **View receipt** on the Split page, phone and desktop, only when the photo flag is set. Place it beside the receipt's title in the receipt card. It opens the V2-5 viewer, and it hides when the flag turns off at 14 days.
- [ ] Say nothing on home about who can see the photo (preferences 13).
- [ ] Show no stale or wrong frame when the viewer opens or closes, or when **View receipt** appears or hides (preferences 18). Nothing is yellow (preferences 15).

**You see.**

- [ ] A Split created from `e2e/fixtures/topgolf-synthetic.png` shows **View receipt** within 2 seconds of the link. Tapping it on a second browser opens the photo. Home is fresh after the create, with no photo.

**Seams.**

- [ ] The flow through Playwright in `e2e/photo.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/photo.spec.ts` gains create, **View receipt** on a second browser, a reload of home before create that keeps the photo and the viewer, home clearing the photo after create, **View receipt** hiding when the flag turns off, and no more than two PUTs after a failed upload. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Scan `e2e/fixtures/topgolf-synthetic.png`, create the link, and open it on a second browser, citing `features/join.md` and `features/photo.md`, at trunk and head. Trunk sends no photo, so record that and gate the head. Save `view-receipt.png`. Pass when the link shows as fast as trunk's, **View receipt** opens the photo on the second browser, and the uploaded body is at most 150 KB.
- [ ] Lane 2. Scan a 12 MP synthetic photo and `e2e/fixtures/srd-1040-exif-rotated.jpg` at 390 px and 1440 px, in light and dark, citing `features/photo.md`. Save `photo-matrix/<case>.png`. Pass when each upload is at most 150 KB with no APP1 segment, the photo reads upright in the viewer, and **View receipt** sits beside the receipt's title at both widths.
- [ ] Run the WebKit frame-timing checks through `motion.mjs` on macOS for the viewer (preferences 45), and the real-iOS census for opening and closing it (preferences 44). Pass when every flagged interaction counts 0.

**Feature map.**

- [ ] Update `features/photo.md` in `verify-receipt-splitter` with the upload after create and **View receipt**.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from the **Create split link** tap to the link on screen, the downscale time at scan, and the uploaded bytes.
- [ ] Probe. Five creates at trunk and head, interleaved, under Playwright mobile emulation with a 4x CPU throttle, timing each step from the page's performance marks.
- [ ] Baseline. Record the trunk create-to-link time first. Trunk has no upload, so the downscale and the bytes get absolute budgets.
- [ ] Rule. Fail if the head create-to-link median is more than 100 ms over trunk's, the downscale median is over 400 ms, or any upload is over 150 KB.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1's `view-receipt.png` and lane 2's screenshots into `/tmp/receipt-splitter-review/V2-6b-review-<case>.png`.
- [ ] Save a 30 to 60 second video of creating a Split and opening the photo on a second browser as `/tmp/receipt-splitter-review/V2-6b-review.mp4`.
- [ ] Post the screenshots, the video, and V2-6a's measured 19 row writes per create in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-6b and confirms the deploy. A production check that needs a new Split uses the handle @test-debug and says so (preferences 54).

## Queued: the bar after a pick

Intent only. A full section with boxes comes before the build. After someone picks their name, the collapsed bar shows "Your share" with an up-arrow that pulls up their breakdown (preferences 26). The bar has no link row, because the header's **Share** button covers sharing. The pay button stays in the expanded breakdown, not in the bar (preferences 27). It builds on `fix/flash-root`.

## Queued: Add Item on the Split page

Intent only. A full section with boxes comes before the build. Anyone in the Split can add a fully new Item from the Split page (preferences 30). The add is a manual receipt change, so History lists it and Revert removes it (preferences 3 and 29). With **Add item** on the Split page, home no longer needs the editor that `Scan.fixOnHome` keeps after a bad read.

Who may add is an open question for the operator. The recommendation is anyone in the Split, with the new Item outside every Bundle, because **Out of scope** keeps adding an Item to a Bundle out.

## Queued: History on home

Intent only. A full section with boxes comes before the build. Home lists the past Splits stored on this device only, and tapping one opens its share link (preferences 37). This is separate from the History on the Split page, which lists payments and manual receipt changes (preferences 29).

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] A cleanup PR at the tip closes every open note in `notes.md`. One gates lane and one audit.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

The design questions were settled by three rounds of mockups, not by code prototypes. Round 3 is in `docs/design/receipt-v2/`, and its earlier rounds are in `/tmp/redesign/boards/`, outside the repository.

- PR 22 (`fix/discount-total`) measured the Topgolf receipt through the real OCR pipeline. Its reading after the fix has the two Bundle discounts, Tax $4.94, Tip $32.26, and a passing Total check, so V2-2 starts from a correct amount and changes only the structure.
- The Share figures in V2-1's **You see** come from the arithmetic in ADR 0006 and are not yet produced by code. V2-1's tests prove them.
- Unproven. The indent rule has no frame on the board. V2-3's review gate is its first picture.
- Unproven. The 150 KB cap at 1280 px is an estimate for a readable receipt photo. V2-6b lane 2 measures it on a 12 MP photo.

## Appendix B. Alternatives rejected

- One PR for the photo. The Worker half has no interaction and can ship first, and each half fits one owner, so V2-6a and V2-6b split it.
- One PR for the Bundle model, the parser, and the schema change, as first suggested. A rollback of that PR would land on a Worker that cannot read version 2 rows, and every Split with a Bundle would close with code 4500. Splitting the reader (V2-1) from the writer (V2-2) makes each deploy safe to roll back.
- One PR for the whole Split page display. The phone receipt and the desktop layout are separate surfaces with separate frames, and together they pass the 300k-token size for one owner. V2-3 and V2-4 each end in screenshots the operator can judge alone.
- A `bundles` list on the Receipt, folding the discount into Item prices, an optional `items?` on every Adjustment, and keeping the header as an Item. ADR 0006 records why each lost.
- R2 for the photo. ADR 0007 records why.
- Uploading the photo inside `POST /api/splits`. The link would wait on the upload over a slow phone connection, and the 32 KB create body cap would have to grow.
- A **Fix items** button on the compact card, and showing the Item list on home when the Total check fails. The operator ruled that a failing Total check blocks nothing and that Items are fixed on the Split page.
- Keeping the photo for the Split's whole life on the Workers Paid plan. The operator chose the Free plan, so ADR 0007 deletes the photo after 14 days.

## Appendix C. Risks

- A schema change on live data. It lands in V2-1 and V2-2. Production holds real Splits at version 1, and every merge deploys at once. Only a Split with a Bundle is written as version 2, so every other Split stays readable by any Worker. The owners watch the golden rows, lane 2 of V2-2 reads both versions with the V2-1 Worker, and the root opens live Splits after each deploy. A rollback past V2-1 makes only the Splits with a Bundle unreadable, so after V2-2 deploys the fix for a bad release is a roll forward.
- The photo's size against the Durable Object's limits and the Free plan. It lands in V2-6a. A SQLite-backed Durable Object allows a 2 MB row, and the cap is 150 KB. At the daily cap of 1,000 creates, photos kept 14 days hold about 2.1 GB, and the Splits at their measured size about 0.24 GB, under the Free plan's 5 GB. If the 14-day delete fails, storage grows toward the 5 GB limit, where writes fail, so lane 2 checks the delete. The owner reports the measured bytes per photo.
- The photo adds 7 row writes to a create with one replace, 19 in total. It lands in V2-6a. The daily cap becomes the floor of 25,000 over the budgeted writes per create, 1,000 at a budget of 25, so creates stay within a quarter of the free daily row writes. `worker/create-cost.test.ts` enforces the rule, so a new write fails the test until the cap moves.
- Accessibility of the collapsible Bundles. It lands in V2-3. A header that is not a real button, or a region that stays in the tab order while closed, hides Items from screen reader and keyboard users. The owner tests the header by keyboard in `e2e/receipt.spec.ts` and records the accessibility tree in lane 2.
- A closed Bundle can hide an unclaimed unit. It lands in V2-3. The closed summary carries the flag, so a missing claim shows without opening it.
- A Host may create a link from a misread receipt, because a failing Total check blocks nothing. It lands in V2-5. The quiet note on home and on the Split page names the gap, and anyone fixes a line on the Split page. No PR here adds a block or a highlight for a mismatch.
- The Bundle detector misreads a $0.00 line, such as a free refill, as a header. It lands in V2-2. A group forms only when a discount echoes the header, prints a percent, and a run of Items under the header matches it within 1 cent, so a lone $0.00 line stays an Item. An echoing discount with no percent, or an OCR-garbled one, stays receipt-wide. A coincidental run can pull a nearby Item into a Bundle. A $0.00 modifier inside a group replaces the open header and drops the Bundle, which fails safe to receipt-wide. The bench run reports any change.
- The photo shows card digits and anything else the receipt prints. It lands in V2-6b. The operator accepted it, with no extra line on home. The server refuses EXIF, and the photo is deleted after 14 days.

## Appendix D. Links and reading list

- Read `CONTEXT.md`, `docs/adr/0001` through `0007`, and `docs/plans/receipt-splitter-v1.md` before editing.
- Read `docs/design/receipt-v2/README.md` and `round3.html` in every frame before V2-3, V2-4, V2-5, and V2-6b. The README wins over the board.
- Read `docs/design/split/README.md` before V2-3, for the Split page decisions that still hold.
- Read `/tmp/redesign/parse-pr.md` before V2-2, for how PR 22 reads the Topgolf receipt.
- Read `https://developers.cloudflare.com/durable-objects/platform/limits/` and `https://developers.cloudflare.com/durable-objects/platform/pricing/` before V2-6a.
- Run `/how` at the start of V2-1 and V2-6a, because they join the Share math and the Worker to new state.
- Run `/interrogate` on V2-1 before its PR opens, because the stored shape is the hardest part to change later.
- Keep a decision trail per `/show-me-your-work` in `docs/plans/receipt-splitter-v2.trail.tsv`, and commit it with the last PR.
