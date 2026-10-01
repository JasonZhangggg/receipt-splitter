# Receipt Splitter v1 plan

This program builds the first public version of Receipt Splitter, a free website for splitting a group bill.
A Host photographs a Receipt, the site reads it on the phone, and everyone with the link Claims their Items live and pays the Host.
The rule it enforces is that no Share goes out until the Total check passes, and the photo never leaves the device.
The PRs, in stack order, are RS-1, RS-2, RS-3, RS-4, RS-5, RS-6, RS-7, RS-8, RS-9, RS-10, and RS-11.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`. The root builds and verifies one linear stack on `main`, bottom-up. No owner merges. The root merges a PR on a clean verdict at its exact head plus green CI, under the merge rules in **Verdict and merge**. RS-3, RS-9, RS-10, and RS-11 also stop at merge-ready for the operator's review gate. RS-6 and RS-7 merged without one, on the operator's ruling of 2026-10-01.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Intent

**Problem.** Splitting a restaurant bill takes too long and goes wrong. Splitwise charges for receipt scanning. Lily Split uploads receipt photos to a public bucket, asks for every name before showing any Items, supports only Venmo, and never checks the Items against the receipt total. Friends overpay or underpay and nobody notices.

**Solution.** The Host does everything on the home page, with no steps to move between. The Host takes or uploads a photo of the Receipt. The site reads it on the phone in about a second, checks that the Items add up to the total, and highlights any row that does not. The tip comes from the receipt as one Adjustment line the Host can edit. In a bottom sheet on the same page, the Host enters a Payment handle, optionally types the names at the table, their own included, and creates a share link. Everyone who opens the link, the Host included, picks their name from a tall sheet over the Split page, or closes it to look. They check off their Items, watch every Share update live, fix the Receipt in place, and pay the Host with one tap on Venmo, Cash App, or PayPal, or copy the Zelle details.

**User stories.**

1. As a Host, I want the site to read my receipt photo on my phone, so that nobody else ever sees the photo.
2. As a Host, I want rows that break the Total check highlighted, so that I can fix a misread price in one tap.
3. As a Host, I want to type Items by hand when the photo is unreadable, so that I can still split the bill.
4. As a Host, I want the tip read from the receipt as one line I can edit, so that a handwritten tip still counts without a separate step.
5. As a Host, I want to share one link without typing names first, so that I can send it to the group chat at once.
6. As a Participant, I want to pick my name from a tall sheet or add it, so that I can start claiming in one tap.
7. As a Participant, I want to check off my Items and see my Share update live, so that I know what I owe before I pay.
8. As a Participant, I want to split a shared Item evenly, by shares, or by amount, and split each unit of a line with a quantity, so that a shared pitcher or two of three dumplings costs each of us the right amount.
9. As any Participant, I want to fix a price in the Item's detail sheet or revert someone's change from History, so that the Split stays right without waiting for the Host.
10. As a Participant, I want one tap to pay the Host on the app they use, so that I do not have to type a handle or an amount.
11. As a Participant, I want to mark myself paid and record what I paid, so that a later change shows exactly what is still owed.
12. As a Host, I want to see who has paid, so that I know whom to remind.
13. As a Host, I want to read the Receipt, fix it, and create the link on one page, so that I never lose my place between steps.
14. As a Host, I want to type my own name with the others and pick it like everyone else, so that the page needs no special "Me".
15. As a Participant, I want to close the pick sheet and look at the Split without picking, so that I can check the bill before I commit to a name.
16. As a Participant, I want my name to belong to my phone alone, and to take it back with **That's me** on a new phone, so that nobody else checks off Items as me by accident.
17. As any Participant, I want to see what nobody has claimed and know that nobody pays for it yet, so that the table can sort it out.
18. As any Participant, I want a warning when the Items stop adding up to the total, so that a bad edit does not go unnoticed.

**Out of scope.** Sign-in, saved groups, and history of past Splits. Any LLM fallback. The iOS and Android apps, although every module keeps them possible. Currencies other than USD. Debt netting across Splits. Long receipts taken in several photos. PDF receipts. WebGPU. A production deploy, which the operator runs after the stack lands.

**Decisions.** The grilling settled these, and they are binding.

- `CONTEXT.md` terms are Host, Participant, Payment handle, Split, Receipt, Item, Adjustment, Total check, Claim, Unclaimed item, Share, and Payment.
- `docs/adr/0001-on-device-ocr-no-llm-for-anonymous-use.md` keeps every photo on the device and allows no LLM.
- `docs/adr/0002-expo-universal-app.md` makes one Expo codebase that exports a static website.
- `docs/adr/0003-equal-access-no-host-privileges.md` gives everyone with the link equal access, except to Payment handles.
- `docs/adr/0004-one-durable-object-per-split.md` stores each Split as one JSON record in one Durable Object, and lists the four cost rules.
- Adjustments divide in proportion to each Participant's Claimed Items. A shared Item divides evenly among its claimers. Leftover cents go to claimers in a fixed order so Shares sum to the total exactly.
- Amounts are integer cents, and each Split carries `currency: "USD"`.
- The Total check must pass before a Split can be created. Unclaimed items never block paying. The redesign below drops the banner that split them among everyone.
- Payment handles are entered at creation, at least one is required, the device remembers them, and only the creating device can change them.
- The OCR model starts downloading in the background on the home page. A share link never downloads it.
- A Split is deleted 60 days after its last change.
- Every UI PR follows the `## UI work` rule in `CLAUDE.md`.

The operator's home redesign of 2026-09-30 settled these. They supersede earlier plan text wherever the two differ.

- The home page `/` is the one page where the Host does everything, with no navigation. The `/new` routes `app/new/index.tsx`, `app/new/tip.tsx`, `app/new/handles.tsx`, and `app/new/people.tsx` are dropped.
- The tip is inferred from the receipt and shown as one editable Adjustment line. The 18, 20, and 22 percent buttons are gone.
- The home page shows no headline, no pitch, and no full example scan.
- The visual language is round 6 idea 2, "Open table". The page is white, with gray surfaces, one black action, Plus Jakarta Sans 400 and 500 under the SIL Open Font License, and a neutral charcoal ladder in dark mode. It replaces the orange field and Archivo. Appendix E lists the tokens and the type sizes.
- v1 reads images only. The input takes a camera photo or a library photo on a phone, and an image file on a desktop. PDF upload is not in v1.
- The line "The photo stays on this phone" is left out of the page.
- Owners commit locally and never push. The root pushes once on a clean verdict, per the push rule in `~/.claude/orchestrate/receipt-splitter/preferences.md`. This replaces opening the PR ready and pushing early.

The operator's split page redesign of 2026-10-01 settled these, in the "Split page redesign", "Split redesign answers", and "Round 8 approved" sections of `~/.claude/orchestrate/receipt-splitter/preferences.md`. They supersede earlier plan text wherever the two differ, RS-9 included. The approved design is round 8 in `docs/design/split/`.

- There is no "Me". The Host types names only, their own included, on the home page.
- Everyone, the Host included, picks their name from a tall bottom sheet over the Split page, not a full page. The sheet shows an invite line, the people list, and **Not here? Add yourself**. A ✕ or a flick down closes it without a pick, and the page then shows a browse state. After a pick, the sheet springs down to its regular height and shows the people chips with yours marked "you".
- One device holds one name. A picked name shows as picked on another phone. Tapping it asks **That's me**, which moves the name to this device and drops the old device back to browsing.
- Participants can add people. Nobody can remove or rename a person.
- Everyone with the link can view and edit the Receipt, after the link exists too. This reverses RS-9's lock. Every Receipt edit is one change that anyone can revert.
- Tapping a Receipt line opens its Item sheet, with the name, the price, a quantity, and **Who had it**. A circle on the left of the line checks it off for the selected person instead.
- With quantity above 1, **Who had it** splits each unit, not the line total.
- An Item splits **Evenly**, **By shares**, or **By amount**. A remainder that a **By amount** split leaves counts as Unclaimed.
- Nobody pays for an Unclaimed item. It stays Unclaimed and flagged in yellow, and the Unclaimed figure under the Total includes its part of tax, fee, and tip. There is no "split among everyone" action.
- History opens from a clock icon in the header. It lists Payments and manual Receipt changes only. It lists no picks, joins, added people, or Claims. Each change reverts once. Reverting a change made on another device asks for confirmation first. There is no Undo toast and no "someone edited" toast.
- The Split page warns in home's style, such as "Items are $0.25 over.", when the Items stop adding up to the subtotal.
- The payer marks themselves paid, with **I already paid** on their own breakdown. Other people's breakdowns show Paid or Not paid with no buttons.
- Spacing grows by about 2 px and type shrinks by about 1 px app-wide, the home page included. Inputs stay at 16 px. Appendix E lists the values.
- RS-9, RS-10, and RS-11 still wait for the operator's review before merge.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write this exact text into the standing objective and restate it in your todolist. "Run docs/plans/receipt-splitter-v1.md under autopilot-stack. Build RS-1 through RS-11 as one linear stack on main, in that order. A PR is verified only when its unit, live, and perf boxes are all checked, and tests alone are not sufficient verification. The root merges each PR bottom-up on a clean verdict at its exact head plus green CI. RS-3, RS-9, RS-10, and RS-11 also wait at merge-ready for the operator's review gate. Each PR's test runs fit in 30 minutes. Done when every PR is verified, rebased on current main, and merged."
- [ ] Read these at program start. Re-read them at every tick.
  - [ ] `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `~/.claude/skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify-receipt-splitter/SKILL.md`, after RS-1 creates it
  - [ ] `~/.claude/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `~/.claude/skills/tdd/SKILL.md`
  - [ ] `~/.claude/skills/spec-review/SKILL.md`
  - [ ] `~/.claude/skills/create-verification-skill/SKILL.md`
  - [ ] `~/.claude/skills/emil-design-eng/SKILL.md`, `~/.claude/skills/apple-design/SKILL.md`, and `~/.claude/skills/mobile-native/SKILL.md` for every UI PR
  - [ ] `~/.claude/skills/animate/SKILL.md` and `~/.claude/skills/review-animations/SKILL.md` for every UI PR
  - [ ] `~/.claude/skills/unslop/SKILL.md` for the UI text of every UI PR
  - [ ] `~/.claude/skills/principle-model-the-domain/SKILL.md` and `~/.claude/skills/principle-type-system-discipline/SKILL.md` for RS-2 and RS-8
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a status message to the operator in chat, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, open notes and their fixers, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner is a background `poteto-agent` with `isolation: "worktree"` on the model `~/.agents/pstack-models.md` names for its role. At most `max parallel` owners run at once. Queue the rest.
- [ ] Follow this dependency graph. Each PR branches from the PR above it in the stack. Start dependent work only after its parent reaches a verified head.
  - [ ] RS-1 is first and branches from `main`.
  - [ ] RS-2 after RS-1.
  - [ ] RS-3 after RS-2.
  - [ ] RS-4 after RS-3.
  - [ ] RS-5 after RS-4.
  - [ ] RS-6 needs only RS-1. Its owner may start once RS-1 is verified, and the root restacks it onto RS-5.
  - [ ] RS-7 after RS-5 and RS-6.
  - [ ] RS-8 needs only RS-2. Its owner may start once RS-2 is verified, and the root restacks it onto RS-7.
  - [ ] RS-9 after RS-7 and RS-8.
  - [ ] RS-10 after RS-9.
  - [ ] RS-11 after RS-10.
