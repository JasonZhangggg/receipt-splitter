# Receipt Splitter v1 plan

This program builds the first public version of Receipt Splitter, a free website for splitting a group bill.
A Host photographs a Receipt, the site reads it on the phone, and everyone with the link Claims their Items live and pays the Host.
The rule it enforces is that no Share goes out until the Total check passes, and the photo never leaves the device.
The PRs, in stack order, are RS-1, RS-2, RS-3, RS-4, RS-5, RS-6, RS-7, RS-8, RS-9, RS-10, and RS-11.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/poteto-mode/playbooks/autopilot-stack.md`. The root builds and verifies one linear stack on `main`. The operator reviews and lands every PR bottom-up. No owner merges. RS-3, RS-6, RS-7, RS-9, RS-10, and RS-11 stop at merge-ready for the operator's review gate.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Intent

**Problem.** Splitting a restaurant bill takes too long and goes wrong. Splitwise charges for receipt scanning. Lily Split uploads receipt photos to a public bucket, asks for every name before showing any Items, supports only Venmo, and never checks the Items against the receipt total. Friends overpay or underpay and nobody notices.

**Solution.** The Host photographs or uploads the Receipt. The site reads it on the phone in about a second, checks that the Items add up to the total, and highlights any row that does not. The Host sets the tip, enters a Payment handle, optionally adds names, and shares a link. Anyone who opens the link picks their name, Claims their Items, watches every Share update live, and pays the Host with one tap on Venmo, Cash App, or PayPal, or copies the Zelle details.

**User stories.**

1. As a Host, I want the site to read my receipt photo on my phone, so that nobody else ever sees the photo.
2. As a Host, I want rows that break the Total check highlighted, so that I can fix a misread price in one tap.
3. As a Host, I want to type Items by hand when the photo is unreadable, so that I can still split the bill.
4. As a Host, I want to set the tip as 18, 20, or 22 percent or a dollar amount, so that a handwritten tip still counts.
5. As a Host, I want to share one link without typing names first, so that I can send it to the group chat at once.
6. As a Participant, I want to pick my name from a list or add it, so that I can start claiming in one tap.
7. As a Participant, I want to Claim my Items and see my Share update live, so that I know what I owe before I pay.
8. As a Participant, I want to split a shared Item evenly with the others who Claimed it, so that a shared pitcher costs each of us the same.
9. As any Participant, I want to fix a price or undo someone's mistake, so that the Split stays right without waiting for the Host.
10. As a Participant, I want one tap to pay the Host on the app they use, so that I do not have to type a handle or an amount.
11. As a Participant, I want to record that I paid and what I paid, so that a later change shows exactly what is still owed.
12. As a Host, I want to see who has paid, so that I know whom to remind.

**Out of scope.** Sign-in, saved groups, and history of past Splits. Any LLM fallback. The iOS and Android apps, although every module keeps them possible. Currencies other than USD. Debt netting across Splits. Long receipts taken in several photos. WebGPU. A production deploy, which the operator runs after the stack lands.

**Decisions.** The grilling settled these, and they are binding.

- `CONTEXT.md` terms are Host, Participant, Payment handle, Split, Receipt, Item, Adjustment, Total check, Claim, Unclaimed item, Share, and Payment.
- `docs/adr/0001-on-device-ocr-no-llm-for-anonymous-use.md` keeps every photo on the device and allows no LLM.
- `docs/adr/0002-expo-universal-app.md` makes one Expo codebase that exports a static website.
- `docs/adr/0003-equal-access-no-host-privileges.md` gives everyone with the link equal access, except to Payment handles.
- `docs/adr/0004-one-durable-object-per-split.md` stores each Split as one JSON record in one Durable Object, and lists the four cost rules.
- Adjustments divide in proportion to each Participant's Claimed Items. A shared Item divides evenly among its claimers. Leftover cents go to claimers in a fixed order so Shares sum to the total exactly.
- Amounts are integer cents, and each Split carries `currency: "USD"`.
- The Total check must pass before a Split can be created. Unclaimed items never block paying. The Split shows a banner and offers one tap to split them among everyone.
- Payment handles are entered at creation, at least one is required, the device remembers them, and only the creating device can change them.
- The OCR model starts downloading in the background on the home page. A share link never downloads it.
- A Split is deleted 60 days after its last change.
- Every UI PR follows the `## UI work` rule in `CLAUDE.md`.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write this exact text into the standing objective and restate it in your todolist. "Run docs/plans/receipt-splitter-v1.md under autopilot-stack. Build RS-1 through RS-11 as one linear stack on main, in that order. A PR is verified only when its unit, live, and perf boxes are all checked, and tests alone are not sufficient verification. The operator reviews and lands every PR. RS-3, RS-6, RS-7, RS-9, RS-10, and RS-11 wait at merge-ready for the operator's review gate. Done when every PR is verified, rebased on current main, and handed to the operator as one stack."
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
  - [ ] RS-6 touches only `src/ui/**`, `assets/fonts/**`, and `app/index.tsx`.
  - [ ] RS-8 touches only `worker/**`, `src/core/**` for the shared operation types, and `wrangler.jsonc`.
