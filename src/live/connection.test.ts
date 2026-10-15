import { expect, test } from "vitest";

import { connectionOf } from "./connection";

test.each([
  [{ socketOpen: true, browserOnline: true, stalled: 0 }, "online"],
  [{ socketOpen: true, browserOnline: true, stalled: 2 }, "slow"],
  [{ socketOpen: false, browserOnline: true, stalled: 0 }, "offline"],
  [{ socketOpen: true, browserOnline: false, stalled: 0 }, "offline"],
  [{ socketOpen: false, browserOnline: false, stalled: 3 }, "offline"],
] as const)("%o is %s", (link, expected) => {
  expect(connectionOf(link)).toBe(expected);
});
