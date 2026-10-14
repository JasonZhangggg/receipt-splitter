---
name: model-choice
description: No Fable access; Sonnet 5.5 implements with Opus 5.5 as advisor, Opus judges, Haiku 5.5 for search and mechanical work
metadata:
  type: feedback
---

Never pass `model: "fable"` to the Agent tool. Sonnet is the default implementer (feature, bug-fix, refactoring, perf owners, fix rounds, delta audits), with Opus as its advisor: the owner asks a short-lived Opus agent before committing to a design or a money-logic fix (operator, 2026-10-09). The built-in advisor tool (`advisorModel`) stays off: it can't be scoped to subagents, and the operator didn't want it in the main session. Opus does judgment, prose, reviews of money or trust logic, and the hardest tasks. Haiku (the `haiku` alias runs Haiku 5.5, checked 2026-10-07) does read-only search, CI and deploy watching, status, and log or screenshot reads. Panels (arena, architect, interrogate) mix opus, sonnet and haiku. All of this is encoded in `.claude/pstack-models.md` (copied to `~/.agents/pstack-models.md` in cloud sessions), which has no fable roles.

**Why:** the user has no Fable access (2026-09-29). On 2026-10-07 they asked pstack to use Haiku 5.5 alongside Sonnet 5.5 and Opus 5.5 to save time and tokens. Skill defaults in `~/Code/agent-skills` still name fable as a fallback, so a role missing from the settings file would fall back to it.
**How to apply:** when a skill or playbook says "fable", use opus. Route mechanical and read-only work to haiku. Revisit if the user says they have Fable again. Related: [[light-verification-small-changes]].
