# Motion

Every animation on the site runs without long frames, jumps, pops or reversals, in WebKit with the iPhone 15 profile, in Chromium with the Pixel 7 profile, and in Chromium at 1440 by 900. Under reduced motion each change lands in one step or fades. `motion.mjs` in this folder samples each animation on every animation frame and judges the trace. `e2e/motion.ts` holds the scenarios, the sampler and the limits, so `e2e/motion.spec.ts` and `motion.mjs` measure the same thing.

## Sub-features

- `motion-sheet` covers the Split sheet: the pick sheet handing off to the bar, a flick on the pick sheet, the breakdown opening by tap and by swipe up, and closing by tap, slow drag and flick.
- `motion-crossfade` covers the sheet's content changing: the old content fades out over 150 ms above the new content, which fades in over 200 ms.
- `motion-bundle` covers a Bundle opening and closing, with its chevron turning.
- `motion-item` covers the Item sheet rising over a lowered Split sheet and closing on the scrim.
- `motion-chips` covers the people chips entering after the pick.
- `motion-home-panel` covers the home panel springing back to rest after a finger drags it 120 px down from beside the payment row and lifts. Create split link is probed with it, so the two move as one piece.
- `motion-names` covers a name chip added on `/`. Enter adds it, and a keyboard action never animates, so the layout must change in one step.
- `motion-photo` covers the photo viewer opening and closing. It runs in a harness page that mounts `PhotoViewer`, because the route needs a real OCR scan to show a photo.
- `motion-reduced` covers the same changes under `prefers-reduced-motion: reduce`.

## How to get to it (user POV)

- The Split page `/s/<id>`: pick yourself, tap or swipe the bar, tap a Bundle header, tap an Item, tap the scrim.
- The home page `/`: tap **Your name**, type a name and press Enter. Drag the panel from beside the payment row and let go.
- The receipt card on `/`: tap the thumbnail to open the photo.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs launch --port 8811` reported `"ok":true`, and `uptime` shows a load average under 10. A busy machine stretches frame gaps.
- WebKit is installed: `npx playwright install webkit`.

- **The whole suite.** Run `.claude/skills/verify-receipt-splitter/motion.mjs --port 8811 --out <out>`. It runs 22 scenarios on `webkit-iphone`, `chromium-mobile` and `chromium-desktop`, each at 1x and 4x, in about 15 minutes. It prints one JSON line with `ok` and the failures, and writes `<out>/table.md`, `<out>/results.json` and one `<lane>-x<speed>-<id>.trace.json` per run.
- **Part of it.** Add `--lanes chromium-mobile --speeds 1 --only open-tap,bundle-expand`. The ids are in `e2e/motion.ts`.
- **Judge again.** After changing a limit in `e2e/motion.ts`, run `motion.mjs --rejudge <out> --out <new-out>` to judge the saved traces without a browser.
- **The fast subset.** Run `PORT=<port> npx playwright test e2e/motion.spec.ts`. It runs 7 scenarios at 1x in `mobile-chrome` and `mobile-safari`.

Each row reports the longest and 95th percentile frame gap, frames over 1.5 vsync, long tasks (Chromium only; WebKit has no `longtask` entries), the largest move of any position in one 60 Hz frame, and the largest opacity change in one 60 Hz frame. A row passes when:

- no frame gap passes 50 ms at 1x;
- no position moves over 140 px in one 60 Hz frame, and no step over 24 px is three times both of its neighbours;
- no opacity changes by over 0.6 in one 60 Hz frame;
- nothing moves against its direction of travel after the finger lifts;
- reduced-motion and keyboard rows show no in-between position.

## Gotchas

- The 4x lanes on Chromium use CDP CPU throttling. WebKit has no CPU throttle, so its 4x lane runs a busy loop that holds the main thread for 3 of every 4 ms. The table labels it so.
- Frame times come from `requestAnimationFrame` on the main thread. A transform or opacity transition runs on the compositor, so a long main-thread frame can show as a gap while the motion on screen stays smooth. A gap on a main-thread animation is a real stutter.
- WebKit headless paints in software at the profile's 3x scale. A CSS `filter` on a large element made every repaint cost about 70 ms; keep shadows on large surfaces as `box-shadow`.
- WebKit gets synthetic pointer events, so its drags do not exercise iOS touch arbitration. Check gestures on a phone.