- [ ] Hold the review gate. RS-6, RS-7, RS-9, RS-10, and RS-11 change an interaction, and RS-3 needs the operator to check the benchmark labels. They wait for the operator's review in chat with screenshots, and a video where the PR changes an interaction, before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push, with `npm run lint` and `npm run typecheck`. Push with hooks on.
- [ ] Write tests through `/tdd` at the PR's **Seams**.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Run `/spec-review` against this plan's PR section before the code-ready report. Fix every Spec finding.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `~/.claude/skills/swarm/SKILL.md`. One gates lane. The live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Lanes return `PASS`, `PASS+NOTES`, or `FAIL`. `FAIL` is a blocking issue, a defect, or new code without a test that fails for it. Clean when no lane fails. `FAIL` findings go back to the owner.
- [ ] Each note names its fixer, the next PR touching those files or the cleanup PR, and goes in `~/.claude/orchestrate/receipt-splitter/notes.md`. A PR sent back fixes its own notes too.
- [ ] The first verdict runs every lane. A fix round reruns gates, an audit of the new commits, and the lanes whose surface changed. Perf reuses deterministic trunk values (build bytes) at the same trunk SHA and keeps timings interleaved.
- [ ] Append each clean PR to the stack on `main` in order. After any restack, compare `git patch-id` of each PR's base-to-head diff against its value at the verdict SHA, per `~/.claude/skills/poteto-mode/playbooks/shipping.md`. An unchanged patch-id keeps the verdict. A changed one gets a fresh swarm. The operator lands the stack bottom-up.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head, with its own app instance and port per `verify-receipt-splitter`. Drive only through `verify-receipt-splitter`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
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

- [ ] `src/parse/index.test.ts` gains SRD receipt 1040 parsed to three Items, a subtotal of 2298 cents, and a total of 2804 cents. Run `npm test -- src/parse`.
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

- [ ] Create `src/ui/theme.ts`, `src/ui/components/`, and `assets/fonts/`.
- [ ] Edit `app/index.tsx`.

**Build.**

- [ ] Load `emil-design-eng`, `apple-design`, and `mobile-native` before any UI code, per `CLAUDE.md`.
- [ ] Build three distinct visual directions for the home screen and a sample Receipt list behind one switcher, per `~/.claude/skills/poteto-mode/playbooks/prototype.md`. Each direction names its type, color, spacing, and motion choices.
- [ ] Present the three directions to the operator with screenshots at phone and desktop widths. Build only the chosen one.
- [ ] Write the chosen direction as tokens in `src/ui/theme.ts`, with light and dark modes, and as base components in `src/ui/components/` for button, list row, money text, sheet, and toast. Self-host the fonts in `assets/fonts/`.
- [ ] Rebuild the home screen in `app/index.tsx` with the base components, with one clear action to scan or upload a Receipt.

