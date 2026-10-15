import type { TextBox } from "../ocr/types";

/** How long home waits for the OCR model files before it sends the photo without OCR text. */
export const ENGINE_WAIT_MS = 5000;

/** `ocr` sends the photo with the device's text boxes. `photo` sends the photo alone, and the boxes are only the fallback if the server fails. */
export type ScanRoute = "ocr" | "photo";

/**
 * Picks the route once. `ready` settling within `waitMs` (the model files are in) gives `ocr`. The wait running out, or the
 * OCR run failing before `ready` (the download failed), gives `photo`.
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

/** How long home waits for the device's OCR after the server read failed, so a stalled model download cannot hold the reading words forever. */
export const FALLBACK_WAIT_MS = 15_000;

/** The value, or null when it has not settled within `ms`. */
export function within<T>(value: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(resolve, ms, null)));
  return Promise.race([value, late]).finally(() => clearTimeout(timer));
}
