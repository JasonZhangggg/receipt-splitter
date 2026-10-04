import type { TextBox } from "../../ocr/types";
import type { ReceiptJpeg } from "./jpeg";

export const isPhoto = (file: Blob): boolean => file.type.startsWith("image/");

export const pickPhoto = (_onFile: (file: File) => void): void => {};

export const usePhotoDrop = (_onFile: (file: File) => void, _accepting: boolean): boolean => false;

export const thumbnailOf = async (_file: Blob): Promise<string | null> => null;

/** The Split's copy of the photo: cropped to the OCR boxes, at most 1280 px on its long edge, as a clean JPEG that fits 150 KB, or null. */
export const receiptCopyOf = async (_photo: Blob, _boxes: readonly TextBox[]): Promise<ReceiptJpeg | null> => null;

export const photoUri = (_file: File): string | null => null;

export const releasePhotoUri = (_uri: string): void => {};
