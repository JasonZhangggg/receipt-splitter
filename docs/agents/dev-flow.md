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