- [ ] Hold the file boundaries.
  - [ ] RS-2 touches only `src/core/**`.
  - [ ] RS-3 touches only `bench/**` and `package.json` scripts.
  - [ ] RS-4 touches only `src/ocr/**`, `public/ort/**`, `public/models/**`, `public/_headers`, and `bench/run-ocr.mjs`.
  - [ ] RS-5 touches only `src/parse/**` and `bench/**`.
  - [ ] RS-6 touches only `src/ui/**`, `assets/fonts/**`, `app/index.tsx`, `e2e/home.spec.ts`, and `features/home.md` and `features/README.md` in `verify-receipt-splitter`.
  - [ ] RS-7 touches only `app/index.tsx`, `src/ui/**`, `src/draft.ts`, `src/draft.test.ts`, `src/ocr/**`, `public/ocr-worker.mjs`, `e2e/**`, `package.json`, and `features/**` in `verify-receipt-splitter`. RS-7 may also edit `src/parse/index.ts`, only to report an Item that `foldInto` set to 0. No PR creates a route under `app/new/`.
  - [ ] RS-8 touches only `worker/**`, `src/core/**` for the shared operation types, and `wrangler.jsonc`.
- [ ] Hold the review gate. RS-9, RS-10, and RS-11 change an interaction, and RS-3 needs the operator to check the benchmark labels. They wait for the operator's review in chat with screenshots, and a video where the PR changes an interaction, before merge. RS-6 and RS-7 merged without the gate, on the operator's ruling of 2026-10-01.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Commit locally and never push. A verifier checks out the owner's local SHA, which every worktree reaches through the shared object store.
- [ ] Draft the PR body at `/tmp/swarm-<PR>/owner/pr-body.md`.
- [ ] On a clean verdict, the root pushes that exact SHA once. The root then opens the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge, or updates the open PR, with the owner's drafted body. A stack child targets its parent branch.
- [ ] CI runs once, on the verified commit. A CI failure goes back to the owner like a lane `FAIL`.
- [ ] Force-push with lease only for a restack, and restack only when `main` moves.
- [ ] Run `npm run lint` and `npm run typecheck` before the verdict. Commit with hooks on.
- [ ] Write tests through `/tdd` at the PR's **Seams**.
- [ ] Hold the CI-robustness rule in every new e2e case. Take no action before the page hydrates. Never assert a value that is already on screen before the action that should change it. Run each new case under a 4x CPU throttle, with `Emulation.setCPUThrottlingRate` at rate 4 through a Playwright CDP session, before the verdict.
- [ ] Test logic, not looks. No test pins a style value, such as a color, a size, or a duration. The screenshot matrix and the operator's review prove the UI.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Run `/spec-review` against this plan's PR section before the code-ready report. Fix every Spec finding.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] Hold the verification budget of 2026-10-01 from `~/.claude/orchestrate/receipt-splitter/preferences.md`. Each PR gets 30 minutes of test runs at most. The budget overrides any heavier lane list in a PR section.
  - [ ] The gates are lint, typecheck, unit, worker, and e2e, about 4 minutes in total.
  - [ ] Mutants cover logic only, such as money math, `src/core`, `src/parse`, `src/draft.ts`, `worker/`, and OCR plumbing. They run against the unit and worker tests, at most about 15 per PR. Each mutant runs only the test files that cover its file, and a survivor counts only after it also survives the full unit suite. No mutant touches UI, style values, or e2e.
  - [ ] The live check is the PR's **Verify, live** lanes, run in one pass of 15 minutes or less. Lane 1 drives the main user flow. Lane 2 is the screenshot matrix. A press check is a smoke test.
  - [ ] Perf is `npm run size` plus LCP over 3 loads each at trunk and head, interleaved, in about 5 minutes.
- [ ] At the owner's merge-ready local head SHA, run the swarm per `~/.claude/skills/swarm/SKILL.md`, with all lanes in parallel and done within 30 minutes. One gates and perf lane. One live lane that runs the PR's **Verify, live** block. One audit lane that reads the diff and the receipts, distrusts the PR body, and runs no UI mutant.
- [ ] Lanes return `PASS`, `PASS+NOTES`, or `FAIL`. `FAIL` is a real defect or new logic without a test that fails for it. A missing test on a visual or a rare edge case is a note. Clean when no lane fails. `FAIL` findings go back to the owner.
- [ ] Each note names its fixer, the next PR touching those files or the cleanup PR, and goes in `~/.claude/orchestrate/receipt-splitter/notes.md`. A PR sent back fixes its own notes too.
- [ ] The first verdict runs every lane. The root checks a fix round itself, with the gates plus the check that failed, and starts no new swarm. Perf reuses deterministic trunk values (build bytes) at the same trunk SHA and keeps timings interleaved.
- [ ] Append each clean PR to the stack on `main` in order. After any restack, compare `git patch-id` of each PR's base-to-head diff against its value at the verdict SHA, per `~/.claude/skills/poteto-mode/playbooks/shipping.md`. An unchanged patch-id keeps the verdict. A changed one gets a fresh swarm.
- [ ] Merge bottom-up. A PR merges on a clean verdict at its exact head, green CI on the required check `check`, and, for a review-gated PR, the operator's approval in chat. The root then arms GitHub auto-merge with a merge commit, or merges with `--match-head-commit` pinned to that head. Never weaken a test to get CI green.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head, with its own app instance and port per `verify-receipt-splitter`. Drive only through `verify-receipt-splitter`.

- [ ] `git checkout <head SHA>`. Until the root pushes it, the head SHA exists only in the owner's commits, and the lane's worktree reaches it through the shared object store.
- [ ] Run `npm ci`, then the `verify-receipt-splitter` launch command, which exports the web build and starts `npx wrangler dev` on the lane's own port. Wait for its doctor command to report ready.
- [ ] Deliver input only through the verification skill's drive commands, which run Playwright against the lane's port. Read-only diagnostics are the doctor command, the browser console log, the network log, and `npx wrangler dev` output.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Stand up the app skeleton and the verification skill (RS-1)

**Depends on.** None.

**Files.**

- [ ] Create `package.json`, `app.json`, `tsconfig.json`, `app/_layout.tsx`, `app/index.tsx`, and `app/s/[id].tsx` from Expo SDK 57 with expo-router and `web.output` set to `"single"`.
- [ ] Create `wrangler.jsonc` with `assets.directory` `./dist`, `run_worker_first` set to `["/parties/*", "/api/*"]`, `not_found_handling` `"single-page-application"`, and a placeholder Worker at `worker/index.ts`.
- [ ] Create `vitest.config.ts`, `eslint.config.js`, `playwright.config.ts`, and `.github/workflows/ci.yml`.
- [ ] Create `scripts/size.mjs`.
- [ ] Create `.claude/skills/verify-receipt-splitter/` through `/create-verification-skill`.
- [ ] Edit `docs/agents/dev-flow.md` to say the verification skill exists.

**Build.**

- [ ] Scaffold the Expo app with a home screen and a `/s/[id]` screen that shows the route id.
- [ ] Add npm scripts `dev`, `build` (`expo export -p web`), `serve` (`wrangler dev`), `test`, `lint`, `typecheck`, `e2e`, and `size`.
- [ ] Write `scripts/size.mjs` to print the brotli size of the web entry JavaScript in `dist`, as one JSON line.
- [ ] Add CI that runs lint, typecheck, unit tests, the web build, and `npm run size` on every PR.
- [ ] Run `/create-verification-skill` so it writes launch, doctor, drive, evidence, and cleanup commands and a feature map, and proves itself once against the skeleton.

**You see.**

- [ ] `npm run build && npm run serve` serves the home screen at `http://localhost:8787/`, and `/s/abc` shows `abc` after an SPA fallback.
- [ ] `npm run size` prints one JSON line with `entryBrotliBytes`.

**Seams.**

- [ ] The exported site as a browser sees it, through Playwright in `e2e/skeleton.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/skeleton.spec.ts` gains a case that loads `/` and `/s/abc` and asserts the text `abc`. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` and `/s/abc` at trunk and head. Trunk has no app, so record that and gate that head serves both routes. Save `skeleton-routes.png`. Pass when head renders the home screen and `/s/abc` shows `abc`.
- [ ] Lane 2. Run the new `verify-receipt-splitter` skill from a clean worktree through launch, doctor, drive, evidence, and cleanup, citing its `features/README.md`. Save `verify-skill-proof.png`. Pass when every step exits 0 and cleanup leaves no process on the lane's port.

**Feature map.**

- [ ] Create `features/README.md` and `features/routes.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of the web entry JavaScript. Trunk has no app, so the metric is absolute for the skeleton.
- [ ] Probe. `npm run build && npm run size` at head, run three times.
- [ ] Baseline. Record that trunk has no build. The prototype measured 231 KB brotli for a hello-world Expo SDK 57 export.
- [ ] Rule. Fail if the entry exceeds 260 KB brotli.

**Review gate.** None. RS-1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-1 to the stack, and the operator lands it bottom-up.

## Model the Split and compute Shares (RS-2)

**Depends on.** RS-1.

**Files.**

- [ ] Create `src/core/money.ts`, `src/core/split.ts`, `src/core/shares.ts`, `src/core/total-check.ts`, and `src/core/operations.ts`.
- [ ] Create `src/core/*.test.ts` beside each module.

**Build.**

- [ ] Define branded `Cents` and the `Split`, `Receipt`, `Item`, `Adjustment`, `Participant`, `Claim`, and `Payment` types in `src/core/split.ts`, using the `CONTEXT.md` names. `Split` carries `currency: "USD"`.
- [ ] Write `computeShares(split)` in `src/core/shares.ts`. It splits each Item evenly among its claimers, divides Adjustments in proportion to Claimed Items, gives leftover cents in a fixed order by Participant id, and reports the Unclaimed items total.
- [ ] Write `runTotalCheck(receipt)` in `src/core/total-check.ts`. It returns pass, or the gap and the Item and Adjustment ids that break it.
- [ ] Write `Operation` as a tagged union and `applyOperation(split, op)` as a pure reducer in `src/core/operations.ts`, for editing, adding, and deleting Items and Adjustments, adding Participants, Claiming and unclaiming, splitting Unclaimed items among everyone, recording a Payment, and undoing a recent change. The reducer records each change in a recent-changes list capped at 50 entries.
- [ ] Reject a Payment handle change unless the operation carries the creator proof, in `applyOperation`.

**You see.**

- [ ] `npm test -- src/core` passes, and a Split of three Participants and a $30.00 shared pitcher gives Shares of 1000, 1000, and 1000 cents.

**Seams.**

