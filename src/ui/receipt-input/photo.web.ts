import { useEffect, useEffectEvent } from "react";

import { drawCropped } from "../../scan/client";
import { receiptJpeg } from "./jpeg";
import type * as Photo from "./photo";

export const isPhoto: typeof Photo.isPhoto = (file) => file.type.startsWith("image/");

export const pickPhoto: typeof Photo.pickPhoto = (onFile) => {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
  input.addEventListener("change", () => {
    const [file] = input.files ?? [];
    input.remove();
    if (file) onFile(file);
  });
  input.addEventListener("cancel", () => input.remove());
  document.body.appendChild(input);
  input.click();
};

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

const keepThePage = (event: DragEvent) => {
  if (carriesFiles(event)) event.preventDefault();
};
if (typeof document !== "undefined") {
  document.addEventListener("dragover", keepThePage);
  document.addEventListener("drop", keepThePage);
}

export const usePhotoDrop: typeof Photo.usePhotoDrop = (onFile, accepting) => {
  const deliver = useEffectEvent(onFile);
  useEffect(() => {
    if (!accepting) return;
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      const [file] = event.dataTransfer?.files ?? [];
      if (file) deliver(file);
    };
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])][0];
      if (!file) return;
      event.preventDefault();
      deliver(file);
    };
    document.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, [accepting]);
};

// A busy photo that still misses 150 KB at the lowest quality gets a smaller long edge.
const COPY_LONG_EDGES = [1280, 960];
const COPY_QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

const jpegOf = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

export const receiptCopyOf: typeof Photo.receiptCopyOf = async (photo, boxes) => {
  for (const longEdge of COPY_LONG_EDGES) {
    const canvas = await drawCropped(photo, boxes, longEdge);
    if (!canvas) return null;
    for (const quality of COPY_QUALITIES) {
      const encoded = await jpegOf(canvas, quality);
      const copy = encoded && receiptJpeg(new Uint8Array(await encoded.arrayBuffer()));
      if (copy) return copy;
    }
  }
  return null;
};
