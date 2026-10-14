### Multi-phase or multi-PR plan

**You own the plan, not the code. The plan is a checklist an owner runs box by box and the operator audits from the evidence.** The plan is the deliverable. Do not implement.

1. When the change is one or two files with an obvious approach, skip the plan. Say so and stop.
2. **Start from the grilling.** The usual input is a `/grill-with-docs` session in this same conversation, plus the repo's `CONTEXT.md` and ADRs. Decisions the grilling settled are binding. Do not re-ask them, and use the `CONTEXT.md` terms in every heading and box. If the grilling happened in another session, read its handoff file or ask for one (`/handoff`). Carry the grilling's problem, solution, user stories, and out-of-scope list into the plan's **Intent** section. List any question the grilling left open, then settle it in step 3.
3. Settle open questions by prototype before you write. Run `playbooks/prototype.md` for each. Keep the branch, the SHA, and the screenshots for Appendix A. Ask the operator only about a product or preference call that no run can settle. Give options (the **never-block-on-the-human** principle skill).
4. Explore in subagents with `subagent_type: "poteto-agent"` and an explicit model per the Subagents section (the **guard-the-context-window** principle skill). Each returns file pointers, conventions, test commands, and entry points. No inlined dumps.
5. Copy the skeleton below into the plan file and fill every placeholder. Unless the operator names a path, write the file to `docs/plans/<slug>.md` in the repo and commit it, so the plan is versioned and any session can pick it up. Keep every heading and every sub-block in the order shown. One section per PR. One PR is one change with its own evidence (the **sequence-verifiable-units** principle skill). Name the execution playbook in **How to read this**. Pick between `playbooks/autopilot-full.md` and `playbooks/autopilot-stack.md` per the rule at the end of `playbooks/autopilot-stack.md`. A standing program takes `playbooks/orchestrate.md`.
6. Write under `/technical-writing` in full, then `/unslop`. The body is one Diátaxis mode, how-to. Appendices hold explanation and reference. Each heading states the task or the finding. No long dashes. No mid-sentence colons.
7. Run `node ~/.claude/skills/poteto-mode/scripts/check-plan.mjs <plan.md>` and fix every line it prints (the **encode-lessons-in-structure** principle skill).
8. Hand back. Post the plan path and the script's output, then stop. Execution starts on the operator's explicit go, under the execution playbook the plan names.

**Verification.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked (the **prove-it-works** principle skill). That sentence is the verification rule. Every verification block opens with it. The live block is mandatory. Its lanes drive the real surface at the PR head through the project's verification skill, per the **swarm** skill, on the `swarm workers` model. Size the lanes to the PR with its **Level**. `standard` is two lanes, the regression lane plus the one load-bearing scenario, and fits most PRs. `swarm` is four to ten lanes, for a PR that changes an interaction, touches shared state or several surfaces, or carries real blast radius. Lanes run on this machine, so each lane gets its own worktree and its own app instance, and at most `max parallel` lanes run at once. Each lane is one box with a concrete scenario, the screenshot it saves, and its pass predicate. One lane is the **Regression lane against trunk.** It runs the same load-bearing scenario on trunk and head. If trunk does not have the feature, the lane records that fact and gates the behavior the diff adds plus the end state the user waits for instead of inventing a trunk result. The perf gate is dual-sided. Trunk and head must both produce the named metric. If trunk lacks the feature, also isolate the work the diff adds and set an absolute budget for that work plus the end-to-end state the user waits for. Do not claim a ratio between unlike scenarios. The perf block names the metric, the interleaved probe, the trunk baseline measured first, and the rule with the number that fails. A PR that changes an interaction is review-gated. The operator reviews it in chat with screenshots and a video before merge. A PR that changes no interaction writes `**Review gate.** None. <PR id> is not review-gated.` and no boxes under it.

**Verification skill.** Use the project's `verify-<app>` skill, which `/create-verification-skill` generates in `.claude/skills/`. Its feature map (`features/README.md`) names how to reach each feature, so every lane cites the map entry it drives. If the repo has none, the first PR in the plan creates it (a runnable skeleton plus `/create-verification-skill`), and every later PR depends on that PR. A PR that touches two surfaces gets lanes on both. A surface the verification skill cannot drive is a risk in Appendix C, and its live block still names how each lane drives it.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the program enforces, and the PR ids in order.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/poteto-mode/playbooks/<execution playbook>.md`. <Who merges, and which PR ids are the operator's items that stop at merge-ready.>

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Intent

**Problem.** <The problem from the user's point of view, from the grilling.>

