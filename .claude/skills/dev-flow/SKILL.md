---
name: dev-flow
description: Map of the combined workflow. Matt Pocock's grilling decides what to build, pstack plans, builds, and verifies it. Shows which command to run at each phase. Use for /dev-flow, "what's next in the flow", or "which skill do I use".
disable-model-invocation: true
---

# Dev flow

Grilling decides. pstack plans, builds, and proves. The plan file is the only planning artifact. There is no separate spec and no tickets.

Design questions a grilling can't settle go to pstack's Prototype playbook (`/poteto-mode prototype <question>`). Skills parked in `~/Code/agent-skills/optional/` are not installed.

Answer the user's question from the map below. If they describe a situation, name the phase they are in and the next command. Keep it short.

## Phases

| Phase | Command | Produces |
|---|---|---|
| 0. Set up a repo (once) | `/setup-dev-flow` | The `verify-<app>` skill, `docs/agents/dev-flow.md`, a `CLAUDE.md` pointer |
| 1. Understand (optional) | `/research` (background reading of docs and APIs) | A cited notes file to bring into the grilling |
| 2. Decide | `/grill-with-docs` | Decisions in the conversation, terms in `CONTEXT.md`, ADRs in `docs/adr/` |
| 3. Plan (same session as 2) | One PR: `/poteto-mode build it` (Feature or Bug fix playbook). More than one PR: `/poteto-mode write the multi-phase plan` | `docs/plans/<slug>.md`, validated by `check-plan.mjs`, committed |
| 4. Build and verify | Review the plan, then say "go". Or, from a fresh session, `/poteto-mode run docs/plans/<slug>.md` | PRs built by background owners in worktrees, each proven with `verify-<app>` and checked by `/spec-review` |
| 5. Ship | `/poteto-mode babysit`, then `/poteto-mode ship the stack` | Green, verified PRs landed bottom-up |
| 6. Maintain | `/maintain-verification-skill` (daily), `/poteto-mode fix <bug>`, `/reflect` after each plan, `/recall` to resume | A current feature map, fixed bugs, better skills |

## Execution scale

The plan names its execution playbook. Defaults:

- **Autopilot-stack**: one plan's PRs, delivered as one stack you review and land. The usual choice.
- **Autopilot-full**: independent PRs you merge one by one.
- **Orchestrate**: several plans or a multi-day program under one coordinator.

Everything runs locally in git worktrees, on Claude models only, with at most `max parallel` agents at once (`~/.agents/pstack-models.md`, change with `/setup-pstack`).

## What each PR owner runs

`how` to confirm the plan's pointers, then `/tdd` at the plan's **Seams**, `/deslop`, `/no-comments`, `verify-<app>` on the real app with screenshots, a feature map update, `/spec-review` against the plan section, and a PR. The root then swarm-verifies at the PR's **Level** (`standard` is 2 live lanes, `swarm` is 4 to 10), including a regression lane against trunk.

## Context hygiene

- Keep phases 2 and 3 in one unbroken session, so the plan is written from the grilling itself. If the session must end first, `/handoff` and start the plan from that file.
- Phase 4 can start fresh. The plan file is self-contained.
- Between unrelated tasks, `/clear`.
