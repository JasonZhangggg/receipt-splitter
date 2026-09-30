# Home

The home screen at `/` is where a Host starts a Split. An orange field holds the `Receipt Splitter` heading, the headline, a one-line pitch, and the line "The photo stays on your phone." Below it, or beside it at 900 px and wider, an example scan shows a Receipt with one flagged price. The one action is **Scan or upload a receipt**. Below 768 px it sits in a solid bar at the bottom of the screen, and the page scrolls above the bar. At 768 px and wider it sits inline under the pitch.

## Sub-features

- `home-scan` shows **Scan or upload a receipt**, visible and reachable with Tab at every width, with a 2 px focus ring. In the bar, a press scales it on touch-down. Inline, the press shows after 50 ms, so a scroll that starts on it shows no press. Under reduced motion a press dims it with no scale.
- `home-bar` holds the action in a solid bar under the scrolling page below 768 px. The bar never covers the last line, and it grows by the bottom safe-area inset.
- `home-headline` shows "Split the bill" and "at the table." on one line each from 320 px. The headline takes its size from the width of its column, up to 64 px in one column and 92 px in two, so it also fits the narrow field column from 900 px. It paints its first frame at its final size, and its mask never cuts a descender.
- `home-layout` keeps the content clear of the side safe-area insets. From 900 px the two columns start at the same height.
- `home-example` shows the example scan with the flagged Tiramisu row and the line that the Items are $1.00 short of the subtotal. Row hairlines span the same width as the heavy rules.
- `home-theme` follows the system light or dark setting. Under reduced motion the page skips its entrance animation. Size-matched local fallbacks stand in for Archivo until it loads, so the layout does not move when it arrives.

## How to get to it (user POV)

- Open the site's root URL on a phone or a desktop browser.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

- **Home, phone.** Run `verify.mjs drive --port 8811 --path / --expect-heading "Receipt Splitter" --expect-text "Scan or upload a receipt" --expect-text "Split the bill" --shot <out>/home.png --aria <out>/home.aria.txt`. The JSON line has `"ok":true`. The screenshot shows the orange field and the bottom bar. The ARIA snapshot lists `button "Scan or upload a receipt"`.
- **Width, color scheme, and reduced motion.** Run one drive per case, with `<w>` in 320, 390, 900, 960, 1024, and 1280, `<scheme>` in `light` and `dark`, and `<motion>` in `no-preference` and `reduce`: `verify.mjs drive --port 8811 --path / --width <w> --color-scheme <scheme> --reduced-motion <motion> --expect-heading "Receipt Splitter" --expect-text "Scan or upload a receipt" --expect-text "Split the bill" --shot <out>/home-<w>-<scheme>-<motion>.png`. Each JSON line has `"ok":true`, and its `media` shows the width, scheme, and motion setting the page received. Below 1024 px the drive keeps the Pixel 7 touch profile, so 900 and 960 px show the two columns with touch input. The screenshots show the bar below 768 px, the inline action from 768 px, and two columns from 900 px. A drive does not look for clipped text or page overflow. For those, run the matrix spec on a port with no launched server: `PORT=8812 npx playwright test e2e/home.spec.ts -g "home matrix"`. It fails on clipped text, horizontal page overflow, a missing Archivo face, or a console error at 320, 390, 900, 960, 1010, 1024, and 1280 px. With `SHOTS=<out>` it saves `home-<width>-<scheme>-<motion>.png` for each case.
- **Keyboard focus and the bar.** `PORT=8812 npx playwright test e2e/home.spec.ts` also checks that the action takes Tab focus with a visible ring at 390 px and inline at 1280 px, that a 34 px bottom safe-area inset lifts it by 34 px, that the bar never covers the last line, and that reduced motion leaves no animation.
- **Headline.** The same spec checks at 320, 390, 900, 960, 1010, 1024, and 1280 px that each headline line fits on one line, that the mask hides no glyph ink, and that the headline starts fully hidden behind its mask. It checks at 390 and 960 px that the headline's font size on the first frame is its final size.
- **Press.** The same spec checks that the bar action shows its press on touch-down with the page timers frozen, and within 50 ms in real time. At 820 px it checks that a scroll that starts on the inline action never shows the press, and that a held touch still presses. Under reduced motion a press dims with no scale or transition.
- **Layout and fonts.** The same spec checks that 47 px side insets move the content by 47 px, that the columns start level at 1280 px, and that row hairlines match the rules. It checks that blocking the `.ttf` requests leaves both headline lines where they were at 320, 390, 960, and 1280 px. It checks that the fallback metrics sample exactly the lines the page renders in each weight, and that no sample line is wider in the shipped fallback face than in Archivo, which fails when the copy changes without a rerun of the generator.
- **Toast.** The same spec bundles `src/ui/components/toast.tsx` with esbuild into a blank page and checks that a reduced-motion change does not restart its 4 s timer.
- **Fallback metrics.** After a copy change, run `node assets/fonts/fallback-metrics.mjs` with Node 22.18 or later, which imports `home-copy.ts` without a build step. On an older Node it exits 1 and says so. It measures Archivo against local Arial for every line in `fallbackSamples` from `src/ui/home-copy.ts` and rewrites `src/ui/fallback-metrics.generated.ts`. It exits 1 and writes nothing when any line would be wider in the fallback.

## Gotchas

- **Scan or upload a receipt** goes to `/new`. RS-7 adds that route. Until then it shows the router's unmatched-route screen, so do not report that screen as a home failure.
- The entrance motion runs for about 700 ms after load. Wait for `document.getAnimations()` to finish before a screenshot you compare against another, or turn reduced motion on.
- The Playwright config starts its own server on `PORT`, so never point the spec at a port where `launch` is serving.
- The fonts are Latin subsets. Text outside Basic Latin and common punctuation falls back to the system face.
