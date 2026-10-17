import { describe, expect, test } from "vitest";

import { cents } from "../../core/money";
import type { Shares } from "../../core/shares";
import { participantId, type ItemId } from "../../core/split";
import { arcAt, arcs, ringMarkup, slices } from "./donut-model";

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
  const length = 2 * Math.PI * 80;
  const two = [
    { id: ann, cents: 5000, start: 0, fraction: 0.5 },
    { id: bob, cents: 5000, start: 0.5, fraction: 0.5 },
  ];

  test("trim each arc by the gap and the stroke so round-capped neighbors leave 4 px of track, and start it half the trim in", () => {
    const [first, second] = arcs(two);
    expect(first.dash).toBe(`${0.5 * length - 12} ${length}`);
    expect(first.offset).toBe(-6);
    expect(second.offset).toBe(-(0.5 * length + 6));
  });

  test("leave a lone arc untrimmed", () => {
    expect(arcs([{ id: ann, cents: 100, start: 0, fraction: 1 }])).toEqual([{ id: "ann", dash: `${length} ${length}`, offset: -0, delay: 0 }]);
  });

  test("start each arc when the clockwise sweep reaches it", () => {
    const three = [
      { id: ann, cents: 1, start: 0, fraction: 0.3 },
      { id: bob, cents: 1, start: 0.3, fraction: 0.3 },
      { id: cy, cents: 1, start: 0.6, fraction: 0.4 },
    ];
    expect(arcs(three).map(({ delay }) => delay)).toEqual([0, 126, 252]);
  });

  test("a crowd of equal arcs still starts at least 30 ms apart and the last within 420 ms", () => {
    const crowd = Array.from({ length: 12 }, (_, at) => ({ id: participantId(`p${at}`), cents: 1, start: at / 12, fraction: 1 / 12 }));
    const delays = arcs(crowd).map(({ delay }) => delay);
    expect(delays.at(-1)).toBe(385);
    expect(Math.min(...delays.slice(1).map((delay, at) => delay - delays[at]))).toBeGreaterThanOrEqual(30);
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
  test("draws the track first, then one round-capped circle per arc in the color paint gives it", () => {
    const markup = ringMarkup([{ id: ann, cents: 100, start: 0, fraction: 1 }], () => "#123456", "#abcdef");
    expect(markup.match(/<circle/g)).toHaveLength(2);
    expect(markup.indexOf('stroke="#abcdef"')).toBeLessThan(markup.indexOf('stroke="#123456"'));
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).not.toContain("opacity");
  });
});

describe("arcAt", () => {
  const sam = participantId("sam");
  const priya = participantId("priya");
  const lee = participantId("lee");
  // Half the ring for Sam, 48% for Priya, a 2% sliver for Lee. The band's middle is at radius 80.
  const all = [
    { id: sam, cents: 5000, start: 0, fraction: 0.5 },
    { id: priya, cents: 4800, start: 0.5, fraction: 0.48 },
    { id: lee, cents: 200, start: 0.98, fraction: 0.02 },
  ];

  test("picks the arc under a tap on its band, measured clockwise from 12 o'clock", () => {
    expect([arcAt(all, 80, 0), arcAt(all, 0, 80), arcAt(all, -80, 0)]).toEqual([sam, priya, priya]);
  });

  test("keeps a few px of slack past the band and ignores the hole and the far side of the band", () => {
    expect([arcAt(all, 89, 0), arcAt(all, 92, 0), arcAt(all, 0, 0), arcAt(all, 30, 0)]).toEqual([sam, null, null, null]);
  });

  test("answers over a minimum stretch for a sliver, and lets a neighbor keep its own side", () => {
    const tap = (turn: number) => arcAt(all, 80 * Math.sin(2 * Math.PI * turn), -80 * Math.cos(2 * Math.PI * turn));
    expect([tap(0.99), tap(0.9975), tap(0.0025), tap(0.96)]).toEqual([lee, lee, lee, priya]);
  });
});

describe("arcAt beside a sliver", () => {
  const b = participantId("b");
  const a = participantId("a");
  const c = participantId("c");
  const all = [
    { id: b, cents: 4900, start: 0, fraction: 0.49 },
    { id: a, cents: 100, start: 0.49, fraction: 0.01 },
    { id: c, cents: 5000, start: 0.5, fraction: 0.5 },
  ];
  const tap = (turn: number) => arcAt(all, 80 * Math.sin(2 * Math.PI * turn), -80 * Math.cos(2 * Math.PI * turn));

  test("a tap on a neighbor's paint, even right beside the sliver, picks the neighbor", () => {
    // 1 px of ring is 0.002 of a turn at radius 80; 5 px either side of the sliver is well inside B and C.
    expect([tap(0.2), tap(0.49 - 0.01), tap(0.5 + 0.01), tap(0.75)]).toEqual([b, b, c, c]);
  });

  test("the sliver is still picked on its own paint and just beside it", () => {
    expect([tap(0.495), tap(0.49 - 0.002), tap(0.5 + 0.002)]).toEqual([a, a, a]);
  });
});
