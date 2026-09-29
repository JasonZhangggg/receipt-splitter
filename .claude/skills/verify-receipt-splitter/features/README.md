# Receipt Splitter verification map

This folder is the maintained source for verifying what a user can do on the Receipt Splitter website. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- The worktree has run `npm ci` and `npx playwright install chromium`.
- The lane has its own port. Examples below use `8811`.
- `verify.mjs launch --port 8811` reported `"ok":true`.
- `verify.mjs doctor --port 8811` reports `"ok":true`.
- Never drive an instance that this lane did not launch.

## Driving conventions

- Run every command from the worktree root. `verify.mjs` means `.claude/skills/verify-receipt-splitter/verify.mjs`.
- Every drive opens a fresh Pixel 7 browser, so no state carries between drives.
- Prefer accessible names and route paths. The only test id is `split-id` on the Split screen.
- Use the terms in `CONTEXT.md`: Split, Host, Participant, Item, Claim, Share.

## Proof and skip reporting

- Each drive saves a screenshot, and an ARIA snapshot where the feature file asks for one.
- Run `verify.mjs evidence` into the lane's output folder before cleanup.
- Record the feature ID and the route with every artifact.
- Report an unreachable route with the command you ran and the failure line.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has four H2 sections in this order.

1. `Sub-features` lists short IDs with one line each.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and pairs each user action with an exact command and the observable result.
4. `Gotchas` lists traps that waste or invalidate a run.

## Features

- [Routes](./routes.md) covers the home screen and opening a Split link, including the SPA fallback for deep links.
