import { expect, test } from "vitest";

import { isPhoto } from "./photo.web";

test("only image files count as photos", () => {
  const files = [
    new File([], "IMG_4127.jpg", { type: "image/jpeg" }),
    new File([], "IMG_4128.HEIC", { type: "image/heic" }),
    new File([], "menu.pdf", { type: "application/pdf" }),
    new File([], "notes", { type: "" }),
  ];
  expect(files.map(isPhoto)).toEqual([true, true, false, false]);
});
