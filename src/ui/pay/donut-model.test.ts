import { describe, expect, test } from "vitest";

import { cents } from "../../core/money";
import type { Shares } from "../../core/shares";
import { participantId, type ItemId } from "../../core/split";
import { arcAt, arcs, drawnBy, rest, ringMarkup, slices } from "./donut-model";

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
      { id: "ann", cents: 5000, start: 0, fraction: 0.5, paid: false },
      { id: "bob", cents: 3000, start: 0.5, fraction: 0.3, paid: false },
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
    ).toEqual([{ id: "bob", cents: 400, start: 0, fraction: 1, paid: false }]);
  });

  test("one person who had everything fills the ring", () => {
    expect(slices(shares([[ann, 7710]], 0))).toEqual([{ id: "ann", cents: 7710, start: 0, fraction: 1, paid: false }]);
  });

  test("a receipt nobody claimed has no arcs, only the track", () => {
    expect(slices(shares([[ann, 0]], 1250))).toEqual([]);
  });

  test("nothing at all gives no arcs", () => {
    expect(slices(shares([[ann, 0]], 0))).toEqual([]);
  });
});

describe("arcs", () => {
  const length = 2 * Math.PI * 79;
  const two = [
    { id: ann, cents: 5000, start: 0, fraction: 0.5, paid: true },
    { id: bob, cents: 5000, start: 0.5, fraction: 0.5, paid: false },
  ];

  test("trim each arc by the gap and the stroke between the paid and the owed, so round-capped neighbors leave 4 px of track, and start it half the trim in", () => {
    const [first, second] = arcs(two);
    expect(first.dash).toBe(`${0.5 * length - 14} ${length}`);
    expect(first.offset).toBe(-7);
    expect(second.offset).toBe(-(0.5 * length + 7));
  });

  test("let neighbors in the same group touch, so everything paid reads as one arc and everything owed as another", () => {
    const owed = [
      { id: ann, cents: 2500, start: 0, fraction: 0.25, paid: true },
      { id: bob, cents: 2500, start: 0.25, fraction: 0.25, paid: false },
      { id: cy, cents: 5000, start: 0.5, fraction: 0.5, paid: false },
    ];
    const [, second, third] = arcs(owed);
    expect(second.dash).toBe(`${0.25 * length - 7} ${length}`);
    expect(second.offset).toBe(-(0.25 * length + 7));
    expect(third.dash).toBe(`${0.5 * length - 7} ${length}`);
    expect(third.offset).toBe(-(0.5 * length));
  });

  test("break the lifted arc out of its group, with a gap on each side", () => {
    const owed = [
      { id: bob, cents: 5000, start: 0, fraction: 0.5, paid: false },
      { id: cy, cents: 5000, start: 0.5, fraction: 0.5, paid: false },
    ];
    expect(arcs(owed).map(({ dash }) => dash)).toEqual([`${0.5 * length} ${length}`, `${0.5 * length} ${length}`]);
    const [first, second] = arcs(owed, cy);
    expect(first.dash).toBe(`${0.5 * length - 14} ${length}`);
    expect(second.r).toBe(89);
  });

  test("stand the lifted arc 10 px further out on the same turn, its cut scaled to its radius", () => {
    const [first, second] = arcs(two, bob);
    expect([first.r, second.r]).toEqual([79, 89]);
    expect(second.dash).toBe(`${((0.5 * length - 14) * 89) / 79} ${2 * Math.PI * 89}`);
    expect(second.offset).toBeCloseTo((-(0.5 * length + 7) * 89) / 79);
  });

  test("close the gaps once everyone has paid, so the arcs meet as one ring", () => {
    const [first, second] = arcs(two, null, true);
    expect(first.dash).toBe(`${0.5 * length} ${length}`);
    expect([first.offset, second.offset]).toEqual([-0, -(0.5 * length)]);
  });

  test("leave a lone arc untrimmed", () => {
    expect(arcs([{ id: ann, cents: 100, start: 0, fraction: 1, paid: false }])).toMatchObject([{ id: "ann", r: 79, dash: `${length} ${length}`, offset: -0 }]);
  });

  test("draw the arcs as one unbroken sweep: each starts just as the one before ends, with a gap only between the paid and the owed", () => {
    const three = [
      { id: ann, cents: 1, start: 0, fraction: 0.3, paid: true },
      { id: bob, cents: 1, start: 0.3, fraction: 0.3, paid: false },
      { id: cy, cents: 1, start: 0.6, fraction: 0.4, paid: false },
    ];
    const draws = arcs(three).map(({ draw }) => [draw.delay, draw.delay + draw.duration]);
    expect(draws).toEqual([[53, 252], [266, 394], [394, 646]]);
    expect(arcs(three)[0].draw.easing).toMatch(/^linear\(0, .*, 1\)$/);
  });

  test("a crowd of a dozen still draws within the one sweep", () => {
    const crowd = Array.from({ length: 12 }, (_, at) => ({ id: participantId(`p${at}`), cents: 1, start: at / 12, fraction: 1 / 12, paid: at % 2 === 0 }));
    const draws = arcs(crowd).map(({ draw }) => draw);
    expect(draws.at(-1)!.delay + draws.at(-1)!.duration).toBeLessThanOrEqual(700);
    expect(draws.every(({ duration }) => duration > 0)).toBe(true);
  });

  test("shrink a sliver to a dot rather than a negative length", () => {
    const [sliver] = arcs([
      { id: ann, cents: 1, start: 0, fraction: 0.001, paid: true },
      { id: bob, cents: 999, start: 0.001, fraction: 0.999, paid: false },
    ]);
    expect(sliver.dash).toBe(`0 ${length}`);
  });
});

