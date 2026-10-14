import { describe, expect, it } from "vitest";

import { replayGate } from "./icon.web";

describe("icon replay", () => {
  it("a press sets the play state once and a hover then press does not restart it", () => {
    let now = 1000;
    const gate = replayGate(() => now);

    expect(gate("pointerdown")).toBe(true);

    now = 5000;
    expect(gate("pointerover")).toBe(true);
    now = 5300;
    expect(gate("pointerdown")).toBe(false);

    now = 5700;
    expect(gate("pointerdown")).toBe(true);
  });
});
