import type { TextBox } from "../../ocr/types";
import type { ReceiptJpeg } from "./jpeg";

export const isPhoto = (file: Blob): boolean => file.type.startsWith("image/");

export const pickPhoto = (_onFile: (file: File) => void): void => {};

export const usePhotoDrop = (_onFile: (file: File) => void, _accepting: boolean): void => {};

/** The Split's copy of the photo: cropped to the OCR boxes, at most 1280 px on its long edge, as a clean JPEG that fits 150 KB, or null. */
export const receiptCopyOf = async (_photo: Blob, _boxes: readonly TextBox[]): Promise<ReceiptJpeg | null> => null;
