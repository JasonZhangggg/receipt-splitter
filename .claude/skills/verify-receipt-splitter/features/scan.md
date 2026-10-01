# Scan

The Host reads a Receipt on the home page `/` and fixes it there. A tap on the hero opens the photo picker. On a desktop, an image dropped anywhere on the page or pasted from the clipboard is read too, and a file that is not an image gets the one line "That file is not a photo." Drop and paste read a photo only on the empty page. On the read state a dropped file changes nothing, and a Host replaces the Receipt with the camera button on the file row. While OCR runs, the slip turns into a skeleton with seven lines that darken one at a time over a progress bar, under the title **Reading receipt**. The read state shows the file row (thumbnail, file name, Item count, and **Replace receipt**) and the receipt card with editable Items, Subtotal, the other Adjustments, one Tip line, and the Total. **Create split link** stays off with one short reason until the Total check passes and one Payment handle is filled in. The draft lives in local storage, so a reload keeps it. RS-9 gives the enabled action its handler.

## Sub-features

- `scan-input` opens the picker with `accept="image/*"` from the hero, reads a dropped or pasted image, and refuses any other file with one line in the Toast. Photos decode with `imageOrientation: "from-image"`, so an EXIF-rotated phone photo reads upright.
- `scan-reading` shows the skeleton slip, **Reading receipt**, and a progress bar that fills over the model download, then OCR. With motion on, each line reaches full ink 150 ms after the one above it, in a 1.6 s loop. Under reduced motion the lines hold still, the bar has no transition, and `document.getAnimations()` is empty. The state ends when the Items show.
- `scan-editor` shows each Item's name and price as text fields, an x button per row, **Add item**, the Subtotal, each Adjustment with its own x, the Tip with a dotted underline and a pencil, and the Total. Every edit reruns the Total check. A row the check names, or a price the Host retyped while the check fails, gets the yellow highlight and the price label ", check this price". A 0-cent Item shows as 0.00. An Item a discount took below zero shows "Its discount was more than its price." An OCR price over `MAX_CENTS` reads 0.00 with "Could not read this price."
- `scan-tip` reads the tip from the receipt's tip lines as one line, $0.00 when the receipt prints none. A tip edit moves the Total by the same amount and never changes the Total check.
- `scan-manual` opens the same editor empty, with the file row, a Tax line at $0.00, and an editable Total, when OCR fails or finds no Items.
- `scan-reason` puts one reason above a disabled **Create split link** in the read state: "Items are $0.50 short.", "Items are $0.50 over.", "Tax and charges are $0.61 short.", "Add an item.", "Name every item.", or "Add how to pay you.". The empty and reading states show no reason.
- `scan-draft` keeps the Receipt, the tip, the Payment handles, and the names in local storage under `receipt-splitter:draft`. A reload during a read starts the Receipt over and keeps the handles and names. Replacing the Receipt keeps the handles and names.
- `scan-offline` keeps a scan working offline once the model is cached. `public/sw.js` answers from Cache Storage only while the browser is offline, and the page asks it to keep `/`, the entry, the fonts, and the worker script. The OCR worker keeps the ORT JavaScript files with the runtime and the models.
- `scan-example` fills the draft with SRD receipt 1040 as its checked label reads, named "Example receipt", and keeps the Payment handles.

## How to get to it (user POV)

- Open `/` on a phone, tap **Add receipt**, and take or choose a photo.
- Open `/` at 900 px or wider, and click **Drop a receipt**, drop an image on the page, or paste one.
- Tap **Example** at the top right of the empty page.
- In the read state, tap the camera button on the file row to replace the Receipt.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

`verify.mjs drive` loads one route and cannot choose a file, so every flow past the empty page runs through `e2e/scan.spec.ts`. Stop the lane's `launch` first, because the spec starts its own server on `PORT`.

- **Read SRD receipt 1040.** `PORT=8812 npx playwright test e2e/scan.spec.ts -g "chosen through the picker"` picks `bench/data/srd-1040.jpg`, sees **Reading receipt**, then five Items, Subtotal $22.98, Tax $1.61, Service fees on tables $3.45, Tip $0.00, and Total $28.04, with "Add how to pay you." until a Venmo handle enables the action.
- **Fix it.** `-g "fixing the Example"` sets the Perrier price to 3.00 and checks the highlighted row and "Items are $0.50 short.", sets the tip to 4.60 and checks Total $32.64, and deletes and re-adds Sprite.
- **Type it.** `-g "failed read"` reads `e2e/fixtures/blank.png`, gets the empty editor and "Add an item.", types two Items and a Total, and gets an enabled action.
- **Desktop input.** `-g "1280 px"` refuses a dropped PDF with one line, then reads a dropped image and a pasted image.
- **EXIF.** `-g "EXIF"` reads `e2e/fixtures/srd-1040-exif-rotated.jpg`, whose pixels lie sideways with EXIF orientation 6, as the same five Items.
- **Reading state.** `-g "reading state"` holds the dictionary download for 3 s, checks that the seven lines darken in order, and that reduced motion runs no animation.
- **Reload and offline.** `-g "reload keeps the draft"` scans, edits, waits for the service worker, goes offline, reloads, and scans again. `-g "payment apps and names"` switches to Cash App, adds Venmo with **+**, adds two names, removes one, and reloads.
- **Sheet.** `-g "the sheet"` drags the grab handle down to collapse the sheet, flicks it open, taps and presses Enter on it, interrupts its settle, and fills it until its content scrolls.
- **Screens.** For a screenshot of a state, run the spec with `--trace on` and save a frame, or use a short Playwright script against a `launch`ed port, as `/tmp/swarm-RS-7/owner/shots.mjs` does.

## Gotchas

- OCR takes about 0.4 to 1 s once the models are cached, so the reading state can be gone before a slow assertion runs. Hold a model download with `page.route` to keep it on screen.
- `react-native-web` compiles `animationKeyframes` only inside `StyleSheet.create`. An inline keyframe style renders with `animation-name: none`.
- The OCR worker stays alive for 10 s after the last scan, then the page terminates it. A scan inside that window reuses the engine.
- The service worker answers only while `navigator.onLine` is false, so Playwright routes still see every online request. Offline it serves only what its caches hold, so a route it never kept, such as `/s/<id>`, fails as it would without it.
- Local storage carries the draft between loads in one browser context. Start each check in a fresh context, as Playwright does per test.
- The Example has no photo, so its file row shows the receipt glyph instead of a thumbnail.
