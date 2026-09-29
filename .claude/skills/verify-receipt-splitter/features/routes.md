# Routes

The site has two routes. `/` is the home screen. `/s/<id>` opens a Split by its link and, in the skeleton, shows the Split's id. A Split link opened directly, from a chat app or a new tab, must load through the SPA fallback instead of a 404.

## Sub-features

- `routes-home` shows the home screen at `/`.
- `routes-split` shows the Split id at `/s/<id>`.
- `routes-deep-link` serves `/s/<id>` with status 200 when it is the first page loaded.

## How to get to it (user POV)

- Open the site's root URL.
- Open a Split link such as `http://localhost:8811/s/abc` directly, as a Participant does when they tap a shared link.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md). Without one, it is `/tmp/verify-receipt-splitter/8811/`.

- **Home.** Open `/`. Run `verify.mjs drive --port 8811 --path / --expect-heading "Receipt Splitter" --shot <out>/routes-home.png`. The JSON line has `"ok":true` and the screenshot shows the `Receipt Splitter` heading.
- **Split link.** Open `/s/abc` as the first page. Run `verify.mjs drive --port 8811 --path /s/abc --expect-text abc --shot <out>/routes-split.png --aria <out>/routes-split.aria.txt`. The JSON line has `"ok":true`, and the ARIA snapshot reads `text: abc`.
- **Deep-link fallback.** The Split link drive above fails on any status other than 200, so it also proves `routes-deep-link`. `verify.mjs doctor` checks the same fallback on `/s/doctor`.

## Gotchas

- A 200 from `curl` on `/s/abc` proves only the fallback. It does not prove the route rendered the id. Drive with the browser.
- `/api/*` and `/parties/*` reach the Worker first and return 404. They are not routes a user opens.