**You see.**

- [ ] The home screen renders in the chosen direction at 390 px and 1280 px wide, in light and dark mode.

**Seams.**

- [ ] The home screen as a user sees it, through Playwright in `e2e/home.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/home.spec.ts` gains a case that the scan action is visible and focusable by keyboard at 390 px. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `standard`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load `/` at trunk and head at 390 px. Save `home-trunk-head.png`. Pass when head shows the new direction, `/s/abc` still resolves, and the console has no errors.
- [ ] Lane 2. Load `/` at 390 px and 1280 px in light and dark mode with reduced motion on and off, citing `features/home.md`. Save `home-matrix.png`. Pass when no text overflows, contrast meets WCAG AA, and motion stops under reduced motion.

**Feature map.**

- [ ] Add `features/home.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Entry JavaScript brotli bytes, font bytes, and home screen Largest Contentful Paint under Playwright's mobile emulation with 4G throttling.
- [ ] Probe. `npm run size` and a Playwright LCP measurement at trunk and head, interleaved, three runs each.
- [ ] Baseline. Record the trunk entry size and LCP first.
- [ ] Rule. Fail if the entry grows by more than 40 KB brotli, fonts exceed 100 KB, or head LCP exceeds 1.5 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the three direction screenshots and lane 2 screenshots into `/tmp/receipt-splitter-review/RS-6-review-directions.png` and `/tmp/receipt-splitter-review/RS-6-review-home.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of the home screen in both modes as `/tmp/receipt-splitter-review/RS-6-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-6 to the stack, and the operator lands it bottom-up.

## Scan a Receipt and fix it until the Total check passes (RS-7)

**Depends on.** RS-5 and RS-6.

**Files.**

- [ ] Create `app/new/index.tsx`, `app/new/receipt.tsx`, and `app/new/tip.tsx`.
- [ ] Create `src/ui/receipt-editor/`.
- [ ] Create `src/draft.ts`.

**Build.**

- [ ] Add photo upload and camera capture on `app/new/index.tsx`, with a progress state while the model finishes downloading and OCR runs.
- [ ] Show the parsed Receipt in an editor in `src/ui/receipt-editor/`. Highlight the rows that `runTotalCheck` names and show the gap in dollars.
- [ ] Let the Host edit an Item's name or price, add an Item, and delete a row with one tap each. Re-run `runTotalCheck` on every change.
- [ ] Offer manual entry, which opens the same editor empty.
- [ ] Add the tip step on `app/new/tip.tsx` with 18, 20, and 22 percent buttons and a dollar field. The tip overrides any tip OCR read.
- [ ] Keep the draft Receipt in local storage through `src/draft.ts` so a reload does not lose it.
- [ ] Disable **Continue** until the Total check passes.

**You see.**

- [ ] Uploading SRD receipt 1040 shows three Items, a subtotal of $22.98, a total of $28.04, and an enabled **Continue**.
- [ ] Changing an Item price highlights that row and disables **Continue** until the numbers add up again.

**Seams.**

- [ ] The new-Split flow as a user drives it, through Playwright in `e2e/scan.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/scan.spec.ts` gains upload of receipt 1040 and asserts the three Items and an enabled **Continue**. Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains a price edit that breaks the Total check and asserts the highlighted row. Run `npm run e2e`.
- [ ] `e2e/scan.spec.ts` gains manual entry of two Items and a total. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Upload SRD receipt 1040 at trunk and head. Trunk has no scan flow, so record that and gate the head flow from upload to an enabled **Continue**. Save `scan-1040.png`. Pass when head shows three Items and the Total check passes.
- [ ] Lane 2. Upload the curled SRD receipt 1019, citing `features/scan.md`. Save `scan-1019.png`. Pass when each price sits on its own Item, or the failing rows are highlighted and one edit makes the check pass.
- [ ] Lane 3. Edit an Item price, add a missing Item, and delete a noise row, citing `features/scan.md`. Save `scan-edit.png`. Pass when each change updates the highlight and **Continue** enables only when the check passes.
- [ ] Lane 4. Enter a Receipt by hand and set a 20 percent tip, citing `features/scan.md`. Save `scan-manual-tip.png`. Pass when the tip equals 20 percent of the subtotal to the cent.
- [ ] Lane 5. Reload mid-edit at 390 px with the browser offline after the model is cached, citing `features/scan.md`. Save `scan-reload-offline.png`. Pass when the draft survives the reload and OCR still runs offline.

**Feature map.**

- [ ] Add `features/scan.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Milliseconds from file chosen to editable Items shown, with the model cached, and entry JavaScript brotli bytes.
- [ ] Probe. A Playwright timing of the upload flow at head over the five RS-4 receipts, and `npm run size` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk entry size first. Trunk has no scan flow.
- [ ] Rule. Fail if the median from file chosen to Items shown exceeds 2000 ms on the four-thread path, or the entry grows by more than 30 KB brotli.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 1, 2, and 3 screenshots into `/tmp/receipt-splitter-review/RS-7-review-scan.png`, `/tmp/receipt-splitter-review/RS-7-review-curled.png`, and `/tmp/receipt-splitter-review/RS-7-review-edit.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of scanning and fixing a Receipt as `/tmp/receipt-splitter-review/RS-7-review.mp4`.
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

**Depends on.** RS-7 and RS-8.

**Files.**

- [ ] Create `app/new/handles.tsx`, `app/new/people.tsx`, and `src/ui/turnstile.web.tsx`.
- [ ] Create `src/live/client.ts` and `src/device.ts`.
- [ ] Edit `app/s/[id].tsx`.

**Build.**

- [ ] Add the Payment handle step on `app/new/handles.tsx` for Venmo, Cash App, PayPal, and Zelle. Require at least one, and prefill from the device.
- [ ] Add the optional names step on `app/new/people.tsx`, with the Host added as "Me".
- [ ] Create the Split through `POST /api/splits` with an invisible Turnstile token from `src/ui/turnstile.web.tsx`. Store the creator secret with `src/device.ts`.
- [ ] Show the share link with the system share sheet and a copy button.
- [ ] Connect with partysocket in `src/live/client.ts`, and never import `src/ocr` from the `/s/[id]` route.
- [ ] Ask "Which one are you?" on `app/s/[id].tsx`, with every name, names picked on another device marked, and a **Someone else** option that adds a Participant. Remember the choice per Split in `src/device.ts`, with a **Not Sam?** link that clears it.
- [ ] Show "This split has expired" when the Split no longer exists.

**You see.**

- [ ] After the Host continues from the tip step, enters a Venmo handle, and adds two names, the share link opens on a second browser and asks "Which one are you?" with "Me" and both names.

**Seams.**

- [ ] The create and join flows as users drive them, through Playwright in `e2e/join.spec.ts` against `wrangler dev`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/join.spec.ts` gains a create with no names, a join as **Someone else**, and asserts the new name appears for the Host. Run `npm run e2e`.
- [ ] `e2e/join.spec.ts` gains a reload of the share link that skips "Which one are you?" and shows **Not Sam?**. Run `npm run e2e`.
- [ ] `e2e/join.spec.ts` gains a share link visit that makes no request under `/models/` or `/ort/`. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the scan flow to the tip step at trunk and head. Trunk stops at the tip step, so record that and gate the head flow from the tip step to a share link that a second browser opens. Save `join-end-to-end.png`. Pass when the second browser shows "Which one are you?" with every name.
- [ ] Lane 2. Join from two browsers as the same name, citing `features/join.md`. Save `join-same-name.png`. Pass when the second browser shows that name as picked on another device.
- [ ] Lane 3. Create a Split with no names, then join as **Someone else** from three browsers, citing `features/join.md`. Save `join-someone-else.png`. Pass when all three names appear on every browser.
- [ ] Lane 4. Try to change the Venmo handle from a joined browser and from the creating browser, citing `features/join.md`. Save `join-handle-lock.png`. Pass when only the creating browser can change it.
- [ ] Lane 5. Open an unknown Split id, citing `features/join.md`. Save `join-expired.png`. Pass when the page says "This split has expired".
- [ ] Lane 6. Create a Split on the COOP and COEP page, citing `features/join.md`. Save `join-turnstile.png`. Pass when Turnstile returns a token under cross-origin isolation, or record the failure and confirm the one-thread fallback path creates the Split.