- [ ] `computeShares`, `runTotalCheck`, and `applyOperation` as their callers use them, in `src/core/shares.test.ts`, `src/core/total-check.test.ts`, and `src/core/operations.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/core/shares.test.ts` gains cases for proportional tax and tip, a $10.00 Item split three ways giving 334, 333, and 333 cents, an Item-level discount, and Shares that sum exactly to the total. Run `npm test -- src/core`.
- [ ] `src/core/total-check.test.ts` gains a passing Receipt and a Receipt where $14.50 was read as $1.45, which names that Item. Run `npm test -- src/core`.
- [ ] `src/core/operations.test.ts` gains undo of a price edit, a rejected Payment handle change without creator proof, and a Payment followed by a Share change that reports the difference. Run `npm test -- src/core`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` and `/s/abc` at trunk and head. Save `core-regression.png`. Pass when both routes render the same at trunk and head, since RS-2 adds no UI.
- [ ] Lane 2. Run the worked example from `features/README.md` through `node --experimental-strip-types -e` against `src/core` at head with the three-way $10.00 Item and 8.875 percent tax. Save `core-example.png` as a terminal capture. Pass when the printed Shares sum to the Receipt total to the cent.

**Feature map.**

- [ ] None. RS-2 adds no user-facing feature.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median time of `computeShares` on a Split of 60 Items and 12 Participants. Trunk lacks the module, so the metric is absolute.
- [ ] Probe. `npx vitest bench src/core/shares.bench.ts` at head, three runs.
- [ ] Baseline. Record that trunk has no `computeShares`.
- [ ] Rule. Fail if the median exceeds 1 ms.

**Review gate.** None. RS-2 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-2 to the stack, and the operator lands it bottom-up.

## Build the receipt benchmark (RS-3)

**Depends on.** RS-2.

**Files.**

- [ ] Create `bench/data/` with about 80 images and `bench/data/ATTRIBUTION.md`.
- [ ] Create `bench/labels/<image>.json` for each image.
- [ ] Create `bench/fetch.mjs`, `bench/score.mjs`, and `bench/report.mjs`.
- [ ] Edit `package.json` to add `bench` and `bench:report` scripts.

**Build.**

- [ ] Write `bench/fetch.mjs` to download and select 50 ExpressExpense SRD receipts, 20 CORD-v2 test receipts, and 12 docjay131 receipts, chosen for tip blocks, signature slips, service charges, modifiers, blur, and skew. Commit the selected images.
- [ ] Write `bench/data/ATTRIBUTION.md` with the MIT notice for ExpressExpense, CC BY 4.0 for CORD-v2 and the Zenodo 13688441 transcriptions, and MIT for docjay131.
- [ ] Draft one label per image as a `Receipt` from `src/core/split.ts`, from the Zenodo transcriptions, the CORD gold labels, and the docjay131 labels. Mark each label `"checked": false`.
- [ ] Write `bench/score.mjs` to score a parser's output against the labels, reporting exact Item price match, Adjustment match, and Total check pass rate. Score CORD receipts on structure only.
- [ ] Write `bench/report.mjs` to render a local HTML page that shows each image beside its label, for the operator's check.
- [ ] Add a `bench/data/own/` path to `.gitignore` for the operator's own photos.

**You see.**

- [ ] `npm run bench -- --parser=labels` scores the labels against themselves at 100 percent.
- [ ] `npm run bench:report` writes `bench/out/report.html`.

**Seams.**

- [ ] `bench/score.mjs` as a CLI with a parser module path, tested in `bench/score.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `bench/score.test.ts` gains a case where one wrong Item price lowers the Item score by exactly one Item. Run `npm test -- bench`.
- [ ] `bench/labels.test.ts` gains a case that every label parses as a `Receipt` and every US label passes `runTotalCheck`. Run `npm test -- bench`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` at trunk and head. Save `bench-regression.png`. Pass when the home screen renders the same, since RS-3 adds no UI.
- [ ] Lane 2. Open `bench/out/report.html` through the verification skill's browser and page through ten receipts. Save `bench-report.png`. Pass when every page shows the image beside its label and the label total matches the printed total.

**Feature map.**

- [ ] None. RS-3 adds no user-facing feature.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `npm run bench -- --parser=labels`. Trunk lacks the benchmark, so the metric is absolute.
- [ ] Probe. `time npm run bench -- --parser=labels`, three runs at head.
- [ ] Baseline. Record that trunk has no benchmark.
- [ ] Rule. Fail if a run exceeds 30 seconds.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 screenshots into `/tmp/receipt-splitter-review/RS-3-review-labels.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of paging through `bench/out/report.html` as `/tmp/receipt-splitter-review/RS-3-review.mp4`.
- [ ] Post the screenshots and the video in chat, and ask the operator to check the labels in `bench/out/report.html`. Set `"checked": true` on each label the operator approves. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-3 to the stack, and the operator lands it bottom-up.

## Read receipts on the device (RS-4)

**Depends on.** RS-3.

**Files.**

- [ ] Create `src/ocr/index.ts`, `src/ocr/index.web.ts`, `src/ocr/index.native.ts`, and `public/ocr-worker.mjs`.
- [ ] Create `public/ort/` with the onnxruntime-web 1.30 plain WASM build and `public/models/` with the chosen det and rec models.
- [ ] Create `public/_headers`.
- [ ] Create `bench/run-ocr.mjs` and commit its output to `bench/ocr/<image>.json`.

**Build.**

- [ ] Define `recognize(image): Promise<TextBox[]>` and `prefetchModel()` in `src/ocr/index.ts`, where a `TextBox` has text and four corner points.
- [ ] Implement the web version in `src/ocr/index.web.ts` and `public/ocr-worker.mjs`, with DB detection post-processing and CTC decoding in the worker, and the ORT WASM runtime loaded from `/ort/`.
- [ ] Make `src/ocr/index.native.ts` throw a typed `OcrUnavailable` error. Native OCR is out of scope.
- [ ] Downscale the photo to 960 px on its longest side in the worker before detection.
- [ ] Set `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` on `/` in `public/_headers`, use four threads when `crossOriginIsolated` is true, and fall back to one thread otherwise.
- [ ] Cache the runtime and models in Cache Storage. `prefetchModel()` starts the download at low priority.
- [ ] Write `bench/run-ocr.mjs` to run every benchmark image through the exported site in headless Chrome and save its `TextBox[]` output and its time.
- [ ] Choose between PP-OCRv5 mobile with English rec and PP-OCRv6 tiny by running `bench/run-ocr.mjs` with each and comparing character error rate against the Zenodo transcriptions. Record the choice and the numbers in the PR body.

**You see.**

- [ ] `bench/run-ocr.mjs` prints one line per image with its character error rate and milliseconds, and a summary line with the medians.

**Seams.**

- [ ] `recognize` and `prefetchModel` as the app calls them, through Playwright in `e2e/ocr.spec.ts` against the exported site.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/ocr.spec.ts` gains a case that recognizes SRD receipt 1040 and asserts a box with the text `Subtotal $22.98`. Run `npm run e2e`.
- [ ] `src/ocr/ctc.test.ts` gains a CTC decode case with repeated and blank tokens. Run `npm test -- src/ocr`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` at trunk and head and record the entry size and whether any OCR request fires. Trunk has no OCR, so gate that head starts the model download after the page is interactive. Save `ocr-prefetch.png`. Pass when the home screen renders before the first `/models/` request starts.
- [ ] Lane 2. Recognize five benchmark receipts through a debug route at head, citing `features/ocr.md`. Save `ocr-boxes.png` with the boxes drawn on receipt 1040. Pass when every receipt returns boxes and receipt 1040 contains `Total $28.04`.

**Feature map.**

- [ ] Add `features/ocr.md` in `verify-receipt-splitter`, naming the debug route and the benchmark command.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Warm median milliseconds per receipt across the benchmark, first-scan download bytes in brotli, peak renderer memory, and entry JavaScript bytes. Trunk has only the entry size.
- [ ] Probe. `node bench/run-ocr.mjs` and `npm run size` at head, interleaved with `npm run size` at trunk.
- [ ] Baseline. Record the trunk entry size first. The prototype measured 469 ms per receipt with four threads, 1255 ms with one thread, and about 14 MB brotli of downloads on an Apple M4.
- [ ] Rule. Fail if the entry grows by more than 5 KB brotli, the four-thread median exceeds 700 ms, the one-thread median exceeds 1500 ms, the first-scan download exceeds 15 MB brotli, or peak memory exceeds 650 MB.

**Review gate.** None. RS-4 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-4 to the stack, and the operator lands it bottom-up.

## Parse text boxes into Items and Adjustments (RS-5)

**Depends on.** RS-4.

**Files.**

- [ ] Create `src/parse/rows.ts`, `src/parse/lines.ts`, and `src/parse/index.ts`.
- [ ] Create `src/parse/*.test.ts`.
- [ ] Create `bench/parsers/app.mjs`.

**Build.**

- [ ] Group `TextBox[]` into rows in `src/parse/rows.ts`, using each box's baseline slope, so a price on a curled receipt joins its own Item.
- [ ] Classify rows in `src/parse/lines.ts` as Item, quantity line such as `2 @ 4.50`, modifier, discount, subtotal, tax, tip, service charge, total, or noise. Take the rightmost price on a row as that row's price.
- [ ] Build a `Receipt` in `src/parse/index.ts` with `parseReceipt(boxes)`, then run `runTotalCheck`. When the check fails, try the known OCR confusions, such as a leading quantity `7` read for `1`, and keep a fix only if it makes the check pass.
- [ ] Point `bench/parsers/app.mjs` at `parseReceipt` over the committed `bench/ocr/` outputs.

**You see.**

- [ ] `npm run bench -- --parser=app` prints the Item score, the Adjustment score, and the Total check pass rate.

**Seams.**

- [ ] `parseReceipt(boxes)` as the app calls it, in `src/parse/index.test.ts`, with fixtures copied from `bench/ocr/`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/parse/index.test.ts` gains SRD receipt 1040 parsed to five Items, a subtotal of 2298 cents, and a total of 2804 cents. Run `npm test -- src/parse`.
- [ ] `src/parse/index.test.ts` gains the curled SRD receipt 1019 with each price on its own Item. Run `npm test -- src/parse`.
- [ ] `src/parse/lines.test.ts` gains a quantity line, a modifier with a price, and an Item-level discount. Run `npm test -- src/parse`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `npm run bench -- --parser=app` at trunk and head. Trunk has no parser, so record that and gate the head scores. Save `parse-bench.png` as a terminal capture. Pass when the head scores meet the perf rule.
- [ ] Lane 2. Recognize and parse SRD receipt 1019 through the debug route from `features/ocr.md`. Save `parse-1019.png` with the parsed Items listed. Pass when every Item shows its own price and the Total check passes.

**Feature map.**

- [ ] Update `features/ocr.md` in `verify-receipt-splitter` to show the parsed Receipt on the debug route.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total check pass rate on US benchmark receipts with no edits, exact Item price match rate, and median parse milliseconds. Trunk lacks the parser, so the metrics are absolute.
- [ ] Probe. `npm run bench -- --parser=app` at head, three runs.
- [ ] Baseline. Record that trunk has no parser.
- [ ] Rule. Fail if the Total check pass rate is under 70 percent, the Item price match is under 90 percent, or the median parse exceeds 20 ms. Record the numbers in the PR body so later PRs can only raise them.

**Review gate.** None. RS-5 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-5 to the stack, and the operator lands it bottom-up.

## Set the visual direction (RS-6)

**Depends on.** RS-1.

**Files.**

- [ ] Rework the open RS-6 branch in place. It already holds `src/ui/`, `assets/fonts/`, `app/index.tsx`, `e2e/home.spec.ts`, and `features/home.md` from the Table direction.
- [ ] Edit `src/ui/colors.ts`, `src/ui/theme.ts`, `src/ui/document.ts`, `src/ui/motion.ts`, and `src/ui/home-copy.ts`.
- [ ] Edit `src/ui/components/button.tsx` and `src/ui/components/sheet.tsx`.
- [ ] Create `src/ui/components/slip.tsx`, `src/ui/components/payment-row.tsx`, `src/ui/components/name-chips.tsx`, and `src/ui/components/file-row.tsx`.
- [ ] Create the Plus Jakarta Sans 400 and 500 Latin WOFF2 files and their `OFL.txt` in `assets/fonts/`. Delete the Archivo files. Edit `assets/fonts/fallback-metrics.mjs`.
- [ ] Edit `app/index.tsx` and `e2e/home.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`. Read `review-animations` by hand. Run `unslop` on every UI string.
- [ ] Remove the Table direction first. Delete the orange field, Archivo and its fallback faces, the headline with its `cqi` sizing and its mask, the pitch, the example scan, and their cases in `e2e/home.spec.ts`. Delete any other piece the approved design `docs/design/home/idea2.html` does not show.
- [ ] Keep the Button press behavior in `src/ui/components/button.tsx` and every committed press case in `e2e/home.spec.ts`. Point each case at a Button the new page renders in the same position, inside the scroll view or outside it. Keep every timing bound. List each case's old target and new target in the PR body.
- [ ] Close the RS-6 notes in `~/.claude/orchestrate/receipt-splitter/notes.md`.
  - [ ] Kill the eight press mutants that survive the committed e2e, V14, W18, W19, W6c, W7, W12, W17, and W16 in `/tmp/swarm-RS-6/v7-audit/mutants.summary`. Add a test that fails for each one, or delete the code that no test can justify.
  - [ ] Stop a passing mouse with its left button down from hiding a held press it did not start, at `button.tsx:51-52`. Park only presses that came from a mouse.
  - [ ] Filter `metaKey` on keydown, so Cmd+Enter does not leave the press look on until blur.
  - [ ] Clear the last mouse id in `pointer.current`, so a mouse that leaves during a held Space keeps the key's look.
  - [ ] List in the PR body's census that a Space press blurred while held leaves the document keyup listener of `PressResponder` active.
  - [ ] Correct the census row "unmount mid-press not reachable". A resize across the breakpoint swaps the Buttons.
  - [ ] Map the PR body's pre-rebase SHAs and test counts to the current ones, from `/tmp/swarm-RS-6/v7-audit/sha-map.txt`.
- [ ] Give Button a `disabled` state that its look follows, because **Create split link** shows disabled on the empty page.
- [ ] Write the white look as tokens in `src/ui/colors.ts` and `src/ui/theme.ts`, in light and dark, from Appendix E. Dark mode is the neutral charcoal ladder with no warm tint. Set `theme-color` to `#FFFFFF` in light and `#121315` in dark.
- [ ] Self-host Plus Jakarta Sans 400 and 500 from `@fontsource/plus-jakarta-sans@5.3.0`, with its `OFL.txt`. Use no weight above 500. Retarget `assets/fonts/fallback-metrics.mjs` to the new face and the new copy, so the font swap does not move the layout.
- [ ] Build the static components in `src/ui/components/`. Each renders in light and dark and reads no app state yet.
  - [ ] Build the blank slip in `slip.tsx`. It is a faint `--paper` slip with hairline lines and the black camera button on it.
  - [ ] Rebuild `sheet.tsx` as the bottom sheet, in place of the modal sheet that has no caller. It is white, with a hairline, a soft neutral shadow, a grab handle, and padding for the bottom safe-area inset. From 900 px it is a 380 px panel at the right.
  - [ ] Build the payment row in `payment-row.tsx`. An app picker shows Venmo by default, one handle field shows that app's placeholder, and a **+** button adds another app.
  - [ ] Build the name chips in `name-chips.tsx`, with **Me** and **+ Add**.
  - [ ] Give Button the primary look, a 54 px black pill that is white in dark mode. The blocked look uses `--off`, with room for one short reason line above it in the yellow highlight.
  - [ ] Build the file row in `file-row.tsx`, with a thumbnail, the file name, the Item count, and one replace button.
