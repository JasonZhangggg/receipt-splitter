import { describe, expect, test } from "vitest";

import { glideFor, leaveFor, project, releaseIntent, releaseVelocity, rubberband, snapFor } from "./sheet-motion";

test("project carries a release velocity forward the way a scroll decelerates", () => {
  expect(project(1000)).toBeCloseTo(499, 0);
});

test("rubberband gives less travel the further past the edge the drag goes", () => {
  expect([rubberband(10, 120), rubberband(100, 120), rubberband(-100, 120)].map(Math.round)).toEqual([5, 38, -38]);
});

describe("releaseIntent", () => {
  test("a drag past half the sheet or a flick goes down, a pull or flick up goes up, and a short drag stays", () => {
    expect({
      slowPastHalf: releaseIntent(130, 0, 240),
      slowShortOfHalf: releaseIntent(60, 0, 240),
      flickDownFromNear: releaseIntent(20, 900, 240),
      pullUp: releaseIntent(-50, 0, 240),
      flickUp: releaseIntent(-8, -700, 240),
      nudgeUp: releaseIntent(-20, 0, 240),
      flickBackUpAfterLongDrag: releaseIntent(150, -900, 240),
    }).toEqual({ slowPastHalf: "down", slowShortOfHalf: "stay", flickDownFromNear: "down", pullUp: "up", flickUp: "up", nudgeUp: "stay", flickBackUpAfterLongDrag: "stay" });
  });
});

describe("snapFor", () => {
  test("closes past 110 px below rest, snaps tall on a pull or flick up, and from tall lands at rest before it ever closes", () => {
    const rest = 300;
    expect({
      slowPast110: snapFor(120, 0, false, rest),
      slowShort: snapFor(100, 0, false, rest),
      flickDown: snapFor(20, 900, false, rest),
      pullUp: snapFor(-50, 0, false, rest),
      flickUp: snapFor(-8, -700, false, rest),
      nudgeUp: snapFor(-20, 0, false, rest),
      tallPullDownShort: snapFor(-240, 0, true, rest),
      tallPullDownLong: snapFor(-300 + 250, 0, true, rest),
      tallPastRest100: snapFor(100, 0, true, rest),
      tallPastRest130: snapFor(130, 0, true, rest),
      tallNudge: snapFor(-280, 0, true, rest),
      tallPullUp: snapFor(-380, 0, true, rest),
      tallFlick: snapFor(-300, 400, true, rest),
    }).toEqual({ slowPast110: "close", slowShort: "stay", flickDown: "close", pullUp: "tall", flickUp: "tall", nudgeUp: "stay", tallPullDownShort: "rest", tallPullDownLong: "rest", tallPastRest100: "rest", tallPastRest130: "close", tallNudge: "stay", tallPullUp: "stay", tallFlick: "rest" });
  });
});

describe("a release at the speed of a deliberate drag", () => {
  test("a drag that eases down 48 px at 120 to 150 px/s stays, however its last samples were spaced, while a flick of the same travel still closes", () => {
    const sample = (times: number[]) => times.map((t, i) => ({ y: (2.4 * (i + 1)), t }));
    const slow = (times: number[]) => snapFor(48, releaseVelocity(sample(times), times.at(-1)! + 16), false, 300);
    expect({
      sixteenMsApart: slow([336, 352, 368, 384, 400]),
      twentyMsApart: slow([420, 440, 460, 480, 500]),
      lastTwoBunched: slow([336, 352, 368, 399, 400]),
      flick: snapFor(48, 1200, false, 300),
      slowUp: snapFor(-30, -150, false, 300),
    }).toEqual({ sixteenMsApart: "stay", twentyMsApart: "stay", lastTwoBunched: "stay", flick: "close", slowUp: "stay" });
  });
});

describe("glideFor", () => {
  test("starts a glide at the finger's speed, never slower than the resting glide nor shorter than 150 ms", () => {
    expect({ still: glideFor(300, 0), slow: glideFor(300, 400), fast: glideFor(300, 3000), faster: glideFor(100, 3000), away: glideFor(200, -2000) }).toEqual({
      still: 300,
      slow: 300,
      fast: 225,
      faster: 150,
      away: 300,
    });
  });
});

test("leaveFor keeps the 300 ms exit for a short sheet and stretches a tall one", () => {
  expect([leaveFor(400), leaveFor(545), leaveFor(668)]).toEqual([300, 300, 367]);
});

describe("releaseVelocity", () => {
  const moves = (from: number, step: number, at: number) => Array.from({ length: 5 }, (_, i) => ({ y: from + step * i, t: at + 16 * i }));

  test("reads the finger's speed over its last moves, and reads a hold before release as still", () => {
    expect({
      flick: releaseVelocity(moves(0, 16, 0), 70),
      held: releaseVelocity(moves(0, 16, 0), 64 + 200),
      justOverHold: releaseVelocity(moves(0, 16, 0), 64 + 81),
      oneRecentMove: releaseVelocity([{ y: 0, t: 0 }, { y: 16, t: 100 }], 110),
      fastUp: releaseVelocity(moves(0, -80, 0), 70),
    }).toEqual({ flick: 1000, held: 0, justOverHold: 0, oneRecentMove: 0, fastUp: -3000 });
  });

  test("ignores moves more than 100 ms before release", () => {
    expect(releaseVelocity([{ y: 0, t: 0 }, { y: 500, t: 20 }, { y: 516, t: 90 }, { y: 532, t: 106 }], 125)).toBe(1000);
  });
});