**Feature map.**

- [ ] Add `features/join.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Milliseconds from opening a share link to "Which one are you?" under Playwright mobile emulation with 4G throttling, bytes transferred on that route, and entry JavaScript brotli bytes.
- [ ] Probe. A Playwright timing of `/s/<id>` at head, three runs, and `npm run size` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk entry size first. Trunk has no join screen.
- [ ] Rule. Fail if the share link takes more than 2000 ms to show "Which one are you?", transfers more than 400 KB, or the entry grows by more than 25 KB brotli.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 1, 2, and 4 screenshots into `/tmp/receipt-splitter-review/RS-9-review-join.png`, `/tmp/receipt-splitter-review/RS-9-review-same-name.png`, and `/tmp/receipt-splitter-review/RS-9-review-handles.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of creating a Split and joining it from a second browser as `/tmp/receipt-splitter-review/RS-9-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-9 to the stack, and the operator lands it bottom-up.

## Claim Items live and undo mistakes (RS-10)

**Depends on.** RS-9.

**Files.**

- [ ] Create `src/ui/split-view/` and `src/ui/recent-changes/`.
- [ ] Edit `app/s/[id].tsx`.

**Build.**

- [ ] Show every Item on `app/s/[id].tsx` with its claimers. One tap Claims or unclaims it for the chosen Participant, and a long press Claims it for anyone.
- [ ] Show every Share live with `computeShares`, labeled as the total so far while Unclaimed items remain.
- [ ] Show the banner "N items unclaimed. Shares may go up." with one tap to split them among everyone.
- [ ] Let anyone edit an Item, an Adjustment, or the tip with the RS-7 editor, and block an edit that breaks the Total check.
- [ ] Show the recent-changes list in `src/ui/recent-changes/`, such as "Sam changed Fries $8.00 to $6.00", with **Undo** on each entry.

**You see.**

- [ ] When one browser Claims the fries for Sam, a second browser shows Sam on the fries and Sam's new Share within one second.

**Seams.**

- [ ] The Split view as users drive it from two browsers, through Playwright in `e2e/claim.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/claim.spec.ts` gains three browsers Claiming a $30.00 pitcher and asserts $10.00 each on every browser. Run `npm run e2e`.
- [ ] `e2e/claim.spec.ts` gains a price change followed by **Undo** from another browser, and asserts the old price everywhere. Run `npm run e2e`.
- [ ] `e2e/claim.spec.ts` gains a split of Unclaimed items among everyone that clears the banner. Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Create a Split and join it from two browsers at trunk and head. Trunk stops at "Which one are you?", so record that and gate a Claim on one browser showing on the other with updated Shares. Save `claim-two-browsers.png`. Pass when both browsers agree on every Share.
- [ ] Lane 2. Claim one Item from four browsers at the same moment, citing `features/claim.md`. Save `claim-race.png`. Pass when every browser settles on the same four claimers and the Shares sum to the total.
- [ ] Lane 3. Change a price, then **Undo** from a different browser, citing `features/claim.md`. Save `claim-undo.png`. Pass when the recent-changes list shows both entries and every browser shows the old price.
- [ ] Lane 4. Leave two Items Unclaimed and tap split among everyone, citing `features/claim.md`. Save `claim-unclaimed.png`. Pass when the banner clears and the Shares sum to the total.
- [ ] Lane 5. Claim on a 390 px touch emulation with reduced motion on, citing `features/claim.md`. Save `claim-mobile.png`. Pass when every tap target is at least 44 px and no animation runs under reduced motion.

**Feature map.**

- [ ] Add `features/claim.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Milliseconds from a Claim tap on one browser to the updated Share painted on another, and entry JavaScript brotli bytes.
- [ ] Probe. A 50-Claim Playwright script across two browsers against `wrangler dev` at head, and `npm run size` at trunk and head, interleaved.
- [ ] Baseline. Record the trunk entry size first. Trunk has no Claiming.
- [ ] Rule. Fail if the p95 tap-to-paint exceeds 300 ms locally or the entry grows by more than 20 KB brotli.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 1, 3, and 5 screenshots into `/tmp/receipt-splitter-review/RS-10-review-claim.png`, `/tmp/receipt-splitter-review/RS-10-review-undo.png`, and `/tmp/receipt-splitter-review/RS-10-review-mobile.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of two browsers Claiming side by side as `/tmp/receipt-splitter-review/RS-10-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-10 to the stack, and the operator lands it bottom-up.

