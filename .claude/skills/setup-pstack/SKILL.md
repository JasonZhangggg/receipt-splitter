---
name: setup-pstack
description: Configure which Claude model pstack uses per role and how many agents may run at once on this machine. Writes ~/.agents/pstack-models.md, which overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write pstack's model settings to `~/.agents/pstack-models.md`. pstack skills read this file when they pick a model or size a fan-out.

This install runs in Claude Code only, with no cloud agents. Every model value is an `Agent` tool alias.

## Steps

### 1. Load current state

If `~/.agents/pstack-models.md` exists, read it and treat its `# budget` line, its `max parallel` line, and its role values as the current choices. Otherwise start from the defaults in step 4.

### 2. Ask for a budget

Use `AskUserQuestion` with these options, naming the current budget when the file records one.

- `max quality` keeps the defaults in step 4. `fable` judges, `opus` builds, `sonnet` fans out.
- `balanced` moves code roles and panel entries that are `fable` down to `opus`, and keeps `fable` for judgment and prose.
- `economy` moves code roles to `sonnet`, judgment and prose to `opus`, and swarm workers to `haiku`.

Then ask for `max parallel`, the most file-writing agents and app instances that may run at once on this machine. Offer `2`, `4` (recommended for a laptop), and `6`.

### 3. Show the roles and confirm

Show every role with its model and ask whether to accept or change specific roles. The only valid values are `fable`, `opus`, `sonnet`, `haiku`, and `inherit-parent` (the role runs on the parent session's model). Panel roles (arena runners, architect runners, interrogate reviewers) take a list, one subagent per entry, so the list length sets the count. Prefer distinct models in a panel for diversity. `arena cross-judge pool` is a list the arena picks one value from, preferring a model that differs from the parent's.

### 4. Write the file

Overwrite the whole file so re-runs stay idempotent. Shape, with the `max quality` defaults:

```
# pstack model configuration (Claude Code). One line per role. Delete a line to fall back to the skill default.
# Values are Agent tool aliases: fable, opus, sonnet, haiku, or inherit-parent.
# budget: max quality
max parallel: 4
feature, refactoring: opus
bug-fix: opus
perf-issue: opus
hillclimb: opus
judgment and prose: fable
hardest tasks: fable
how explorer: sonnet
how explainer: opus
why investigators: sonnet
why synthesizer: fable
reflect tooling: opus
reflect judgment, divergent, synthesizer: fable
arena runners: fable, opus, sonnet
arena cross-judge pool: fable, opus
swarm workers: sonnet
architect runners: fable, opus, sonnet
interrogate reviewers: fable, opus, sonnet
```

### 5. Confirm

Tell the user the file path and the budget. Changes apply to the next pstack run.

### 6. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill in `.claude/skills/`, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill`. On no, move on without pushing.
