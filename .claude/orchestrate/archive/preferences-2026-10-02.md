# Standing objective (armed 2026-09-29)

Run docs/plans/receipt-splitter-v1.md under autopilot-stack. Build RS-1 through RS-11 as one linear stack on main, in that order. A PR is verified only when its unit, live, and perf boxes are all checked, and tests alone are not sufficient verification. The operator reviews and lands every PR. RS-3, RS-6, RS-7, RS-9, RS-10, and RS-11 wait at merge-ready for the operator's review gate. [Amended 2026-10-01 by the operator: the root merges RS-6 and RS-7 without review, on a clean verdict plus green CI. RS-6 lands inside RS-7's PR 12. RS-9, RS-10, and RS-11 still wait for the operator's review.] Done when every PR is verified, rebased on current main, and handed to the operator as one stack.

## Program state
- Forge: gh (origin CLI not installed).
- Plan PR 1 merged 2026-09-30 as 98ae6af; PR 2 retargeted to main.
- Models: owners opus, swarm workers sonnet, max parallel 4.

## Brief rules for later owners (root decisions)
- RS-2 may also edit vitest.config.ts, only to remove passWithNoTests.
- UI owners (RS-6, RS-7, RS-9, RS-10, RS-11): review-animations is installed but disable-model-invocation; Read ~/.claude/skills/review-animations/SKILL.md by hand. Load emil-design-eng, apple-design, mobile-native and log the load in the trail BEFORE the first UI commit.
- Perf lanes from RS-4 on measure every script dist/index.html loads, not only entry-*.

## Stack state
- RS-1 CLEAN at 0066502, patch-id 79c87813c3f6a6dbd40968519bf3ce6611cb150c, verdict comment on PR 2.
- RS-1a (verify-skill message fixes) stacks between RS-1 and RS-2; disjoint files, so restacking RS-2 onto it keeps RS-2's patch-id.
- Owner ports: RS-2 8871, RS-1a 8881, RS-6 8891. Swarm lanes use 8851-8854.
- After every verdict, strip node_modules and dist from that swarm lanes worktrees (about 736M each). Reuse an existing worktree when its SHA matches. Check df before a swarm.
- RS-1a CLEAN at 340b45a, patch-id 69080c2f77faff63210eb2c14268b67a928ded24, verdict comment on PR 5.
- Deferred to RS-7 owner: Sheet (src/ui/components/sheet.tsx) needs drag-to-dismiss, velocity handoff, max height with scroll and overscroll-behavior contain, before first use. /new route arrives in RS-7.
- Deferred to RS-9 owner: installDocument at module scope applies the orange body color and theme-color to /s/:id; scope it per route.
- RS-1a follow-ups parked for /maintain-verification-skill: ps lstart locale/TZ, empty start time, cleanup recheck before rmSync, --height -1 parse wording, "left .verify" wording, launching until exit.
- Hosting decided (operator, 2026-09-30): all Cloudflare, one Worker serving static assets plus /api and /parties with Durable Objects. Launch on Workers Free; $5 Paid when traffic warrants. No ADR change.
- Merged: RS-1 (9b2787c), RS-1a (686670d) on main. RS-2 and RS-6 PRs retargeted to main.
- Standing authorization (operator, 2026-09-30): the root merges each PR itself with a merge commit once (a) clean swarm verdict at the exact head, (b) CI green at that head, (c) review-gated PRs (RS-3, RS-6, RS-7, RS-9, RS-10, RS-11) have the operator's approval in chat. Bottom-up order only. Repo has auto-merge off and no branch protection, so the root merges directly via gh api rather than arming GitHub auto-merge.
- GitHub settings (2026-09-30): ruleset 24227575 "Protect main" (no bypass: PR required, 0 approvals, conversations resolved, merge-commit only, required check `check`, no force-push, no deletion). Repo: auto-merge on, delete head branch on merge, squash and rebase off. Dependabot alerts and security updates on. Secret scanning not available on this plan.
- Merge path now: arm GitHub auto-merge (merge commit) on a PR once its swarm verdict is clean at the exact head and any review gate is approved; GitHub merges when `check` passes. Children of a merged parent auto-retarget to main when the parent branch is deleted.
- RS-7 owner: Toast sits over the home bottom bar; lift it above the bar. Add e2e for toast restart, live region, and 44 px target (RS-6 proved them only by temporary mount).
- RS-8 owner: mint Split ids server-side with crypto.getRandomValues, validate with isMintedSplitId, call parseNewSplit(body, id). applyOperation per Claim ~28 us at 60x12 (after RS-2 fix4).
- Plan erratum (2026-09-30): src/core uses extensionless imports, so any lane or script that runs src/core through `node --experimental-strip-types` needs a `.ts` resolve hook (`--import` hook or `registerHooks`). RS-2 lane 2 cites a features/README.md worked example that no box asks for; treat the lane's intent (Shares sum to total) as the predicate.
- RS-2 MERGED 2026-09-30 as d30eb07 (CLEAN at 8027d06, patch-id b4426ddb0dc304c10508a980736593dfeb1285eb). RS-3 and RS-8 owners started from d30eb07, ports 8871 and 8872.
- Operator label rulings (2026-09-30): label total = total paid incl handwritten tip; a label must be checkable against its photo; indented priced rows fold into the Item above regardless of POS item count.
- Verdict rule (operator, 2026-09-30, plan PR 8): lanes return PASS, PASS+NOTES, or FAIL; clean when no lane fails; notes go to notes.md with a named fixer; fix rounds rerun gates + delta audit + changed-surface lanes; cleanup PR at the tip. Lane reports are short (verdict + one line per finding + evidence paths).
- Models: test-only or small fix rounds on sonnet; delta audits on sonnet except RS-8 and RS-9 (opus). First audit of every PR stays opus.
- Owners get the probe that found their defect and commit it as a test. A third fix to one behavior stops for a premise check.
- Ports: audit lanes RS-6 8961, RS-8 8962, RS-3 8963; later PRs 8964+.
- Owners and lanes write drafts only under /tmp/swarm-<PR>/<role>/, never the shared session scratchpad.
- RS-3 MERGED 2026-09-30 as f02ae4c. RS-4 owner started from f02ae4c, port 8873.
- Ride-alongs on a fix round must fix existing code only. Never add a new feature as a ride-along (lesson from RS-8 flood close).

