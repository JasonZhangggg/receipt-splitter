---
name: setup-dev-flow
description: One-time setup of a repo for the dev flow (grilling, pstack plans, pstack build and verify). Checks global prerequisites, creates the project verification skill, and records the workflow in the repo. Use for /setup-dev-flow.
disable-model-invocation: true
---

# Set up the dev flow

Run each step in order. Skip a step whose output already exists, and say so. Explore before asking. Ask only what the repo cannot tell you.

## 1. Global prerequisites

- `~/.agents/pstack-models.md` exists. If not, run `/setup-pstack`.
- `bun --version` works. `orch` (Orchestrate) and `watch-pr` (Babysit) need it. If missing, tell the user to install it with `brew install oven-sh/bun/bun` and continue.
- `gh auth status` succeeds when the repo has a GitHub remote.

## 2. Domain docs

Use single-context domain docs: `CONTEXT.md` at the repo root and ADRs in `docs/adr/`. Do not create them now. `/grill-with-docs` creates them the first time a term or decision needs recording.

## 3. Verification skill

If the app builds and starts, run `/create-verification-skill`. It writes `.claude/skills/verify-<app>/` with a launch/doctor/drive/evidence/cleanup recipe and a feature map, and proves itself once.

If the repo has no runnable app yet, do not generate a skill against nothing. Record in step 4 that the first PR of the first plan builds a runnable skeleton and runs `/create-verification-skill`, and every later PR depends on it.

## 4. Record the workflow in the repo

Write `docs/agents/dev-flow.md`, under 20 lines:

- Plans live in `docs/plans/<slug>.md` and are the spec for each PR.
- The verification skill is `verify-<app>` (or "created by the first PR").
- Domain terms live in `CONTEXT.md`, decisions in `docs/adr/`.
- The commands per phase, pointing at `/dev-flow` for the full map.

Add a short `## Agent workflow` section to the repo's `CLAUDE.md` (create the file if missing, or use `AGENTS.md` if that is where instructions live) that points at `docs/agents/dev-flow.md` and names the verification skill. Keep it to three or four lines.

## 5. Offers

Offer each once. Act on yes, move on after no.

- A JavaScript or TypeScript repo with no pre-commit hook: `/setup-pre-commit`.
- A verification skill exists: a daily scheduled run of `/maintain-verification-skill` (use the `schedule` skill).

## 6. Report

List what was created or already present, anything the user must do by hand (such as installing `bun`), and the next command: `/grill-with-docs` on the first idea.
