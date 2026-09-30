import type { TextBox } from "./types";

export { OcrUnavailable, type Point, type TextBox } from "./types";

export declare function recognize(image: Blob): Promise<TextBox[]>;

export declare function prefetchModel(): void;