- 2026-09-30 resume: RS-8 owner port 8872.
- 2026-09-30: RS-5 owner port 8875.

## Push rule (operator, 2026-09-30)
- Owners commit locally and never push. Verifiers check out the owner's local SHA (worktrees share one object store).
- On a clean verdict the root pushes that exact SHA once and opens or updates the PR with the owner's drafted body (`/tmp/swarm-<PR>/owner/pr-body.md`). CI runs once on the verified commit. A CI failure goes back to the owner like a lane FAIL.
- Restacks still force-push with lease; they happen only when main moves.
- Why: 74 CI runs on 2026-09-30 on a private repo, about 370 Actions minutes (estimate) against a 2,000-minute monthly free tier.
- This overrides the plan's PR mechanics ("open the PR ready", "push early") until the cleanup PR updates the plan text.
- 2026-09-30 operator: no PDF upload in v1 (images only). The "photo stays on this phone" line is not shown.

## Mutation runs (operator, 2026-09-30)
Per-mutant runs execute only the test files that cover the mutated file (for example the press spec for `button.tsx`), not the full e2e suite. A mutant that survives the targeted run is rerun against the full suite before it counts as a survivor. The full suite still runs once at the final head. Applies to owners and auditors from RS-7 on. Why: the RS-6 v8 run spent about 1.1 min per mutant (about an hour for 50) rerunning all 57 e2e tests.

