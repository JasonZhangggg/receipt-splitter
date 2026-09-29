---
name: verify-receipt-splitter
description: Launch, check, drive, and tear down the Receipt Splitter website (Expo web export served by wrangler dev) on a port of your choice, then capture screenshots and ARIA snapshots as proof. Use to prove any change to the site's routes or UI works in a real browser, and in every live verification lane.
---

# Verify Receipt Splitter

The app is an Expo Router website. `npm run build` exports it to `dist/`. `wrangler dev` serves `dist/` as Workers static assets with the SPA fallback, and routes `/api/*` and `/parties/*` to `worker/index.ts`. A user touches the site in a phone browser, so every drive runs Playwright's Chromium with the Pixel 7 profile.

All commands go through one helper. Run it from the repo root of the worktree you are verifying. Every command prints one JSON line on stdout and exits 0 on success and 1 on failure. A failure line is `{"ok":false,"error":"..."}`. Build output from `launch` goes to stderr.

```sh
.claude/skills/verify-receipt-splitter/verify.mjs <command> --port <port> [options]
```

Before the first launch in a fresh worktree, run `npm ci` and `npx playwright install chromium`.

## Isolation

Each lane picks its own port. The helper derives everything else from it, so lanes in different worktrees never share state.

- The site listens on `http://localhost:<port>`.
- The wrangler inspector listens on `<port> + 10000`. Pick ports below 55000.
- Run state (the process group id, `wrangler.log`, Durable Object storage) lives in `.verify/<port>/` in the worktree.
- Two lanes in the same worktree share `dist/`. Do not rebuild while another lane in that worktree is driving.

## Launch

```sh
.claude/skills/verify-receipt-splitter/verify.mjs launch --port 8811
```

Launch refuses a port that is already in use. It runs `npm run build`, starts `wrangler dev` in its own process group, and waits up to 90 seconds for `GET /` to return 200. Pass `--no-build` to serve the existing `dist/`. Ready output looks like `{"ok":true,"port":8811,"pgid":73941,"url":"http://localhost:8811/","log":".../.verify/8811/wrangler.log"}`.

## Doctor

```sh
.claude/skills/verify-receipt-splitter/verify.mjs doctor --port 8811
```

Read-only. Run it after launch and whenever anything looks off. It passes only when all four checks are true.

- `running`. The process group this helper started still has a live process.
- `portOwned`. The listener on the port belongs to that process group, not to someone else's server.
- `servesBuild`. The served `/` is byte-identical to `dist/index.html`, so the server shows the current build.
- `spaFallback`. A navigation to `/s/doctor` returns 200.

## Drive

One call loads one route in a fresh mobile browser, checks it, and saves proof.

```sh
.claude/skills/verify-receipt-splitter/verify.mjs drive --port 8811 --path /s/abc \
  --expect-text abc --shot /tmp/swarm-RS-1/worker-1/split-abc.png --aria /tmp/swarm-RS-1/worker-1/split-abc.aria.txt
```

- `--path` is the route to open. The default is `/`.
- `--expect-heading <name>` requires a visible heading with that accessible name.
- `--expect-text <text>` requires visible text with that exact content. Repeat it for several strings. Each expectation waits up to 5 seconds.
- `--shot <file>` saves a full-page screenshot.
- `--aria <file>` saves the ARIA snapshot of the page body.

A drive fails on a non-200 response, a missing heading or text, or any console error or uncaught page error. The failures are listed in the JSON line.

For multi-step interactions that one navigation cannot express, write a Playwright spec under `e2e/` and run it with `PORT=<port> npm run e2e`. The spec config runs `npm run build` and starts its own `wrangler dev` on that port with the inspector on `port + 10000`, so do not run it against a port where `launch` is already serving.

## Evidence

```sh
.claude/skills/verify-receipt-splitter/verify.mjs evidence --port 8811 --out /tmp/swarm-RS-1/worker-1
```

Evidence copies `wrangler.log` into the output folder and writes `manifest.json` with the head SHA, whether the tree is dirty, a fresh doctor report, and every file in the folder with its size. Run it after the drives and before cleanup. The default folder is `/tmp/verify-receipt-splitter/<port>/`.

Proof standards.

- Drive the route a user opens. Do not call the Worker or read `dist/` as a substitute for loading the page.
- Capture the page after the action and name the route in the file name.
- Save screenshots to the path the lane names, such as `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png`.
- A proof that covers one entry point in `features/` is incomplete when the feature file lists others.

## Cleanup

```sh
.claude/skills/verify-receipt-splitter/verify.mjs cleanup --port 8811
```

Cleanup stops only the process group that `launch` recorded, and never kills by process name. It sends SIGTERM, then SIGKILL after five seconds, checks that no process in the group remains and that nothing listens on the port, and deletes `.verify/<port>/`. It never touches the evidence folder. It exits 1 if the port is held by a process this helper did not start. Run it after every lane, including failed ones.

## Feature map

Read [features/README.md](features/README.md) before driving. Each feature file lists its entry points and the exact drive commands that prove it. Keep the map current with `/maintain-verification-skill` when a PR adds or changes a route.
