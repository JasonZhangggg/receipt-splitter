# Dev flow

- Plans live in `docs/plans/<slug>.md`. Each plan is the spec for its PRs.
- Verification skill: `verify-receipt-splitter` in `.claude/skills/verify-receipt-splitter/`. Its helper launches the site on a port you choose, checks it, drives it with Playwright, saves evidence, and cleans up. Its `features/` map lists the routes to prove. Every PR proves its change with it.
- Domain terms live in `CONTEXT.md`, decisions in `docs/adr/`. `/grill-with-docs` creates both on first use.
- Product brief: `description.md`.

| Phase | Command |
|---|---|
| Understand (optional) | `/research` |
| Decide | `/grill-with-docs` |
| Plan (same session) | `/poteto-mode build it` (one PR) or `/poteto-mode write the multi-phase plan` |
| Build and verify | `/poteto-mode run docs/plans/<slug>.md` |
| Ship | `/poteto-mode babysit`, then `/poteto-mode ship the stack` |
| Maintain | `/maintain-verification-skill`, `/poteto-mode fix <bug>`, `/reflect`, `/recall` |

Full map: `/dev-flow`.

## Process rules

Binding rules live in `.claude/orchestrate/preferences.md`. These three shape every PR.

- **Draft PRs (rule 87).** Open every PR as a draft with `gh pr create --draft`. Push revision rounds to the draft. CI skips drafts, so it runs once, at `gh pr ready`. Docs-only changes skip CI.
- **Fast review loop (rule 80).** The owner checks the change against the recurring-failure list before reporting. One independent review runs in parallel with the operator's screenshot look. A fix the reviewer prescribed gets no second review. Fix rounds stop at two. Small changes (copy, spacing, an icon) skip the independent review.
- **Design iteration mode.** While the operator is shaping a design, build fast static HTML mocks in `.claude/ui-proposals/` instead of code, with no tests and no PRs. Details are in `.claude/memory/design-iteration-mode.md`.

## Run the app

Follow `.claude/skills/verify-receipt-splitter/SKILL.md`. Two points hold in cloud sessions.

- Browsers are preinstalled in `/opt/pw-browsers`. `npx playwright install chromium` fails there because the proxy blocks the download, so skip it. Run `npm ci` once per worktree.
- A port may already be held by another session. If `launch` says so, pick another port below 55000, for example `--port 8863`.
