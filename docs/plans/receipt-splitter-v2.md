# Receipt Splitter v2 plan

This program rebuilds how the live site shows a Receipt, after launch, from round 3 of the operator's mockups.
Friends read a receipt by quantity and Bundle instead of a flat list, the Host's home page asks only for what the link needs, and everyone can view the Receipt photo.
The rules it enforces are that no deploy makes a live Split unreadable and that no Share goes out until the Total check passes.
The PRs, in stack order, are V2-1, V2-2, V2-3, V2-4, V2-5, and V2-6.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`, as v1 did. The root builds and verifies one linear stack on `main`, bottom-up, and merges each PR on a clean verdict at its exact head plus green CI. Every merge to `main` deploys to production at `app.splitwith.workers.dev`, so the root confirms each deploy before the next merge. V2-3, V2-4, V2-5, and V2-6 change an interaction and stop at merge-ready for the operator's review gate.

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

**Out of scope.** Native iOS and Android builds. Claiming a whole Bundle from its header, because the operator ruled the header has no control. Adding an Item to a Bundle or making a Bundle by hand. Bundles without a discount. Editing or cropping the photo. Storing the photo in R2. Detecting Bundles on receipts that print no $0.00 header. A photo for a Split created before V2-6.

**Decisions.**

- `docs/design/receipt-v2/README.md` and `round3.html` are the approved design. The README's indent rule and operator picks win over the board.
- `docs/adr/0006-bundle-discount-is-a-scoped-adjustment.md` models a Bundle as an Adjustment of kind `bundleDiscount` that names its Items.
- `docs/adr/0007-receipt-photo-stored-with-the-split.md` stores one downscaled JPEG in the Split's Durable Object and amends ADR 0001.
- `docs/adr/0004-one-durable-object-per-split.md`, section **Stored Split versions**, makes the `schemaVersion` bump and migration mandatory. V2-1 ships the reader of version 2 one deploy before V2-2 writes it.
- `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md` sets the row-write budget that V2-6 measures again.
- `CONTEXT.md` gains **Bundle** and **Receipt photo** and redefines **Adjustment** and **Share**.
- The operator's rulings of 2026-10-01 in `~/.claude/orchestrate/receipt-splitter/preferences.md`, from "Turnstile removed" on, bind every PR.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write this exact text into the standing objective and restate it in your todolist. "Run docs/plans/receipt-splitter-v2.md under autopilot-stack. Build V2-1 through V2-6 as one linear stack on main, in that order. A PR is verified only when its unit, live, and perf boxes are all checked, and tests alone are not sufficient verification. The root merges each PR bottom-up on a clean verdict at its exact head plus green CI, and confirms the production deploy before the next merge. V2-3, V2-4, V2-5, and V2-6 also wait at merge-ready for the operator's review gate. Each PR's test runs fit in 30 minutes. Done when every PR is verified, rebased on current main, merged, and deployed."
- [ ] Read these at program start. Re-read them at every tick.
  - [ ] `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `~/.claude/skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify-receipt-splitter/SKILL.md`
  - [ ] `~/.claude/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `~/.claude/skills/tdd/SKILL.md`
  - [ ] `~/.claude/skills/spec-review/SKILL.md`
  - [ ] `~/.claude/skills/emil-design-eng/SKILL.md`, `~/.claude/skills/apple-design/SKILL.md`, and `~/.claude/skills/mobile-native/SKILL.md` for V2-3 to V2-6
  - [ ] `~/.claude/skills/animate/SKILL.md` and `~/.claude/skills/review-animations/SKILL.md` for V2-3 to V2-6
  - [ ] `~/.claude/skills/unslop/SKILL.md` for the UI text of V2-3 to V2-6
  - [ ] `~/.claude/skills/principle-model-the-domain/SKILL.md` and `~/.claude/skills/principle-type-system-discipline/SKILL.md` for V2-1 and V2-2
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a status message to the operator in chat, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, open notes and their fixers, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner is a background `poteto-agent` with `isolation: "worktree"` on the model `~/.agents/pstack-models.md` names for its role, at medium effort per the operator's ruling. At most `max parallel` owners run at once. Queue the rest.
- [ ] Follow this dependency graph. Each PR branches from the PR above it in the stack. Start dependent work only after its parent reaches a verified head.
  - [ ] V2-1 is first and branches from `main`.
  - [ ] V2-2 after V2-1. V2-2 merges only after V2-1's deploy is live in production.
  - [ ] V2-3 after V2-2.
  - [ ] V2-4 after V2-3.
  - [ ] V2-5 needs only `main`. Its owner may start at once, and the root restacks it onto V2-4.
  - [ ] V2-6 after V2-4 and V2-5.
- [ ] Hold the file boundaries.
  - [ ] V2-1 touches only `src/core/**`, `scripts/golden-splits.mjs`, `worker/**` tests, and the one switch in `src/ui/split-view/receipt-card.tsx` that the new kind breaks.
  - [ ] V2-2 touches only `src/parse/**`, `src/draft.ts`, `src/draft.test.ts`, `src/core/parse.ts`, `src/core/split.ts`, `src/core/golden/**`, `src/ui/receipt-editor/**`, `e2e/fixtures/**`, and `bench/**`.
  - [ ] V2-3 touches only `app/s/[id].tsx`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `src/ui/split-copy.ts`, `src/ui/components/**`, `e2e/claim.spec.ts`, `e2e/receipt.spec.ts`, and `features/**` in `verify-receipt-splitter`.
  - [ ] V2-4 touches only `app/s/[id].tsx`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `e2e/desktop.spec.ts`, and `features/**` in `verify-receipt-splitter`.
  - [ ] V2-5 touches only `app/index.tsx`, `src/ui/home-copy.ts`, `src/ui/receipt-input/**`, `src/ui/receipt-editor/**`, `src/ui/components/**`, `src/ui/photo-viewer/**`, `e2e/home.spec.ts`, `e2e/scan.spec.ts`, and `features/**` in `verify-receipt-splitter`.
  - [ ] V2-6 touches only `worker/**`, `src/core/operations.ts`, `src/live/**`, `src/draft.ts`, `src/ui/receipt-input/**`, `src/ui/photo-viewer/**`, `src/ui/split-view/**`, `app/index.tsx`, `app/s/[id].tsx`, `src/ui/home-copy.ts`, `src/ui/split-copy.ts`, `e2e/photo.spec.ts`, `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md`, and `features/**` in `verify-receipt-splitter`.
- [ ] Hold the review gate. V2-3, V2-4, V2-5, and V2-6 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Commit locally and never push. A verifier checks out the owner's local SHA, which every worktree reaches through the shared object store.
- [ ] Draft the PR body at `/tmp/swarm-<PR>/owner/pr-body.md`.
- [ ] On a clean verdict, the root pushes that exact SHA once. The root then opens the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] CI runs once, on the verified commit. A CI failure goes back to the owner like a lane `FAIL`.
- [ ] Run `npm run lint` and `npm run typecheck` before the verdict. Commit with hooks on.
- [ ] Write tests through `/tdd` at the PR's **Seams**.
- [ ] Hold the CI-robustness rule from v1 in every new e2e case. Take no action before the page hydrates. Never assert a value that is already on screen before the action that should change it. Run each new case under a 4x CPU throttle before the verdict.
- [ ] Test logic, not looks. No test pins a style value. The screenshot matrix and the operator's review prove the UI.
- [ ] Never commit `topgolf-receipt.webp` or any real receipt photo. Tests and lanes use `src/parse/fixtures/topgolf.tsv` and `e2e/fixtures/topgolf-synthetic.png`, which V2-2 draws from that file's text.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Run `/spec-review` against this plan's PR section before the code-ready report. Fix every Spec finding.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] Hold the verification budget of 2026-10-01. Each PR gets 30 minutes of test runs at most. Gates are lint, typecheck, unit, worker, and e2e. Mutants cover logic only, at most about 15 per PR. The live check is the PR's two lanes in one pass of 15 minutes or less. Perf is `npm run size` plus LCP over 3 loads each at trunk and head, interleaved, unless the PR names another metric.
- [ ] At the owner's merge-ready local head SHA, run the swarm per `~/.claude/skills/swarm/SKILL.md`. One gates and perf lane. One live lane that runs the PR's **Verify, live** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Lanes return `PASS`, `PASS+NOTES`, or `FAIL`. `FAIL` is a real defect or new logic without a test that fails for it. Clean when no lane fails. `FAIL` findings go back to the owner.
- [ ] Each note names its fixer, the next PR touching those files or the cleanup PR, and goes in `~/.claude/orchestrate/receipt-splitter/notes.md`.
- [ ] Append each clean PR to the stack on `main` in order. After any restack, compare `git patch-id` of each PR's diff against its value at the verdict SHA, per `~/.claude/skills/poteto-mode/playbooks/shipping.md`. An unchanged patch-id keeps the verdict. A changed one gets a fresh swarm.
- [ ] Merge bottom-up with `--match-head-commit` pinned to the verified head. After each merge, wait for the deploy job on `main` to pass, then load `https://app.splitwith.workers.dev/` and one live Split. A failed deploy or an unreadable Split stops the program and goes to the operator.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head, with its own app instance and port per `verify-receipt-splitter`. Drive only through `verify-receipt-splitter`.

- [ ] `git checkout <head SHA>`.
- [ ] Run `npm ci`, then the `verify-receipt-splitter` launch command, which exports the web build and starts `npx wrangler dev` on the lane's own port. Wait for its doctor command to report ready.
- [ ] Deliver input only through the verification skill's drive commands. Read-only diagnostics are the doctor command, the browser console log, the network log, and `npx wrangler dev` output.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Read Bundles in the Split model (V2-1)

**Depends on.** None.

V2-1 adds the Bundle to the domain and teaches every reader of a stored Split to read `schemaVersion: 2`. It writes nothing new. No Split can hold a Bundle until V2-2, so the Worker keeps writing version 1. A rollback of V2-2 then lands on a Worker that still reads version 2.

**Files.**

- [ ] Edit `src/core/split.ts`, `src/core/parse.ts`, `src/core/shares.ts`, and `src/core/operations.ts`.
- [ ] Edit `src/core/shares.test.ts`, `src/core/operations.test.ts`, and `src/core/parse.test.ts`.
- [ ] Edit `scripts/golden-splits.mjs`, and create `src/core/golden/v2-1.json`.
- [ ] Edit `src/ui/split-view/receipt-card.tsx` only where the new kind fails to compile.

**Build.**

- [ ] In `src/core/split.ts`, add `bundleDiscount` to `ADJUSTMENT_KINDS`. Make `Adjustment` a union where only `kind: "bundleDiscount"` carries `bundle` with a `name` and `items` of type `NonEmpty<ItemId>`, per ADR 0006. No other kind can carry `bundle`.
- [ ] In `src/core/parse.ts`, read `schemaVersion` 1 and 2. Version 1 migrates to the in-memory Split unchanged. Refuse a `bundleDiscount` whose Items are missing, repeated, or in another Bundle, and refuse a positive Bundle discount. Refuse `bundleDiscount` in a version 1 row and in a create request, because nothing writes one yet.
- [ ] Keep the stored version at 1. Write it from one constant in `src/core/split.ts`, which V2-2 changes to 2.
- [ ] In `src/core/shares.ts`, divide each Bundle discount among the claimers of its Items' units, in proportion to the unit prices. Divide the other Adjustments in proportion to each Participant's Items after Bundle discounts. Cents of a Bundle discount on an unclaimed unit count as Unclaimed. The Shares plus Unclaimed still equal the total to the cent.
- [ ] In `src/core/operations.ts`, make deleting an Item drop it from its Bundle in the same Change, and make deleting a Bundle's last Item remove the Bundle discount in the same Change. One Revert restores both.
- [ ] Add `v2-1.json` to `src/core/golden/` through `node scripts/golden-splits.mjs`, holding the Topgolf Receipt with two Bundles at version 2.
- [ ] Let the current Split page show a Bundle discount as a plain discount row. V2-3 draws the Bundle.

**You see.**

- [ ] `npm test -- src/core` passes, and `src/core/parse.test.ts` reads every golden row, `v2-1.json` included. For the Topgolf Split with Priya on all of Bundle 1 and Jason on Gameplay and Bundle 2, Priya's Share is $49.52 and Jason's is $157.77. The same Claims under v1's math give Priya $52.21.

**Seams.**

- [ ] `parseSplit`, `computeShares`, `shareBreakdown`, and `applyOperation`, through `src/core/parse.test.ts`, `src/core/shares.test.ts`, and `src/core/operations.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/core/shares.test.ts` gains the Topgolf case above with literal cents, a Bundle with an unclaimed unit, and a property check that Shares plus Unclaimed equal the total over random Claims. Run `npm test -- src/core`.
- [ ] `src/core/operations.test.ts` gains deleting a Bundle Item, deleting the last one, and reverting each. Run `npm test -- src/core`.
- [ ] `src/core/parse.test.ts` gains each refusal above and reads every file in `src/core/golden/`. Run `npm test -- src/core` and `npm run test:worker`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Create a Split with `POST /api/splits` from the Receipt that `parseReceipt` reads from `src/parse/fixtures/topgolf.tsv`, Claim three Items from two browsers, and reload, citing `features/claim.md`, at trunk and head. Save `claim-flow.png`. Pass when head shows the same Shares as trunk to the cent, because no Split holds a Bundle yet, and no connection closes with code 4500.
- [ ] Lane 2. Load the `v2-1.json` golden row into a local `SplitServer` through the worker test harness and open it in a browser, citing `features/live.md`. Save `bundle-row.png`. Pass when the Split opens, both Bundle discounts show as discount rows, and Priya's Share reads $49.52.

**Feature map.**

- [ ] Update `features/live.md` in `verify-receipt-splitter` with how to seed a golden row into a local Split.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time per `computeShares` call from `src/core/shares.bench.ts`, and brotli bytes of every script `dist/index.html` loads.
- [ ] Probe. `npm run bench:core` and `npm run size` at trunk and head, interleaved three times.
- [ ] Baseline. Record the trunk numbers first.
- [ ] Rule. Fail if the median `computeShares` time is more than 10 percent over trunk's, or the scripts grow by more than 2 KB brotli.

**Review gate.** None. V2-1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-1, confirms the deploy, and opens three live Splits made before it in production.

## Detect Bundles when reading a receipt (V2-2)

**Depends on.** V2-1, deployed to production.

**Files.**

- [ ] Edit `src/parse/index.ts`, `src/parse/lines.ts`, and `src/parse/index.test.ts`.
- [ ] Edit `src/draft.ts` and `src/draft.test.ts`.
- [ ] Edit `src/core/parse.ts`, `src/core/split.ts`, and `src/core/parse.test.ts`.
- [ ] Create `src/core/golden/v2-2.json`.
- [ ] Edit `src/ui/receipt-editor/index.tsx` only to keep Bundles whole through a home edit.
- [ ] Edit `e2e/fixtures/make-fixtures.py`, and create `e2e/fixtures/topgolf-synthetic.png`.

**Build.**

- [ ] In `src/parse/index.ts`, open a Bundle at an Item line with words and a price of $0.00. Collect the Items under it. Close it at a receipt-level discount whose label echoes the header's name, using the existing `echoes` token match against the open header. The discount becomes a `bundleDiscount` Adjustment, and the header line becomes the Bundle's name, not an Item.
- [ ] Leave the reading as it is when no discount closes the group. The $0.00 header stays an Item, as today.
- [ ] Keep the Total check deciding between readings, as PR 22 does. Bundles change no amount, so a passing reading still passes.
- [ ] In `src/draft.ts`, carry Bundles through a read, a price edit, a reload, and `splitRequest`. Deleting a Bundle Item on home follows the rule from V2-1.
- [ ] Draw `e2e/fixtures/topgolf-synthetic.png` with `e2e/fixtures/make-fixtures.py` from the lines of `src/parse/fixtures/topgolf.tsv`. It holds no payment lines. Confirm that scanning it on home reads the same Receipt as the TSV, or report the difference.
- [ ] In `src/core/parse.ts`, accept `bundleDiscount` in a create request. Change the stored-version constant to 2 and write `v2-2.json` through `node scripts/golden-splits.mjs`.

**You see.**

- [ ] `parseReceipt` on `src/parse/fixtures/topgolf.tsv` returns Gameplay, two Bundles named "Beer Bucket" with four Items each, the discounts -$4.51 and -$4.63 as `bundleDiscount`, Tax $4.94, Tip $32.26, Subtotal $179.23, Total $207.29, and a passing Total check.

**Seams.**

- [ ] `parseReceipt` in `src/parse/index.test.ts`, the draft through `src/draft.test.ts`, and `parseCreateSplitRequest` in `src/core/parse.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/parse/index.test.ts` gains the full Topgolf Receipt with literal values, a $0.00 header with no echoing discount that stays an Item, and two Bundles with the same name that stay apart. Run `npm test -- src/parse`.
- [ ] `src/draft.test.ts` gains Bundles carried through a reload and into `splitRequest`. Run `npm test -- src/draft`.
- [ ] `src/core/parse.test.ts` reads `v2-2.json` and every older golden row. Run `npm test -- src/core`.
- [ ] Run `npm run bench -- --parser=app` and report each category against trunk. No category drops.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Scan `e2e/fixtures/topgolf-synthetic.png`, create the link, and Claim Bundle 1's Items as Priya, citing `features/scan.md` and `features/claim.md`, at trunk and head. Save `topgolf-split.png`. Pass when trunk shows the discounts spread over everyone and head shows Priya's Share at $49.52 with Jason on Gameplay and Bundle 2.
- [ ] Lane 2. Create a Split with no Bundle at head and open it with a Worker built from V2-1's merge commit, citing `features/live.md`. Save `rollback-read.png`. Pass when the V2-1 Worker reads both a version 1 row and a version 2 row with no close code 4500.

**Feature map.**

- [ ] Update `features/scan.md` in `verify-receipt-splitter` with the Topgolf fixture and its expected Bundles.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total `parseReceipt` time over the bench set, and brotli bytes of every script `dist/index.html` loads.
- [ ] Probe. `npm run bench -- --parser=app` with its timing, and `npm run size`, at trunk and head, interleaved three times.
- [ ] Baseline. Record the trunk numbers first.
- [ ] Rule. Fail if the median parse time is more than 10 percent over trunk's, or the scripts grow by more than 2 KB brotli.

**Review gate.** None. V2-2 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-2 after V2-1's deploy is live, then confirms its own deploy.

## Show the receipt by quantity and Bundle on the Split page (V2-3)

**Depends on.** V2-2.

Build from the phone frames in `docs/design/receipt-v2/round3.html`, and read its `README.md` first. The README's indent rule wins over the board. Desktop keeps today's layout until V2-4.

**Files.**

- [ ] Edit `src/ui/split-view/receipt-card.tsx`, `src/ui/split-view/model.ts`, and `src/ui/split-view/model.test.ts`.
- [ ] Edit `src/ui/item-sheet/index.tsx`, `src/ui/split-copy.ts`, and `app/s/[id].tsx`.
- [ ] Create `e2e/receipt.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] Start every Item row with a quantity column, with tabular figures. Remove the quantity from the name.
- [ ] Remove the × from every row. A row tap opens the Item sheet.
- [ ] Draw a Bundle as C's card with B's collapse. Its header shows the Bundle's name, a summary such as "6 drinks · 10% off", and its net price. The header has no claim circle. Closed, it shows who had what inside it. Open, it lists its Items and then its discount.
- [ ] Hold the indent rule. Each child's quantity lines up with the left edge of the header's name text. A light vertical line runs from under the header's quantity down beside the children.
- [ ] Make the header a button with `aria-expanded` and `aria-controls` naming the region of its Items. Its label reads the name, the summary, and the state, such as "Beer Bucket, 6 drinks, 10% off, collapsed". Enter and Space toggle it. Focus stays on the header.
- [ ] Animate the open and close with the sheet's spring from v1, and cross-fade under reduced motion.
- [ ] Build C's Item sheet on the phone, with the name, the quantity stepper, the price, a line such as "In Beer Bucket. Its 10% off takes $2.19 off this line." for a Bundle Item, **Who had it**, **Evenly**, **By shares**, **By amount**, and **Delete item**.
- [ ] Set the default states. The pick sheet opens first, every Bundle is collapsed, and nothing is selected.
- [ ] Show the yellow flag on an unclaimed unit inside an open Bundle, and on a closed Bundle's summary when it holds one.

**You see.**

- [ ] On a 390 px phone, the Topgolf Split shows Gameplay and two collapsed rows reading "Beer Bucket, 6 drinks · 10% off" and "Beer Bucket, 6 drinks · 10% off". Tapping one opens it in place, with "3 Guinness Draught 14.9oz Can" indented under "Beer Bucket".

**Seams.**

- [ ] The row model in `src/ui/split-view/model.test.ts`, which turns a Receipt into rows and Bundles, and the page through Playwright in `e2e/receipt.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/ui/split-view/model.test.ts` gains the Topgolf rows, a Bundle's summary with its drink count, and the flag state of a Bundle with one unclaimed unit. Run `npm test -- src/ui`.
- [ ] `e2e/receipt.spec.ts` gains opening a Bundle by keyboard, checking `aria-expanded`, opening a Bundle Item's sheet, and deleting it from there. The case holds the CI-robustness rule. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the Topgolf Split at 390 px, pick Sam, open Bundle 1, Claim the Guinness, and delete one Item from its sheet, citing `features/claim.md`, at trunk and head. Save `bundle-claim.png`. Pass when trunk shows the flat list and head shows Sam's Share matching `shareBreakdown` to the cent, the deleted Item gone from both browsers, and a Revert bringing it back.
- [ ] Lane 2. Shoot the screenshot matrix at 390 px, citing `features/claim.md`. Capture phone frames 1 to 5 in light and dark, plus VoiceOver's or the accessibility tree's reading of a Bundle header. Save `receipt-matrix/<frame>.png`. Pass when each frame matches the board and the indent rule, no text overflows, and every target is at least 44 px.

**Feature map.**

- [ ] Create `features/receipt.md` in `verify-receipt-splitter` with how to open, close, and read a Bundle, and add it to `features/README.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads, LCP on `/s/<id>`, and the frame time of opening a Bundle under a 4x CPU throttle.
- [ ] Probe. `npm run size` at trunk and head, 3 loads of `/s/<id>` at trunk and head, interleaved, and a Performance trace of 5 Bundle toggles at head.
- [ ] Baseline. Record the trunk sizes and LCP first. Trunk has no Bundle, so the toggle gets an absolute budget.
- [ ] Rule. Fail if the scripts grow by more than 10 KB brotli, the head LCP median is more than 10 percent over trunk's, or any toggle frame takes over 16 ms at the throttle.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2's screenshots into `/tmp/receipt-splitter-review/V2-3-review-<frame>.png`.
- [ ] Save a 30 to 60 second video of opening a Bundle, claiming in it, and deleting from the Item sheet as `/tmp/receipt-splitter-review/V2-3-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-3 after V2-2 and confirms the deploy.

## Center the Split page on desktop with a popover and a right pane (V2-4)

**Depends on.** V2-3.

Build from the desktop frames in `docs/design/receipt-v2/round3.html`.

**Files.**

- [ ] Edit `app/s/[id].tsx` and `src/ui/split-view/**`.
- [ ] Create `src/ui/item-sheet/popover.tsx`.
- [ ] Create `e2e/desktop.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] From 1024 px up, lay out A's centered pair. The receipt sits on the left and a right pane on the right. With no pick, the right pane is the pick list. After a pick, it is your Share and the people.
- [ ] Open an Item's detail as a popover anchored to its line, with the same fields as the phone sheet. It flips above the line when there is no room below. Escape and a click outside close it, and focus returns to the line.
- [ ] Keep the phone layout under 1024 px unchanged from V2-3.

**You see.**

- [ ] At 1440 px, the Topgolf Split shows the receipt and the pick list side by side in the middle of the page. Clicking Gameplay opens a popover under its line while "You owe" stays in view.

**Seams.**

- [ ] The page at 1440 px and 1024 px through Playwright in `e2e/desktop.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/desktop.spec.ts` gains opening the popover by click and by Enter, closing it with Escape with focus back on the line, and a Claim in the popover that updates the right pane. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At 1440 px, pick Sam, open Bundle 2, and Claim a can from the popover, citing `features/receipt.md`, at trunk and head. Save `desktop-claim.png`. Pass when trunk shows the phone layout stretched and head shows the centered pair with Sam's Share updated in the right pane.
- [ ] Lane 2. Shoot desktop frames 1 to 3 at 1440 px and 1024 px in light and dark, citing `features/receipt.md`. Save `desktop-matrix/<frame>.png`. Pass when the page is centered, the popover stays inside the viewport, and nothing overlaps.

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
- [ ] The root merges V2-4 after V2-3 and confirms the deploy.

## Ask only for what the link needs on the home page (V2-5)

**Depends on.** None. It branches from `main`, and the root restacks it onto V2-4.

Build from the home frames in `docs/design/receipt-v2/round3.html`.

**Files.**

- [ ] Edit `app/index.tsx`, `src/ui/home-copy.ts`, and `src/ui/components/name-chips.tsx`.
- [ ] Edit `src/ui/receipt-input/**` and `src/ui/receipt-editor/index.tsx`.
- [ ] Create `src/ui/photo-viewer/index.tsx`.
- [ ] Edit `e2e/home.spec.ts` and `e2e/scan.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] Center the web home in one column, per A, at 1024 px and 1440 px.
- [ ] After a scan, show the compact receipt card with the thumbnail, the merchant, the Item count, and the total. Remove the Item list from home.
- [ ] When the Total check fails, show its reason on the card with a **Fix items** button that opens the receipt editor in a sheet. **Create split link** stays blocked until the check passes.
- [ ] Remove the **Example** button under 768 px.
- [ ] After a name is added, open a new name input with focus, so that type, Enter, type, Enter adds names with no click. With no names and the first input focused, the next chip says **+ Add**.
- [ ] Open the photo viewer when the thumbnail is tapped. The camera button replaces the photo. The viewer closes on Escape, a tap on the scrim, and its close button. Build it in `src/ui/photo-viewer/` so that V2-6 reuses it.

**You see.**

- [ ] At 1440 px, the scanned home shows the compact card in the middle of the page, then the Payment handle and the names, and no Item list. Typing "Sam", Enter, "Priya", Enter adds two chips with focus in a third input.

**Seams.**

- [ ] The home page through Playwright in `e2e/home.spec.ts` and `e2e/scan.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/home.spec.ts` gains the names flow by keyboard alone, the **+ Add** chip, and no **Example** button at 390 px. The cases hold the CI-robustness rule. Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains a scan that fails the Total check, a fix through **Fix items**, and the thumbnail opening the viewer. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At 390 px and 1440 px, scan `e2e/fixtures/srd-1040-exif-rotated.jpg`, enter a Venmo handle and three names by keyboard, and create the link, citing `features/home.md` and `features/scan.md`, at trunk and head. Save `home-flow.png`. Pass when head reaches the link with no click between names and the Split page shows the same Receipt trunk would create.
- [ ] Lane 2. Shoot the web home frames and the phone home frames in light and dark, plus a failing Total check, citing `features/home.md`. Save `home-matrix/<frame>.png`. Pass when the column is centered at 1024 px and 1440 px, every frame matches the board, and every target is at least 44 px.

**Feature map.**

- [ ] Update `features/home.md` and `features/scan.md` in `verify-receipt-splitter` with the compact card, **Fix items**, the names flow, and the viewer.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads, and LCP on `/` at 390 px and 1440 px.
- [ ] Probe. `npm run size` at trunk and head, and 3 loads of `/` at each width at trunk and head, interleaved.
- [ ] Baseline. Record the trunk sizes and LCP first.
- [ ] Rule. Fail if the scripts grow by more than 5 KB brotli or either head LCP median is more than 10 percent over trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2's screenshots into `/tmp/receipt-splitter-review/V2-5-review-<frame>.png`.
- [ ] Save a 30 to 60 second video of the home flow by keyboard as `/tmp/receipt-splitter-review/V2-5-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-5 after V2-4 and confirms the deploy.

## Keep the Receipt photo with the Split (V2-6)

**Depends on.** V2-4 and V2-5.

Read ADR 0007 first. It sets the size, the transport, the checks, and the deletion.

**Files.**

- [ ] Create `worker/photo.ts` and `worker/photo.test.ts`.
- [ ] Edit `worker/index.ts`, `worker/split-server.ts`, `worker/split-server.test.ts`, and `worker/create-cost.test.ts`.
- [ ] Edit `src/core/operations.ts` and `src/live/client.ts` for the snapshot's photo flag.
- [ ] Edit `src/ui/receipt-input/photo.web.ts`, `src/draft.ts`, and `app/index.tsx`.
- [ ] Edit `src/ui/split-view/header.tsx`, `src/ui/split-view/receipt-card.tsx`, and `app/s/[id].tsx`.
- [ ] Edit `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md`.
- [ ] Create `e2e/photo.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] In `src/ui/receipt-input/photo.web.ts`, downscale the photo at scan time to at most 1600 px on its long edge as a JPEG. Lower the quality in steps until it fits 300 KB. Keep the copy with the draft so that a reload before **Create split link** keeps it.
- [ ] After `POST /api/splits` returns, send the copy with `PUT /api/splits/<id>/photo` and the Creator secret. Show the link at once. Retry a failed upload twice, then give up without a message.
- [ ] In `worker/photo.ts`, refuse a missing or wrong Creator secret, a body over 300 KB, a body without the JPEG start marker, and a JPEG with an EXIF segment. Store the bytes in a `photo` table in the Split's Durable Object. A second PUT replaces the first.
- [ ] Serve `GET /api/splits/<id>/photo` with `content-type: image/jpeg`, `x-content-type-options: nosniff`, and `cache-control: private, max-age=3600`. Return 404 when there is no photo or no Split.
- [ ] Add a photo flag to the live snapshot, and broadcast it when the photo lands.
- [ ] Show **View receipt** beside the merchant name on the Split page, phone and desktop, only when the flag is set. It opens the V2-5 viewer.
- [ ] Add one line under **Create split link** on home that says everyone with the link can see the photo. Run `unslop` on it.
- [ ] Measure the new row writes per create in `worker/create-cost.test.ts`, and update the arithmetic in ADR 0005 if the per-create budget of 15 no longer holds.

**You see.**

- [ ] A Split created from `e2e/fixtures/topgolf-synthetic.png` shows **View receipt** within 2 seconds of the link. Tapping it on a second browser opens the photo. `PUT` with a wrong Creator secret returns 403, and a 400 KB body returns 413.

**Seams.**

- [ ] The photo routes through the worker test harness in `worker/photo.test.ts`, expiry in `worker/split-server.test.ts`, row writes in `worker/create-cost.test.ts`, and the flow through Playwright in `e2e/photo.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `worker/photo.test.ts` gains each refusal with its status, a replace, and a GET of the stored bytes. Run `npm run test:worker`.
- [ ] `worker/split-server.test.ts` gains the expiry alarm deleting the photo with the Split. Run `npm run test:worker`.
- [ ] `worker/create-cost.test.ts` gains the row writes of a create with a photo, as a literal count. Run `npm run test:worker`.
- [ ] `e2e/photo.spec.ts` gains create, **View receipt** on a second browser, and a reload of home before create that keeps the photo. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Scan `e2e/fixtures/topgolf-synthetic.png`, create the link, and open it on a second browser, citing `features/join.md`, at trunk and head. Trunk has no stored photo, so record that and gate the head. Save `view-receipt.png`. Pass when the link shows as fast as trunk's, **View receipt** opens the photo on the second browser, and the uploaded body is at most 300 KB.
- [ ] Lane 2. Upload a 12 MP synthetic photo and `e2e/fixtures/srd-1040-exif-rotated.jpg`, send a forged PUT without the Creator secret, and advance the expiry alarm, citing `features/photo.md`. Save `photo-matrix/<case>.png`. Pass when the stored photo is at most 300 KB with no EXIF segment, the forged PUT gets 403, and GET returns 404 after expiry.

**Feature map.**

- [ ] Create `features/photo.md` in `verify-receipt-splitter`, and add it to `features/README.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from the **Create split link** tap to the link on screen, the downscale time at scan, and the uploaded bytes.
- [ ] Probe. Five creates at trunk and head, interleaved, under Playwright mobile emulation with a 4x CPU throttle, timing each step from the page's performance marks.
- [ ] Baseline. Record the trunk create-to-link time first. Trunk has no upload, so the downscale and the bytes get absolute budgets.
- [ ] Rule. Fail if the head create-to-link median is more than 100 ms over trunk's, the downscale median is over 400 ms, or any upload is over 300 KB.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1's `view-receipt.png` into `/tmp/receipt-splitter-review/V2-6-review-view-receipt.png`.
- [ ] Save a 30 to 60 second video of creating a Split and opening the photo on a second browser as `/tmp/receipt-splitter-review/V2-6-review.mp4`.
- [ ] Post the screenshots, the video, and the measured row writes per create in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-6 after V2-5 and confirms the deploy, then creates one Split in production and opens its photo.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] A cleanup PR at the tip closes every open note in `notes.md`. One gates lane and one audit.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

The design questions were settled by three rounds of mockups, not by code prototypes. Round 3 is in `docs/design/receipt-v2/`, and its earlier rounds are in `/tmp/redesign/boards/`, outside the repository.

- PR 22 (`fix/discount-total`) measured the Topgolf receipt through the real OCR pipeline. Its reading after the fix has the two Bundle discounts, Tax $4.94, Tip $32.26, and a passing Total check, so V2-2 starts from a correct amount and changes only the structure.
- The Share figures in V2-1's **You see** come from the arithmetic in ADR 0006 and are not yet produced by code. V2-1's tests prove them.
- Unproven. The indent rule has no frame on the board. V2-3's review gate is its first picture.
- Unproven. The 300 KB cap at 1600 px is an estimate for a receipt photo. V2-6 lane 2 measures it on a 12 MP photo.

## Appendix B. Alternatives rejected

- One PR for the Bundle model, the parser, and the schema change, as first suggested. A rollback of that PR would land on a Worker that cannot read version 2 rows, and every Split with a Bundle would close with code 4500. Splitting the reader (V2-1) from the writer (V2-2) makes each deploy safe to roll back.
- One PR for the whole Split page display. The phone receipt and the desktop layout are separate surfaces with separate frames, and together they pass the 300k-token size for one owner. V2-3 and V2-4 each end in screenshots the operator can judge alone.
- A `bundles` list on the Receipt, folding the discount into Item prices, an optional `items?` on every Adjustment, and keeping the header as an Item. ADR 0006 records why each lost.
- R2 for the photo. ADR 0007 records why.
- Uploading the photo inside `POST /api/splits`. The link would wait on the upload over a slow phone connection, and the 32 KB create body cap would have to grow.
- Showing the full Item list on home only when the Total check fails, in place of **Fix items**. It brings back the long home page in the case where the Host most needs focus.

## Appendix C. Risks

- A schema change on live data. It lands in V2-1 and V2-2. Production holds real Splits at version 1, and every merge deploys at once. The owners watch the golden rows, lane 2 of V2-2 reads both versions with the V2-1 Worker, and the root opens live Splits after each deploy. A rollback past V2-1 makes every version 2 Split unreadable, so after V2-2 deploys the fix is a roll forward.
- The photo's size against the Durable Object's limits. It lands in V2-6. A SQLite-backed Durable Object allows a 2 MB row, and the cap is 300 KB. The larger risk is storage, about 27 GB at the daily cap over 60 days, which the Free plan's 5 GB cannot hold. The owner reports the measured bytes per photo, and the operator confirms the plan.
- The photo adds row writes to every create. It lands in V2-6. `worker/create-cost.test.ts` fails if the count passes its budget, and the owner redoes ADR 0005's arithmetic.
- Accessibility of the collapsible Bundles. It lands in V2-3. A header that is not a real button, or a region that stays in the tab order while closed, hides Items from screen reader and keyboard users. The owner tests the header by keyboard in `e2e/receipt.spec.ts` and records the accessibility tree in lane 2.
- A closed Bundle can hide an unclaimed unit. It lands in V2-3. The closed summary carries the flag, so a missing claim shows without opening it.
- Moving the Item list off home hides a failing Total check. It lands in V2-5. **Fix items** keeps the v1 rule that no Share goes out until the check passes. The operator confirms this choice in the review gate.
- The Bundle detector misreads a $0.00 line, such as a free refill, as a header. It lands in V2-2. A group forms only when a discount echoes the header, so a lone $0.00 line stays an Item. The bench run reports any change.
- The photo shows card digits and anything else the receipt prints. It lands in V2-6. The operator accepted it. The home line says the photo is shared, and the server refuses EXIF.

## Appendix D. Links and reading list

- Read `CONTEXT.md`, `docs/adr/0001` through `0007`, and `docs/plans/receipt-splitter-v1.md` before editing.
- Read `docs/design/receipt-v2/README.md` and `round3.html` in every frame before V2-3, V2-4, V2-5, and V2-6. The README wins over the board.
- Read `docs/design/split/README.md` before V2-3, for the Split page decisions that still hold.
- Read `/tmp/redesign/parse-pr.md` before V2-2, for how PR 22 reads the Topgolf receipt.
- Read `https://developers.cloudflare.com/durable-objects/platform/limits/` and `https://developers.cloudflare.com/durable-objects/platform/pricing/` before V2-6.
- Run `/how` at the start of V2-1 and V2-6, because they join the Share math and the Worker to new state.
- Run `/interrogate` on V2-1 before its PR opens, because the stored shape is the hardest part to change later.
- Keep a decision trail per `/show-me-your-work` in `docs/plans/receipt-splitter-v2.trail.tsv`, and commit it with the last PR.