**Solution.** <The solution from the user's point of view.>

**User stories.**

1. As a <actor>, I want <feature>, so that <benefit>.

**Out of scope.** <What this program does not do.>

**Decisions.** <Links to the ADRs and `CONTEXT.md` terms the grilling produced or relies on.>

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write this exact text into the standing objective and restate it in your todolist. "<The plan path, the PR ids in order, the verification rule, who merges, and the done condition.>"
- [ ] Read these at program start. Re-read them at every tick.
  - [ ] `~/.claude/skills/poteto-mode/playbooks/<execution playbook>.md`
  - [ ] `~/.claude/skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify-<app>/SKILL.md`
  - [ ] `~/.claude/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `~/.claude/skills/<each other leaf skill the program uses>/SKILL.md`
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Post to the operator only when something big changed since the last post: a merge, a deploy, a FAIL verdict, a new operator gate, or a blocker. Otherwise stay quiet and log the tick in the trail. The full status (queue table of PR, owner, state, and head SHA, verdicts, merges, open gates, open notes and their fixers, blockers) is for when the operator runs `/status`."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner is a background `poteto-agent` with `isolation: "worktree"`. At most `max parallel` owners run at once. Queue the rest.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] <PR id> and <PR id> are independent and first. Both branch from `main`.
  - [ ] <PR id> after <PR id>.
- [ ] Hold the file boundaries. <PR id or class> touches only `<glob>`.
- [ ] Hold the review gate. <PR ids> change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Write tests through `/tdd` at the PR's **Seams**.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Run `/spec-review` against this plan's PR section before the code-ready report. Fix every Spec finding.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `~/.claude/skills/swarm/SKILL.md`. One gates lane. The live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Lanes return `PASS`, `PASS+NOTES`, or `FAIL`. `FAIL` is a blocking issue, a defect, or new code without a test that fails for it. Clean when no lane fails. `FAIL` findings go back to the owner.
- [ ] Each note names its fixer, the next PR touching those files or the cleanup PR, and goes in the store's `notes.md`. A PR sent back fixes its own notes too.
- [ ] The first verdict runs every lane. A fix round reruns gates, an audit of the new commits, and the lanes whose surface changed.
- [ ] <The merge or append rule from the execution playbook, with the patch-id rule from `playbooks/shipping.md`.>

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head, with its own app instance and port per `verify-<app>`. Drive only through `verify-<app>`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] <Start the backend and the surface. Wait for ready.>
- [ ] <Deliver input only through the verification skill's commands. Name the read-only diagnostics.>
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Seams.**

- [ ] <The public interface the tests go through, per `/tdd`. Name the test file.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Level `<standard or swarm>`, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run <the same load-bearing scenario> at trunk and head. If trunk lacks the feature, record that and gate <the behavior the diff adds plus the end state the user waits for>. Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 2. <Scenario, citing its feature map entry.> Save `<slug>.png`. Pass when <predicate>.
- [ ] <Lanes 3 to 10 only at Level `swarm`, same shape.>

**Feature map.**

- [ ] <Add or update `features/<entry>.md` in `verify-<app>`, or write None with the reason the PR changes no user-facing feature.>

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. <What is measured at both trunk and head. If trunk lacks the feature, also name the diff-added work and the end-to-end state the user waits for.>
- [ ] Probe. <The command or procedure, run at trunk and at the head, interleaved. Both sides must produce the metric.>
- [ ] Baseline. Record the trunk <value> first. Reuse deterministic trunk values (build bytes) across rounds at the same trunk SHA. Keep timings interleaved.
- [ ] Rule. <Head against trunk, with the number that fails. If the scenarios differ, add absolute budgets for the diff-added work and the user-visible end state instead of an invalid ratio.>

**Review gate.** The operator reviews before merge.

- [ ] Copy lane <n> screenshots into `<media path>/<pr-id>-review-<slug>.png`.
- [ ] If `verify-<app>` can record, save a 30 to 60 second video of the change as `<media path>/<pr-id>-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] <The owner squash-merges its own PR, or the root appends it to the base-branch stack and the operator lands it bottom-up.>

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] A cleanup PR at the tip closes every open note in `notes.md`. One gates lane and one audit.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the branch, the SHA, and the artifact links. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the PR it lands in and what the owner watches.>

## Appendix D. Links and reading list

<Docs to read before editing. Which PRs get `/how` and `/interrogate`. The trail per `/show-me-your-work`.>
````

**Reply:** the plan path, the PR ids with their dependencies and the review-gated set, what the prototypes proved and what stays unproven, and the check script's output.
