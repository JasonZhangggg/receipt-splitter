import type { TextBox } from "../ocr/types";

/** How long home waits for the on-device engine before it sends the photo without OCR text. */
export const ENGINE_WAIT_MS = 5000;

/** `ocr` sends the photo with the device's text boxes. `photo` sends the photo alone, and the boxes are only the fallback if the server fails. */
export type ScanRoute = "ocr" | "photo";

/**
 * Picks the route once. The engine reporting ready within `waitMs` gives `ocr`. The wait running out, or the OCR run
 * failing before the engine reported ready (the download failed), gives `photo`.
 */
export function chooseRoute(ready: Promise<void>, ocr: Promise<TextBox[] | null>, waitMs = ENGINE_WAIT_MS): Promise<ScanRoute> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("photo"), waitMs);
    const settle = (route: ScanRoute) => {
      clearTimeout(timer);
      resolve(route);
    };
    void ready.then(() => settle("ocr"));
    void ocr.then((boxes) => settle(boxes ? "ocr" : "photo"));
  });
}
