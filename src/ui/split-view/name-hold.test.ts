import { describe, expect, it } from "vitest";

import { deviceId, participantId, type Split } from "../../core/split";
import { holdOf, takenName } from "./name-hold";

const sam = participantId("sam");
const priya = participantId("priya");
const mine = deviceId("mine");
const theirs = deviceId("theirs");
const split = (picks: Split["picks"]) => ({ picks }) as Split;

describe("name hold", () => {
  it("tells this device's pick from another device's, and a missing pick from both", () => {
    expect(holdOf(split([{ participantId: sam, device: mine }]), sam, mine)).toEqual({ name: sam, by: "here" });
    expect(holdOf(split([{ participantId: sam, device: theirs }]), sam, mine)).toEqual({ name: sam, by: "elsewhere" });
    expect(holdOf(split([]), sam, mine)).toBeNull();
    expect(holdOf(split([{ participantId: sam, device: mine }]), undefined, mine)).toBeNull();
  });

  it("names the person only when the same name moves from here to another device", () => {
    expect(takenName({ name: sam, by: "here" }, { name: sam, by: "elsewhere" })).toBe(sam);
    expect(takenName({ name: sam, by: "here" }, null)).toBeNull();
    expect(takenName({ name: sam, by: "here" }, { name: priya, by: "elsewhere" })).toBeNull();
    expect(takenName({ name: sam, by: "elsewhere" }, { name: sam, by: "elsewhere" })).toBeNull();
    expect(takenName(null, { name: sam, by: "elsewhere" })).toBeNull();
  });
});
