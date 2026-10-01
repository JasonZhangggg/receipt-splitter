---
name: verify-receipt-splitter
description: Launch, check, drive, and tear down the Receipt Splitter website (Expo web export served by wrangler dev) on a port of your choice, then capture screenshots and ARIA snapshots as proof. Use to prove any change to the site's routes or UI works in a real browser, and in every live verification lane.
---

# Verify Receipt Splitter

The app is an Expo Router website. `npm run build` exports it to `dist/`. `wrangler dev` serves `dist/` as Workers static assets with the SPA fallback, and routes `/api/*` and `/parties/*` to `worker/index.ts`. A user touches the site in a phone browser, so a drive runs Playwright's Chromium with the Pixel 7 profile unless `--width` asks for a desktop width. Drive flags change the viewport size, the color scheme, and the reduced-motion setting.

All commands go through one helper. Run it from the repo root of the worktree you are verifying. Every command prints one JSON line on stdout and exits 0 on success and 1 on failure. Every failure line has `"ok":false` and a readable message in `error`, so read `.error` whenever `ok` is false. Doctor, drive, and evidence failures also keep their other fields, such as the doctor checks and the drive `failures` list. This also holds when the command hits an error, such as a refused connection, a failed build, a missing wrangler or Chromium, or an unknown option. No stack trace goes to stdout. Build output from `launch` goes to stderr.

```sh
.claude/skills/verify-receipt-splitter/verify.mjs <command> --port <port> [options]
```

Before the first launch in a fresh worktree, run `npm ci` and `npx playwright install chromium`.

## Isolation

Each lane picks its own port. The helper derives everything else from it, so lanes in different worktrees never share state.

- The site listens on `http://localhost:<port>`.
- The wrangler inspector listens on `<port> + 10000`. The port must be below 55000, so the inspector stays below 65535. Every command rejects any other port with a usage failure.
- Run state (the launch pid, the process group id, `wrangler.log`, Durable Object storage) lives in `.verify/<port>/` in the worktree.
- Two lanes in the same worktree share `dist/`. Do not rebuild while another lane in that worktree is driving.

## Launch

```sh
.claude/skills/verify-receipt-splitter/verify.mjs launch --port 8811
```

Launch creates `.verify/<port>/` in one atomic step and records its own pid and start time in `.verify/<port>/launcher`, so doctor and cleanup can tell that a launch is still starting. The start time keeps a reused pid from passing as the launch. It runs `npm run build`, starts `wrangler dev` in its own process group, and records that group in `.verify/<port>/pgid`. It then waits up to 90 seconds until every listener on the port belongs to that group and `GET /` returns 200. Each request in that wait times out after 5 seconds, and the build gets 3 minutes. Pass `--no-build` to serve the existing `dist/`. Ready output looks like `{"ok":true,"port":8811,"pgid":73941,"url":"http://localhost:8811/","log":".../.verify/8811/wrangler.log"}`.

Launch returns only when the site is ready, so you do not need to poll doctor after it. Launch fails without starting anything in these cases:

- The port or the inspector port already has a listener. The failure line names the pid and says whether it is in the launch group that this worktree recorded for the port. If it is and your lane started that launch, run cleanup first. Otherwise pick another port, because cleanup never stops a process it did not start.
- `.verify/<port>/` already exists. A launch from this worktree may still be starting on the port, or an earlier launch failed and no cleanup has removed the folder since. Run doctor. Run cleanup only if doctor reports `"launching":null` and `"running":false`, which means nothing from this worktree is using the port. Otherwise pick another port.
- The build fails or runs past 3 minutes.

When two launches on one port start together in the same worktree, exactly one creates the folder and proceeds. `.verify/` is per worktree, so two worktrees that launch on one port at the same time both proceed. The one whose wrangler does not get the port fails at the end of its 90-second wait.

