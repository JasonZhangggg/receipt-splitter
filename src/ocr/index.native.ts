import type * as Ocr from "./index";
import { OcrUnavailable } from "./types";

export { OcrUnavailable };

export const recognize: typeof Ocr.recognize = async () => {
  throw new OcrUnavailable();
};

export const prefetchModel: typeof Ocr.prefetchModel = () => {};