## Pay the Host and record the Payment (RS-11)

**Depends on.** RS-10.

**Files.**

- [ ] Create `src/core/pay-links.ts` and `src/core/pay-links.test.ts`.
- [ ] Create `src/ui/pay/`.
- [ ] Edit `app/s/[id].tsx`.

**Build.**

- [ ] Build the payment links in `src/core/pay-links.ts`. PayPal is `https://paypal.me/<user>/<amount>USD`. Cash App is `https://cash.app/$<tag>/<amount>`. Venmo is `https://venmo.com/<user>?txn=pay&amount=<amt>&note=<note>` on the web, and `venmo://paycharge` on a phone.
- [ ] Show one button for each Payment handle the Host entered, in `src/ui/pay/`. Zelle shows a card that copies the handle and the amount.
- [ ] Add **I paid** after the handoff. It records a Payment with the amount.
- [ ] Show the difference when a Share changes after a Payment, as "You paid $22.00. The Host owes you $8.00." or "You owe $4.00 more."
- [ ] Show the Host who has paid and who has not. Let the Host mark or unmark anyone.

**You see.**

- [ ] Sam's view shows a Venmo button that opens `https://venmo.com/<host>?txn=pay&amount=14.20&note=...` for a $14.20 Share.

**Seams.**

- [ ] `payLink(handle, cents, note)` in `src/core/pay-links.test.ts`, and the pay flow through Playwright in `e2e/pay.spec.ts`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/core/pay-links.test.ts` gains the exact URL for each service at $14.20, and a note with spaces and an ampersand encoded. Run `npm test -- src/core`.
- [ ] `e2e/pay.spec.ts` gains **I paid** at $22.00, then a Claim that drops the Share to $14.00, and asserts "The Host owes you $8.00." Run `npm run e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `swarm`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Claim Items and open the pay step at trunk and head. Trunk has no pay step, so record that and gate that head shows one button per Payment handle with the right amount. Save `pay-buttons.png`. Pass when each button's URL carries the Share to the cent.
- [ ] Lane 2. Tap the Zelle card on desktop width, citing `features/pay.md`. Save `pay-zelle.png`. Pass when the clipboard holds the Zelle handle and the amount.
- [ ] Lane 3. Tap **I paid**, then change a Claim from another browser, citing `features/pay.md`. Save `pay-difference.png`. Pass when the payer sees the exact difference and the Host sees the same.
- [ ] Lane 4. Open the Host's view with two paid and one unpaid Participant, citing `features/pay.md`. Save `pay-host-view.png`. Pass when the Host sees who has paid and can unmark one.