Launch also fails when the 90 seconds pass without a ready server. If another process listens on the port, even beside wrangler, the failure line names its pid. Run cleanup to stop wrangler, then pick another port. Otherwise the failure line points to `wrangler.log`.

A held port or an existing `.verify/<port>/` fails the launch before it creates anything. For those two, follow the failure line, which says when cleanup is safe. Any later failure, such as a failed build or the 90-second timeout, leaves `.verify/<port>/`, and the next launch on that port fails until cleanup removes it. Run cleanup after any later failure.

## Doctor

```sh
.claude/skills/verify-receipt-splitter/verify.mjs doctor --port 8811
```

Doctor is a single read-only check. It does not wait for the site to come up. Run it once after launch and again whenever anything looks off. Each request it makes times out after 5 seconds. It passes only when all four checks are true.

- `running`. The process group this helper started still has a live process, and every live process in it is this worktree's wrangler, workerd, esbuild, or node.
- `portOwned`. Every listener on the port belongs to that process group, so no other server shares the port.
- `servesBuild`. The served `/` is byte-identical to `dist/index.html`, so the server shows the current build.
- `spaFallback`. A navigation to `/s/doctor` returns 200.

Doctor also reports `launching`. It is the pid of a launch on this port that is still building or waiting for the server, or `null`. On failure, `error` lists the checks that failed.

## Drive

One call loads one route in a fresh browser, checks it, and saves proof.

```sh
.claude/skills/verify-receipt-splitter/verify.mjs drive --port 8811 --path /s/abc \
  --expect-text abc --shot /tmp/swarm-<pr-id>/worker-<n>/split-abc.png --aria /tmp/swarm-<pr-id>/worker-<n>/split-abc.aria.txt
```

Drive saves files only where `--shot` and `--aria` point, and creates their folders. Point both into the lane's output folder, the one you later pass to `evidence --out`. If the lane names no folder, use `/tmp/verify-receipt-splitter/<port>/`, which is where `evidence` writes by default.

- `--path` is the route to open. The default is `/`.
- `--expect-heading <name>` requires a visible heading with that accessible name.
- `--expect-text <text>` requires visible text with that exact content. Repeat it for several strings. Each expectation waits up to 5 seconds.
- `--shot <file>` saves a full-page screenshot.
- `--aria <file>` saves the ARIA snapshot of the page body.
- `--width <px>` and `--height <px>` set the viewport in CSS pixels. Without them, the drive uses the Pixel 7 profile at 412 by 839, with touch input, a mobile user agent, and a device pixel ratio of 2.625. A width below 1024 keeps that profile. A width of 1024 or more switches to Playwright's Desktop Chrome profile, with mouse input, a desktop user agent, a device pixel ratio of 1, and a default height of 720. A screenshot is the viewport width times the device pixel ratio.
- `--color-scheme light|dark` sets `prefers-color-scheme`. The default is `light`.
- `--reduced-motion reduce|no-preference` sets `prefers-reduced-motion`. The default is `no-preference`.

Drive checks these values before it opens the browser. A width or height that is not a whole number above 0, or a color scheme or reduced-motion value that is not in the list, fails with the reason in `error`.

When the page loads, the JSON line has `media`, which the page reports about itself:

- `width` and `height` are `innerWidth` and `innerHeight`.
- `colorScheme` is `dark` when `matchMedia("(prefers-color-scheme: dark)")` matches, otherwise `light`.
- `reducedMotion` is `reduce` when `matchMedia("(prefers-reduced-motion: reduce)")` matches, otherwise `no-preference`.
- `pointer` is `coarse` when `matchMedia("(pointer: coarse)")` matches, otherwise `fine`. The Pixel 7 profile reports `coarse` and the Desktop Chrome profile reports `fine`.

Cite `media` to show which viewport and preferences a screenshot was taken with. It proves that the page received the preference, not that the page honors it.

A drive fails on a non-200 response, a missing heading or text, or any console error or uncaught page error. The JSON line lists the failures in `failures` and joins them in `error`. If the page cannot load at all, for example because nothing listens on the port, the failure line carries the browser's error in `error`.

