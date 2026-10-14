# pstack model configuration (Claude Code). One line per role. Delete a line to fall back to the skill default.
# Values are Agent tool aliases: fable, opus, sonnet, haiku, or inherit-parent. The haiku alias runs Haiku 5.5 (checked 2026-10-07).
# budget: custom (no fable access). sonnet implements with opus as its advisor, opus judges and takes the hardest tasks, haiku searches, fans out and does mechanical work.
max parallel: 4
feature, refactoring: sonnet (advisor: opus)
bug-fix: sonnet (advisor: opus)
perf-issue: sonnet (advisor: opus)
implementer advisor: opus, as a short-lived opus agent the implementer asks before committing to a data shape, an architecture choice or a fix for money logic. The built-in advisor tool is off (operator, 2026-10-09: it cannot be scoped to subagents only).
hillclimb: opus
judgment and prose: opus
hardest tasks: opus
how explorer: haiku
how explainer: opus
why investigators: haiku
why synthesizer: opus
reflect tooling: sonnet
reflect judgment, divergent, synthesizer: opus
arena runners: opus, sonnet, haiku
arena cross-judge pool: opus, sonnet
swarm workers: sonnet
swarm workers, read-only (search, census, coverage checks): haiku
architect runners: opus, sonnet, haiku
interrogate reviewers: opus, sonnet, haiku
fix round, prescribed or test-only: sonnet
delta audit: sonnet (opus for money, security or trust-model logic)
mechanical (CI and deploy watching, status, log and screenshot reads, worktree audits, model-ID checks): haiku
