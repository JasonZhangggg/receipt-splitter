import { expect, test } from "vitest";

import { connectionOf, nextNotice } from "./connection";

test.each([
  ["offline", null, { notice: "offline", afterMs: 1500 }],
  ["offline", "slow", { notice: "offline", afterMs: 0 }],
  ["offline", "offline", { notice: "offline", afterMs: 0 }],
  ["slow", null, { notice: "slow", afterMs: 0 }],
  ["online", "offline", { notice: null, afterMs: 1000 }],
  ["online", "slow", { notice: null, afterMs: 0 }],
  ["online", null, { notice: null, afterMs: 0 }],
] as const)("a %s link while showing %s moves the notice as %o", (connection, showing, expected) => {
  expect(nextNotice(connection, showing)).toEqual(expected);
});

test.each([
  [{ socketOpen: true, browserOnline: true, stalled: 0 }, "online"],
  [{ socketOpen: true, browserOnline: true, stalled: 2 }, "slow"],
  [{ socketOpen: false, browserOnline: true, stalled: 0 }, "offline"],
  [{ socketOpen: true, browserOnline: false, stalled: 0 }, "offline"],
  [{ socketOpen: false, browserOnline: false, stalled: 3 }, "offline"],
] as const)("%o is %s", (link, expected) => {
  expect(connectionOf(link)).toBe(expected);
});