For several WebSocket clients on one Split, use `live-clients.mjs` in this folder, as [features/live.md](features/live.md) describes. For the Split page's main flow across four browsers, run `split-flow.mjs` in this folder, as [features/claim.md](features/claim.md) describes. For multi-step interactions that one navigation cannot express, write a Playwright spec under `e2e/` and run it with `PORT=<port> npm run e2e`. The spec config runs `npm run build` and starts its own `wrangler dev` on that port with the inspector on `port + 10000`, so do not run it against a port where `launch` is already serving.

## Evidence

```sh
.claude/skills/verify-receipt-splitter/verify.mjs evidence --port 8811 --out /tmp/swarm-<pr-id>/worker-<n>
```

Evidence copies `wrangler.log` into the output folder and writes `manifest.json` with the head SHA, whether the tree is dirty, a fresh doctor report, and every file in the folder with its size. The manifest lists every file already in the folder, including files from earlier runs, so start each lane with an empty folder. Run it after the drives and before cleanup. The default folder is `/tmp/verify-receipt-splitter/<port>/`.

Proof standards.

- Drive the route a user opens. Do not call the Worker or read `dist/` as a substitute for loading the page.
- Capture the page after the action and name the route in the file name.
- Save screenshots to the path the lane names, such as `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png`.
- A proof that covers one entry point in `features/` is incomplete when the feature file lists others.

## Cleanup

```sh
.claude/skills/verify-receipt-splitter/verify.mjs cleanup --port 8811
```

Cleanup stops only the process group that `launch` recorded, and never kills by process name. While a launch on the port is still starting, cleanup exits 1 and changes nothing. Before it sends any signal, it checks the record in `.verify/<port>/pgid`:

- The recorded id must be an integer above 1. An empty file or `1` fails.
- Every live process in the group must be this worktree's wrangler, workerd, esbuild, or node, which means its command runs from this worktree's `node_modules/`.

If either check fails, cleanup deletes the record, signals nothing, and exits 1. The failure line names the bad value or the pids it refused. Run cleanup again to remove the rest of `.verify/<port>/`. If that run exits 1 because wrangler still holds the port, follow [Recover a lost record](#recover-a-lost-record).

When the record passes, cleanup sends SIGTERM, then SIGKILL after five seconds. It checks that no process in the group remains and that nothing listens on the port or the inspector port, then deletes `.verify/<port>/`. A group that exits before cleanup signals it counts as stopped. Cleanup never touches the evidence folder. If either port is held by a process this helper did not start, cleanup exits 1 and keeps `.verify/<port>/`. Run it at the end of every lane whose launch created `.verify/<port>/`, including a launch that failed later. For a launch that failed on a held port or an existing folder, follow the failure line instead.

## Recover a lost record

When cleanup deletes a bad record while wrangler still serves the port, no record names that server, and every later cleanup exits 1. Stop the server by hand, and only after you confirm it is this worktree's launch on this port.

1. Run `lsof -nP -iTCP:<port> -sTCP:LISTEN` and note the pid.
2. Run `ps -o pgid= -p <pid>` and note the process group id.
3. Run `ps -ww -o command= -p <pgid>`. Continue only if the command runs this worktree's `node_modules/.bin/wrangler dev --port <port>` and includes `--persist-to <worktree>/.verify/<port>/state`. Only `launch` passes that `--persist-to` path, so an `npm run e2e` server fails this check. If the command does not match, the server is not yours. Pick another port and stop here.
4. Run `kill -TERM -- -<pgid>` to stop the group.
5. Run cleanup again. It exits 0 and removes `.verify/<port>/` once both ports are free.

## Feature map

Read [features/README.md](features/README.md) before driving. Each feature file lists its entry points and the exact drive commands that prove it. Keep the map current with `/maintain-verification-skill` when a PR adds or changes a route.