## Verification budget (operator, 2026-10-01): 30 minutes of test runs per PR, max
Overrides the plan's verdict rule and the heavier lane lists where they conflict, until the plan text is amended.
- Gates as before: lint, typecheck, unit, worker, e2e (about 4 min in total).
- Mutation testing applies to logic only: money math, src/split, src/parse, src/draft, worker/, OCR plumbing. Mutants run against the unit tests, which take seconds. At most about 15 mutants per PR. No mutants on UI, style values, or e2e.
- UI is proved by the screenshot matrix plus the operator's review. Tests do not pin style values.
- Each PR's live check is one lane covering its main user flow, plus the screenshot matrix, in 15 min or less. The press check is a smoke test, not a 2,000-case harness.
- Perf: `npm run size`, plus LCP with 3 loads each, interleaved (about 5 min).
- The swarm is gates+perf, one live lane, and one diff audit. All run in parallel, finish within 30 min, and the audit runs no UI mutants.
- Only real defects and untested logic block. Missing tests on visuals and rare edge cases are notes.
- A fix round is checked by the root: the gates plus the specific check that failed. No new swarm.
- Why: RS-6's redesign took about 10.5 h. The test suite itself runs in about 2 to 3 min. The hours went to e2e-based mutation runs (about 2 min per mutant) and press harnesses of up to 2,900 cases (55 to 74 min).

## Operator rulings (2026-10-01, during RS-6 review), assigned to RS-7
- Replace the hand-rolled Button press machine with the platform's built-in handling (Pressable's `pressed` state, CSS :active where needed). Ordinary browser press behavior is acceptable in edge cases. Delete the press cases that only encode the old machine's rules, and keep a short smoke test.
- Upload box: the desktop drop area gets a dashed border, and mobile gets the same dashed box around the hero. Fill colors stay unchanged; only the dashes are added. Add a short line naming the supported file types. Reference: /tmp/receipt-splitter-review/ref-dashed-upload.png. Everything else stays the same.

## Merge authority (operator, 2026-10-01)
"Can you merge both of them in without my approval": RS-6 and RS-7 no longer wait for the operator's review gate. The root merges each one on a clean verdict at the exact head plus green CI, using a merge commit pinned with --match-head-commit. Tests are never weakened to get CI green.
Keep using /emil-design-eng (and apple-design, mobile-native per CLAUDE.md) for every UI change.
- 2026-10-01 operator: RS-6 lands together with RS-7. Once RS-7 has a clean verdict and green CI, the root merges RS-7's PR, which carries RS-6's commits, and PR 3 closes as merged. RS-6 is not merged alone while its CI is red.

## Fix-round routing (operator, 2026-10-01)
Resume the owner when a fix round needs its judgment. When the round is small and fully specified (test-only, or a few findings with file:line and a done check) and the owner's last usage report shows more than about 400k tokens, use a fresh fixer on the `fix round, test-only or small` model (sonnet) instead. It works in the owner's idle worktree from file pointers. This rule is also written into poteto-mode SKILL.md (Subagents) and playbooks/autopilot-stack.md step 4.

## Split page redesign (operator, 2026-10-01 ~13:00), mockups in Figma first
- No "Me" chip. The Host types names only. After the link is created, EVERYONE, the Host included, picks "which one are you?". The pick decides whose name a claim goes to.
- "Which one are you?" is the bottom sheet pulled up tall over the split page, not a full page. It shows an invite line ("X invited you to split <bill> · $total"), the people list, and "Not here? Add yourself". After the pick, the sheet animates down to regular height, showing people chips with yours highlighted.
- Tapping a name shows only that person's items, what they owe, and details (shares of tax and tip, status).
- Every participant can VIEW and EDIT the receipt. This reverses RS-9's lock after the link exists, so edits must be undoable.
- Status: the HTML mockup board is being built (/tmp/receipt-splitter-review/split7/). It goes into Figma file rUCjp4g9qO5erLgaXSe5pO as a new page. RS-10 is held to core and server work until the design is approved. After approval, amend the plan (RS-9, RS-10, RS-11) as in PR 11.

## Split redesign answers (operator, 2026-10-01 ~14:30)
1. The creator types their own name into the people list on home, alongside the others. There is no "Me". They then pick it like everyone else.
2. The tall "which one are you" sheet can be closed without picking.
3. Unclaimed items: nobody pays for them. They stay unclaimed and flagged.
4. Participants can only ADD people, not remove or rename them.
5. The payer marks themselves paid.
6. No "someone edited" toast or Undo toast. Each receipt line opens a detail view: edit price, quantity, split the item in different ways, add people to it, etc. A pop-open History tab shows the edits, replacing the Undo toast.
7. Yes: warn on the split page when the items stop adding up to the total.
8. No: two devices cannot pick the same name.
9. General: a little more spacing between everything, and text sizes down a smudge.

