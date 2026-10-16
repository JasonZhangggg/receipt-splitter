import { expect, test } from "vitest";

import { rowsThatFit } from "./recent-fit";

test("shows every row that fits, else as many as fit above See all, and never none", () => {
  const sizes = { title: 31, row: 73, seeAll: 44 };
  const fit = (total: number, room: number) => rowsThatFit(total, room, sizes);
  expect([fit(3, 31 + 3 * 73), fit(8, 31 + 3 * 73 + 44), fit(8, 31 + 3 * 73 + 43), fit(8, 20)]).toEqual([3, 3, 2, 1]);
});