describe("slices with payments", () => {
  const three = shares(
    [
      [ann, 2000],
      [bob, 1000],
      [cy, 1000],
    ],
    0,
  );

  test("put everyone who has paid first, so the paid arcs are one sweep from the top, each group in chip order", () => {
    expect(slices(three, (id) => id === cy)).toEqual([
      { id: "cy", cents: 1000, start: 0, fraction: 0.25, paid: true },
      { id: "ann", cents: 2000, start: 0.25, fraction: 0.5, paid: false },
      { id: "bob", cents: 1000, start: 0.75, fraction: 0.25, paid: false },
    ]);
    expect(slices(three, (id) => id !== ann).map(({ id }) => id)).toEqual(["bob", "cy", "ann"]);
  });

  test("keep chip order when nobody or everybody has paid", () => {
    expect(slices(three, () => false).map(({ id }) => id)).toEqual(["ann", "bob", "cy"]);
    expect(slices(three, () => true).map(({ id }) => id)).toEqual(["ann", "bob", "cy"]);
  });

  test("All paid on opening waits for the last arc to draw in", () => {
    const four = [ann, bob, cy, participantId("dee")].map((id, index) => ({ id, cents: 100, start: index / 4, fraction: 0.25, paid: index % 2 === 0 }));
    expect(drawnBy(four)).toBe(200 + 647);
  });
});

describe("rest", () => {
  const length = 2 * Math.PI * 79;

  test("draw the unclaimed rest as one more arc after the last Share, cut like a neighbor", () => {
    const left = rest([{ id: ann, cents: 100, start: 0, fraction: 0.25, paid: false }])!;
    expect(left.dash).toBe(`${0.75 * length - 14} ${length}`);
    expect(left.offset).toBe(-(0.25 * length + 7));
  });

  test("a lone Share beside the rest is cut too, so the two leave a gap", () => {
    expect(arcs([{ id: ann, cents: 100, start: 0, fraction: 0.25, paid: false }])[0].dash).toBe(`${0.25 * length - 14} ${length}`);
  });

  test("nothing is left when everything is claimed, and nothing claimed leaves the full ring", () => {
    expect(rest([{ id: ann, cents: 100, start: 0, fraction: 1, paid: false }])).toBeNull();
    expect(rest([])).toMatchObject({ r: 79, dash: `${length} ${length}`, offset: -0, draw: { delay: 0, duration: 700 } });
  });
});

describe("ringMarkup", () => {
  test("draws one round-capped circle per arc in the color paint gives it, then the rest in its own color, with no ring behind", () => {
    const markup = ringMarkup([{ id: ann, cents: 100, start: 0, fraction: 0.5, paid: false }], () => "#123456", "#abcdef");
    expect(markup.match(/<circle/g)).toHaveLength(2);
    expect(markup.indexOf('stroke="#123456"')).toBeLessThan(markup.indexOf('stroke="#abcdef"'));
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).not.toContain("opacity");
  });

  test("draws the lifted arc 10 px further out and leaves the rest on the ring", () => {
    const markup = ringMarkup(
      [
        { id: ann, cents: 100, start: 0, fraction: 0.5, paid: false },
        { id: bob, cents: 100, start: 0.5, fraction: 0.5, paid: false },
      ],
      () => "#111111",
      "#eeeeee",
      bob,
    );
    expect(markup.match(/r="(\d+)"/g)).toEqual(['r="79"', 'r="89"']);
  });
});

describe("arcAt", () => {
  const sam = participantId("sam");
  const priya = participantId("priya");
  const lee = participantId("lee");
  // Half the ring for Sam, 48% for Priya, a 2% sliver for Lee. The band's middle is at radius 79.
  const all = [
    { id: sam, cents: 5000, start: 0, fraction: 0.5, paid: false },
    { id: priya, cents: 4800, start: 0.5, fraction: 0.48, paid: false },
    { id: lee, cents: 200, start: 0.98, fraction: 0.02, paid: false },
  ];

  test("picks the arc under a tap on its band, measured clockwise from 12 o'clock", () => {
    expect([arcAt(all, 80, 0), arcAt(all, 0, 80), arcAt(all, -80, 0)]).toEqual([sam, priya, priya]);
  });

  test("keeps a few px of slack past the band and ignores the hole and the far side of the band", () => {
    expect([arcAt(all, 90, 0), arcAt(all, 91, 0), arcAt(all, 0, 0), arcAt(all, 30, 0)]).toEqual([sam, null, null, null]);
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
    { id: b, cents: 4900, start: 0, fraction: 0.49, paid: false },
    { id: a, cents: 100, start: 0.49, fraction: 0.01, paid: false },
    { id: c, cents: 5000, start: 0.5, fraction: 0.5, paid: false },
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