## Round 8 approved (operator, 2026-10-01 ~15:00): "Design looks great"
- Design: /tmp/receipt-splitter-review/split8/ (Figma node 17-2). It gets copied into docs/design/split/ by the plan amendment.
- Quantity: with quantity above 1, "Who had it" splits EACH UNIT (per unit), not the line total.
- Reverting someone else's change asks for confirmation.
- A leftover remainder in a "By amount" split counts as Unclaimed.
- History shows ONLY payments (who paid) and manual receipt changes. No picks, joins, adds or claims, to avoid clutter. A wrong "That's me" takeover is fixed by the real person tapping "That's me" again.
- Spacing up about 2 px and type down about 1 px app-wide (values in split8/notes.md). Inputs stay at 16 px.
- Merge authority unchanged: RS-9, RS-10 and RS-11 wait for the operator's review.
- 2026-10-01 operator confirmed the plan author's six calls (per unit, restore on the Created row, delete splitUnclaimed, hero 26 px, split-mode changes in History, editing only on the split page) and approved RS-9. PR 13 merged as 538ccc0 and plan PR 14 as a4825e9.

## Context budget (operator, 2026-10-01)
Size each PR for one owner under about 300k tokens, and split anything bigger. The cleanup PR becomes 2–3 themed PRs. Long command output goes to files, and the agent reads only the summary and failures. Owners hand live runs, screenshots, perf and mutants to short-lived helpers. Any agent past about 400k writes a handoff file and is continued by a fresh agent; the loop tick checks token counts with ~/.claude/skills/status/scripts/agents.py. These rules are also written into poteto-mode SKILL.md ("Keep contexts small") and autopilot-stack steps 1–2.

