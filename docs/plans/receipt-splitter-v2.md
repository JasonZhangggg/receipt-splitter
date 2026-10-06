# Receipt Splitter v2 plan

This program rebuilds how the live site shows a Receipt, after launch, from round 3 of the operator's mockups.
Friends read a receipt by quantity and Bundle instead of a flat list, the Host's home page asks only for what the link needs, and everyone can view the Receipt photo.
The rules it enforces are that no deploy makes a live Split unreadable and that a failing Total check blocks nothing.
The PRs, in stack order, are V2-1, V2-2, V2-3, V2-4, V2-5, V2-6a, and V2-6b. V2-7a and V2-7b, server-side receipt reading, were added on 2026-10-03.

**Status at `main` = `fe301a4`.**

- Merged and deployed, in this order: V2-1 as PR 29 (`9e3a34d`), V2-2 as PR 30 (`ade639d`), V2-5 as PR 31 (`f5e5b8e`), V2-6a as PR 32 (`461b37a`), and V2-3 as PR 33 (`2da1e47`).
- Merged beside them: PR 27 (`96abf06`), the bug-fix PR on `fix/pay-note-sheet-flash`. PR 28 (`1440d94`), the quiet Total check note. PR 34 (`967c9aa`), the per-IP daily create limit. PR 35 (`d0cf6ce`), the Split page sheet rebuilt for iOS with the link row, the Home button, and a fresh home after create. [PR 36](https://github.com/JasonZhangggg/receipt-splitter/pull/36) (`19c8e93`), `fix/create-silent`, which makes every Create tap act and keeps the home panel open. [PR 37](https://github.com/JasonZhangggg/receipt-splitter/pull/37) (`fe301a4`), docs only, which adds the receipt-reading research and brings this plan up to rulings 55 to 59.
- In flight. `fix/flash-root` is a local branch, not pushed. It fixes the Split page flashes at their causes.
- Queued, in order: server-side receipt reading as V2-7a then V2-7b, the bar after a pick, quantities follow the receipt (full section below), a home reload that keeps only the payment handles, Add Item on the Split page, Recent splits on home, V2-4, V2-6b, then the open notes in `notes.md`. V2-4 and V2-6b are amended below to the rulings since approval. V2-7a and V2-7b have full sections. The next five have short sections before **Close the program**.
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

- **Preferences 5, 2026-10-03.** A line shown as one row is claimed like any one-line Item, with or without a quantity. **Who had it**, **Evenly**, **By shares**, and **By amount** apply to the whole line. After **Split**, each one-unit row is claimed the same way. This replaces per-unit claims on a quantity line.
- **Preferences 7, 2026-10-02.** Creates are limited to 10 a minute and 50 a UTC day per IP, plus a global cap of 1,000 a UTC day. PR 34 added the daily per-IP limit. V2-6a's cap of 1,000 stands.
- **Preferences 10, 2026-10-02.** Payment handles cannot change after create. The Split page has no handle-edit control.
- **Preferences 12, 2026-10-01.** The Host may upload the Receipt photo at most twice. PR 32 replaces the photo on the second PUT and answers a third with 429.
- **Preferences 15, 2026-10-02.** Nothing is highlighted in yellow. Unclaimed rows, flagged rows, and reasons use secondary gray text. This replaces V2-3's yellow flag.
- **Preferences 17, 2026-10-02.** The keyboard never covers a focused text field, on any page.
- **Preferences 18, 2026-10-02.** No animation shows a stale or wrong state for any frame. That includes an old selection, a flash of the open state, doubled content, and a jump when the keyboard opens or closes.
- **Preferences 58, 2026-10-03.** Quantities follow the receipt. Lines the receipt prints separately stay separate rows. A line printed with a quantity is one row with the quantity in its text, such as "3x", styled like the "6 items" count on a Bundle header. It behaves as any one-line Item (preferences 5). Its detail has a **Split** button that splits it into that many one-unit rows, which then behave as normal one-line Items. This replaces preferences 19, V2-3's one row per unit. It is queued.
- **Preferences 20, 2026-10-02.** Rows use about 14 px text and a 16 px select circle with a 44 px tap target.
- **Preferences 22, 2026-10-02.** The Bundle header's chevron sits in its leading slot, with its tip on the light vertical rule beside the children.
- **Preferences 23, 2026-10-02.** Rows carry no "Unclaimed" tag, because the missing person icon shows it. A collapsed Bundle shows a quiet gray "N unclaimed".
- **Preferences 24, 2026-10-03.** A person's breakdown shows no "1 of 3". It lists what the Split page shows. A quantity line is one line with its quantity, and split rows are separate lines.
- **Preferences 25, 2026-10-02.** "Which one are you?" is the tall pick sheet, and it closes without a pick. It shows the invite line, the people, "Not here? Add yourself", and one link row with the link, **Copy**, and **Share**.
- **Preferences 26, 2026-10-02.** After a pick, the collapsed bar shows "Your share" with an up-arrow and no link row. It is queued.
- **Preferences 27, 2026-10-02.** The pay button stays in the expanded breakdown, not in the collapsed bar.
- **Preferences 28, 2026-10-02.** The Split page header has a Home button that starts a new split. PR 35 built it.
- **Preferences 30, 2026-10-02.** Anyone in the Split can add a fully new Item. This brings a new Item into scope, though not one inside a Bundle. Who may add is still open. It is queued.
- **Preferences 33, 2026-10-02.** The home panel with the payment row, the names, and **Create split link** is always shown, never collapses, and is one surface with Create. A drag moves it and it springs back. PR 36 built it.
- **Preferences 34, 2026-10-02.** A tap on an enabled Create always acts. It creates, or it focuses what is missing and says so. PR 36 built it. The operator approved the wording "Add how to pay you." on 2026-10-03.
- **Preferences 36, 2026-10-02.** After a Split is created, home is fresh. The receipt, the photo, and the names clear, and the payment handles stay. PR 35 built it.
- **Preferences 37, 2026-10-04.** Recent splits, the past Splits stored on this device only, open from an icon at the top right of home, not inline. A tap on an entry opens its link, and the icon hides when there are none. **Recent splits on home** builds it.
- **Preferences 66, 2026-10-04.** On home the dashed **Add receipt** box fills the space between the header and the panel, and its dashed border is a lighter gray. **Recent splits on home** builds it.
- **Preferences 44, 2026-10-02.** The real-iOS census in the iOS Simulator is the deciding gate for UI fixes. Every flagged interaction counts 0 on the fix head.
- **Preferences 45, 2026-10-02.** CI runs WebKit for the functional sheet and claim specs only. WebKit frame timing runs locally through `motion.mjs` on macOS before every UI PR, and Chromium frame timing runs in CI.
- **Preferences 55 to 57, 2026-10-03.** The server may read receipts, with the photo and a third-party model API. This reverses ADR 0001's on-device OCR rule. The API key is a Worker secret behind a same-origin `/api` route, and scans get their own rate limit and daily cap. An eval on real receipts picks the reading path by price to performance. The provider and model change by config, open-weight models with several hosts come first, and a fallback needs no paid model. V2-7a and V2-7b build it.
- **Preferences 60 to 62, 2026-10-03.** The operator approved the reading design. Pass 1 is GLM-5.3-Flash at effort minimal with `/nothink`, the photo, and the OCR lines, in the compact format, on pinned hosts. Pass 2 is GPT-6 Luna at effort low via Azure, only on a failed server check. The current OpenRouter key stays in use and becomes the Worker secret, with no rotation first. An Item whose price includes a discount printed under it shows that discount in its detail line, such as "$2.00 off". V2-7a and V2-7b build it.
- **Preferences 59, 2026-10-03.** A reload of home resets the receipt, the photo, and the names, and keeps the payment handles. Create treats a kept handle as filled, which fixes the bug where a prefilled handle counts as empty until the user types. It is queued.

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
  - [ ] V2-7a needs only `main`. *Not built.*
  - [ ] V2-7b after V2-7a's deploy is live with the secret set. *Built locally on `v2-7b-scan-client`, restacked onto `main` at 629a862 after V2-7a merged as PR 41.*
- [ ] Hold the file boundaries. *Not held for every PR. See each child.*
  - [ ] V2-1 touches only `src/core/**`, `scripts/golden-splits.mjs`, `worker/**` tests, and the one switch in `src/ui/split-view/receipt-card.tsx` that the new kind breaks. *Not held: its PR body lists the files outside this list.*
  - [ ] V2-2 touches only `src/parse/**`, `src/draft.ts`, `src/draft.test.ts`, `src/core/parse.ts`, `src/core/split.ts`, `src/core/golden/**`, `src/ui/receipt-editor/**`, `e2e/fixtures/**`, and `bench/**`. *Not held: its PR body lists the files outside this list.*
  - [ ] V2-3 touches only `app/s/[id].tsx`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `src/ui/split-copy.ts`, `src/ui/components/**`, `e2e/claim.spec.ts`, `e2e/receipt.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not held: its PR body lists the files outside this list.*
  - [ ] V2-4 touches only `app/s/[id].tsx`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `e2e/desktop.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not built.*
  - [ ] V2-5 touches only `app/index.tsx`, `src/ui/home-copy.ts`, `src/ui/receipt-input/**`, `src/ui/receipt-editor/**`, `src/ui/components/**`, `src/ui/photo-viewer/**`, `e2e/home.spec.ts`, `e2e/scan.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not held: its PR body lists the files outside this list.*
  - [x] V2-6a touches only `worker/**`, `src/core/operations.ts` and `src/live/**` for the snapshot's photo flag, `docs/adr/0005-no-turnstile-per-ip-limit-and-daily-cap.md`, `docs/adr/0007-receipt-photo-stored-with-the-split.md`, `CONTEXT.md`, and `features/photo.md`, `features/README.md`, `features/claim.md`, and `features/join.md` in `verify-receipt-splitter`.
  - [ ] V2-6b touches only `src/draft.ts`, `src/ui/receipt-input/**`, `src/ui/photo-viewer/**`, `src/ui/split-view/**`, `app/index.tsx`, `app/s/[id].tsx`, `src/ui/split-copy.ts`, `e2e/photo.spec.ts`, and `features/**` in `verify-receipt-splitter`. *Not built.*
  - [ ] V2-7a touches only `worker/**`, `wrangler.jsonc`, `.dev.vars.example`, `bench/scan/**`, `e2e/fixtures/make-fixtures.py` and the fixtures it draws, `docs/adr/0001-on-device-ocr-no-llm-for-anonymous-use.md`, `docs/adr/0008-server-reads-the-receipt.md`, and `features/scan.md` and `features/README.md` in `verify-receipt-splitter`. *Not built.*
  - [ ] V2-7b touches only `src/core/**`, `scripts/golden-splits.mjs`, `src/scan/**`, `src/draft.ts`, `app/index.tsx`, `src/ui/receipt-input/**`, `src/ui/split-view/**`, `src/ui/item-sheet/**`, `src/ui/receipt-editor/**`, `src/ui/history/**`, `CONTEXT.md`, `e2e/scan.spec.ts`, and `features/scan.md` in `verify-receipt-splitter`. *Not built.*
- [ ] Hold the review gate. V2-3, V2-4, V2-5, V2-6b, and V2-7b change an interaction. They wait for the operator's review in chat with screenshots and a video before merge. *Held for V2-3 and V2-5. V2-4 and V2-6b are not built.*

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

**Changed after it shipped.** The boxes below record what PR 33 shipped. Preferences 58 replaces one row per unit from here on. A line printed with a quantity becomes one row, claimed as a whole, with a **Split** button in its detail. See **Quantities follow the receipt**.

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

**Depends on.** V2-3, `fix/flash-root`, the bar after a pick, quantities follow the receipt, and Add Item on the Split page. It branches from `feat/add-item` at `ee95e6c` and the root restacks it onto `main` once Add Item merges.

**Rulings since approval, 2026-10-04.** These change this section, and the boxes below already follow them.

- Quantities (preferences 58). A quantity line is one row with "3x" in its text, and its popover has **Split into 3**, which leaves three one-unit rows. The split modes apply to the whole line (preferences 5).
- **Add item** (preferences 30). From 1024 px the **Add item** row opens the add form as a popover anchored to that row, not a bottom sheet.
- History. From 1024 px the header's History button opens History as a popover anchored to the button.
- **View receipt** is an icon in the header with the accessible name "View receipt" (preferences 67). It already is, and the photo viewer opens over the page on desktop as it does on the phone.
- Precedent. **Recent splits on home** (PR 50) opens its list from 900 px as a popover anchored to its icon, with a keydown listener for Escape and focus handed back to the icon. V2-4's popovers follow that pattern through one shared popover in `src/ui/components/popover.tsx`, which renders in the page's own layer instead of React Native Web's `Modal`, so the accessibility tree holds one named dialog. Recent splits keeps its own popover. It opens from home's header, where no layer covers the page, so leaving the `Modal` would need a portal or the list's state lifted to the home screen. Its approved look also differs (360 px wide, a hairline border, 8 px padding, flush with the icon), so the move would be a visual change of its own. Its `Modal` already keeps Tab inside.
- Open notes folded in from `notes.md`. A touch on a gliding sheet freezes it at once. A Bundle opens and closes with a CSS `grid-template-rows` transition instead of the main-thread spring. The Split page's wordmark sits in a level-1 heading. Reduced-motion fades use `motion.easeOut`. The Item, Add item, and History sheets close on Escape. A popover opened from the keyboard shows at once, with no entrance.

**Amended after approval.** This section follows **Amendments since approval**. Where the desktop frames in `docs/design/receipt-v2/round3.html` disagree with a ruling, the ruling wins. Build from those frames otherwise.

**Files.**

- [ ] Edit `app/s/[id].tsx`, `src/ui/split-view/**`, and `src/ui/theme.ts` for the 1024 px breakpoint.
- [ ] Create `src/ui/components/popover.tsx`. The Item detail, the add form, and History render their existing content, `ItemSheet`, `AddItemSheet`, and `HistorySheet`, inside it from 1024 px and inside `BottomSheet` below.
- [ ] Create `e2e/desktop.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [ ] From 1024 px up, lay out the centered pair. The receipt sits on the left and the right pane on the right (preferences 31).
- [ ] With no pick, fill the right pane with the pick content: the invite line, the people, "Not here? Add yourself", and one link row with the link, **Copy**, and **Share** (preferences 25). A visitor can browse the receipt without picking.
- [ ] After a pick, show "Your share" in the right pane with the breakdown open, the pay button inside it, and the people (preferences 26 and 27). The pane has no link row, because the header's **Share** button covers sharing.
- [ ] Keep the header's Home button and **Share** button (preferences 28).
- [ ] Draw the rows as the phone does. Rows follow the receipt. A line printed with a quantity is one row with the quantity in its text, such as "3x", styled like the "6 items" count on a Bundle header. A line printed on its own is its own row. Rows have about 14 px text, a 16 px circle, a 44 px tap target, and no × (preferences 58, 20, and 21).
- [ ] Draw Bundles as the phone does. They start closed, the chevron sits in the header's leading slot, and a closed Bundle shows a gray "N unclaimed" (preferences 22 and 23). Nothing on the page is yellow (preferences 15).
- [ ] Open **Add item** and History as popovers anchored to their row and button. Escape and a click outside close them, and focus returns to the trigger. A popover opened with Enter shows at once.
- [ ] Open a row's detail as a popover anchored to its line. It holds the phone sheet's fields: the price, **Who had it**, **Evenly**, **By shares**, **By amount**, **Delete item**, and, on a row with a quantity above 1, **Split**. The split modes apply to the whole line, quantity or not (preferences 5). **Split** turns the row into that many one-unit rows, each claimed as a one-line Item (preferences 58). Name and price edits apply to the whole Item. The popover flips above the line when there is no room below. Escape and a click outside close it, and focus returns to the line.
- [ ] Show a person's breakdown as the Split page shows the rows, with no "1 of 3" (preferences 24). A quantity line is one line with its quantity, and split rows are separate lines.
- [ ] Offer no control that edits a Payment handle (preferences 10).
- [ ] Show no stale or wrong frame when the popover opens, closes, or moves to another line, or when the right pane changes from the pick content to "Your share" (preferences 18).
- [ ] Keep the phone layout under 1024 px as `main` has it.

**You see.**

- [ ] At 1440 px, the Topgolf Split shows the receipt and the pick content side by side in the middle of the page. After picking Sam, clicking a Gameplay row opens a popover under its line while "Your share" stays in view in the right pane.

**Seams.**

- [ ] The page at 1440 px and 1024 px through Playwright in `e2e/desktop.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/desktop.spec.ts` gains opening the popover by click and by Enter, closing it with Escape with focus back on the line, a Claim in the popover that updates the right pane, **Split** on a quantity-3 row that leaves three one-unit rows, **Delete item** on one of those rows, **Add item** from its popover, History from its popover, and no overlap of the receipt, the right pane, and an open popover at 1024 and 1440 px. The cases hold the CI-robustness rule and pass with every `requestAnimationFrame` 200 ms late (`SLOW_RAF=200`). Run `npm run e2e`.

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

## Read the receipt on the server (V2-7a)

**Depends on.** None. It branches from `main`. No client calls the route until V2-7b.

The on-device OCR reads the characters well, but the rule-based parser often gets the receipt wrong (preferences 56). The server reads the receipt instead, with the photo, the OCR lines, and a third-party model API (preferences 55). The operator approved the design on 2026-10-03 (preferences 60 to 62). V2-7a builds the Worker half: the route, the reader, and a harness that scores it. It changes no client code.

Read `docs/research/receipt-extraction-eval.md` first. Its **Compact formats** section is the spec for pass 1's reply and the server's parsing rules. Its **Guards to build** section lists the guards this PR builds. The OpenRouter key stays the current one, and it becomes the Worker secret (preferences 61).

The receipt-reading work is two PRs, not one. The Worker half and its harness alone is about the size of V2-6a plus a scorer, and the client half changes the stored Split shape and the Split page. Together they pass the 300k-token size for one owner (preferences 47). V2-7a has no interaction, so it ships without the operator's review of screenshots.

**Files.**

- [x] Create `docs/adr/0008-server-reads-the-receipt.md`. Edit `docs/adr/0001-on-device-ocr-no-llm-for-anonymous-use.md` with an amendment line.
- [x] Create `worker/scan/route.ts`, `worker/scan/prompt.ts`, `worker/scan/reader.ts`, `worker/scan/format.ts`, and `worker/scan/check.ts`, with `worker/scan/route.test.ts`, `worker/scan/format.test.ts`, and `worker/scan/check.test.ts`.
- [x] Edit `worker/index.ts`, `worker/rate-limit.ts`, `worker/env.d.ts`, and `wrangler.jsonc`. Create `.dev.vars.example`.
- [x] Create `bench/scan/run.mjs`, `bench/scan/score.mjs`, `bench/scan/score.test.ts`, and the synthetic fixtures in `bench/scan/fixtures/`. Edit `e2e/fixtures/make-fixtures.py` to draw them.

**Build.**

- [x] Write ADR 0008. The photo and the on-device OCR lines go to the Worker and on to OpenRouter and its pinned hosts. The key is a Worker secret behind a same-origin `/api` route, and scans have their own rate limit and daily cap. The model and hosts change by config, and the on-device reader stays as the fallback that needs no paid model (preferences 57). Record the operator's approval of the design on 2026-10-03 and link the eval. Add a line to ADR 0001 saying ADR 0008 replaces its on-device OCR rule.
- [x] Take `POST /api/scan` in `worker/scan/route.ts`. The body is JSON with the photo as a JPEG data URL and the OCR text as plain lines. Refuse a request whose `origin` is not the site's own with 403, a body over 1 MB with 413, and an image that is not a JPEG data URL with 400. Forward the data URL as is. The Worker never decodes or re-encodes the image, because Workers Free allows 10 ms of CPU per request.
- [x] Limit scans apart from creates. Give `CreateLimiter`'s per-IP and daily-cap logic in `worker/rate-limit.ts` a limit argument, and run scans under their own names, `scan:<limiterKey(ip)>` and `scan-daily-cap`. Read the limits from `wrangler.jsonc` vars: `SCAN_PER_MINUTE` 6, `SCAN_PER_DAY` 20, and `SCAN_DAILY_CAP` 2,000. Answer a refused scan with 429 and `retry-after`. At about $0.001 a receipt, the cap holds spend near $2 a UTC day.
- [x] Keep every model setting in config (preferences 57). `SCAN_PASS1_MODEL` is `z-ai/glm-5.3-flash`, and `SCAN_PASS1_HOSTS` lists `parasail` and a second host. `SCAN_PASS2_MODEL` is `openai/gpt-6-luna`, and `SCAN_PASS2_HOSTS` lists `azure` and `openai`. Never route to `openai/flex`. The key is the secret `OPENROUTER_API_KEY`. `.dev.vars.example` names it with an empty value.
- [x] Run pass 1 in `worker/scan/reader.ts` per preferences 60. Use GLM at `reasoning.effort = "minimal"`, with `/nothink` at the start of the prompt, the photo, and the OCR lines. Pin one host per call with `provider.order` and `allow_fallbacks: false`. Never sort hosts by latency.
- [x] Retry pass 1 once on the next host in `SCAN_PASS1_HOSTS` when it runs past 25 s or returns an empty reply. Pick the second host from the harness's latency run, and record the choice in the PR body. *The second host is `baseten`. On t1 it took 1.5 to 1.7 s against 2.9 to 3.2 s for `friendli`, and Parasail took 0.6 to 1.9 s.*
- [x] Write the pass-1 prompt in `worker/scan/prompt.ts` from **Compact formats**. Use an invented example, never a real receipt (preferences 53). Tell the model to use per-item promos and skip a summary savings block, and to keep names as printed apart from casing. Ask for no priced `+` lines, unit price, `CNT`, or `?`. *The prompt moves the example's bag fee above the tax and prints `SUB|3235`, because the server check counts fees in the subtotal and the example in **Compact formats** fails it.*
- [x] Parse the reply in `worker/scan/format.ts`. Fold each `-` line into the Item above it, and keep the folded amount with the Item so V2-7b can show it. Keep `d` lines order-level. Open a Bundle on `b|` and add the `>` lines to it, with `>d` as its discount. Make every discount amount negative. Send a decimal after an amount to the detail as a weight. Skip a line that does not parse and count it.
- [x] Check the reading in `worker/scan/check.ts`. Sum the lines and compare them with `SUB` and `TOT`. With `|pre`, compare the subtotal with the items before any `-`, `d`, or `>d` line. Accept a receipt with no tax line. Accept a gap of up to 3 cents, and return the reading with the gap instead of running pass 2.
- [x] Run pass 2 only when the check fails or pass 1's reply is malformed. Use Luna at `reasoning.effort = "low"` on `SCAN_PASS2_HOSTS`, with pass 1's numbered lines. Apply its `fix`, `drop`, `after`, and `add` edits. Refuse a `drop` of an `f` line. `after|<n>` inserts after line n and the `+` and `-` lines under it. Check again.
- [x] Reply 200 with the reading: Items with name, price, quantity, detail lines, and folded discounts, Bundles with their discounts, receipt-level Adjustments, subtotal, total, and the check result. A reading that still fails the check is still a 200. The client shows the quiet Total check note (preferences 6). `worker/scan/format.ts` exports the reply's type. Reply 502 when no pass returns a usable reading.
- [x] Log timings, token counts, cost, the host, and the check result. Never log the image, the OCR lines, a reply's text, or the key.
- [x] Draw the synthetic fixtures with `e2e/fixtures/make-fixtures.py`, each from an invented TSV with a truth file beside it. Cover two items with different discounts printed under them, so a swap shows, a tax-free receipt with a subtotal printed before discounts, a fee and a deposit, per-item promos with a summary savings block, a weighed item, and modifiers on their own lines. t1 is the Topgolf fixture drawn from `src/parse/fixtures/topgolf.tsv`. No fixture comes from a real receipt (preferences 53).
- [x] Build the regression harness. `bench/scan/run.mjs` posts each fixture to a running route a set number of times and scores each reading with `bench/scan/score.mjs`. The scorer reports fully correct, items F1 by amount, the per-item discount split, Bundle members and discounts, and readings wrong with a passing check. It prints one table and exits non-zero below a floor committed beside the fixtures. It also takes a directory and truth file outside the repo, so the owner can score `~/receipts-eval/` locally without committing it.

**You see.**

- [x] A POST of t1 to the route on `wrangler dev` returns both Bundles with their members and discounts, Gameplay outside them, and a passing check. The seventh scan from one IP in a minute gets 429. `node bench/scan/run.mjs` prints its table and passes its floor.

**Seams.**

- [x] The parser, the fold, and pass 2's edits as pure functions in `worker/scan/format.test.ts`, fed invented replies.
- [x] The check in `worker/scan/check.test.ts`.
- [x] The route through the worker test harness in `worker/scan/route.test.ts`, with OpenRouter stubbed at `fetch`.
- [x] The scorer in `bench/scan/score.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `worker/scan/format.test.ts` gains the invented receipt from **Compact formats** parsed to literal Items, Bundles, and Adjustments, an unsigned discount made negative, a weight sent to the detail, a `d` line after an item kept order-level, a skipped bad line counted, and each pass-2 edit, including `after` past a `-` line and a refused `drop` of an `f` line. Run `npm run test:worker`.
- [x] `worker/scan/check.test.ts` gains a pass, a 3-cent gap accepted, a 4-cent gap failed, a `|pre` subtotal, and a receipt with no tax. Run `npm run test:worker`.
- [x] `worker/scan/route.test.ts` gains each refusal with its status, 429 at each limit, a pass-1 timeout retried on the second host, an empty reply retried, pass 2 run only on a failed check, and 502 when every pass fails. Run `npm run test:worker`.
- [x] `bench/scan/score.test.ts` gains a swapped per-item split scored wrong while every amount matches. Run `npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe. The lane puts the key in `.dev.vars` from `~/.config/receipt-eval/env` without printing it.

- [x] Lane 1. Regression lane against trunk. Create a Split through the home page and Claim one Item from a second browser, citing `features/join.md`, at trunk and head. Save `create-claim.png`. Pass when both behave the same, because no client calls the route yet.
- [x] Lane 2. Run `node bench/scan/run.mjs` with 3 runs per fixture against the lane's `wrangler dev`, citing `features/scan.md`. Save the table as `scan-table.txt`. Pass when t1 is fully correct with both Bundles in 3 of 3 runs and the fixtures pass the committed floor. Then set the pass-1 limit to 1 ms and scan once. Pass when the log shows the retry on the second host.
- [x] Run the harness once against `~/receipts-eval/` (r1-r8, 3 runs each) and report scores by receipt id only (preferences 53). Pass when at least 18 of 24 readings are fully correct, the eval's 20 of 24 less the noise band.

**Feature map.**

- [x] Create `features/scan.md` in `verify-receipt-splitter` with the route, the limits, how to set the key in `.dev.vars`, and how to run the harness. Add it to `features/README.md`. *`features/scan.md` already covered the home scan, so the route, its limits, the key, and the harness went into it as new sub-features and a driving section.*

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Time per scan, median and worst, and cost per receipt from OpenRouter's reported usage.
- [x] Probe. Lane 2's harness run.
- [x] Baseline. Trunk has no route, so each metric gets an absolute budget from the eval.
- [x] Rule. Fail if the median scan takes over 8 s, any scan takes over 60 s, or the mean cost passes $0.0015 per receipt.

**Review gate.** No interaction changes. The operator confirms the three scan limits in chat before merge, because they set the daily spend.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] Before the merge, the root sets the production secret with `npx wrangler secret put OPENROUTER_API_KEY`, reading the value from `~/.config/receipt-eval/env` without printing it (preferences 61).
- [ ] The root merges V2-7a and confirms the deploy. A POST of t1 to `https://app.splitwith.workers.dev/api/scan` returns a reading.

## Read the receipt through the server on home (V2-7b)

**Depends on.** V2-7a, merged and deployed with the secret set.

V2-7b moves home's scan onto the route, with the on-device reader as the fallback, and gives every Item an optional **Detail**. An Item whose price includes a discount printed under it shows that discount in its detail line, so a discount on the wrong Item is easy to spot (preferences 62).

**Files.**

- [x] Edit `src/core/split.ts`, `src/core/parse.ts`, `src/core/operations.ts`, and their tests. Add a golden row in `src/core/golden/` with `scripts/golden-splits.mjs`.
- [x] Create `src/scan/client.ts` and `src/scan/client.test.ts`.
- [x] Edit `app/index.tsx`, `src/draft.ts`, `src/ui/receipt-input/photo.web.ts`, and `src/ui/receipt-input/reading.tsx`. *`photo.web.ts` and `reading.tsx` needed no change. The JPEG encode lives in `src/scan/client.ts`, and the bar's OCR share lives in `app/index.tsx`.*
- [x] Edit `src/ui/split-view/model.ts`, `src/ui/split-view/receipt-card.tsx`, `src/ui/item-sheet/index.tsx`, `src/ui/receipt-editor/index.tsx`, and `src/ui/history/describe.ts`.
- [x] Edit `CONTEXT.md` and `e2e/scan.spec.ts`.

**Build.**

- [x] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` before the PR.
- [x] Add **Detail** to `CONTEXT.md`. A Detail is supplementary text under an Item's name, such as a size, a flavor, a weight, an unpriced modifier, or a discount folded into its price. The name alone identifies the Item. Avoid "description" and "note".
- [x] Give `Item` in `src/core/split.ts` an optional `detail`, one line of at most 120 characters. One string holds both the model's detail and the discount text, so the stored shape gains one field. *The reply's `fee` kind, which has no core match, maps to `serviceCharge`. A Bundle the reply gives no discount stays plain Items.*
- [x] Read `detail` in `parseSplit`. Per ADR 0004, bump `schemaVersion` to 3 and read versions 1 and 2 unchanged. Write version 3 only when an Item has a detail, so a Split without one stays readable by the V2-7a Worker, as V2-2 did for Bundles. Add the golden row.
- [x] Let anyone edit an Item's detail in the item sheet, beside its name. The edit is a receipt change, so History lists it and Revert restores it (preferences 3).
- [x] Call the route in `src/scan/client.ts`. Run the on-device OCR as today. Downscale the photo to about 2048 px on its long edge, crop it to the OCR boxes with a margin, and encode it as a JPEG through a canvas, so it carries no EXIF. Lower the quality in steps until it fits 1 MB. Post it with the OCR plain lines.
- [x] Parse the route's reply at the boundary in `src/scan/client.ts`, and map it to a Receipt. Join the detail lines with ", ". Append each folded discount as "$2.00 off". A Bundle becomes an Adjustment of kind `bundleDiscount` per ADR 0006.
- [x] Fall back to `parseReceipt` on the same OCR result on any status other than 200, a network failure, a reply that does not parse, or no reply in 60 s. Show no message for the fallback. Home keeps "Reading the receipt." until either reading lands. *Home keeps its shipped copy, **Reading receipt**. The bar fills to 80% over OCR and holds while the server reads.*
- [x] On the Split page, show `item.detail` under the name when it is set. Otherwise split the name with `nameParts` in `src/ui/split-view/model.ts`, which stays the fallback for sizes printed on the name line and for on-device readings.
- [x] Show no stale or wrong frame when the detail line appears or changes (preferences 18). Nothing is yellow (preferences 15).

**You see.**

- [x] Scanning `e2e/fixtures/topgolf-synthetic.png` on home reads both Bundles through the route. A fixture with a discount under an Item shows "$2.00 off" in that Item's detail line on the Split page. With the route blocked, the same scan still reads, on the device.

**Seams.**

- [x] The reply-to-Receipt mapping in `src/scan/client.test.ts`, fed invented replies.
- [x] The stored shape in `src/core/parse.test.ts` through the golden rows.
- [x] The detail edit in `src/core/operations.test.ts`.
- [x] The scan flow through Playwright in `e2e/scan.spec.ts`, with `/api/scan` answered by `page.route`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/scan/client.test.ts` gains a reply mapped to a literal Receipt with a joined detail, "$2.00 off", and a Bundle, and a malformed reply that returns null. Run `npm test`.
- [x] `src/core/parse.test.ts` reads every golden row, a version 3 row with a detail, and a version 2 row unchanged, and refuses a detail over 120 characters. Run `npm test`.
- [x] `src/core/operations.test.ts` gains a detail edit and its revert. Run `npm test`.
- [x] `e2e/scan.spec.ts` gains a route reading, the fallback on 429, on 502, and on a 60 s timeout, and an upload at most 1 MB. Run each new case under a 4x CPU throttle. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe, with the key in `.dev.vars`.

- [x] Lane 1. Regression lane against trunk. Scan `e2e/fixtures/topgolf-synthetic.png`, create the link, and Claim one Item from a second browser, citing `features/scan.md` and `features/join.md`, at trunk and head. Save `scan-create-claim.png`. Pass when the head reads through the route, both read the same Bundles and Total, and create and Claim behave the same.
- [x] Lane 2. Scan the V2-7a fixtures with item discounts and modifiers at 390 px and 1440 px, in light and dark, citing `features/scan.md`. Save `detail-matrix/<case>.png`. Then block `/api/scan` and scan once more. Pass when each detail line reads under its name, "$2.00 off" sits on the right Item, and the blocked scan reads on the device.
- [ ] Run the WebKit frame-timing checks through `motion.mjs` on macOS for the item sheet with the detail field (preferences 45), and the real-iOS census for opening it and editing the detail (preferences 44). Pass when every flagged interaction counts 0. *WebKit `motion.mjs` passed `item-open` and `item-close` at 1x and 4x. The real-iOS census did not run, because simulator access was not granted. A Playwright WebKit iPhone 15 recording run through the census tool showed 0 flags while typing the detail, and flags only on the sheet's own slide, which a constant-frame recording reports as motion.*

**Feature map.**

- [x] Update `features/scan.md` in `verify-receipt-splitter` with the home flow, the fallback, and how to block the route.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Time from picking the photo to the read receipt on home, the uploaded bytes, and `npm run size`.
- [x] Probe. Five scans of `e2e/fixtures/topgolf-synthetic.png` at trunk and head, interleaved, under Playwright mobile emulation with a 4x CPU throttle, timed from the page's performance marks.
- [x] Baseline. Record the trunk pick-to-read time first.
- [x] Rule. Fail if the head median is more than 5 s over trunk's, any upload is over 1 MB, or `npm run size` passes its budget.

**Review gate.** The operator reviews before merge.

- [x] Copy lane 1's `scan-create-claim.png` and lane 2's screenshots into `/tmp/receipt-splitter-review/V2-7b-review-<case>.png`. *They live in `~/.claude/orchestrate/receipt-splitter/review/v2-7b/`, per the coordinator, to keep durable files out of `/tmp`.*
- [ ] Save a 30 to 60 second video of scanning a receipt and opening an Item with a discount in its detail as `/tmp/receipt-splitter-review/V2-7b-review.mp4`. *Recorded at `~/.claude/orchestrate/receipt-splitter/review/v2-7b/video/V2-7b-review.mp4`, 12.5 s, because the flow is that short.*
- [ ] Post the screenshots, the video, and V2-7a's harness table in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges V2-7b and confirms the deploy. A production check that needs a new Split uses the handle @test-debug and says so (preferences 54).

## Show your share in the bar after a pick

**Depends on.** PR 40 (`fix/flash-root`), which fades the bar's content through and keeps the chips in a fixed header. It branches from `main` at `629a862` or later.

After someone picks their name, the collapsed bar shows **Your share** with their amount and an up-arrow that pulls up their breakdown (preferences 26). The bar has no link row, because the header's **Share** button covers sharing. The pay button stays in the expanded breakdown, not in the bar (preferences 27). The pick sheet keeps the full link row and its close button (preferences 25). Today a Host who has not shared the link sees the link row in place of the share line, both collapsed and above the breakdown, and a guest's line says "You owe".

**Files.**

- [ ] Edit `src/ui/split-view/model.ts` and `src/ui/split-view/model.test.ts`.
- [ ] Edit `app/s/[id].tsx`.
- [ ] Edit `src/ui/split-view/link-line.tsx`, `src/ui/split-view/pick-sheet.tsx`, and `src/device.ts`.
- [ ] Edit `e2e/join.spec.ts` and `e2e/pay.spec.ts`.
- [ ] Edit `features/join.md`, `features/claim.md`, `features/pay.md`, and `features/README.md` in `verify-receipt-splitter`.

**Build.**

- [ ] Name the bar's states as a type before any view code. `Bar` is `ask` (no name picked), `share` (picked, collapsed), or `breakdown` with the person it shows (picked, expanded). `barFor(me, expanded, selected)` derives it, so an expanded bar with no pick cannot exist.
- [ ] The page renders from `Bar` alone. The sheet's `view` key, `onUp`, and `onDown` come from the same value.
- [ ] `share` shows **Your share**, the amount, and the up-arrow for everyone, Host and guest alike. A tap or a swipe up opens `breakdown`.
- [ ] Delete the link row from the bar and from above the breakdown. Delete the `shared` flag in device memory, which only decided that row, and the `onShared` callbacks that set it.
- [ ] Leave the pick sheet as it is. It closes without a pick and shows the link, **Copy**, and **Share** on one line.
- [ ] No new motion. The bar's content swap keeps PR 40's fade-through.

**You see.**

- [ ] On a phone, create a link and pick your name. The bar shows the chips, then **Your share $0.00** with an up-arrow, and no link. Tap it. Your breakdown rises with no link row above it. Open the link in another browser as Sam, check Pho, and the bar says **Your share $14.20**. Pull it up, and the **Pay Jason $14.20 on Venmo** button shows under the total.

**Seams.**

- [ ] `barFor` in `src/ui/split-view/model.ts`, through `src/ui/split-view/model.test.ts`.
- [ ] The Split page through Playwright in `e2e/join.spec.ts` (the Host) and `e2e/pay.spec.ts` (a guest).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/ui/split-view/model.test.ts`. No pick gives `ask` whether or not the bar was expanded; a pick gives `share` collapsed and `breakdown` of the selected person expanded, falling back to the picker. Run `npm test`.
- [ ] `e2e/join.spec.ts`. After the Host picks on an unshared link, the bar shows **Your share** and no link row or **Copy**; tapping Sam's chip shows Sam's breakdown with no link row. **Copy** and the no-share case move to the pick sheet, where the link now lives. Run `npm run e2e`.
- [ ] `e2e/pay.spec.ts`. A guest who checked a line sees **Your share $14.20** and no pay link in the collapsed bar, and the Venmo pay link in the expanded breakdown. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Lane 1. Against `verify-receipt-splitter` on a port from 9300 to 9399, capture the Host and a guest at 390 px, light and dark: before the pick, after the pick collapsed, and after the pick expanded. Pass when no collapsed bar shows the link row or a pay button, and every expanded guest breakdown shows the pay button.
- [ ] Lane 2. `motion.mjs` in every lane and `flash-census.mjs` at 0 of 180.
- [ ] Lane 3. The iOS census on the owner's own simulator device: the pick (the pick sheet closing into the bar), a flick up and down on the bar after a pick, and closing the pick sheet without a pick. Pass at 0 flagged frames each.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads. Probe `npm run size` at trunk and head. Rule. Fail on any growth over 1 KB.

## Quantities follow the receipt

**Depends on.** None. It branches from `main` after V2-7b. It touches two lines of `app/s/[id].tsx` and one function of `src/ui/split-view/model.ts`, which `feat/bar-after-pick` also edits, so whichever lands second rebases over a small overlap.

The Split page shows lines as the receipt prints them (preferences 58). Lines printed separately stay separate rows. A line printed with a quantity, such as Guinness x3, is one row with "3x" in its text, styled like the "6 items" count on a Bundle header. Unsplit, it is claimed like any one-line Item. **Who had it**, **Evenly**, **By shares**, and **By amount** apply to the whole line, with no per-unit claims (preferences 5). Its detail has a **Split** button that turns it into three one-unit rows, and each of those is claimed as a one-line Item. A person's breakdown lists what the Split page shows, so a quantity line is one line with its quantity (preferences 24). **Split** is a manual receipt change, so History lists it and Revert undoes it (preferences 3 and 29). This replaces V2-3's one row per unit.

**Data shape.** Decided before the build.

- An Item keeps its quantity. `SplitItem` is `Item & { split }`, so it carries `quantity` from 2 to 20, and an absent `quantity` means 1. Inside an Edit pair a quantity is a number, and 1 means one.
- `ItemSplit` keeps the stored key `units`, typed as a list of exactly one claim set: who had the whole line, with their shares or cents. The in-memory type is a one-tuple, so no code can index a second unit.
- `Claim` and `ItemValue` lose `unit`. `ItemPatch` loses `quantity` and `drop`. The parser still accepts `"unit": 0` on a claim from a page loaded before the deploy and drops it. Any other unit is malformed.
- **Split** is a new `ItemPatch`, `{ type: "split", itemId, ids }`. The client mints `ids`, one per new row, as it mints ids for an added Item. The server owns the math. It records one Change with one `split` write, `{ kind: "split", id, ids, line: { quantity, price, split } }`, which holds the line as it was. The rows follow from it, so the record stays under the 5 KB change cap at any quantity. The line takes `quantity` 1, the first of `unitPrices(price, quantity)`, and the first row's claims. Each further row takes the next index and the next unit price. When the line is in a Bundle, the new ids go right after the line's id. Every row starts with the line's claimers and mode. Shares copy over. By amount, the rows fill in order: each claimer takes what is left of their cents, up to what is left of the row's price. Every claimer keeps their total and the unclaimed rest stays the same, so every Share stays the same to the cent, and no row turns even. The cents of the rows add up to the line's price.
- Revert of a Split is the existing undo. It records an `unsplit` write that removes the added rows, restores the Bundle's list, and gives the line back the quantity, price, and claims it had before the Split. It answers `conflict` unless every row the Split made still has its split-time price and claims, and all of them still share one name and detail, so a Revert never drops a later edit: a row gone, a price edit on any row (claimed or not), a rename, a detail, or any claim, mode, or amount edit all answer `conflict`. It also answers `conflict` unless every Share and the unclaimed total are the same before and after it.
- Every write stores `schemaVersion` 4, whatever the Split holds. `parseSplit` reads versions 1, 2, and 3 with the old per-unit parsers and maps them, as ADR 0004 and V2-2 read old rows, so an old row loads and its next write stores it at version 4. Version 3 is V2-7b's, so the mapping keeps each Item's detail. Each version reads every earlier one. Storage rolls forward only: a Worker from before this PR cannot read a version 4 row, so a rollback past this release is not supported (Appendix C).

**How old Splits map.** A Split stored at version 1, 2, or 3 keeps its money and its details.

- A one-unit Item reads unchanged.
- A quantity line whose units all hold the same claims reads as one line with that quantity and those claims. Cents scale by the quantity, so each claimer pays the same.
- A quantity line whose units differ reads as rows in its place, one per distinct claim set, in the order the units first show it. Each row takes that set's units as its quantity, the sum of their prices from `unitPrices`, and the set's claims, with cents scaled by the quantity. Equal units map exactly, so every Share stays the same to the cent, and each row keeps the line's detail. The first row keeps the id. The rest take the next free `<id>-2`, `<id>-3`, and so on, cutting the base so the id fits 24 characters, and a Bundle lists them where it listed the line. Money is never folded into one line.
- The 100-Item cap and the 32 KB budget hold for a new Split and for writes that add Items (**Add item**, **Split**), never for reading a stored row. An old row whose rows pass them still loads with the same Shares, takes claims and edits, and refuses an added Item or a **Split** as `tooManyItems` or `tooLarge`. A Split within the 32 KB budget never grows past it. A stored row reads up to 2,000 Items and 640 KB, the most an old row can read as.
- Item writes in old `recentChanges` map their claim sets the same way, with the one-line rule, and an old quantity edit becomes a quantity pair. A write whose Revert would no longer undo what it did gets a `{ kind: "perUnit", id }` mark, and Revert of its change answers `conflict`, which changes nothing: its line now reads as rows, its units differed, or its quantity is not the line's quantity now.
- `original` already stores quantities and reads unchanged, so **Restore receipt** brings a split line back as one line.

**Files.**

- [ ] Edit `src/core/split.ts`, `src/core/operations.ts`, `src/core/parse.ts`, `src/core/shares.ts`, and their tests. Add a golden row in `src/core/golden/` with `scripts/golden-splits.mjs`.
- [ ] Edit `src/ui/split-view/model.ts`, `src/ui/split-view/receipt-card.tsx`, `src/ui/split-view/breakdown.tsx`, `src/ui/item-sheet/index.tsx`, `src/ui/history/describe.ts`, `src/ui/split-copy.ts`, and `app/s/[id].tsx`, with their tests.
- [ ] Edit `CONTEXT.md`: **Unit**, **Claim**, **Split mode**, and **Unclaimed item**.
- [ ] Edit `e2e/claim.spec.ts`, `e2e/receipt.spec.ts`, `e2e/sheet.spec.ts`, and `e2e/motion.ts`.
- [ ] Edit `features/claim.md`, `features/receipt.md`, `live-clients.mjs`, and `split-flow.mjs` in `verify-receipt-splitter`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` on the UI text before the PR.
- [ ] Change the model to the **Data shape** above, and map old Splits as **How old Splits map** says.
- [ ] Rows follow Items. A row is one Item. Its circle and its detail act on the whole line. Rows keep 14 px text, the 16 px circle, the 44 px tap target, and no × (preferences 20 and 21).
- [ ] Show the quantity of a line above 1 as "3x" before the name, in the type and color of the "6 items" count on a Bundle header. A Bundle header still counts units, so the Topgolf bucket reads "6 items". A closed Bundle's "N unclaimed" counts the units of its unclaimed lines.
- [ ] The detail shows the line's price, with no "each", and its quantity. **Who had it**, **Evenly**, **By shares**, **By amount**, and **Delete item** act on the whole line. A line with a quantity above 1 has a **Split** button that reads "Split into 3".
- [ ] A tap on **Split** sends the patch and closes the detail. The first row stays where it is. The new rows open below it, height and opacity from 0, about 200 ms, ease-out, and the rows under them slide down with them. Under reduced motion the rows appear without the height change. No frame shows "3x" beside the new rows, or the old row twice (preferences 18).
- [ ] A person's breakdown lists one line per row on the page. A quantity line shows its quantity. It shows no "1 of 3" (preferences 24).
- [ ] History reads a Split as one entry, "Split Guinness Draught 14.9oz Can into 3", with no count of more writes. Revert asks for confirmation as any other change does (preferences 3).

**You see.**

- [ ] On the Topgolf Split at 390 px, the Beer Bucket opens to four rows, one of them "3x Guinness Draught" at $21.87. A tap on its circle claims the whole line for the picked name. Its detail shows **Split into 3**. After **Split**, three Guinness rows at $7.29 sit inside the Bundle. History shows the Split, and Revert brings back the one "3x" row.

**Seams.**

- [ ] The stored shape and the old-row mapping in `src/core/parse.test.ts`, through literal version 2 Splits and the golden rows.
- [ ] Claims, **Split**, and its revert through `applyOperation` in `src/core/operations.test.ts`.
- [ ] Shares in `src/core/shares.test.ts`.
- [ ] Rows, the breakdown lines, and History entries as pure functions in `src/ui/split-view/model.test.ts` and `src/ui/history/describe.test.ts`.
- [ ] The Split page through Playwright in `e2e/claim.spec.ts` and `e2e/receipt.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/core/operations.test.ts` gains a claim on a quantity line that names the whole line, each split mode on a quantity line, **Split** of a 3x line at $21.87 into rows of $7.29, $7.29, and $7.29 with the claims copied, **Split** of an uneven price whose rows add up to the cent, **Split** of a by-amount line whose rows' cents add up to the line's, **Split** inside a Bundle with the ids in place, a refused **Split** of a one-unit line and of an id already used, and Revert of a **Split**, alone and after a claim on a new row. Run `npm test`.
- [ ] `src/core/parse.test.ts` gains a version 2 Split with equal units read as one line with its quantity, one with different units read as rows with `<id>-2` ids and the same Shares, one whose differing units group into quantity rows with the next free ids, one whose rows pass 100 Items and 32 KB that still loads and refuses an added Item, an old claim with `"unit": 0` accepted and `"unit": 1` refused, a version 3 Split with a detail on a quantity line read as one line or as rows that each keep the detail, a version 4 Split read back unchanged, and a one-line Split written at version 2. Every golden row reads, with the Topgolf Shares unchanged. Run `npm test`.
- [ ] `src/core/shares.test.ts` gains the Topgolf Shares with Guinness claimed by two people as a whole line, and the same Shares after **Split** with each row claimed by the same two. Run `npm test`.
- [ ] `src/ui/split-view/model.test.ts` and `src/ui/history/describe.test.ts` gain the Bundle rows with "3x", the unclaimed count in units, the breakdown line for a quantity line, and the Split entry. Run `npm test`.
- [ ] `e2e/receipt.spec.ts` gains **Split** on the Guinness line inside the Bucket, the three rows in a second browser, and Revert in History. `e2e/claim.spec.ts` claims a quantity line from one browser and sees the Share in another. The cases hold the CI-robustness rule. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe, on ports 9100 to 9199.

- [ ] Lane 1. Regression lane against trunk. Create the Topgolf Split and Claim one Item from a second browser, citing `features/claim.md`, at trunk and head. Pass when both reach the same Shares.
- [ ] Lane 2. Screenshot matrix at 390 px and 1440 px, in light and dark, citing `features/receipt.md`: the open Bucket with the "3x" row, its detail with **Split into 3**, and the three rows after **Split**. Save `quantities/<case>.png`.
- [ ] Run `motion.mjs` on every lane and the flash census with `flash-census.mjs`. Pass when the motion lanes pass and every "Runs with flash" cell reads 0. The root schedules the real-iOS census for the **Split** motion (preferences 44).

**Feature map.**

- [ ] Update `features/receipt.md` with the "3x" row, **Split**, and its revert, and `features/claim.md` with whole-line claims.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `npm run size` and `npm run bench:core`. Probe at trunk and head. Rule. Fail when size passes its budget or the Share bench slows by more than 10%.

**Review gate.** The root merges on a clean verdict and green CI (preferences 40). The screenshots go to the operator after the merge.

- [ ] Copy lane 2's screenshots into `~/.claude/orchestrate/receipt-splitter/review/quantities/`.

## A home reload keeps only the payment handles

**Depends on.** None. It branches from `main`.

A reload of home starts a new split: no receipt, no photo, no names. The payment handles stay, and a kept handle works, so a tap on **Create split link** never asks for a handle the field shows (preferences 59). Today home saves the whole Draft, so a reload brings back the receipt and the names. The operator also saw a handle in the field that Create reported missing until they typed (`notes.md`, operator report of 2026-10-03).

**Files.**

- [ ] Edit `src/draft.ts`, `src/draft.test.ts`, and `app/index.tsx`.
- [ ] Edit `e2e/join.spec.ts` and `e2e/scan.spec.ts`.
- [ ] Add `e2e/fixtures/example-total-over-limit.png` through `e2e/fixtures/make-fixtures.py`. The home editor tests reached the editor through a stored Draft; a read whose Total is over the limit reaches it the way a Host does.
- [ ] Edit `features/home.md` in `verify-receipt-splitter`.

**Build.**

- [ ] Reproduce the prefilled handle in Safari on an iOS Simulator device of the owner's own, before any fix. Record what the field shows against what the Draft holds after a reload, a crash reload of the tab, and a Safari relaunch.
- [ ] Store only the payment handles. The stored value is `{ version: 2, handles }` under the same key, so the first save after this PR overwrites a version 1 Draft and its receipt thumbnail. A version 1 value still yields its handles, so nobody retypes a handle after the deploy.
- [ ] `loadDraft` returns the empty Draft with the stored handles, and `saveDraft` stores only the handles.
- [ ] Back to home remounts it without a reload. Home keeps the whole Draft for the life of the page in `app/index.tsx`, so a receipt replaced during Create still waits on home after Back (PR 33bece3), and only a reload starts over.
- [ ] Delete the code that only read a stored receipt back: the stored-scan parser and its Item, Adjustment, Bundle, and file checks.
- [ ] The PR changes no layout, no motion, and no UI text.

**You see.**

- [ ] On a phone, enter `@test-debug`, scan a receipt, and add two names. Reload. Home shows the empty receipt box, no names, and `@test-debug` in the Venmo field. Scan again, add a name, and tap **Create split link**. The Split page opens.

**Seams.**

- [ ] `saveDraft` and `loadDraft` in `src/draft.ts`, through a memory storage, in `src/draft.test.ts`.
- [ ] The home page through Playwright in `e2e/join.spec.ts`, beside the other fresh-home cases, and `e2e/scan.spec.ts`. Specs that read the stored receipt read the body Create sends instead.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/draft.test.ts`. A saved Draft loads back as the empty Draft with its handles in order; a kept handle makes the Draft ready once a Receipt and a name are back; a full Draft saved by the old build loads back as its handles only, and the first save overwrites it; nothing, bad JSON, or another version loads the one empty Venmo row. Run `npm test`.
- [ ] `e2e/join.spec.ts`. After a handle, the Example receipt, and two names, a reload shows the handle and no receipt card or name chips. Then the Example receipt and a name, and a tap on **Create split link** opens the Split page and sends that handle. The case holds the CI-robustness rule. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Lane 1. In Safari on the owner's own iOS Simulator device, against `verify-receipt-splitter` on a port from 9100 to 9199, enter a handle, read a receipt, add names, and reload. Save `home-after-reload.png`. Then read a receipt, add a name, and tap **Create split link**. Save `create-with-kept-handle.png`. Pass when the reload shows only the handle and Create opens the Split page.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads. Probe `npm run size` at trunk and head. Rule. Fail on any growth over 1 KB; the PR deletes code.

**Review gate.** The operator reviews before merge, because a reload now drops the receipt and the names.

- [ ] Copy lane 1's screenshots into `~/.claude/orchestrate/receipt-splitter/review/home-reload/`. Post them in chat and wait for approval.

## Home leaves the keyboard to iOS

**Depends on.** None. It branches from `main` at 629a862 or later.

On a phone, home's panel moves in steps when a handle or name field takes focus. iOS pans the page 166 pt before the keyboard's resize, and the panel's keyboard inset then steps 330, 164, 330 as `visualViewport.offsetTop` arrives (`notes.md`, home keyboard). The hero also switches to compact while the keyboard is up. The operator chose design A for home too (preferences 17). The app does not move the panel for the keyboard, and iOS pans the page. **Create split link** may sit under the keyboard while someone types. The focused field stays in view.

**Files.**

- [ ] Edit `src/ui/components/sheet.tsx`, `src/ui/components/viewport.ts`, and `app/index.tsx`.
- [ ] Edit `e2e/home.spec.ts`, `e2e/motion.ts`, and `e2e/flash.spec.ts`.
- [ ] Edit `features/home.md` in `verify-receipt-splitter`.

**Build.**

- [ ] Delete the panel's keyboard inset. The panel keeps PR 36's behavior otherwise: one surface, it never collapses, and a drag moves it and it springs back.
- [ ] The panel's scroll limit and the hero's compact switch read the layout height (`clientHeight`), not the visual viewport.
- [ ] Delete what only the inset used: `useViewport`, `visibleHeight`, and `keyboardInset`.
- [ ] The PR adds no motion and no UI text.

**Seams.**

- [ ] The home page through Playwright in `e2e/home.spec.ts`, with the shared iOS 27 keyboard model in `e2e/motion.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/home.spec.ts`. With the keyboard up, the focused handle field and name field are in view above it, also with twelve names at 844 and 667 px. The panel's page position does not change while the keyboard opens and closes, and its on-screen top never reverses while the keyboard rises. The hero's drop box keeps its size. These fail on 629a862. The twelve-names case no longer asks for Create above the keyboard, by the operator's ruling.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The iOS census (preferences 44) on the owner's own simulator device: handle field and name field, keyboard up and down, counted on the band above the keyboard (`keyboard-premise/above.sh`) and judged against `kbref.html` run on the same device. Every case counts 0 beyond the reference.
- [ ] `motion.mjs` on all lanes and the Playwright flash census.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `npm run size` at trunk and head. Rule. Fail on any growth; the PR deletes code.

**Review gate.** The operator reviews the census frames in `~/.claude/orchestrate/receipt-splitter/review/home-keyboard-a/` before merge.

## Add Item on the Split page

**Depends on.** Quantities follow the receipt (PR 49). It branches from `feat/quantities` at `e92bf9c` and rebases onto `main` once PR 49 merges.

Anyone in the Split can add a new Item from the Split page (preferences 30). The Item goes at the end of the receipt, outside every Bundle, because adding to a Bundle stays **Out of scope**. An add is a manual receipt change, so History lists it, and Revert removes it after a confirmation when someone else made it (preferences 3 and 29). Today the core already takes an added Item and History already reads one, but no page sends it.

**Decisions.**

- **Add item** is the last row of the receipt list, under the last row or Bundle and above the Total check note and **Subtotal**. It has a plus in the circle column and "Add item" in secondary gray, on the row's 44 px tap target. A tap opens the add sheet, a bottom sheet over the page, as an Item's detail opens today.
- The add sheet is a form, not the live Item sheet. Nothing is sent until **Add item** at its foot. It holds the name, the detail ("Add a detail", optional), the price, the quantity (a stepper from 1 to 20, 1 by default), and **Who had it** (the people as chips, none on by default). The price is the whole line's price, as on a quantity line's detail. A half-typed Item never reaches other phones, and History holds one entry per add.
- One operation carries the whole add. The `add` Item patch gains an optional `who`, the people who had it, split evenly. So the new row arrives with its claims, on every phone, in one frame. Without it, the row would arrive unclaimed and its dots would pop in one claim later (preferences 18). The stored change does not change, because an `added` write already holds its claims, so storage stays at version 4 (preferences 68). The server refuses a `who` that names an unknown person or one person twice.
- Validation. The name is required and at most 80 characters. The price is required and from $0.00 up. A tap on **Add item** always acts: it adds, or it focuses the first missing field and says what is missing under the button ("Add a name." or "Add a price."), as **Create** does on home (preferences 34). A price over the limit says "That price is over $X." Problems show in secondary gray, never yellow (preferences 15).
- The Total check keeps the printed Subtotal and Total. An add sends no `subtotalDelta` or `totalDelta`, because the common add is an Item the reading missed, which the printed Subtotal already counts. The quiet gray note under the rows updates as it does for any edit, and it blocks nothing (preferences 6).
- Caps. The sheet runs the add through `applyOperation` before it sends, as the Item sheet previews its edits. At the 100-Item cap it says "A split holds at most 100 items." At the 32 KB budget it says "This split is full. Delete an item to add one." The server's answer wins: the same two messages show when it refuses a race the preview did not see, and any other refusal says "Couldn't save that. Check it and try again." The sheet stays open on a refusal and keeps what was typed.
- The new Item's id is a random 12-character id, minted when the sheet opens. A retry after a lost answer sends the same id, and a `duplicateId` answer for an id the Split now holds counts as added.
- Motion. The add sheet opens and closes as the Item sheet does. On success the sheet closes, and the new row opens in place with the existing `Grow` entrance: height and opacity from 0, `motion.rowsIn`, ease-out, and opacity only under reduced motion. The height starts at 0 in a layout effect, so no painted frame shows the row at full height or without its claims. Other phones see the same entrance, because `useEntering` keys on the receipt's ids. The **Add item** row does not animate; it moves down with the new row.
- Keyboard, design A (preferences 17). The app does not move the add sheet for the keyboard; iOS pans the page. The sheet focuses no field on open, so the keyboard never rises while the sheet rises. Return moves from the name to the detail to the price (`enterKeyHint` "next"), and Return in the price adds (`enterKeyHint` "done"). Inputs stay at 16 px (preferences 16).
- Home's editor stays in this PR. With **Add item** on the Split page, home no longer needs the editor that `Scan.fixOnHome` keeps after a read with no Items, an unnamed Item, or an amount over the limit. Removing it changes what Create sends for such a read, the home e2e cases, and the over-limit fixture, so it is the next PR, **Drop the home editor**.

**Files.**

- [ ] Edit `src/core/operations.ts`, `src/core/parse.ts`, and `src/core/operations.test.ts`.
- [ ] Add `src/ui/item-sheet/add.tsx`, and `src/ui/item-sheet/new-item.ts` with `src/ui/item-sheet/new-item.test.ts`.
- [ ] Edit `src/ui/split-view/receipt-card.tsx`, `src/ui/split-copy.ts`, and `app/s/[id].tsx`.
- [ ] Add `e2e/add-item.spec.ts`. Edit `e2e/motion.ts` for the add scenario.
- [ ] Edit `features/receipt.md` in `verify-receipt-splitter`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code. Build motion with `animate`. Run `review-animations` and `unslop` on the UI text before the PR.
- [ ] Name the form's shape before view code. `NewItem` is `{ name, detail, price, quantity, who }` as typed. `newItem(split, typed, id, by)` returns the operation to send, or the one problem to show (`name`, `price`, `overLimit`, `tooManyItems`, or `tooLarge`). The sheet renders from that answer alone.
- [ ] The `add` patch takes `who`. `itemWrites` writes the added Item with `{ by: "even", units: [who] }`, and refuses an unknown person as `unknownParticipant` and a repeat as `duplicateId`.
- [ ] The Split page's overlay gains `{ kind: "add" }`.
- [ ] On success the sheet closes. On a refusal it stays, keeps the fields, and shows the message.
- [ ] History needs no change. It reads an add as "Added Fries", and Revert asks first for someone else's add.

**You see.**

- [ ] On the Topgolf Split at 390 px, **Add item** sits under the second Beer Bucket. A tap opens the sheet. Type "Fries" and "6.50", turn on Sam, and tap **Add item**. The sheet closes, and "Fries" opens in under the Bucket at 6.50 with Sam's dot, on this phone and on a second one. History shows "Added Fries". Revert from the second phone asks first, and the row leaves both.

**Seams.**

- [ ] The `add` patch with `who` through `parseOperation` and `applyOperation` in `src/core/operations.test.ts`.
- [ ] `newItem` as a pure function in `src/ui/item-sheet/new-item.test.ts`.
- [ ] The Split page through Playwright in `e2e/add-item.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/core/operations.test.ts` gains an add with `who` that lands claimed evenly with the Shares to the cent, an add whose `who` names an unknown person refused as `unknownParticipant` and a repeat refused as `duplicateId`, a `who` read through `parseOperation`, and an add at the end of a Split with Bundles that joins no Bundle. Run `npm test`.
- [ ] `src/ui/item-sheet/new-item.test.ts` covers an empty name, an empty price, $0.00 accepted, a price over the limit, a quantity of 3 sent as a 3x line, a detail trimmed or dropped, the 100th Item accepted and the 101st refused as `tooManyItems`, and a Split at its byte budget refused as `tooLarge`. Run `npm test`.
- [ ] `e2e/add-item.spec.ts` covers an add from one browser that a second browser sees with its claim and the same Shares; claiming the added Item from the second browser, with the Shares in both; History listing the add, and Revert from the other browser asking first and then removing the row in both; a Split at 100 Items whose sheet shows the cap message and sends nothing; a tap on **Add item** with no name that focuses the name and says "Add a name."; Return moving from the name to the detail to the price and then adding; with the iOS keyboard model up, each focused field above the keyboard and the sheet's top unchanged; and no frame that shows the new row at full height before it grows, with frames 200 ms late. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe, on ports 9300 to 9399.

- [ ] Lane 1. Screenshot matrix at 390 px and 1440 px, in light and dark, citing `features/receipt.md`: the receipt with **Add item**, the empty add sheet, the sheet with "Add a name.", and the receipt with the added row. Save `add-item/<case>.png`.
- [ ] Run `motion.mjs` on every lane and the flash census with `flash-census.mjs`. Pass when the motion lanes pass and every "Runs with flash" cell reads 0. The root schedules the real-iOS census for the add sheet and the entrance (preferences 44).

**Feature map.**

- [ ] Update `features/receipt.md` with **Add item**, its sheet, and its refusals.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `npm run size`. Probe at trunk and head. Rule. Fail when size passes its budget or grows by more than 2 KB brotli.

**Review gate.** The root merges on a clean verdict and green CI (preferences 40). The screenshots go to the operator after the merge.

- [ ] Copy lane 1's screenshots into `~/.claude/orchestrate/receipt-splitter/review/add-item/`.

## Drop the home editor

**Depends on.** Add Item on the Split page (PR 52).

Home stops editing Items. With **Add item** on the Split page, every fix a Host made in home's editor can now be made on the Split page, where everyone in the Split sees it (preferences 38). This PR deletes the editor that `Scan.fixOnHome` kept after a read with an unnamed Item, an amount over the limit, or no Items, and decides what Create sends for such a read.

Decisions.

- A read is turned into the Receipt Create sends once, when it lands. The Draft holds that Receipt (or nothing, when no Item was read), not an editable copy. `sendable` repairs a read the core would refuse at that moment, so Create acts on it (preferences 34) and the Split page fixes the rows. Rows are not dropped, because a dropped row is a missing charge nobody sees, while a sent row is one tap from fixed.
- An Item with no name but a price is sent as "Item N", N its place on the receipt. The core refuses a blank name (`badName`), and the price is what matters to the Shares. Anyone renames it on the Split page.
- A price over $100,000 is sent as $0.00, as the editor already read it, and so is an Adjustment over the limit. The core refuses the amount (`amountOutOfRange`). The Total check then fails, and the quiet gray note on home and on the Split page names the gap (preferences 6), which points at the $0.00 row.
- A Subtotal over the limit is sent as the Items' sum, and a Total over the limit as the Subtotal plus the Adjustments. They are read lines like any other, and a misread one should not block the link.
- A read with no Items blocks Create, because a Split holds at least one Item. The core types the Items as non-empty and refuses to delete the last one (`lastItem`). **Create split link** stays off with "Couldn't read any items. Try another photo." The card's camera replaces the photo, and **Example** still fills home.
- The parser's `discountExceededPrice` flag goes. Only the editor showed it, and the Item it marks is already $0.00.
- Home keeps the compact card for every read, the same card and layout a good read gets. Nothing new animates.

**Files.**

- [ ] Edit `src/draft.ts` and `src/draft.test.ts`. Edit `app/index.tsx` and `src/ui/home-copy.ts`.
- [ ] Delete `src/ui/receipt-editor/`.
- [ ] Edit `src/parse/index.ts` and `src/parse/index.test.ts` to drop `discountExceededPrice`. Edit `src/ui/split-view/model.ts` for `gapNote`.
- [ ] Edit `e2e/scan.spec.ts`. Replace `e2e/fixtures/example-total-over-limit.png` with `example-price-over-limit.png` through `e2e/fixtures/make-fixtures.py`.
- [ ] Edit `features/scan.md`, `features/home.md` and `features/README.md` in `verify-receipt-splitter`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before the UI change. Run `review-animations` and `unslop` on the UI text before the PR.
- [ ] Name the shape first. `Scan`'s read state is `{ status: "read", file, receipt: Receipt | null }`, the core Receipt Create sends. `sendable(read)` builds it from the parser's Receipt, and `readiness` reads it as it is. The edit actions, `DraftReceipt`, `fixOnHome`, `editsOnHome`, `flaggedRows`, `itemProblem`, and `parseAmount`'s editor-only signed form go.
- [ ] Red tests first, at the behavior level: a read with a price over the limit, an unnamed Item, an Adjustment over the limit, or a Subtotal or Total over the limit is ready, and its create body carries the repaired rows. The e2e case creates the link and fixes the row on the Split page.

**You see.**

- [ ] At 390 px, choose `example-price-over-limit.png`, whose Perrier prints $1,000,003.50 and whose Total prints $1,000,028.04. Home shows the card with "5 items" and "$28.04" and no Item list, with the quiet note "Items are $3.50 short of the subtotal." Create opens the Split page, where Perrier reads $0.00 under the same note. Tap Perrier, type 3.50, and close. The note goes.
- [ ] Choose `blank.png`. The card shows "0 items" and **Create split link** stays off with "Couldn't read any items. Try another photo."

**Seams.**

- [ ] `reduceDraft`, `readiness`, and `splitRequest` through `src/draft.test.ts`.
- [ ] Home and the Split page through Playwright in `e2e/scan.spec.ts`.

**Verify, unit.**

- [ ] `src/draft.test.ts`. An unnamed priced Item goes out as "Item 6". A price over the limit goes out as 0, and the note names the gap. An Adjustment over the limit goes out as 0. A Subtotal over the limit goes out as the Items' sum, a Total over the limit as the Subtotal plus Adjustments. A read with no Items says "Couldn't read any items. Try another photo." The created body parses through `parseCreateSplitRequest`. Run `npm test`.

**Verify, e2e.**

- [ ] `e2e/scan.spec.ts`. The over-limit read creates the link and the Split page fixes Perrier, clearing the note. The blank read keeps Create off with its reason and shows no editor. Run `npm run e2e`.

**Verify, live.** Level `standard`, ports 9300 to 9399.

- [ ] Lane 1. Screenshots at 390 px, light and dark: home after the over-limit read, and the Split page with Perrier at $0.00 and the note. Save `drop-home-editor/<case>.png`.
- [ ] Run `motion.mjs` on every lane and the flash census with `flash-census.mjs`. Pass when the motion lanes pass and every "Runs with flash" cell reads 0.

**Feature map.**

- [ ] Update `features/scan.md`: no editor; the repairs; the no-Items reason.

**Verify, perf.**

- [ ] Metric. `npm run size` at trunk and head. Rule. Fail on any growth. The editor's removal should shrink it.

**Review gate.** The root merges on a clean verdict and green CI (preferences 40). The screenshots go to the operator after the merge.

- [ ] Copy lane 1's screenshots into `~/.claude/orchestrate/receipt-splitter/review/drop-home-editor/`.

## Recent splits on home

**Depends on.** None. It branches from `main` at `d59243e` or later. PR 46 built Recent splits as a list inline on home. This section replaces that list with an icon (preferences 37, 2026-10-04) and fills the space above the panel with the **Add receipt** box (preferences 66).

Home keeps the Splits this device created or opened, and a tap on one opens its link. The list is called **Recent splits**, because History is the Split page's list of payments and receipt changes (preferences 29). It opens from an icon at the top right of home, so home itself shows only the receipt, the names, and **Create split link**.

Decisions.

- The icon is the `history` glyph, the one the Split page header uses for **History**, drawn by the same `Button kind="icon"`: an 18 px glyph in `muted` on a 44 by 44 tap target, with the header's -12 px right margin so the glyph lines up with the gutter. Its name is **Recent splits**. The two pages never show both lists, so one glyph does not mean two things on one screen.
- The icon shows only when this device lists at least one Split. With none there is no icon, no heading, and no placeholder, so a first-time Host sees today's home. The icon shows whether or not a receipt is on home.
- Below 900 px a tap opens a bottom sheet with a scrim, the same `BottomSheet` the Split page uses for an Item's detail and for History. From 900 px it opens a popover anchored under the icon, right edges aligned, 360 px wide, as preferences 31 asks for the Item detail on desktop.
- It lists every entry this device saw within 60 days, newest first by `added`. The device keeps at most 50, so the list is at most 50 rows, and the sheet and the popover scroll past their height. Each entry shows the names, host first, up to three and then "and N more"; the day this device first saw the Split ("Today", "Yesterday", "Sep 28", or "Sep 28, 2025" in another year); and the total. A tap on an entry opens its link in place.
- It closes on a tap outside (the scrim on a phone, anywhere off the popover on desktop), on Escape, and on a swipe down on the phone sheet. Focus moves into the list on open and returns to the icon on close.
- Motion. The phone sheet rises and leaves with the `BottomSheet` glide and follows the finger on a swipe. The popover scales from 0.96 and fades in over 200 ms (`controlIn`) with the strong ease-out, from its top-right corner, which sits under the icon, and leaves with a 150 ms fade. Under reduced motion both only fade. The icon itself does not animate in, because it is there from the first frame.
- The dashed **Add receipt** box fills the page between the header and the panel on a phone, at every height, with its content centered. From 900 px it keeps its 336 px (380 px from 1280 px) minimum in the one centered column (preferences 32). Its dashed border uses the `dash` token, now lighter: `#B0B4BA` in light and `#4A4D53` in dark, about 2:1 against the page and the paper in both, so it reads as a quiet edge while the camera button and the **Add receipt** text name the control.
- The app moves nothing for the keyboard (preferences 17, design A). The box is part of the scrolling page, and iOS pans the page to reveal a focused field.
- The rows keep PR 46's press: a fill with `sheetIn` after a 150 ms touch hold, at once on a mouse hover, and a 200 ms fade on release.

**Files.**

- [ ] Edit `src/device.ts` and `src/device.test.ts`.
- [ ] Edit `src/ui/recent-splits.tsx`, `src/ui/colors.ts`, `src/ui/colors.test.ts`, and `app/index.tsx`.
- [ ] Edit `e2e/history.spec.ts` and `e2e/flash.spec.ts`.
- [ ] Edit `features/home.md` and `history-shots.mjs` in `verify-receipt-splitter`.

**Build.**

- [ ] Name the data shape first. A Split's record on the device stays `{ creatorSecret?, me?, recent? }`, and `recent` stays `{ names, total, added, seen }`. `recentSplits(now)` returns every entry seen within 60 days, newest first, with no cap of 5. The open state is one value, `null`, open, or closing, so the sheet and the popover cannot both show.
- [ ] Delete the inline list from home: the hero's compact switch for the list, the measured fit of rows above the panel, and the 3 and 5 row caps. Keep `sheet.tsx`'s first-frame height, which Back still needs.
- [ ] `RecentSplits` renders the icon, and on a tap the sheet or the popover with the heading **Recent splits** and one link per entry to `/s/<id>`, through expo-router's `Link`.

**You see.**

- [ ] On a phone, create a link for Jason and Sam, then tap **Split a receipt**. Home shows the box down to the panel and the icon at the top right. Tap the icon. The sheet lists "Jason and Sam", "Today", and the total. Tap the row. The Split page opens at the same link.

**Seams.**

- [ ] `recentSplits` in `src/device.ts` through `src/device.test.ts`.
- [ ] Home and the Split page through Playwright in `e2e/history.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification.

- [ ] `src/device.test.ts`. Every entry within 60 days lists, newest first, past 5. The other PR 46 cases stand. Run `npm test`.
- [ ] `src/ui/colors.test.ts`. `dash` stands at least 1.8:1 against `field` and `paper` in both schemes. Run `npm test`.
- [ ] `e2e/history.spec.ts`. A fresh home has no icon. With stored Splits the icon shows at the top right. Its sheet lists all of them newest first with names, days, and totals, and a tap opens a link. It closes on a scrim tap and on Escape, with focus back on the icon. At 1440 px a popover opens under the icon and closes on an outside click and on Escape, with focus back on the icon. The box fills the page from the header to the panel at 390 by 844 and 390 by 700. With the keyboard up on the handle field the panel and the box keep their page positions. Home and a live Split page render with a throwing `localStorage` getter. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification.

- [ ] Lane 1. Against `verify-receipt-splitter` on a port from 9300 to 9399, at 390 and 1440 px, light and dark: home with no Splits (no icon), home with Splits (the icon), and the sheet or the popover open.
- [ ] Lane 2. `motion.mjs` on all lanes and the Playwright flash census.

**Verify, perf.**

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads. Probe `npm run size` at trunk and head. Rule. Fail on any growth over 2 KB.

## Edit Adjustments on the Split page

Anyone in the Split can fix a tax, tip, fee or discount the reading got wrong, delete one, or add a missing one, Bundle discounts included (preferences 75, 3). The core already takes `add`, `edit` and `delete` Adjustment patches with Undo; no page sent them.

**Decisions.**

- Every row under **Subtotal** opens its sheet on a phone and its popover on desktop, as an Item does (preferences 21). The row keeps its 34 px pitch with a 44 px tap target (preferences 20).
- The sheet holds **Kind** (Tax, Tip, Fee, Discount), **Name**, **Amount**, and **Delete**. The amount is always typed as a positive number. A discount shows "Amount off" after "−$" and stores the amount below zero, so a sign is never typed and never lost. Switching the kind flips the sign. A Bundle discount has no Kind; its sheet names the Bundle its amount comes off, and its Items stay.
- It saves as typed, 600 ms after the last change and on close, like the Item sheet. It sends only the fields typed in it, and the others show the row as it is now, so a fix from another phone to a field this sheet did not touch stays. An empty name says "Add a name." and saves nothing. History lists each save, and Revert asks first for someone else's (preferences 3).
- **Add tax, tip or discount** is the block's last row. Its sheet is a form like **Add item**: nothing is sent until **Add tip** (the button names the kind). The kind starts at the first of Tax and Tip the receipt lacks. An empty name takes the kind's. It asks nothing else (preferences 70).
- The Total. Every Adjustment change that moves an amount (an add, a delete, a new amount, or a switch between a charge and a discount) sends `totalFollows`; a rename leaves the Total alone. With it, the server sets the Total to the Subtotal plus the Adjustments on the Split it holds. When the receipt added up, the Total moves by the change (preferences 70). When the reading misread a tax, fixing it keeps the printed Total and clears the gray note (preferences 6). Because the server resolves it, two phones fixing different rows at once still leave a Total that adds up, which a delta sent from each phone would not. A change that takes the Total under $0.00 is refused with "That takes the total under $0.00."
- Motion. An added row grows in with the receipt's `Grow` entrance. The sheets reuse the Item sheet's open and close. Nothing new animates.

**Files.** `src/core/operations.ts`, `src/core/parse.ts`, `src/ui/adjustment-sheet/`, `src/ui/split-view/receipt-card.tsx`, `src/ui/item-sheet/index.tsx` (shared `Segments`), `src/ui/item-sheet/new-item.ts` (shared `readAmount`), `src/ui/split-copy.ts`, `app/s/[id].tsx`, `e2e/adjustments.spec.ts`, and `features/receipt.md` with `adjustment-shots.mjs` in `verify-receipt-splitter`.

**Verify.** `src/core/operations.test.ts` covers `totalFollows` (moves with the change, keeps a printed Total a fix agrees with, two phones, Bundle discount, Revert, conflict with `totalDelta`, the wire). `src/ui/adjustment-sheet/adjustment.test.ts` covers the edit and add building with literal operations. `e2e/adjustments.spec.ts` covers a tax edit with every Share and the Total on two phones, an added tip, a deleted discount, a Bundle discount, Revert from the other phone, and the desktop popover. Screenshots at 390 and 1440 px, light and dark.

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
- One PR for server-side receipt reading. The Worker route, the reader, and the harness ship without an interaction, and the client half changes the stored Split shape and the Split page. Together they pass the 300k-token size for one owner, so V2-7a and V2-7b split it.
- A JSON schema for the model's reply. Both hosts enforce one, but it was about 9x slower at the median, cost about 43% more, scored no better, and listed t1's Bundle headers as Items. `docs/research/receipt-extraction-eval.md` records the run.
- A second stored number for an Item's folded discount. One `detail` string carries the discount text, such as "$2.00 off", so the stored shape gains one field. A price edit leaves the text as it was, and anyone can edit the detail.

## Appendix C. Risks

- A schema change on live data. It lands in V2-1 and V2-2. Production holds real Splits at version 1, and every merge deploys at once. Only a Split with a Bundle is written as version 2, so every other Split stays readable by any Worker. The owners watch the golden rows, lane 2 of V2-2 reads both versions with the V2-1 Worker, and the root opens live Splits after each deploy. A rollback past V2-1 makes only the Splits with a Bundle unreadable, so after V2-2 deploys the fix for a bad release is a roll forward.
- The photo's size against the Durable Object's limits and the Free plan. It lands in V2-6a. A SQLite-backed Durable Object allows a 2 MB row, and the cap is 150 KB. At the daily cap of 1,000 creates, photos kept 14 days hold about 2.1 GB, and the Splits at their measured size about 0.24 GB, under the Free plan's 5 GB. If the 14-day delete fails, storage grows toward the 5 GB limit, where writes fail, so lane 2 checks the delete. The owner reports the measured bytes per photo.
- The photo adds 7 row writes to a create with one replace, 19 in total. It lands in V2-6a. The daily cap becomes the floor of 25,000 over the budgeted writes per create, 1,000 at a budget of 25, so creates stay within a quarter of the free daily row writes. `worker/create-cost.test.ts` enforces the rule, so a new write fails the test until the cap moves.
- Accessibility of the collapsible Bundles. It lands in V2-3. A header that is not a real button, or a region that stays in the tab order while closed, hides Items from screen reader and keyboard users. The owner tests the header by keyboard in `e2e/receipt.spec.ts` and records the accessibility tree in lane 2.
- A closed Bundle can hide an unclaimed unit. It lands in V2-3. The closed summary carries the flag, so a missing claim shows without opening it.
- A Host may create a link from a misread receipt, because a failing Total check blocks nothing. It lands in V2-5. The quiet note on home and on the Split page names the gap, and anyone fixes a line on the Split page. No PR here adds a block or a highlight for a mismatch.
- The Bundle detector misreads a $0.00 line, such as a free refill, as a header. It lands in V2-2. A group forms only when a discount echoes the header, prints a percent, and a run of Items under the header matches it within 1 cent, so a lone $0.00 line stays an Item. An echoing discount with no percent, or an OCR-garbled one, stays receipt-wide. A coincidental run can pull a nearby Item into a Bundle. A $0.00 modifier inside a group replaces the open header and drops the Bundle, which fails safe to receipt-wide. The bench run reports any change.
- The photo shows card digits and anything else the receipt prints. It lands in V2-6b. The operator accepted it, with no extra line on home. The server refuses EXIF, and the photo is deleted after 14 days.
- The receipt photo and its OCR lines go to OpenRouter and its pinned hosts. It lands in V2-7a, and ADR 0008 records the operator's ruling. The Worker logs no image, OCR text, or reply text.
- Spend on the model API. It lands in V2-7a. The scan limits and the daily cap of 2,000 hold spend near $2 a UTC day, and a refused scan falls back to the on-device reader in V2-7b.
- A swapped per-item discount passes every check. It lands in V2-7a and V2-7b. The eval put r4's split right in 2 of 3 readings. The "$2.00 off" detail line makes a discount on the wrong Item visible, and anyone fixes it on the Split page.
- The stored `detail` field. It lands in V2-7b. Only a Split with a detail is written as version 3, so a rollback to V2-7a makes only those Splits unreadable, and the fix is a roll forward.
- Quantity lines change the stored shape of every Split. It lands with quantities. From this release, storage changes roll forward only. Every write stores version 4, which no earlier Worker reads, so a rollback past this release makes every Split written since unreadable and is not supported. The fix for a bad release is a roll forward. Four rounds of fixes that kept old versions readable after a write each failed audit on a limit the older Worker enforced, and the version probe cost 30 to 40 times the CPU of a write, so the operator dropped that goal. Old rows at versions 1 to 3 still load, with every Share exact.
- Bundle reading is proven only on the synthetic t1, with perfect OCR. A real Bundle photo may score lower. V2-7a's harness takes a directory outside the repo, so a real photo can be scored without committing it.

## Appendix D. Links and reading list

- Read `CONTEXT.md`, `docs/adr/0001` through `0007`, and `docs/plans/receipt-splitter-v1.md` before editing.
- Read `docs/design/receipt-v2/README.md` and `round3.html` in every frame before V2-3, V2-4, V2-5, and V2-6b. The README wins over the board.
- Read `docs/design/split/README.md` before V2-3, for the Split page decisions that still hold.
- Read `/tmp/redesign/parse-pr.md` before V2-2, for how PR 22 reads the Topgolf receipt.
- Read `https://developers.cloudflare.com/durable-objects/platform/limits/` and `https://developers.cloudflare.com/durable-objects/platform/pricing/` before V2-6a.
- Run `/how` at the start of V2-1 and V2-6a, because they join the Share math and the Worker to new state.
- Run `/interrogate` on V2-1 before its PR opens, because the stored shape is the hardest part to change later.
- Keep a decision trail per `/show-me-your-work` in `docs/plans/receipt-splitter-v2.trail.tsv`, and commit it with the last PR.
