---
name: orchestrator-store
description: "Where the Receipt Splitter orchestrator's handoff, standing rules and notes live, and how to resume"
metadata:
  type: reference
---

The orchestrator store is `.claude/orchestrate/` in this repo. In cloud sessions `~/.claude/orchestrate/receipt-splitter/` links to it, so paths in skills and playbooks still work. To resume, read `handoff.md` first, then `preferences.md` (binding numbered rules) and `notes.md` (open follow-ups, each with a fixer). Older handoffs are in `archive/`.

Changes to these files persist only when committed. Commit store updates with the PR they belong to, or in a small state-only PR.

PR evidence (`review/<feature>/`), audits and the census and probe tools stay on the Mac in `~/.claude/orchestrate/receipt-splitter/`. They are large and not in git.

Related: [[model-choice]].
