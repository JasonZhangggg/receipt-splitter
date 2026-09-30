# OCR

The site reads a receipt photo on the device. `recognize(photo)` from `src/ocr` returns text boxes, each with its text and four corner points in photo pixels. The OCR runs in a Web Worker on onnxruntime-web, with four threads when the page is cross-origin isolated and one thread otherwise. The home screen starts the model download after it paints, and the worker keeps the runtime and models in Cache Storage. The photo never leaves the device.

## Sub-features

- `ocr-prefetch` starts the model download from `/` after the home screen paints.
- `ocr-recognize` reads a photo into text boxes on the debug route `/debug/ocr`.
- `ocr-parse` parses those text boxes into a Receipt with `parseReceipt` from `src/parse` and shows its Items, Adjustments, subtotal, total, and Total check on `/debug/ocr`.
- `ocr-bench` runs every benchmark image through `/debug/ocr` and prints character error rate and milliseconds.

## How to get to it (user POV)

- Open `/`. The model download starts in the background. Nothing on the screen changes.
- Open `/debug/ocr`, choose a photo in **Receipt photo**, and read the boxes drawn on the photo and the text list under it. This is a developer route. No screen links to it.
- On `/debug/ocr`, after a photo is read, read the parsed Receipt under the photo. Each Item shows its name and price, such as `Sprite $2.50`. The last line says `Total check passed.` or names the gaps, such as `Total check failed. Items are off by $0.50 and the total by $0.00.` A photo with no Items shows `No Items found.`

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).

`verify.mjs drive` cannot choose a file or read the network log, so the file upload and the download order go through the benchmark command and `e2e/ocr.spec.ts`.

- **Prefetch order.** Stop the lane's `launch` first, because the spec starts its own server. Run `PORT=8811 npx playwright test e2e/ocr.spec.ts`. The test `home paints before the model download starts, then prefetches the models` passes when `/` is cross-origin isolated and the first `/models/` request starts after its first contentful paint.
- **Home still renders.** Run `verify.mjs drive --port 8811 --path / --expect-heading "Receipt Splitter" --shot <out>/ocr-prefetch.png`. The JSON line has `"ok":true`.
- **Recognize five receipts.** Run `node bench/run-ocr.mjs --url http://localhost:8811 --only srd-1002,srd-1008,srd-1019,srd-1040,srd-1174 --out <out>/boxes --shots <out>/shots`. It prints one line per receipt with its box count, and `<out>/shots/srd-1040.png` shows the boxes drawn on receipt 1040. Each `<out>/boxes/<image>.json` holds `{ image, ms, boxes }`. Run `jq -r '.boxes[].text' <out>/boxes/srd-1040.json` and look for `Total` and `$28.04`.
- **Parse a receipt.** Run `node bench/run-ocr.mjs --url http://localhost:8811 --only srd-1019 --out <out>/boxes --shots <out>/shots`. `<out>/shots/srd-1019.png` shows only the photo with its boxes. `<out>/shots/srd-1019.parse.png` shows the parsed Receipt, with the Items list, the Adjustments, the subtotal, the total, and the Total check line. Pass when every Item in that shot shows its own price and the last line reads `Total check passed.` Copy the shot to the name the lane asks for, such as `<out>/parse-1019.png`.
- **Full benchmark.** Run `node bench/run-ocr.mjs --url http://localhost:8811` for four threads, then add `--threads 1` for one thread. The last line gives the median character error rate over the SRD receipts, the warm median milliseconds, the first-scan download in brotli, and the peak renderer memory. Without `--out`, the run rewrites `bench/ocr/<image>.json`.

## Gotchas

- A text box holds one detected run of text, not a whole receipt line. On receipt 1040, `Total` and `$28.04` are two boxes on one line. Row grouping belongs to the parser.
- `--threads 1` strips the isolation headers from `/debug/ocr` in the benchmark browser, and the run fails if the page is still cross-origin isolated.
- The debug route parses the boxes it just read. The parser bench `npm run bench -- --parser=app` parses the committed `bench/ocr/<image>.json` instead. The two show the same Items only while those files match the shipped OCR model.
- `run-ocr.mjs` without `--out` rewrites `bench/ocr/`, which is the parser bench's input. Pass `--out <out>/boxes` in a lane unless the lane is meant to refresh those files.
- Only `/` and `/debug/ocr` send the isolation headers. A direct load of any other route runs one thread.
- Every run starts a fresh browser profile, so the first scan always downloads the runtime and models.
- The worker keeps a model in Cache Storage under the name `ocr-ort-1.30.0`. Change that name when you replace a runtime or model file without renaming it.