- [ ] Build the empty state of the home page in `app/index.tsx`.
  - [ ] Put the wordmark **Receipt Splitter** at the top left and a small **Example** link at the top right.
  - [ ] Fill the space above the sheet with the hero. It holds the blank slip, the black camera button, **Add receipt**, and an image-only subline of a few words, such as "Take or upload a photo".
  - [ ] Put the payment row, the name chips, and a disabled **Create split link** in the sheet.
  - [ ] From 900 px, draw the hero as a gray drop area left of the panel, with **Drop a receipt** and an image-only subline.
  - [ ] Show no headline, no pitch, no example scan, and no line about the photo staying on the phone.
- [ ] Make the sheet taller by default than the round 6 prototype, per the operator's tweak. The prototype sheet measured 223 px at 390 by 844 when empty. Keep the camera button and **Add receipt** fully above the sheet at 375 by 667. Record the chosen height in `features/home.md`.
- [ ] Build the press motion with `animate`. The hero slip scales to 0.97 over 120 ms with `cubic-bezier(0.23, 1, 0.32, 1)`. The action moves from the blocked look to black over 180 ms ease. Under reduced motion nothing scales.
- [ ] Keep the OCR model prefetch effect that RS-4 added to `app/index.tsx`.

**You see.**

- [ ] At 390 by 844, `/` shows a white page with **Receipt Splitter**, **Example**, the blank slip with the black camera button, and **Add receipt**. The sheet below shows **Venmo**, the handle field, **+**, **Me**, **+ Add**, and a disabled **Create split link**.
- [ ] At 1280 px, the drop area sits left of the 380 px panel. In dark mode the page is `#121315` and the action is a white pill.

**Seams.**

- [ ] The home page and its Buttons as a user sees and presses them, through Playwright in `e2e/home.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/home.spec.ts` keeps every committed press case, pointed at the new page's Buttons, with every timing bound unchanged. Run `npm run e2e`.
- [ ] `e2e/home.spec.ts` gains one case for each of the mutants V14, W18, W19, W6c, W7, W12, W17, and W16, and each case fails with its mutant applied. Run `npm run e2e`, then rerun the root's 45 mutants from `/tmp/swarm-RS-6/v7-audit/` and record zero survivors.
- [ ] `e2e/home.spec.ts` gains the empty state at 390 px. **Add receipt** takes keyboard focus with a visible ring, and **Create split link** has `aria-disabled="true"`. Run `npm run e2e`.
- [ ] `e2e/home.spec.ts` gains a sheet taller than 223 px at 390 by 844, and a camera button fully above the sheet at 375 by 667. Run `npm run e2e`.
- [ ] `e2e/home.spec.ts` keeps the home matrix. It fails on clipped text, horizontal page overflow, a missing Plus Jakarta Sans face, or a console error at 320, 375, 390, 900, 1024, and 1280 px. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` at trunk and head at 390 px. Trunk shows the RS-4 placeholder home, so record that and gate the head empty state. Save `home-trunk-head.png`. Pass when head shows the empty state from **You see**, `/s/abc` still resolves, the first `/models/` request starts after first contentful paint, and the console has no errors.
- [ ] Lane 2. Drive `/` at 375, 390, and 1280 px, in light and dark, with reduced motion on and off, citing `features/home.md`. Save `home-matrix.png`. Pass when no text overflows, every text pair meets WCAG AA, every target is at least 44 by 44 px, and no animation runs under reduced motion.
- [ ] Lane 3. Press lane. Run the press harness `/tmp/swarm-RS-6/v5-worker-1/press5.mjs` against the new page's Buttons by mouse, pen, touch, and keyboard, with drag-in and multi-pointer cases added, citing `home-press` in `features/home.md`. Save `home-press.png`. Pass when every case matches the press rules in `features/home.md`.
- [ ] Lane 4. Measure the sheet at 390 by 844 and at 375 by 667 with a 34 px bottom safe-area inset, citing `home-sheet` in `features/home.md`. Save `home-sheet.png`. Pass when the sheet is taller than 223 px at 390 by 844, the camera button and **Add receipt** sit fully above it at both sizes, the inset lifts the sheet's content by 34 px, and the handle field's text is at least 16 px.

**Feature map.**

- [ ] Rewrite `features/home.md` in `verify-receipt-splitter` for the new page, with the sub-features `home-hero`, `home-sheet`, `home-press`, `home-layout`, and `home-theme`. Drop `home-headline`, `home-example`, `home-bar`, and the gotcha that the action goes to `/new`. List Home in `features/README.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Entry JavaScript brotli bytes, font bytes, and home page Largest Contentful Paint under Playwright's mobile emulation with 4G throttling.
- [ ] Probe. `npm run size` and a Playwright LCP measurement at trunk and head, interleaved, three runs each.
- [ ] Baseline. Record the trunk entry size and LCP first. The two prototype font files measure 24 KB together.
- [ ] Rule. Fail if the entry grows by more than 40 KB brotli, fonts exceed 30 KB, or head LCP exceeds 1.5 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 4 screenshots into `/tmp/receipt-splitter-review/RS-6-review-home.png` and `/tmp/receipt-splitter-review/RS-6-review-sheet.png`. Put them beside the approved sheet `docs/design/home/idea2.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of the home page in both modes, with a press on each Button, as `/tmp/receipt-splitter-review/RS-6-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-6 to the stack, and the operator lands it bottom-up.

## Read a Receipt and fix it on the home page (RS-7)

**Depends on.** RS-5 and RS-6.

**Files.**

