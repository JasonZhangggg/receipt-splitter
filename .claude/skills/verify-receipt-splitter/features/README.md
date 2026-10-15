# SplitWith verification map

This folder is the maintained source for verifying what a user can do on the SplitWith website. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- The worktree has run `npm ci` and `npx playwright install chromium`.
- The lane has its own port. Examples below use `8811`.
- `verify.mjs launch --port 8811` reported `"ok":true`. Launch returns only when the site is ready.
- `verify.mjs doctor --port 8811` reports `"ok":true`. Doctor is one check, not a wait, so run it once.
- Never drive an instance that this lane did not launch.

## Driving conventions

- Run every command from the worktree root. `verify.mjs` means `.claude/skills/verify-receipt-splitter/verify.mjs`.
- `<out>` in a command is the lane's output folder. Use the folder the lane names, such as `/tmp/swarm-<pr-id>/worker-<n>/`. If the lane names none, use `/tmp/verify-receipt-splitter/<port>/`, the folder `evidence` writes to by default. Drive creates the folder if it does not exist.
- Every drive opens a fresh browser, so no state carries between drives. `--width`, `--height`, `--color-scheme`, and `--reduced-motion` change the viewport and media preferences for one drive. A width of 1024 or more drives a desktop browser instead of the Pixel 7.
- Prefer accessible names and route paths. The test ids are `split-link` for the link row on the pick sheet; `owe`, `total`, `unclaimed`, `unclaimed-count`, `share-note`, `share`, `breakdown`, `breakdown-items`, `share-arrow`, and `line-<id>` on the Split page; `ocr-status`, `ocr-photo`, `ocr-json`, `parse`, `parse-items`, and `parse-check` on the OCR debug route; and `receipt`, `item-<id>`, `reading-line`, and `reading-bar` on the home page. The home page also marks the sheet with `data-sheet`, the panel surface that moves under a drag with `data-sheet-surface`, and the grab handle with `data-sheet-grab`.
- Use the terms in `CONTEXT.md`: Split, Host, Participant, Item, Claim, Share.

## Viewport and media matrix

A UI change is proven at phone and desktop widths, in light and dark mode, with reduced motion on and off. This loop drives `/` in all eight combinations and names each screenshot after its combination:

```sh
for width in 390 1280; do
  for scheme in light dark; do
    for motion in no-preference reduce; do
      verify.mjs drive --port 8811 --path / --width "$width" --color-scheme "$scheme" \
        --reduced-motion "$motion" --shot "<out>/home-$width-$scheme-$motion.png"
    done
  done
done
```

The loop prints eight JSON lines. Before you cite a screenshot, check that its line has `"ok":true` and that `media` shows the same width, `colorScheme`, and `reducedMotion` as the file name. The 390 lines report `"pointer":"coarse"` from the Pixel 7 profile, and the 1280 lines report `"pointer":"fine"` from the Desktop Chrome profile. Swap `--path` and the file prefix to run the matrix on another route.

A screenshot shows one frame, so it cannot prove that motion stops under reduced motion. Prove that with a spec under `e2e/`.

## Run `src/core` without a browser

Use this to check a Share calculation from a terminal. `src/core` imports its own files without extensions, and plain `node` cannot load those. `bench/register-ts.mjs` adds the resolve hook that finds the `.ts` files. Pass it with `--import`, and pass `--input-type=module` so `-e` accepts `import`. Import the files you call with their `.ts` extension.

This example splits a $10.00 Item three ways with 8.875 percent tax, which is 89 cents:

```sh
node --import ./bench/register-ts.mjs --input-type=module -e '
import { computeShares } from "./src/core/shares.ts";
import { adjustmentId, itemId, participantId } from "./src/core/split.ts";
const [ann, bob, cat] = ["ann", "bob", "cat"].map(participantId);
const split = {
	receipt: {
		items: [{ id: itemId("nachos"), name: "Nachos", price: 1000, split: { by: "even", units: [[ann, bob, cat]] } }],
		adjustments: [{ id: adjustmentId("tax"), kind: "tax", name: "Tax 8.875%", amount: 89 }],
		subtotal: 1000,
		total: 1089,
	},
	participants: [ann, bob, cat].map((id) => ({ id, name: id })),
	payments: [],
};
const { shares } = computeShares(split);
console.log(shares.map(({ participantId, share }) => `${participantId} ${share}`).join("\n"));
console.log("sum", shares.reduce((sum, { share }) => sum + share, 0), "total", split.receipt.total);
'
```

The output is `ann 363`, `bob 363`, `cat 363`, then `sum 1089 total 1089`. The Shares sum to the Receipt total to the cent.

## Proof and skip reporting

- Each drive saves a screenshot, and an ARIA snapshot where the feature file asks for one.
- Run `verify.mjs evidence --port 8811 --out <out>` before cleanup. The manifest lists every file already in `<out>`, so start each lane with an empty folder.
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
- [Live Splits](./live.md) covers creating a Split through `POST /api/splits` and driving several WebSocket clients on one Split with `live-clients.mjs`: Claims between clients, hibernation, reconnect, the 32 KB cap, and the Claim round trip.
- [Join](./join.md) covers **Create split link** on `/`, the Host landing on the Split page, **Share** and **Copy**, **Not here? Add yourself**, the remembered pick, the handle lock, and the expired page.
- [Claim](./claim.md) covers the Split page `/s/<id>`: the tall pick sheet, **That's me**, browsing, checking lines, the Item sheet with quantity and split modes, breakdowns, **I already paid**, History with Revert and Restore, and the mismatch warning.
- [Receipt](./receipt.md) covers how the Split page lists the Receipt: the quantity column, Bundles that open and close in place with `aria-expanded`, the unclaimed flag on a closed Bundle, the Bundle line on the Item sheet, and **Delete item**.
- [Pay](./pay.md) covers your own breakdown on `/s/<id>`: a pay link per handle with the Share to the cent, the Zelle card, **I already paid**, the paid line under each share, the server's `payerOnly` refusal, and Payments in History without Revert.
- [OCR](./ocr.md) covers the model prefetch on `/`, reading a photo on the debug route `/debug/ocr`, and the OCR benchmark command.
- [Home](./home.md) covers the home page at `/`: the header with the theme button and Recent splits, the receipt block, the payment rows, the names, the fixed footer with the Create pill, the keyboard rule, the press rules, and the light, dark, and reduced-motion modes.
- [Scan](./scan.md) covers reading a Receipt on `/`: the picker, drop, and paste, the reading state, the receipt card, the repairs a problem read gets, the Total check, the tip line, the reason under **Create split link**, the saved draft, and the offline scan. It also covers the server reading at `POST /api/scan`, its limits, how to set the key in `.dev.vars`, and the scan harness `bench/scan/run.mjs`.
- [Motion](./motion.md) covers frame-sampling every animation with `motion.mjs`: the Split sheet, the content cross-fade, Bundles, the Item sheet, the chips, the name chips on `/`, the photo viewer, and reduced motion, in WebKit and Chromium at 1x and 4x CPU.
- [Receipt photo](./photo.md) covers `PUT` and `GET /api/splits/<id>/photo`: the upload with the Creator secret, the one replace, the size, type, and JPEG checks, the `photo` flag in every `state` frame, and the 14-day delete.