**Feature map.**

- [ ] Add `features/pay.md` in `verify-receipt-splitter`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Entry JavaScript brotli bytes, and milliseconds from the pay step opening to the buttons painted.
- [ ] Probe. `npm run size` and a Playwright timing of the pay step at trunk and head, interleaved.
- [ ] Baseline. Record the trunk entry size first. Trunk has no pay step.
- [ ] Rule. Fail if the entry grows by more than 10 KB brotli or the buttons take more than 100 ms to paint after the step opens.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 1, 3, and 4 screenshots into `/tmp/receipt-splitter-review/RS-11-review-buttons.png`, `/tmp/receipt-splitter-review/RS-11-review-difference.png`, and `/tmp/receipt-splitter-review/RS-11-review-host.png`.
- [ ] If `verify-receipt-splitter` can record, save a 30 to 60 second video of paying and recording a Payment as `/tmp/receipt-splitter-review/RS-11-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends RS-11 to the stack, and the operator lands it bottom-up.

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

## Appendix B. Alternatives rejected

- A Vite and React website lost to one Expo codebase, because the operator chose React Native for the later app. See ADR 0002.
- WebGPU lost for v1. Its runtime build is 26.8 MB, over the 25 MiB static asset limit, and onnxruntime issue 26827 reports crashes with WebGPU on iOS 26 Safari.
- PP-OCRv6 small lost to v5 mobile on speed and memory in the prototype. RS-4 still compares v5 mobile with v6 tiny on the full benchmark.
- A snapshot link with the Split encoded in the URL lost to one live link type. See the grilling and ADR 0004.
- A host key with special powers lost to equal access, with the Payment handle exception. See ADR 0003.
- Plain Durable Object WebSocket code lost to partyserver with hibernation, because partysocket gives reconnect and message buffering on phones for free.
- Firebase, Supabase, and Vercel with Pusher lost to Cloudflare, because Cloudflare serves the 14 MB OCR download from static assets at no charge.

## Appendix C. Risks

- OCR is too slow or runs out of memory on low-end phones. It lands in RS-4. The owner watches the one-thread path and peak memory, and keeps manual entry reachable from every OCR failure in RS-7.
- Cross-origin isolation breaks Turnstile or a font. It lands in RS-4 and RS-9. The owner keeps the one-thread fallback working, and RS-9 lane 6 records the result.
- The parser misses the RS-5 thresholds on real US receipts. The owner reports the per-category failures from `bench/score.mjs` and asks the operator before lowering a threshold.
- The Venmo link format is undocumented and may change. It lands in RS-11. The owner keeps the format in `src/core/pay-links.ts` alone, so a change touches one file.
- Equal access lets anyone with the link vandalize a Split. It lands in RS-10. The recent-changes list with **Undo** is the recovery, and the per-Split rate limit in RS-8 caps the damage.
- A WebSocket that stops hibernating multiplies the Cloudflare bill. It lands in RS-8. The perf rule greps for timers and `ws.accept(`, and lane 2 checks hibernation.
- The verification skill cannot drive a real phone camera. Lanes upload files instead, and RS-7 lane 5 covers the offline cached path.
- The benchmark labels hold mistakes. RS-3 gates on the operator's check before the parser is judged against them.

## Appendix D. Links and reading list

- Read `description.md`, `CONTEXT.md`, and `docs/adr/0001` through `0004` before editing.
- Read the partyserver README at `https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md` before RS-8.
- Read `https://developers.cloudflare.com/durable-objects/best-practices/websockets/` before RS-8.
- Read `https://developers.cloudflare.com/turnstile/troubleshooting/testing/` before RS-8 and RS-9.
- Read `https://developers.cloudflare.com/workers/static-assets/headers/` before RS-4.
- Run `/how` at the start of RS-7, RS-8, and RS-10, because they join modules built by earlier PRs.
- Run `/interrogate` on RS-2 and RS-8 before their PRs open, because the Share math and the shared state are the hardest parts to change later.
- Keep a decision trail per `/show-me-your-work` in `docs/plans/receipt-splitter-v1.trail.tsv`, and commit it with the last PR.