- [ ] Edit `app/index.tsx`.
- [ ] Create `src/ui/receipt-input/` and `src/ui/receipt-editor/`.
- [ ] Create `src/draft.ts` and `src/draft.test.ts`.
- [ ] Edit the sheet, the payment row, the name chips, the file row, Button, and Toast in `src/ui/components/`.
- [ ] Edit `src/ocr/index.web.ts` and `public/ocr-worker.mjs`.
- [ ] Create `e2e/scan.spec.ts` and `e2e/toast.spec.ts`. Edit `e2e/home.spec.ts` and `package.json`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`. Read `review-animations` by hand. Run `unslop` on every UI string.
- [ ] Take a Receipt image on `/` in `src/ui/receipt-input/`.
  - [ ] Open the system picker with `accept="image/*"` on a tap of the hero. On a phone the picker offers the camera and the photo library.
  - [ ] On a desktop, read an image dragged onto the drop area and dropped, or pasted from the clipboard. Show the drag-over look while a file is over the area.
  - [ ] Refuse any file that is not an image with one short line.
  - [ ] Decode with `imageOrientation: "from-image"`, so an EXIF-rotated phone photo reads upright.
  - [ ] Keep every scan on `/`. `public/_headers` already isolates `/`, so the four-thread path needs no new header.
- [ ] Show the reading state.
  - [ ] Turn the slip into a skeleton slip with a progress bar under it and no photo. The bar shows the model download, then OCR.
  - [ ] Build the operator's reading animation with `animate`. The slip's lines darken one by one while OCR runs, and the animation ends when the Items show. Under reduced motion the lines hold still, and the bar updates with no transition.
  - [ ] Run `review-animations` on the reading animation and fix each finding.
- [ ] Show the read state.
  - [ ] Put the file row on top, with the thumbnail, the file name, the Item count, and one replace button that opens the picker again.
  - [ ] Put the receipt card below it, with the editable Items, then Subtotal, Tax, the other Adjustments, the Tip line, and the Total.
  - [ ] Highlight each row that `runTotalCheck` names in the yellow highlight.
  - [ ] Let the Host edit an Item's name or price, add an Item, and delete a row, with one tap each. Rerun `runTotalCheck` on every change.
- [ ] Show the tip as one editable Adjustment line, inferred from the receipt. When the receipt prints no tip, the line reads $0.00. A tip edit moves the Total by the same amount, so it never breaks the Total check.
- [ ] When OCR fails or finds no Items, open the same editor empty and keep the file row, so the Host can type the Items.
- [ ] Wire **Create split link** to the draft. It stays disabled with one short reason until the Total check passes and one Payment handle exists, such as "Items are $0.50 short." or "Add how to pay you." Show no reason on the empty page. RS-9 gives the enabled action its handler.
- [ ] Wire the payment row and the name chips to the draft. They moved here from RS-9 because they need no server.
  - [ ] Offer Venmo, Cash App, PayPal, and Zelle in the picker, with Venmo first. Each app shows its own placeholder. **+** adds a row for another app.
  - [ ] Show **Me** for the Host. **+ Add** adds a name, and a name chip can be removed.
- [ ] Keep the draft in local storage through `src/draft.ts`, with the Receipt, the tip, the Payment handles, and the names, so a reload does not lose it. Keep the Payment handles on the device when the Host replaces the Receipt.
- [ ] Make **Example** fill the draft with a bundled example Receipt, copied from the checked label of SRD receipt 1040, so a Host can try the editor without a photo.
- [ ] Close the RS-7 notes in `~/.claude/orchestrate/receipt-splitter/notes.md`.
  - [ ] Lift the Toast above the sheet.
  - [ ] Move the Toast test from `e2e/home.spec.ts` to `e2e/toast.spec.ts`, and declare `esbuild` in `package.json`.
  - [ ] Give the sheet drag on its grab handle with velocity handoff, a max height with its own scroll, and `overscroll-behavior: contain`. The sheet never leaves the page, so a drag down collapses it to the action instead of dismissing it.
  - [ ] Truncate each OCR line to 80 graphemes before `createSplit`, refuse blank rows, and refuse a price over `MAX_CENTS`.
  - [ ] Show 0-cent Items, such as "APPS OUT FIRST" on SRD receipt 1019.
  - [ ] Show the Host when `foldInto` in `src/parse/index.ts` sets an Item to 0 because a discount exceeds its price.
  - [ ] Release the OCR worker after a scan.
  - [ ] Let a scan skip the wait on an in-flight low-priority prefetch, at `public/ocr-worker.mjs:130-138,153`.
  - [ ] Cache the ORT JavaScript glue with the runtime and the models, so a cached scan runs offline.
  - [ ] Add `parse`, `parse-items`, and `parse-check` to the test ids in `features/README.md`.
  - [ ] Use five Items for SRD receipt 1040 in every RS-7 test and lane. The old plan text said three, and the checked label has five.

**You see.**

- [ ] Choosing SRD receipt 1040 on `/` shows the reading state, then the file row with "5 items". The receipt card shows five Items, Subtotal $22.98, Tax $1.61, the service charge $3.45, Tip $0.00, and Total $28.04. With a Venmo handle typed, **Create split link** is enabled.
- [ ] Changing the Perrier Sparkling Water price to 3.00 highlights that row and disables **Create split link** with "Items are $0.50 short." until the numbers add up again.

**Seams.**

- [ ] The home page as a Host drives it, through Playwright in `e2e/scan.spec.ts`.
- [ ] `loadDraft`, `saveDraft`, and `blockedReason(draft)` in `src/draft.ts` as the page calls them, in `src/draft.test.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/draft.test.ts` gains `blockedReason` for no Receipt, reading, $0.50 short, $0.50 over, no Payment handle, and ready, each against its literal string or `null`. Run `npm test -- src/draft`.
- [ ] `src/draft.test.ts` gains a draft saved and loaded with the Receipt, the tip, two Payment handles, and three names. It also gains an OCR line cut to 80 graphemes and a price over `MAX_CENTS` refused. Run `npm test -- src/draft`.
- [ ] `e2e/scan.spec.ts` gains SRD receipt 1040 chosen through the picker. It asserts five Items, Tip $0.00, Total $28.04, and an enabled **Create split link** after a Venmo handle. Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains a price edit that breaks the Total check, and asserts the highlighted row and "Items are $0.50 short." Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains a tip edit to 4.60 that moves the Total to $32.64 and keeps the action enabled. Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains a failed read that opens the empty editor, then manual entry of two Items and a total. Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains an image dropped and an image pasted at 1280 px, a PDF refused with one line, and an EXIF-rotated phone photo read upright. Run `npm run e2e`.
- [ ] `e2e/toast.spec.ts` gains the Toast timer restart, its live region, its 44 px target, and its place above the sheet. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Choose SRD receipt 1040 on `/` at trunk and head. Trunk shows only the static empty page, so record that and gate the head flow from the file chosen to an enabled **Create split link**. Save `scan-1040.png`. Pass when head shows five Items and the Total check passes.
- [ ] Lane 2. Choose the curled SRD receipt 1019, citing `features/scan.md`. Save `scan-1019.png`. Pass when each price sits on its own Item, or the failing rows are highlighted and one edit makes the check pass.
- [ ] Lane 3. Edit an Item price, add a missing Item, and delete a noise row, citing `features/scan.md`. Save `scan-edit.png`. Pass when each change updates the highlight and the reason, and **Create split link** enables only when the check passes.
- [ ] Lane 4. Read a blank image, then type a Receipt by hand and edit the tip line, citing `features/scan.md`. Save `scan-manual-tip.png`. Pass when the empty editor opens and the Total moves by exactly the tip edit.
- [ ] Lane 5. Record the reading state at 390 px with motion on and with reduced motion, citing `features/scan.md`. Save `scan-reading.png` and `scan-reading.mp4`. Pass when the slip's lines darken one at a time, the animation ends when the Items show, and `document.getAnimations()` is empty under reduced motion.
- [ ] Lane 6. Reload mid-edit at 390 px with the browser offline after the model is cached, citing `features/scan.md`. Save `scan-reload-offline.png`. Pass when the draft survives the reload and OCR still runs offline.
- [ ] Lane 7. At 1280 px, drag an image onto the drop area and drop it, paste another, and drop a PDF, citing `features/scan.md`. Save `scan-desktop-input.png`. Pass when both images read and the PDF gets one short refusal line.
- [ ] Lane 8. Switch the app to Cash App, add Venmo with **+**, add two names, remove one, and reload, citing `features/scan.md`. Save `scan-sheet-state.png`. Pass when the placeholder follows the app, the Payment handles and names survive the reload, and with no handle the reason reads "Add how to pay you."

**Feature map.**

- [ ] Add `features/scan.md` in `verify-receipt-splitter`. Update `features/home.md` for the wired sheet, and the test ids in `features/README.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Milliseconds from file chosen to editable Items shown with the model cached, entry JavaScript brotli bytes, and peak renderer memory over 20 scans in one tab.
- [ ] Probe. A Playwright timing of the home page flow at head over the five RS-4 receipts, 20 scans in one tab with renderer memory sampled after each, and `npm run size` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk entry size first. Trunk has no read state. RS-4 measured renderer memory climbing about 4 MB per scan with the worker kept alive.
- [ ] Rule. Fail if the median from file chosen to Items shown exceeds 2000 ms on the four-thread path, the entry grows by more than 30 KB brotli, or peak renderer memory over 20 scans exceeds 650 MB.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 1, 3, and 5 screenshots into `/tmp/receipt-splitter-review/RS-7-review-scan.png`, `/tmp/receipt-splitter-review/RS-7-review-edit.png`, and `/tmp/receipt-splitter-review/RS-7-review-reading.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of reading and fixing a Receipt on the home page as `/tmp/receipt-splitter-review/RS-7-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-7 to the stack, and the operator lands it bottom-up.

## Serve live Splits from a Durable Object (RS-8)

**Depends on.** RS-2.

**Files.**

- [ ] Create `worker/index.ts`, `worker/split-server.ts`, `worker/create.ts`, and `worker/rate-limit.ts`.
- [ ] Create `worker/*.test.ts` and `vitest.worker.config.ts`.
- [ ] Edit `wrangler.jsonc` to bind the `SplitServer` Durable Object with a `new_sqlite_classes` migration.
- [ ] Edit `src/core/operations.ts` only to export the wire message types.

**Build.**

- [ ] Write `SplitServer` in `worker/split-server.ts` as a partyserver `Server` with `static options = { hibernate: true }`. It stores the whole Split as one JSON row, applies each incoming `Operation` with `applyOperation`, and broadcasts the new state.
- [ ] Reject any operation that would push the stored JSON over 32 KB.
- [ ] Set the expiry alarm once at creation. When it fires, delete the Split if the last change is 60 days old, and otherwise reschedule for 60 days after the last change.
- [ ] Answer heartbeats with `setWebSocketAutoResponse`. Use no timers in the Worker.
- [ ] Write `POST /api/splits` in `worker/create.ts`. It verifies a Turnstile token with siteverify, applies a per-IP rate limit, creates the Split, and returns the Split id and a creator secret for the creating device.
- [ ] Apply a per-Split rate limit on operations in `worker/rate-limit.ts`.
- [ ] Route `/parties/split-server/:id` with `routePartykitRequest` in `worker/index.ts`.

**You see.**

- [ ] Two WebSocket clients on one Split each receive the other's Claim within one message.
- [ ] `npx wrangler dev` logs no error when a Split is created with the Turnstile test key `1x00000000000000000000AA` and secret `1x0000000000000000000000000000000AA`.

**Seams.**

