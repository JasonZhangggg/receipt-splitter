import { expect, test } from "vitest";
import { OcrUnavailable, prefetchModel, recognize } from "./index.native";

test("native recognize rejects with OcrUnavailable so the Host can type Items", async () => {
  prefetchModel();

  await expect(recognize(new Blob())).rejects.toThrow(OcrUnavailable);
});