## Trust model ruling (operator, 2026-10-01)
A Split is between friends and needs no verification. "That's me" (pick with takeOver) letting any device take any name is expected. So is any device then marking that name paid. Security cleanup item S1 (hash device ids so a copied id can't forge Payments) is dropped as not needed; payerOnly stays as a guard against honest mistakes, not as security. No History line or notice for takeovers. Abuse protection against strangers without the link (Turnstile, rate limits, sw.js, headers) still applies.

## Production address (operator, 2026-10-01)
Production is app.splitwith.workers.dev: account subdomain `splitwith`, Worker name `app`. Turnstile hostname and ALLOWED_HOSTNAMES use that value. Rename the Worker before the first deploy only.

## Merge approval (operator, 2026-10-01)
The operator approved merging security PR 21 ("yes you can merge"). Order: PR 20 (Worker rename) first, then PR 21, each on green CI with --match-head-commit (84d2b14, then a37d3f0).

## Turnstile removed (operator, 2026-10-01)
A real-key Turnstile widget cannot render under the home page's COEP require-corp. This was confirmed live on app.splitwith.workers.dev: no frame renders under COEP, and the same widget renders on a non-isolated page. Creating bills was broken in production. The operator chose to remove Turnstile entirely ("detracts from the experience of being super easy"). Keep cross-origin isolation for 4-thread OCR. Protection is the per-IP create limit plus a new global daily create cap sized to the free row-write quota. The ALLOWED_HOSTNAMES and EXPO_PUBLIC_TURNSTILE_SITE_KEY variables and the TURNSTILE_SECRET_KEY secret become unused.

## Redesign picks (operator, 2026-10-01, round 1)
- Receipt: on the phone, C's bottom-sheet item detail with the Evenly/By shares/By amount control. On desktop, A's popover anchored to the line plus A's right pane. Buckets combine C's card with B's collapse (a "6 drinks · 10% off" summary). A quantity column, and no × on rows.
- Web home: A, the centered column.
- Names flow: approved (type, Enter, a new input opens; the empty state's next chip says "+ Add").
- The operator asked to see default states (nothing selected or expanded). Round 2 board in progress: /tmp/redesign/boards/round2.html.

## Receipt photo on the Split page (operator, 2026-10-01)
Everyone in a Split can view the receipt photo. Upload a downscaled copy when the link is created, store it with the Split on Cloudflare, and delete it when the Split expires. The operator accepted that the photo shows whatever the receipt prints (for example, card last 4). Round-3 tweaks: the bucket header has no leading control, the bucket card uses the same surface, the 1024 upload box has room, and there's a "View receipt" button on the Split page.

## Agent effort (operator, 2026-10-01)
All subagents run on medium effort. `effort: medium` is set in ~/.claude/agents/poteto-agent.md and comment-sicko.md. For general-purpose agents (verifiers), say "work at medium effort" in the brief, because the built-in type has no frontmatter.

## Round 3 approved (operator, 2026-10-01) with one change
Figma node 50-2 is the target design. The operator said the minor rendering issues in the capture are fine. Sub-item change: drinks inside a bucket are indented so each child's quantity aligns with the left edge of the parent's name text ("Beer Bucket"). A light vertical line runs from under the parent's quantity down beside the children. Next: a plan amendment PR (like PR 14), then the build PRs.

## Live bugs (operator, 2026-10-01)
- Remove the yellow "Add how to pay you." note. Tapping Create without a handle focuses the handle field instead.
- On mobile, the up (expanded) state flashes when a bottom sheet slides down. Fix at the root.
Opus owner on fix/pay-note-sheet-flash; body /tmp/redesign/bugfix-pr.md. Ships before the v2 redesign.

## Total mismatch (operator, 2026-10-01)
A failing Total check blocks nothing: not create, not any operation. It is only a quiet, non-highlighted note on home and on the Split page. Structural validation stays strict. In scope for the fix/pay-note-sheet-flash PR, along with Copy and Share on the "Which one are you?" sheet. The v2 plan (PR 26) must reflect this.

## v2 plan decisions (operator, 2026-10-01)
1. Photos stay on the Free plan. Downscale to about 150 KB, and delete each photo 14 days after the Split is created (the Split remains). No Workers Paid.
2. No "Fix items" on the compact card. Items are fixed on the Split page by tapping a line, and the mismatch is non-blocking.
3. No line on home about who can see the photo.
Go given to start implementing. V2-1 starts now.

## Handles (operator, 2026-10-01)
"@jason-z" in the design mockups is not a real handle. Leave it.

## Updates (operator, 2026-10-02)
No routine status posts every 30 minutes. Post only on a big change (a merge, a deploy, a FAIL verdict, a new operator gate, or a blocker), or when the operator runs /status. The audit tick still runs silently.

## Desktop home (operator, 2026-10-02)
Confirmed design A, the centered column, which is what V2-5 built.

## Follow-up chips (operator, 2026-10-02)
Subagents must not file spawn_task chips for the operator. Every brief says: "Don't use spawn_task; list follow-ups in your final report." The root routes them through notes.md and the hardening PR.

## One row per unit (operator, 2026-10-02)
No quantity column or number. An Item with quantity N shows as N rows, each claimable, at the unit price (the extra cents go to the first rows). Name and price edits apply to the whole Item. Delete removes one unit. Bundle counts are in units. Display-only: the model's per-unit claims are unchanged. Folded into V2-3 before merge; also applies to V2-4 desktop.

## Row circle (operator, 2026-10-02)
The select circle on Split rows is smaller, with less left spacing around it and a little less spacing to the right (the circle-to-name gap and the right padding), and keeps a 44 px tap target. In V2-3; V2-4 must follow it.

## Bundle header chevron (operator, 2026-10-02)
Keep the current V2-3 indent layout. Reject the proto/aligned-circles and proto/line-at-beer variants. The Bundle expand chevron moves into the header's leading slot, with its point on the vertical rule. V2-4 follows it.

## Sheet and navigation (operator, 2026-10-02)
- The iPhone Safari sheet is unreliable: slide up and down or tap doesn't consistently work, it still flashes sometimes, and there is a pause with nothing shown between the detail view and the collapsed bar. This is the 4th round on SpringSheet: do a premise check (rebuild versus patch). The operator approved downloading Playwright WebKit.
- The Link ready, Copy and Share block becomes ONE line: the link text with Copy and Share buttons inline.
- The bill page header gets a Home button (to / to start a new split; the Split stays saved).
- Opening the home URL must show a fresh home, not the cached draft. Clear the receipt and names after a Split is created (keeping the pay handle is a convenience; confirm with the operator).

## Row size (operator, 2026-10-02)
Item text and the select circle a little smaller again: about 1 px less text and a 16 px circle, keeping a 44 px tap target, the indent rule and the chevron on the rule. In fix/sheet-ios; V2-4 follows.

## Unclaimed (operator, 2026-10-02)
No yellow highlight anywhere in the app (unclaimed, flagged rows, blocker reasons). Use plain secondary-gray text or a small monochrome tag. Unclaimed is a monochrome "Unclaimed" tag, and collapsed Bundles say "N unclaimed". In fix/sheet-ios; V2-4 follows.

## Round 2 rulings (operator, 2026-10-02)
- No "Unclaimed" tag on rows; the missing person icon shows it. Collapsed Bundles keep a quiet gray "N unclaimed" text (the root's call, flagged to the operator).
- The creator (Host) keeps editing the Venmo handle and payment methods from the Split page. No one else can.
- Animations are tested with Playwright for smoothness (frame gaps, no jumps, reduced motion), in WebKit and Chromium at 1x and 4x CPU, as a standing check for UI PRs.
- UPDATE (operator, 2026-10-02): no handle-edit control on the Split page for now. The pick sheet shows only the people and the share link. Payment handles can't be changed after create. Offered: an "Edit" in the creator's own "You owe" panel, if they ask later.

## Pay button in the bar (operator, 2026-10-02)
For a non-Host who picked a name, the collapsed bar shows "Pay <Host> $X" directly under or next to You owe. One tap opens the first payment app's deep or web link (Zelle copies). Other apps stay in the expanded breakdown. It is in fix/sheet-ios after the motion round, and V2-4 follows it.
- UPDATE (operator, 2026-10-02): no change; the pay button stays in the expanded breakdown as is.

## Breakdown units (operator, 2026-10-02)
Drop "1 of 3" from a person's breakdown, matching one row per unit on the receipt. V2-4 builds it.

## WebKit in CI (operator, 2026-10-02)
CI runs WebKit (mobile-safari) for the functional sheet and claim specs only. Tests tagged @frame-timing are skipped on Linux, because the Linux runner's WebKit frame gaps measure the runner. WebKit frame timing is a required local gate through verify-receipt-splitter motion.mjs on macOS before every UI PR. Chromium frame timing still runs in CI.

## iPhone test of PR 35 (operator, 2026-10-02, on production d0cf6ce)
Bugs, all binding:
- Item sheet: switching split type shows the old selection, then the new one.
- Item sheet: tapping the price field collapses the item panel, which pushes the active field under the keyboard.
- The pull-up bar still flashes on some collapses, and flashes whenever the keyboard goes down.
- Bundle carets flash the open state when opening and closing. Flashing is a recurring pattern across almost all animations; fix it everywhere.
- Home: pulling the tab up splits it away from the Split link button, with black between them.
- Home: editing text sometimes doesn't scroll the field up above the keyboard. Rule: a focused text field is never covered by the keyboard, anywhere.
- Split page: adding a name after the link exists, the name box is partly covered by the top.
Features:
- Add a fully new Item on the Split page.
- A History button on home that lists past Splits.
- Home bottom pane (operator, 2026-10-02): the Create split link area must be one piece with the payment and names panel. No gap between them, and dragging up or down from anywhere on the panel (for example "how you pay") moves it, not only the small grab slit.
- History (operator, 2026-10-02): on the home page, stored on this device only. Tapping a past Split opens its share link directly.
- Home panel not collapsible (operator, 2026-10-02, supersedes the collapse in sheet.tsx): the home panel with payment, names and Create split link is always shown. Dragging it up or down moves it only while the finger is down, then it springs back. With the one-piece ruling above, the whole panel including Create is one surface.
- Split page bar after a pick (operator, 2026-10-02): do not show the link row (link, Copy, Share) in the collapsed bar once someone has picked a name. The Share button in the page header is enough there. Instead the bar shows "Your share" with an up-arrow, so it is clear you can pull it up for the breakdown. The full link row stays only on the pick sheet ("Which one are you?").
