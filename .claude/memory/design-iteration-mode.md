---
name: design-iteration-mode
description: While the operator is iterating on UI mocks, skip tests and send screenshots fast, light mode only, until they say "good"
metadata:
  type: feedback
---

During design iteration the operator wants fast static HTML mocks, not code. Build the mock, take a phone screenshot (390x844, framed as mobile Safari), send it, and explain the options in plain words. No tests, no verify runs, no PRs, light mode only. Mocks live in `.claude/ui-proposals/` (untracked), one new folder per round so earlier rounds are never overwritten.

**Why:** on 2026-10-12 the operator said "I want to iterate quickly so no need to run any tests. Just mock the UI as quick as possible and send it back."

**How to apply:** stay in this mode until the operator says the design is good. Then implement it as a normal PR with the UI skills, verify-receipt-splitter screenshots, review and CI. Check alignment in a close-up crop before sending a mock.