- [ ] `POST /api/splits` and the WebSocket at `/parties/split-server/:id` as the client uses them, in `worker/split-server.test.ts` with `@cloudflare/vitest-plugin`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `worker/split-server.test.ts` gains a case where one client Claims an Item and a second client receives the new state. Run `npm run test:worker`.
- [ ] `worker/split-server.test.ts` gains a rejected Payment handle change without the creator secret and an accepted one with it. Run `npm run test:worker`.
- [ ] `worker/split-server.test.ts` gains an alarm that deletes a Split 60 days after its last change and reschedules a Split changed since. Run `npm run test:worker`.
- [ ] `worker/create.test.ts` gains a failed Turnstile token that returns 403 and an eleventh create from one IP within a minute that returns 429. Run `npm run test:worker`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` and `/s/abc` at trunk and head. Trunk has no server, so record that and gate that head creates a Split through `POST /api/splits` and two clients see each other's Claims. Save `server-two-clients.png`. Pass when both clients show the same state after each Claim.
- [ ] Lane 2. Open three clients on one Split, idle 60 seconds, then send a Claim, citing `features/live.md`. Save `server-hibernate.png` as a capture of `wrangler dev` output. Pass when the Durable Object logs that it woke from hibernation and every client receives the Claim.
- [ ] Lane 3. Drop one client's network for 10 seconds while another Claims, citing `features/live.md`. Save `server-reconnect.png`. Pass when the dropped client reconnects and shows the Claim.
- [ ] Lane 4. Send operations until the Split nears 32 KB, citing `features/live.md`. Save `server-cap.png`. Pass when the operation that crosses 32 KB is rejected with an error and the stored state is unchanged.

**Feature map.**

- [ ] Add `features/live.md` in `verify-receipt-splitter`, naming how to open several clients on one Split.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Local round-trip milliseconds from a Claim sent by one client to the state received by another, and a count of `setInterval`, `setTimeout`, and `ws.accept(` in `worker/`.
- [ ] Probe. A 200-Claim script against `wrangler dev` at head, and `grep -rnE "setInterval|setTimeout|ws\.accept\(" worker/` at head.
- [ ] Baseline. Record that trunk has no server.
- [ ] Rule. Fail if the p95 round trip exceeds 150 ms locally or the grep finds any match.

**Review gate.** None. RS-8 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-8 to the stack, and the operator lands it bottom-up.

## Create a Split and join it by link (RS-9)

RS-9 is built as PR 13 at `2e8d6d5` and waits for the operator's review. Its boxes below record what it built. RS-10 replaces three parts of it under the split page redesign. The full-page "Which one are you?" becomes the tall pick sheet. The Host's "Me" Participant goes away, and the Host types their own name like any other. The Receipt stops being locked once the link exists, because everyone can edit it on the Split page.

**Depends on.** RS-7 and RS-8.

**Files.**

- [ ] Create `src/ui/turnstile.web.tsx`, `src/live/client.ts`, and `src/device.ts`.
- [ ] Edit `app/index.tsx` and the sheet in `src/ui/components/`.
- [ ] Edit `app/s/[id].tsx`.

**Build.**

- [ ] Give **Create split link** on `/` its handler. Get an invisible Turnstile token from `src/ui/turnstile.web.tsx`, then create the Split through `POST /api/splits` with the draft's Receipt, Payment handles, and names, with the Host as "Me". Store the creator secret with `src/device.ts`.
- [ ] Show progress on the action while the request runs. On a failure, show one short reason and enable the action again.
- [ ] Show the link in the sheet with **Share** and **Copy**. **Share** opens the system share sheet. **Copy** puts the link on the clipboard. Where the browser has no share sheet, show **Copy** alone.
- [ ] Lock the receipt card on `/` once the link shows, because the Split now lives at the link. Replacing the receipt starts a new draft and keeps the Payment handles.
- [ ] Connect with partysocket in `src/live/client.ts`, and never import `src/ocr` from the `/s/[id]` route.
- [ ] Ask "Which one are you?" on `app/s/[id].tsx`, with every name, names picked on another device marked, and a **Someone else** option that adds a Participant. Remember the choice per Split in `src/device.ts`, with a **Not Sam?** link that clears it.
- [ ] Show "This split has expired" when the Split no longer exists.

**You see.**

- [ ] After the Host reads a Receipt on `/`, enters a Venmo handle, adds two names, and taps **Create split link**, the sheet shows **Share** and **Copy**. The link opens on a second browser and asks "Which one are you?" with "Me" and both names.

**Seams.**

- [ ] The create and join flows as users drive them, through Playwright in `e2e/join.spec.ts` against `wrangler dev`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/join.spec.ts` gains a create from the home sheet with no names, a join as **Someone else**, and asserts the new name appears for the Host. Run `npm run e2e`.
- [ ] `e2e/join.spec.ts` gains a reload of the share link that skips "Which one are you?" and shows **Not Sam?**. Run `npm run e2e`.
- [ ] `e2e/join.spec.ts` gains a share link visit that makes no request under `/models/` or `/ort/`. Run `npm run e2e`.
- [ ] `e2e/join.spec.ts` gains **Copy**, which puts the exact link on the clipboard, and a failed Turnstile token, which shows one reason and enables the action again. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the home page to an enabled **Create split link** at trunk and head. The trunk action has no handler, so record that and gate the head flow from the tap to a share link that a second browser opens. Save `join-end-to-end.png`. Pass when the second browser shows "Which one are you?" with every name.
- [ ] Lane 2. Join from two browsers as the same name, citing `features/join.md`. Save `join-same-name.png`. Pass when the second browser shows that name as picked on another device.
- [ ] Lane 3. Create a Split with no names, then join as **Someone else** from three browsers, citing `features/join.md`. Save `join-someone-else.png`. Pass when all three names appear on every browser.
- [ ] Lane 4. Try to change the Venmo handle from a joined browser and from the creating browser, citing `features/join.md`. Save `join-handle-lock.png`. Pass when only the creating browser can change it.
- [ ] Lane 5. Open an unknown Split id, citing `features/join.md`. Save `join-expired.png`. Pass when the page says "This split has expired".
- [ ] Lane 6. Create a Split on the COOP and COEP page, citing `features/join.md`. Save `join-turnstile.png`. Pass when Turnstile returns a token under cross-origin isolation, or record the failure and confirm the one-thread fallback path creates the Split.
- [ ] Lane 7. Tap **Share** and **Copy** in the sheet at 390 px and at 1280 px, citing `features/join.md`. Save `join-share-copy.png`. Pass when **Share** hands the link to `navigator.share` where the browser has it, and **Copy** puts the exact link on the clipboard.

**Feature map.**

- [ ] Add `features/join.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Milliseconds from opening a share link to "Which one are you?" under Playwright mobile emulation with 4G throttling, bytes transferred on that route, and entry JavaScript brotli bytes.
- [ ] Probe. A Playwright timing of `/s/<id>` at head, three runs, and `npm run size` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk entry size first. Trunk has no join screen.
- [ ] Rule. Fail if the share link takes more than 2000 ms to show "Which one are you?", transfers more than 400 KB, or the entry grows by more than 25 KB brotli.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 1, 2, 4, and 7 screenshots into `/tmp/receipt-splitter-review/RS-9-review-join.png`, `/tmp/receipt-splitter-review/RS-9-review-same-name.png`, `/tmp/receipt-splitter-review/RS-9-review-handles.png`, and `/tmp/receipt-splitter-review/RS-9-review-share.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of creating a Split and joining it from a second browser as `/tmp/receipt-splitter-review/RS-9-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-9 to the stack, and the operator lands it bottom-up.

## Claim Items live and undo mistakes (RS-10)

**Depends on.** RS-9.

RS-10 builds the Split page of round 8 in `docs/design/split/`. Read its `README.md` first. The operator's decisions there win over the board. The core and server half is built on the local branch `rs-10-claims` at `187798a`, and its boxes below are checked with their commits. The UI half starts from that head.

**Files.**

- [x] Edit `src/core/operations.ts`, `src/core/split.ts`, `src/core/shares.ts`, `worker/rate-limit.ts`, and their tests. Edit `e2e/join.spec.ts`. Done in `eb1899c` through `187798a`.
- [ ] Edit `src/core/split.ts`, `src/core/operations.ts`, `src/core/shares.ts`, `src/core/operations.test.ts`, and `src/core/shares.test.ts` again for quantity, split modes, and **That's me**.
- [ ] Edit `src/ui/theme.ts` and the home components in `src/ui/components/` for the new spacing and type.
- [ ] Create `src/ui/split-view/`, `src/ui/item-sheet/`, and `src/ui/history/`.
- [ ] Edit `app/s/[id].tsx`, `app/index.tsx`, and `src/device.ts`.
- [ ] Create `e2e/claim.spec.ts`. Edit `e2e/join.spec.ts` where RS-9's full page goes away.

**Build.**

- [x] Refuse a change or a new Split that leaves two Participants with one name, as `nameTaken`, ignoring case and outer spaces. A stored Split that already repeats a name takes no further repeat. Done in `eb1899c` and `7d69511`.
- [x] Hold one device per name. A second device's pick, and an Undo of an unmark after someone else took the name, are refused as `namePicked`. An unmark is a recorded change that Undo reverses. Done in `4e9b050` and `ab4f8d8`.
- [x] Start every name unpicked in `createSplit`, so the Host picks like everyone else. Done in `ab4f8d8`.
- [x] Make Participants add-only. `removeParticipant` is refused as `removalNotAllowed` for every client. Done in `ab4f8d8`.
- [x] Make every Receipt edit by any Participant one recorded change that Undo reverses, and carry it between clients and across a Durable Object wake. Done in `195fffe` and `02daed8`.
- [x] Keep the Receipt as created in `original`, and add `restoreReceipt`, one recorded change that puts every Item and Adjustment back and keeps the Claims on rows that stayed. Done in `84680f8`, `82d6225`, and `187798a`.
- [x] Charge each recorded change's bytes to a per-Split history bucket of 5 KB that refills at 1 KB a second in `worker/rate-limit.ts`. Keep 64 recent changes and cap one change at 5 KB, so a burst cannot push a change out of reach of Undo. Done in `84680f8`.
- [x] Add `shareBreakdown(split, participantId)` in `src/core/shares.ts`, whose Item and Adjustment lines add up to the Share from `computeShares`. Done in `4798fae`.
- [x] Drive the 4500 close test in `e2e/join.spec.ts` with the page clock instead of a 3 second wait. Done in `17fdc9d`.
- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`. Build motion with `animate`. Read `review-animations` by hand and fix each finding. Run `unslop` on every UI string.
- [ ] Run `/architect` on the core changes below before code, and name the data shape first.
- [ ] Add quantity and split modes to the model in `src/core/split.ts`, with `computeShares` and `shareBreakdown` following.
  - [ ] Give each Item a quantity of 1 or more. With quantity above 1, **Who had it** splits each unit, not the line total. Each unit takes its own claimers.
  - [ ] Give each Item one split mode, `even`, `shares`, or `amount`, as a discriminated union. `shares` holds a whole-number weight per claimer. `amount` holds cents per claimer.
  - [ ] Count the cents that an `amount` split leaves unassigned as Unclaimed. Refuse an `amount` split whose parts exceed the price.
  - [ ] Keep Adjustments in proportion to each Participant's claimed cents. Unclaimed cents, and their part of each Adjustment, stay out of every Share.
  - [ ] Make a change to the quantity, the split mode, the shares, or the amounts one recorded change that Undo reverses.
- [ ] Add a core operation for **That's me** that moves a picked name to the sending device, and drops the old device back to browsing. Record it outside History.
- [ ] Delete the `splitUnclaimed` operation and its tests, since nobody pays for Unclaimed items and no page sends it. Close the RS-2 note on its `tooLarge` rejection with it.
- [ ] Change the spacing and type tokens app-wide in `src/ui/theme.ts`, per Appendix E, so the home page moves too. Inputs stay at 16 px. The chip row on the Split page keeps an 8 px gap.
- [ ] Build the tall pick sheet in `src/ui/split-view/`, per frames B, C, C2, D, and J-C.
  - [ ] Open it over `app/s/[id].tsx` on every visit with no pick stored for this device. Show the invite line, such as "Jason invited you to split Sukhothai Sushi · $32.64", or "Link ready." for the creating device. Below it, show every name with the creator first, and **Not here? Add yourself** at the bottom.
  - [ ] Mark a name picked on another phone. Tapping it shows "Picked on another phone." with **That's me** and **Cancel** inline in the row.
  - [ ] Close the sheet with a ✕ or a flick down, without a pick.
  - [ ] Remember the pick per Split in `src/device.ts`. Delete RS-9's full page and its **Not Sam?** link.
  - [ ] Collapse to the regular sheet after a pick, per the spec beside frame E. Show the filled check for 80 ms, then run one critically damped spring of 0.35 s on `transform`. Fade the list out with a 2 px blur over 120 ms, and fade the chips in from scale 0.96 over 180 ms, 30 ms apart. A drag picks the sheet up where it is and keeps the finger's velocity. Under reduced motion, cross-fade over 200 ms.
- [ ] Build the browse state of frame K. No chip is selected and no "you" mark shows. The sheet says "Pick your name to check off what you had." with a **Which one are you?** pill that reopens the tall sheet. Lines still open their Item. A tap on a line's circle reopens the tall sheet.
- [ ] Show the people chips in the regular sheet. Mark your own chip "you", outline names nobody has picked, sort the creator first, and end the row with a **+** chip that adds a person.
- [ ] Claim through the line's circle, per frame F. The left 44 px of each line toggles it for the selected chip, and the rest of the line opens the Item sheet. The hint reads "Check what you had". Initial dots show the claimers. Once claiming starts, Unclaimed lines turn yellow.
- [ ] Show one person's breakdown on a chip tap, from `shareBreakdown`, per frames G and H. Show their Items, such as "½ of 1.00", their parts of tax, fee, and tip, their total, and Paid or Not paid. Your own breakdown reads "You owe" and holds the pay action that RS-11 wires. Decide how per-person lines show when they do not sum across people, per note N-a.
- [ ] Build the Item sheet in `src/ui/item-sheet/`, per frames I1 and I2.
  - [ ] Edit the name, the price, and the quantity in place. Save as you go, with no Save button. The ✕ closes the sheet.
  - [ ] Show **Who had it** as chips with a **+** that adds a person to this Item.
  - [ ] Switch the split with a three-way control, **Evenly**, **By shares**, and **By amount**. Show a stepper per person for shares and a dollar field per person for amounts. Under **By amount**, show "Adds up" or how much is left.
  - [ ] Draw quantity above 1 per unit. The board draws quantity 1 only, so show the operator the quantity-2 sheet in the review gate.
  - [ ] Show a shares split's ratio beside the line name on the receipt, such as "2:1", and "split" for an amount split.
  - [ ] Slide the segment over 200 ms ease-out and cross-fade the rows below over 150 ms, with no height animation.
- [ ] Build History in `src/ui/history/`, per frame I3. It replaces the recent-changes list and the Undo toast.
  - [ ] Open it from a clock icon in the header, left of Share.
  - [ ] List Payments and manual Receipt changes only, newest first, with the name picked on the sending device and the time. List no picks, joins, added people, Claims, or **That's me** moves. Word the name so that it claims no identity that `by` cannot prove, per notes N-c and N-d.
  - [ ] Revert each change once, through Undo. Keep a reverted row in the list, dimmed over 150 ms, labeled "Reverted". "Created the split" has no Revert.
  - [ ] Ask for confirmation before a revert of a change made on another device.
  - [ ] Offer `restoreReceipt` on the "Created the split" row, with the same confirmation. The board draws no place for it, so show the operator this row in the review gate.
- [ ] Show the mismatch warning under the Items in home's style, such as "Items are $0.25 over.", from the Total check in `src/core/total-check.ts`. The Subtotal row keeps the printed value.
- [ ] Show the Unclaimed figure under the Total in yellow, with the Items' part of tax, fee, and tip, as $4.98 in the board. Remove the "split among everyone" banner.
- [ ] Drop the remove buttons on the home sheet's name chips after the link exists, in `app/index.tsx`.
- [ ] Drop "Me" from Split creation on `/`. The Host types their own name with the others.
- [ ] Give a reloaded device that forgot its pick the **That's me** path, so it no longer stops at `namePicked` on its own name.
- [ ] Re-run hibernation and reconnect, which RS-9's live lane skipped, inside lane 1.
- [ ] Split the `/s/[id]` route from the home bundle if the page's transfer passes 400 KB. It was 355 KB at RS-9.

**You see.**

- [ ] When the Host creates a Split with "Jason", "Sam", and "Priya", each of three browsers opens the tall pick sheet. After Priya picks Priya and checks Sprite, the other browsers show Priya on Sprite and Priya's new Share within one second.
- [ ] Changing Sprite to $2.75 in its Item sheet shows "Items are $0.25 over." on every browser, and History lists the change.

**Seams.**

- [ ] `applyOperation` and `computeShares` and `shareBreakdown` as the page calls them, in `src/core/operations.test.ts` and `src/core/shares.test.ts`.
- [ ] The Split page as users drive it from several browsers, through Playwright in `e2e/claim.spec.ts` against `wrangler dev`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `src/core/operations.test.ts` and `src/core/shares.test.ts` gain the core half's cases, and `worker/split-server.test.ts` gains a 100-edit flood and a refused second pick. Gates at `187798a` passed 469 unit, 47 worker, and 93 e2e tests. 24 of 25 mutants were killed. Run `npm test` and `npm run test:worker`.
- [ ] `src/core/shares.test.ts` gains the board's Split, and asserts each person's literal cents and an Unclaimed figure that brings the sum to $32.64. Run `npm test -- src/core`.
- [ ] `src/core/shares.test.ts` gains Tostones at $1.00 split 2:1, which gives $0.67 and $0.33, and split by amount at $0.75 and $0.25. It also gains an amount split that leaves $0.10, and asserts the $0.10 and its Adjustment parts in Unclaimed. Run `npm test -- src/core`.
- [ ] `src/core/shares.test.ts` gains two pitchers at $12.00 each, with Jason and Sam on one unit and Priya on the other, and asserts $6.00, $6.00, and $12.00 before Adjustments. Run `npm test -- src/core`.
- [ ] `src/core/operations.test.ts` gains **That's me**, which moves a name to a second device and leaves the first unpicked, and a split mode change that Undo reverses. Run `npm test -- src/core`.
- [ ] Run at most 15 mutants on the new core logic against the unit tests, per **Verdict and merge**. No mutant touches UI or e2e.
- [ ] `e2e/claim.spec.ts` gains two browsers that pick, check a line, and see each other's Shares, a closed pick sheet that browses, **That's me** on a second browser, and a revert from another browser that asks for confirmation. Every case holds the CI-robustness rule in **PR mechanics** and passes under a 4x CPU throttle. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe. Both lanes run in one live pass of 15 minutes or less, per the verification budget.

- [ ] Lane 1. Regression lane against trunk. Run the main multi-browser flow at trunk and head, citing `features/claim.md`. The Host creates a Split with three names, and three browsers open the link. One browser closes the pick sheet and browses, then picks. The others pick, check Items, open a breakdown, split Tostones 2:1, and change Sprite to $2.75. A fourth browser takes Sam with **That's me**, and one browser reverts the price from History after the confirmation. One browser drops its network for 10 seconds and reconnects. Trunk stops at RS-9's full-page join, so record that and gate the head flow. Save `claim-flow.png`. Pass when every browser agrees on every Share and the Unclaimed figure, the Shares plus Unclaimed equal the Total, and the warning shows only while the Items disagree with the subtotal.
- [ ] Lane 2. Shoot the screenshot matrix at 390 px, citing `features/claim.md`. Capture each board frame from A to K in light, J-C and J-F in dark, the quantity-2 Item sheet, the restore row in History, and the home page at the new tokens, with reduced motion on and off for the collapse. Save `split-matrix/<frame>.png`. Pass when each frame has its screenshot, no text overflows at 390 px, every target is at least 44 px, and `document.getAnimations()` is empty under reduced motion.

**Feature map.**

- [ ] Add `features/claim.md` in `verify-receipt-splitter`, with how to open several browsers on one Split and reach each board frame. Update `features/join.md` and `features/home.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads, bytes transferred on `/s/<id>`, and LCP on `/s/<id>` and on `/` under Playwright mobile emulation.
- [ ] Probe. `npm run size` at trunk and head, and 3 loads of each route at trunk and head, interleaved.
- [ ] Baseline. Record the trunk sizes first. Trunk has RS-9's join page at `/s/<id>`.
- [ ] Rule. Fail if the scripts grow by more than 25 KB brotli, `/s/<id>` transfers more than 400 KB, or the head LCP median on either route is more than 10 percent over trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1's `claim-flow.png` and lane 2's frames B, K, F, G, I2, and I3, the quantity-2 sheet, and the restore row into `/tmp/receipt-splitter-review/RS-10-review-<frame>.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of the pick sheet collapsing and two browsers claiming side by side as `/tmp/receipt-splitter-review/RS-10-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges RS-10 after RS-9, under the merge rules in **Verdict and merge**.

## Pay the Host and record the Payment (RS-11)

**Depends on.** RS-10.

RS-11 wires the pay action and the paid status that RS-10 draws on the breakdowns. Build from frames G and H in `docs/design/split/`, and read its `README.md` first.

**Files.**

- [ ] Create `src/core/pay-links.ts` and `src/core/pay-links.test.ts`.
- [ ] Create `src/ui/pay/`.
- [ ] Edit `src/core/operations.ts`, `src/core/operations.test.ts`, and `app/s/[id].tsx`.
- [ ] Create `e2e/pay.spec.ts`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`. Build motion with `animate`. Read `review-animations` by hand. Run `unslop` on every UI string.
- [ ] Build the payment links in `src/core/pay-links.ts`. PayPal is `https://paypal.me/<user>/<amount>USD`. Cash App is `https://cash.app/$<tag>/<amount>`. Venmo is `https://venmo.com/<user>?txn=pay&amount=<amt>&note=<note>` on the web, and `venmo://paycharge` on a phone.
- [ ] Put the pay pill on your own breakdown in `src/ui/pay/`, per frame G, such as "Pay Jason $12.05 on Venmo". Show one pill for each Payment handle the Host entered. Zelle shows a card that copies the handle and the amount.
- [ ] Add **I already paid** under the pay pill, on your own breakdown only. It records a Payment with the amount, and shows in History.
- [ ] Let only the payer mark or unmark themselves paid. Refuse `recordPayment` and `clearPayment` from a device that has not picked that name, per note N-f.
- [ ] Show Paid or Not paid on every other person's breakdown, with no buttons, per frame H. Once someone has paid, their label reads "Priya paid $3.56" instead of "owes".
- [ ] Show the difference when a Share changes after a Payment, as "You paid $22.00. The Host owes you $8.00." or "You owe $4.00 more."

**You see.**

- [ ] Sam's own breakdown shows a Venmo pill that opens `https://venmo.com/<host>?txn=pay&amount=14.20&note=...` for a $14.20 Share. Priya's breakdown on Sam's phone shows Not paid and no buttons.

**Seams.**

- [ ] `payLink(handle, cents, note)` in `src/core/pay-links.test.ts`, `applyOperation` for Payments in `src/core/operations.test.ts`, and the pay flow through Playwright in `e2e/pay.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/core/pay-links.test.ts` gains the exact URL for each service at $14.20, and a note with spaces and an ampersand encoded. Run `npm test -- src/core`.
- [ ] `src/core/operations.test.ts` gains a Payment from the payer's device that lands and one from another device that is refused. Run `npm test -- src/core`.
- [ ] `e2e/pay.spec.ts` gains **I already paid** at $22.00, then a Claim that drops the Share to $14.00, and asserts "The Host owes you $8.00." The case holds the CI-robustness rule in **PR mechanics**. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe. Both lanes run in one live pass of 15 minutes or less, per the verification budget.

- [ ] Lane 1. Regression lane against trunk. From two browsers, claim Items, open your own breakdown, tap the pay pill, tap **I already paid**, then change a Claim from the other browser, citing `features/pay.md`. Trunk has no pay pill, so record that and gate the head flow. Save `pay-flow.png`. Pass when each pill's URL carries the Share to the cent, the other browser shows Paid with no buttons, and both browsers show the exact difference.
- [ ] Lane 2. Shoot the screenshot matrix at 390 px, citing `features/pay.md`. Capture frames G and H in light and dark, the Zelle card at 1280 px, and History with a Payment. Save `pay-matrix/<frame>.png`. Pass when each frame has its screenshot, no text overflows, and every target is at least 44 px.

**Feature map.**

- [ ] Add `features/pay.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Brotli bytes of every script `dist/index.html` loads, and LCP on `/s/<id>` under Playwright mobile emulation.
- [ ] Probe. `npm run size` at trunk and head, and 3 loads of `/s/<id>` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk sizes first. Trunk has no pay pill.
- [ ] Rule. Fail if the scripts grow by more than 10 KB brotli, `/s/<id>` transfers more than 400 KB, or the head LCP median is more than 10 percent over trunk's.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1's `pay-flow.png` and lane 2's frames G and H into `/tmp/receipt-splitter-review/RS-11-review-<frame>.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of paying and marking yourself paid as `/tmp/receipt-splitter-review/RS-11-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's approval.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges RS-11 after RS-10, under the merge rules in **Verdict and merge**.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] A cleanup PR at the tip closes every open note in `notes.md`. One gates lane and one audit.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

One throwaway prototype answered whether one Expo codebase can run PaddleOCR in the browser. It lives in the scratch directory `proto-ocr/` of the planning session and is not in git. The harness `harness/run.mjs` reproduces every number. All numbers were measured on an Apple M4 in headless Chrome 154, against five ExpressExpense receipts at 960 px.

- Expo SDK 57 with `npx expo export -p web` runs PP-OCRv5 mobile in a Web Worker on onnxruntime-web 1.30. Metro cannot bundle `onnxruntime-web`, so the runtime, the worker, and the models go in `public/`.
- The hello-world entry is 231 KB brotli. The OCR screen adds 2.8 KB because the runtime loads outside the bundle.
- PP-OCRv5 mobile with English rec takes 469 ms per receipt on four threads and 1255 ms on one thread. PP-OCRv6 tiny takes 209 ms on four threads with slightly higher error. PP-OCRv6 small is slower than v5 mobile and uses more memory.
- The first scan downloads about 14 MB brotli, of which the models are 11.6 MB and barely compress.
- Peak renderer memory is 488 MB to 744 MB depending on the model.
- Grouping boxes by vertical position works on flat receipts. On the curled SRD receipt 1019, each price lands one row below its Item, which is why RS-5 groups rows by baseline slope.
- The model files come from the RapidOCR ModelScope repository under Apache 2.0.

These stay unproven. Speed on a real phone is a guess of two to four times slower than the M4. Memory with a 12 megapixel photo was not measured, since RS-4 downscales before detection. Native OCR was not tried. Turnstile under cross-origin isolation was not tried, and RS-9 lane 6 settles it.

Six rounds of throwaway home page prototypes chose the design. Each round is static HTML rendered by Playwright in Chromium, not the Expo app, and none is in git. The operator approved round 6 idea 2, "Open table", on 2026-09-30, with Figma reference node 10-2 in `https://www.figma.com/design/rUCjp4g9qO5erLgaXSe5pO`.

- `docs/design/home/idea2.html` is the approved design. Open its states with `?s=empty|reading|read|ready|link&t=light|dark`. Widths of 900 px and up get the desktop layout. `idea2.png` is its contact sheet.
- `docs/design/home/tokens.md` holds the tokens, the type sizes, and the contrast table. `docs/design/home/layout.md` holds the layout, the states, the motion spec, and the reasons the tip section and the payment fields were cut.
- At 390 by 844 the prototype sheet measured 223 px tall when empty and 253 px with the reason line. Its top sat at y 621. The camera button spanned y 283 to 347.
- `audit.mjs` found no text below WCAG AA and no target under 44 by 44 px on any idea2 page. The lowest text ratio was 4.80 in light, muted text on the gray surface, and 5.59 in dark.
- The two Plus Jakarta Sans files measure 11,816 and 12,312 bytes.

These stay unproven. The reading animation was not built. The sheet was not tried with a long receipt or with the on-screen keyboard on a real phone. Drag, drop, and paste were not wired.

Two rounds of throwaway split page mockups chose the Split page. Each round is one static board that draws every frame from one Split model with `render(state)`, rendered by Playwright in Chromium at 390 by 844.

- Round 7, on 2026-10-01, is Figma node 14-2 in `https://www.figma.com/design/rUCjp4g9qO5erLgaXSe5pO`. Its board lives at `/tmp/receipt-splitter-review/split7/` and is not in git. It drew the tall pick sheet, the collapse to people chips, claiming by a tap on the line, the breakdowns, and an Undo toast. Its eight open questions became the operator's split redesign answers.
- Round 8, approved on 2026-10-01 with "Design looks great", is Figma node 17-2. `docs/design/split/` holds its board, its contact sheet, and its notes. It added the line circle, the Item sheet with three split modes, History, the browse state, **That's me**, and the spacing and type change.
- In the round 8 numbers, Jason and Sam owe $12.05 each, Priya owes $3.56, and Unclaimed is $4.98, which together make the $32.64 Total. Tostones at $1.00 split 2:1 gives $0.67 and $0.33 by largest remainder.

These stay unproven. Nothing animates on either board, and no motion ran on a phone. The board draws quantity 1 only, so the per-unit Item sheet is not drawn. The board draws no place for `restoreReceipt`. The board's History still lists Claims and a **That's me** move, which the operator ruled out after approval.

## Appendix B. Alternatives rejected

- A Vite and React website lost to one Expo codebase, because the operator chose React Native for the later app. See ADR 0002.
- WebGPU lost for v1. Its runtime build is 26.8 MB, over the 25 MiB static asset limit, and onnxruntime issue 26827 reports crashes with WebGPU on iOS 26 Safari.
- PP-OCRv6 small lost to v5 mobile on speed and memory in the prototype. RS-4 still compares v5 mobile with v6 tiny on the full benchmark.
- A snapshot link with the Split encoded in the URL lost to one live link type. See the grilling and ADR 0004.
- A host key with special powers lost to equal access, with the Payment handle exception. See ADR 0003.
- Plain Durable Object WebSocket code lost to partyserver with hibernation, because partysocket gives reconnect and message buffering on phones for free.
- Firebase, Supabase, and Vercel with Pusher lost to Cloudflare, because Cloudflare serves the 14 MB OCR download from static assets at no charge.
- The Table direction, with an orange field, Archivo, a headline, a pitch, and an example scan, lost to the white "Open table" look. The operator found the page too busy and asked for a white page like his reference.
- A new-Split flow across `/new`, `/new/tip`, `/new/handles`, and `/new/people` lost to one page at `/`. Each step was a place to lose the Host.
- Tip buttons for 18, 20, and 22 percent lost to a tip line read from the receipt. The buttons took space on every page for a value most receipts print.
- Round 6 idea 1, a centered card, and idea 3, a dashed drop zone, lost to idea 2. The round 5 notes recommended idea 3, and the operator chose idea 2.
- PDF upload lost for v1. It needs a PDF renderer such as pdf.js before OCR and a rule for multi-page PDFs.
- RS-9's full-page "Which one are you?" lost to a tall bottom sheet over the Split page. The sheet keeps the receipt in view behind it, can be closed to look, and collapses into the people chips after the pick.
- The Undo toast of round 7, and a "someone edited" toast, lost to History behind a clock icon. A toast that lasts 5 seconds lets one person undo, while History lets anyone revert any change later, and keeps the page quiet while people claim.
- A per-device pick counter, which let several devices hold one name, lost to one device per name with **That's me**. With a counter, two people could check off Items as one name, and "Not Sam?" cleared the name for every device.
- A "split among everyone" action for Unclaimed items lost to nobody paying for them. The operator wants the table to settle an Unclaimed item by checking it off.
- Removing and renaming people lost to add-only Participants, on the operator's answer. With equal access, any link holder could otherwise remove anyone.

## Appendix C. Risks

- OCR is too slow or runs out of memory on low-end phones. It lands in RS-4. The owner watches the one-thread path and peak memory, and keeps manual entry reachable from every OCR failure in RS-7.
- Cross-origin isolation breaks Turnstile or a font. It lands in RS-4 and RS-9. The owner keeps the one-thread fallback working, and RS-9 lane 6 records the result.
- The parser misses the RS-5 thresholds on real US receipts. The owner reports the per-category failures from `bench/score.mjs` and asks the operator before lowering a threshold.
- The Venmo link format is undocumented and may change. It lands in RS-11. The owner keeps the format in `src/core/pay-links.ts` alone, so a change touches one file.
- Equal access lets anyone with the link vandalize a Split. It lands in RS-10. History with Revert is the recovery for one change. `restoreReceipt` puts the whole Receipt back as created, in one change that can itself be reverted. The per-Split history rate of 5 KB, refilled at 1 KB a second, keeps a burst from pushing a change out of reach. The per-Split operation rate limit in RS-8 caps the damage. Claims are not recorded, so no Revert brings back a Claim a vandal cleared, which was audit finding F2. The root accepted that, because claims are self-service. A person who finds their Item unchecked checks it again. Participants are add-only, so a vandal cannot remove a person.
- A wrong **That's me** moves a name to the wrong phone, and there are no accounts to stop it. It lands in RS-10. The real person taps **That's me** again. History does not list the move.
- The round 8 board draws quantity 1 only, so the per-unit Item sheet and its claims have no approved look. It lands in RS-10. The owner shows the quantity-2 sheet in the review gate.
- The round 8 board gives `restoreReceipt` no place. It lands in RS-10. The owner puts it on the "Created the split" row in History and shows that row in the review gate.
- The spacing and type change moves the home page that RS-6 and RS-7 verified. It lands in RS-10. Lane 2 shoots the home page at the new tokens.
- A WebSocket that stops hibernating multiplies the Cloudflare bill. It lands in RS-8. The perf rule greps for timers and `ws.accept(`, and lane 2 checks hibernation.
- The verification skill cannot drive a real phone camera. Lanes upload files instead, and RS-7 lane 6 covers the offline cached path.
- The bottom sheet covers about 253 of 844 px in the read state, and more after the operator's taller default. It lands in RS-6 and RS-7. RS-7 gives the sheet a max height with its own scroll, and its lanes check that no row hides under it.
- OCR reads print, so a handwritten tip reads as $0.00. It lands in RS-7. The Tip line stays one tap from an edit, and a tip edit moves the Total with it.
- The gray surface on white measures 1.08 to 1 and the hairline 1.26 to 1, so a fill alone marks nothing. It lands in RS-6. Every control names itself with text or an icon, and RS-6 lane 2 checks text contrast and target size.
- The approved design lives in `docs/design/home/`, a static sketch, not app code. Appendix E copies the tokens and the type sizes into this plan.
- The benchmark labels hold mistakes. RS-3 gates on the operator's check before the parser is judged against them.

## Appendix D. Links and reading list

- Read `description.md`, `CONTEXT.md`, and `docs/adr/0001` through `0004` before editing.
- Read the partyserver README at `https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md` before RS-8.
- Read `https://developers.cloudflare.com/durable-objects/best-practices/websockets/` before RS-8.
- Read `https://developers.cloudflare.com/turnstile/troubleshooting/testing/` before RS-8 and RS-9.
- Read `https://developers.cloudflare.com/workers/static-assets/headers/` before RS-4.
- Read `docs/design/home/idea2.html` in all five states, `docs/design/home/idea2.png`, `docs/design/home/tokens.md`, and `docs/design/home/layout.md` before RS-6 and RS-7.
- Read `docs/design/split/README.md`, `docs/design/split/board.html` in every frame, `docs/design/split/board.png`, and `docs/design/split/notes.md` before RS-10 and RS-11. The README's operator decisions win over the board.
- Read `/tmp/swarm-RS-10/owner/pr-body.md` before the RS-10 UI half, for what the core half built.
- Run `/how` at the start of RS-7, RS-8, and RS-10, because they join modules built by earlier PRs.
- Run `/interrogate` on RS-2 and RS-8 before their PRs open, because the Share math and the shared state are the hardest parts to change later.
- Keep a decision trail per `/show-me-your-work` in `docs/plans/receipt-splitter-v1.trail.tsv`, and commit it with the last PR.

## Appendix E. Home and Split page design reference

The colors come from `docs/design/home/tokens.md` and `docs/design/home/idea2.html`, and the Split page keeps them unchanged. The dark ladder mirrors the light one. In light the page is white, a surface is one step darker, and a control on a surface is white again. In dark the page is the darkest step and each layer up is lighter. Every gray is neutral.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--field` | Page | `#FFFFFF` | `#121315` |
| `--paper` | Surface for cards, fields, chips, the file row, and the slip | `#F5F6F7` | `#1C1D20` |
| `--inset` | Control on a surface, such as the replace button or the flagged price box | `#FFFFFF` | `#2A2B2F` |
| `--ink` | Text and icons | `#111214` | `#F2F2F3` |
| `--muted` | Secondary text and placeholders | `#696D74` | `#A0A3A9` |
| `--hairline` | Dividers, slip lines, and outlined chips and buttons | `#E3E5E8` | `#2F3135` |
| `--action` | Primary button | `#111214` | `#F2F2F3` |
| `--on-action` | Primary button label | `#FFFFFF` | `#111214` |
| `--off` | Blocked action | `#EEEFF1` | `#26272B` |
| `--flag-wash` | Yellow highlight behind a flagged row or a reason | `#FFEF9E` | `#463A0C` |
| `--flag` | Text and ring on the yellow highlight | `#5A4500` | `#FFE27A` |
| `--bar` | Frosted bar | `#FFFFFF` at 86 percent | `#121315` at 86 percent |
| `--sheet` | Bottom sheet | `#FFFFFF` | `#1C1D20` |
| `--sheet-in` | Fields and chips in the sheet | `#F5F6F7` | `#2A2B2F` |

Round 8 of the split page, approved on 2026-10-01, set spacing about 2 px larger and type about 1 px smaller app-wide, the home page included. The round 8 column wins. `docs/design/split/notes.md` holds the source table. Inputs stay at 16 px, because iOS zooms the page into any input under 16 px.

| Use | Round 6 | Round 8 |
| --- | --- | --- |
| Hero line, such as **Add receipt**, and the pick sheet headline "Which one are you?" | 28 px, 400, tracking -0.02em | 26 px, 400, tracking -0.02em |
| Total amount and "You owe" amount | 28 px, 500, tracking -0.02em | 26 px, 500, tracking -0.02em |
| Wordmark | 18 px, 500 | 17 px, 500 |
| Merchant name | 17 px, 500 | 16 px, 500 |
| Body and Items | 16 px, 400 | 15 px, 400 |
| Action and button labels | 16 px, 500 | 15 px, 500 |
| Inputs | 16 px, 400 | 16 px, 400 |
| Chips | 15 px, 500 | 14 px, 500 |
| Secondary text, and the tax, fee, and tip rows | 13 to 15 px, 400, muted | 14 px, 400, muted |
| Hints and meta lines | 13 px | 12.5 px |

| Spacing | Round 7 | Round 8 |
| --- | --- | --- |
| Page side gutter | 20 px | 22 px |
| Header height | 56 px | 60 px |
| Receipt card padding, top and sides and bottom | 14, 18, and 18 px | 18, 20, and 20 px |
| Receipt card radius | 20 px | 22 px |
| Item row height | 48 px | 52 px |
| Tax, fee, and tip row height | 32 px | 34 px |
| Sheet padding, top and sides and bottom | 8, 20, and 28 px | 10, 22, and 30 px |
| Gap between sheet blocks | 12 px | 14 px |
| Name row in the pick sheet | 56 px tall, 8 px apart | 58 px tall, 10 px apart |
| Fields | 52 px, radius 14 px | 54 px, radius 16 px |
| Gap between paired buttons and wrapped chips | 8 px | 10 px |
| Gap in the Split page chip row | 8 px | 8 px, so four names and **+** fit at 390 px |

Shapes. The primary action is a 54 px pill. Cards take a 22 to 28 px radius and fields 16 px. The sheet takes 28 px at its top corners. Icons use a 1.5 px stroke. Prices use tabular figures. Every sheet moves on one critically damped spring of 0.35 s, and cross-fades over 200 ms under reduced motion.
