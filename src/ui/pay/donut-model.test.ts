import { describe, expect, test } from "vitest";

import { cents } from "../../core/money";
import type { Shares } from "../../core/shares";
import { participantId, type ItemId } from "../../core/split";
import { arcs, slices } from "./donut-model";

const ann = participantId("ann");
const bob = participantId("bob");
const cy = participantId("cy");

const shares = (own: [typeof ann, number][], unclaimed: number): Shares => {
  const [[host, hostShare], ...rest] = own;
  return {
    shares: [{ participantId: host, share: cents(hostShare) }, ...rest.map(([id, share]) => ({ participantId: id, share: cents(share), paid: cents(0), owed: cents(share) }))],
    unclaimed: { itemIds: [] as ItemId[], total: cents(unclaimed) },
  };
};

describe("slices", () => {
  test("run in chip order from the top with the unclaimed rest last, and fill the ring", () => {
    expect(
      slices(
        shares(
          [
            [ann, 5000],
            [bob, 3000],
          ],
          2000,
        ),
      ),
    ).toEqual([
      { id: "ann", cents: 5000, start: 0, fraction: 0.5 },
      { id: "bob", cents: 3000, start: 0.5, fraction: 0.3 },
      { id: null, cents: 2000, start: 0.8, fraction: 0.2 },
    ]);
  });

  test("leave out a $0.00 Share and an unclaimed $0.00", () => {
    expect(
      slices(
        shares(
          [
            [ann, 0],
            [bob, 400],
            [cy, 0],
          ],
          0,
        ),
      ),
    ).toEqual([{ id: "bob", cents: 400, start: 0, fraction: 1 }]);
  });

  test("one person who had everything is one full slice", () => {
    expect(slices(shares([[ann, 7710]], 0))).toEqual([{ id: "ann", cents: 7710, start: 0, fraction: 1 }]);
  });

  test("a receipt nobody claimed is the unclaimed ring alone", () => {
    expect(slices(shares([[ann, 0]], 1250))).toEqual([{ id: null, cents: 1250, start: 0, fraction: 1 }]);
  });

  test("nothing at all gives no slices", () => {
    expect(slices(shares([[ann, 0]], 0))).toEqual([]);
  });
});

describe("arcs", () => {
  test("cut each slice 2 px short so neighbors leave a 2 px gap, and start it half a gap in", () => {
    const length = 2 * Math.PI * 64;
    const [first, second] = arcs([
      { id: ann, cents: 5000, start: 0, fraction: 0.5 },
      { id: bob, cents: 5000, start: 0.5, fraction: 0.5 },
    ]);
    expect(first.dash).toBe(`${0.5 * length - 2} ${length}`);
    expect(first.offset).toBe(-1);
    expect(second.offset).toBe(-(0.5 * length + 1));
  });

  test("leave a lone slice whole, with no gap", () => {
    const length = 2 * Math.PI * 64;
    expect(arcs([{ id: ann, cents: 100, start: 0, fraction: 1 }])).toEqual([{ id: "ann", dash: `${length} ${length}`, offset: -0 }]);
  });
});
