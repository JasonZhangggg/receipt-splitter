# Home

The home screen at `/` is where a Host starts a Split. An orange field holds the `Receipt Splitter` heading, the headline, a one-line pitch, and a link that opens a sheet about the photo staying on the phone. Below it, or beside it at 900 px and wider, an example scan shows a Receipt with one flagged price. The one primary action is **Scan a receipt**. Below 768 px it sits in a solid bar fixed to the bottom of the screen. At 768 px and wider it sits inline under the pitch.

## Sub-features

- `home-scan` shows **Scan a receipt**, visible and reachable with Tab at every width.
- `home-bar` holds the action in a solid bar under the scrolling page below 768 px. The page scrolls above the bar, so the bar never covers the last line. The bar grows by the bottom safe-area inset.
- `home-privacy` opens the "Your photo stays on your phone" sheet from the link under the pitch. **Got it**, Escape, or a tap on the dimmed backdrop closes it.
- `home-example` shows the example scan with the flagged Tiramisu row and the line that the Items are $1.00 short of the subtotal.
- `home-theme` follows the system light or dark setting and drops movement under reduced motion, keeping only fades.

## How to get to it (user POV)

- Open the site's root URL on a phone or a desktop browser.
- Tap or click **The photo stays on your phone.** to open the sheet.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

- **Home, phone.** Run `verify.mjs drive --port 8811 --path / --expect-heading "Receipt Splitter" --expect-text "Scan a receipt" --expect-text "Split the bill" --shot <out>/home.png --aria <out>/home.aria.txt`. The JSON line has `"ok":true`. The screenshot shows the orange field and the bottom bar. The ARIA snapshot lists `button "Scan a receipt"`.
- **Width, color scheme, and reduced motion.** `drive` always opens a light Pixel 7 page with motion on, so it cannot cover this matrix yet. Run the matrix spec on a port with no launched server: `PORT=8812 SHOTS=<out> npx playwright test e2e/home.spec.ts -g "home matrix"`. It loads `/` at 390 px and 1280 px, in light and dark, with reduced motion on and off. It fails on clipped text, horizontal page overflow, a missing Archivo face, or a console error. `SHOTS` saves one screenshot per case as `home-<width>-<scheme>-<motion>.png`.
- **Keyboard focus and the bar.** `PORT=8812 npx playwright test e2e/home.spec.ts` also checks that the scan action takes Tab focus at 390 px, that a 34 px bottom safe-area inset lifts it by 34 px, that the bar never covers the last line, and that reduced motion leaves no moving animation.

## Gotchas

- **Scan a receipt** goes to `/new`. RS-7 adds that route. Until then it shows the router's unmatched-route screen, so do not report that screen as a home failure.
- The entrance motion runs for about 800 ms after load. Wait for `document.getAnimations()` to finish before a screenshot you compare against another, or turn reduced motion on.
- The Playwright config starts its own server on `PORT`, so never point the spec at a port where `launch` is serving.
- The fonts are Latin subsets. Text outside Basic Latin and common punctuation falls back to the system face.
