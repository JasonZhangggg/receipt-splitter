export const isPhoto = (file: Blob): boolean => file.type.startsWith("image/");

export const pickPhoto = (_onFile: (file: File) => void): void => {};

export const usePhotoDrop = (_onFile: (file: File) => void, _accepting: boolean): boolean => false;

export const thumbnailOf = async (_file: Blob): Promise<string | null> => null;
