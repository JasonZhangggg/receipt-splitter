import { describe, expect, test } from "vitest";

import { cents } from "../../core/money";
import type { Shares } from "../../core/shares";
import { participantId, type ItemId } from "../../core/split";
import { arcs, ringMarkup, slices } from "./donut-model";

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
  test("run in chip order from the top as parts of the Total, and leave the unclaimed rest as the open track", () => {
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
    ]);
  });

  test("leave out a $0.00 Share", () => {
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

  test("one person who had everything fills the ring", () => {
    expect(slices(shares([[ann, 7710]], 0))).toEqual([{ id: "ann", cents: 7710, start: 0, fraction: 1 }]);
  });

  test("a receipt nobody claimed has no arcs, only the track", () => {
    expect(slices(shares([[ann, 0]], 1250))).toEqual([]);
  });

  test("nothing at all gives no arcs", () => {
    expect(slices(shares([[ann, 0]], 0))).toEqual([]);
  });
});

describe("arcs", () => {
  const length = 2 * Math.PI * 99.5;

  test("trim each arc by the gap and the stroke so round-capped neighbors leave 5 px of track, and start it half the trim in", () => {
    const [first, second] = arcs([
      { id: ann, cents: 5000, start: 0, fraction: 0.5 },
      { id: bob, cents: 5000, start: 0.5, fraction: 0.5 },
    ]);
    expect(first.dash).toBe(`${0.5 * length - 14} ${length}`);
    expect(first.offset).toBe(-7);
    expect(second.offset).toBe(-(0.5 * length + 7));
  });

  test("leave a lone arc untrimmed", () => {
    expect(arcs([{ id: ann, cents: 100, start: 0, fraction: 1 }])).toEqual([{ id: "ann", width: 9, dash: `${length} ${length}`, offset: -0 }]);
  });

  test("draw the picked arc thicker and still leave 5 px of track at each end", () => {
    const [first, second] = arcs(
      [
        { id: ann, cents: 5000, start: 0, fraction: 0.5 },
        { id: bob, cents: 5000, start: 0.5, fraction: 0.5 },
      ],
      ann,
    );
    expect([first.width, second.width]).toEqual([14, 9]);
    expect(first.dash).toBe(`${0.5 * length - 19} ${length}`);
    expect(first.offset).toBe(-9.5);
    expect(second.dash).toBe(`${0.5 * length - 14} ${length}`);
  });

  test("shrink a sliver to a dot rather than a negative length", () => {
    const [sliver] = arcs([
      { id: ann, cents: 1, start: 0, fraction: 0.001 },
      { id: bob, cents: 999, start: 0.001, fraction: 0.999 },
    ]);
    expect(sliver.dash).toBe(`0 ${length}`);
  });
});

describe("ringMarkup", () => {
  test("draws the track first, then one round-capped circle per arc", () => {
    const markup = ringMarkup([{ id: ann, cents: 100, start: 0, fraction: 1 }], () => "#123456", "#abcdef");
    expect(markup.match(/<circle/g)).toHaveLength(2);
    expect(markup.indexOf('stroke="#abcdef"')).toBeLessThan(markup.indexOf('stroke="#123456"'));
    expect(markup).toContain('stroke-linecap="round"');
  });

  test("thickens the picked arc and dims the rest", () => {
    const two = [
      { id: ann, cents: 100, start: 0, fraction: 0.5 },
      { id: bob, cents: 100, start: 0.5, fraction: 0.5 },
    ];
    const markup = ringMarkup(two, (id) => (id === ann ? "#111111" : "#222222"), "#abcdef", ann);
    expect(markup).toMatch(/stroke="#111111" stroke-width="14"[^>]*\/>/);
    expect(markup).toMatch(/stroke="#222222" stroke-width="9"[^>]*opacity="0.4"/);
  });
});
