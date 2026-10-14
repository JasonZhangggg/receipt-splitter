---
name: light-verification-small-changes
description: "For simple UI/copy tweaks the operator wants speed and light testing, not full audit rounds"
metadata:
  type: feedback
---

For simple changes (copy, spacing, an icon, a small layout tweak), the operator wants them done quickly with light verification: one test, a screenshot, one full e2e run. Skip the independent multi-round audits. Keep full audits for logic, money, motion or core changes.

**Why:** on 2026-10-06 the operator said "these changes are all quite simple, make them quickly. You should not need a lot of tests" after several long audit cycles on small tweaks.

**How to apply:** match the verification to the risk. For visual tweaks, show the operator a screenshot before merging, and pause auto-merge while they're still deciding ([[clear-kills-agents]] covers the handoff side).

On 2026-10-07 the operator asked again for fewer test-fix-retest loops, because they still take a lot of time and tokens. Rule 80 in the orchestrator's preferences.md encodes the fast loop: owner self-check against a recurring-failure list, one review run in parallel with CI, no re-review for a prescribed fix, at most two fix rounds, and CI (not owners) runs the full e2e. See [[model-choice]].
