export type Point = { x: number; y: number };

/** Corners run top-left, top-right, bottom-right, bottom-left along the text, in pixels of the photo as displayed. */
export type TextBox = { text: string; corners: readonly [Point, Point, Point, Point] };

export class OcrUnavailable extends Error {
  override name = "OcrUnavailable";

  constructor() {
    super("On-device OCR is not available on this platform");
  }
}
