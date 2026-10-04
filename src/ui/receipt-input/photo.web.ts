import { useEffect, useEffectEvent, useState } from "react";

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
  const [over, setOver] = useState(false);
  const deliver = useEffectEvent(onFile);
  useEffect(() => {
    if (!accepting) return;
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const [file] = event.dataTransfer?.files ?? [];
      if (file) deliver(file);
    };
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])][0];
      if (!file) return;
      event.preventDefault();
      deliver(file);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, [accepting]);
  return accepting && over;
};

const thumb = { width: 232, height: 296 };

export const thumbnailOf: typeof Photo.thumbnailOf = async (file) => {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.max(thumb.width / image.width, thumb.height / image.height);
    const canvas = Object.assign(document.createElement("canvas"), thumb);
    const context = canvas.getContext("2d");
    if (!context) return null;
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (thumb.width - width) / 2, (thumb.height - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    image.close();
  }
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

export const photoUri: typeof Photo.photoUri = (file) => URL.createObjectURL(file);

export const releasePhotoUri: typeof Photo.releasePhotoUri = (uri) => URL.revokeObjectURL(uri);
