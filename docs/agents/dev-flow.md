# Dev flow

- Plans live in `docs/plans/<slug>.md`. Each plan is the spec for its PRs.
- Verification skill: `verify-receipt-splitter`, created by the first PR of the first plan. That PR builds a runnable skeleton and runs `/create-verification-skill`. Every later PR depends on it.
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
