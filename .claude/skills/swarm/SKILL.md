---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
---

# Swarm

Fan out N parallel workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers. At most `max parallel` (pstack settings file, default 4) run at once on this machine. Queue the rest as a rolling window.
4. Pick the worker model from `swarm workers` in the pstack settings file when present (`~/.cursor/rules/pstack-models.mdc` in Cursor, `~/.agents/pstack-models.md` in other harnesses). Otherwise use `sonnet`. For a model race, name each arm's model up front.
5. Give each worker its own writable output when it writes.

## Phase B: Fan out

Spawn the first window of workers in one message with the `Agent` tool: `subagent_type: general-purpose`, `run_in_background: true`, the configured model, and `isolation: "worktree"` for any worker that writes files or runs the app. Workers that drive the app each use their own port or instance per the project's `verify-<app>` skill.

When a worker must start from a non-default branch, its brief tells it to check that branch out in its worktree first.

**Other harnesses.** These parameters belong to Cursor's `Task` tool, and `environment: "cloud"` runs a Cursor cloud agent. In another harness, use its subagent tool: `Agent` in Claude Code (`subagent_type: general-purpose`), `task` in OpenCode (`subagent_type: general`), `spawn_agent` in Codex. Workers run locally there, so give each one its own worktree or output path. Keep the brief and the model. Drop parameters your tool doesn't have. If your harness has no subagent tool, as in Pi without an extension, run the workers yourself, one after another.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `PASS+NOTES`, `FAIL`, or `BLOCKED`, then one line per finding with its evidence path. Details go in files.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
