import type { Shares } from "../../core/shares";
import type { ParticipantId } from "../../core/split";

/** One person's arc of the ring. `start` and `fraction` are parts of one full turn, which is the whole Total. */
export type Slice = { readonly id: ParticipantId; readonly cents: number; readonly start: number; readonly fraction: number };

/**
 * Shares plus the unclaimed rest add up to the Total, so the full ring is the Total. Each person's Share is an arc from the top: everyone `paid` says has paid
 * first, then everyone else, each group in chip order, so the paid arcs read as one black sweep from 12 o'clock. The unclaimed rest is not a Slice: `rest` draws it
 * after the last one in a lighter gray. A $0.00 Share gets no arc.
 */
export function slices({ shares, unclaimed }: Pick<Shares, "shares" | "unclaimed">, paid: (id: ParticipantId) => boolean = () => false): Slice[] {
  const total = shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total;
  let before = 0;
  return [...shares.filter(({ participantId }) => paid(participantId)), ...shares.filter(({ participantId }) => !paid(participantId))]
    .filter(({ share }) => share > 0)
    .map(({ participantId, share }) => {
      const slice = { id: participantId, cents: share as number, start: before / total, fraction: share / total };
      before += share;
      return slice;
    });
}

/** The selected arc stands `lift` px further out than the rest, so it stands that far past the square. */
export const ring = { size: 168, thickness: 10, gap: 4, lift: 10 } as const;


/**
 * The ring's mount timing on the web. The Payments sheet takes about 300 ms to arrive; the arcs wait `sheetArrives` for it so the ring draws on a sheet that has
 * landed, then one clockwise sweep draws the whole ring in `drawFor`. `settle` is how long an arc takes to move to a new place or radius, when someone pays or another person is picked.
 * `close` is how long the gaps take to close when the last person pays, a slower beat for a moment that comes once.
 */
export const ringMotion = { sheetArrives: 200, drawFor: 700, settle: 240, close: 520 } as const;

/**
 * The sweep's curve. It eases in and out over the whole turn, so it never stalls partway: each arc draws while the sweep crosses its own paint, on its own piece of
 * this one curve, so the tip runs on from one arc to the next at the speed it had.
 */
const sweep = [0.37, 0, 0.63, 1] as const;

const bezier = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
/** How far round the sweep is, as a part of the turn, `t` of the way through its time. */
function swept(t: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (bezier(sweep[0], sweep[2], middle) < t) low = middle;
    else high = middle;
  }
  return bezier(sweep[1], sweep[3], low);
}
/** When the sweep reaches `turn`, as a part of its time. */
function reaches(turn: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (swept(middle) < turn) low = middle;
    else high = middle;
  }
  return high;
}

/** An arc's draw-in, for the paint from `from` to `to` (parts of the turn): it starts `delay` ms in, lasts `duration` ms, and follows `easing`, a CSS `linear()`. */
export type Draw = { delay: number; duration: number; easing: string };
function drawIn(from: number, to: number): Draw {
  const begin = reaches(from);
  const end = Math.max(reaches(to), begin + 1 / ringMotion.drawFor);
  const steps = 10;
  const points = Array.from({ length: steps + 1 }, (_, at) => Math.min(1, Math.max(0, to > from ? (swept(begin + ((end - begin) * at) / steps) - from) / (to - from) : at / steps)));
  return {
    delay: Math.round(begin * ringMotion.drawFor),
    duration: Math.round((end - begin) * ringMotion.drawFor),
    easing: `linear(${points.map((point) => +point.toFixed(3)).join(", ")})`,
  };
}

export type Arc = { id: ParticipantId; r: number; dash: string; offset: number; draw: Draw };

/**
 * Each arc is a stroked circle cut to its length, so a full ring and a sliver draw the same way. Round caps stand half a stroke past each end, so the cut takes the
 * stroke off too: neighbors, the unclaimed rest among them, leave `ring.gap` px of clear space between their caps. One arc alone has no gap to leave. The `lifted` arc sits `ring.lift` px
 * further out on the same turn, its cut scaled to its radius. A `closed` ring, once everyone has paid, takes no gaps, so its arcs meet as one unbroken ring.
 * `draw` is its part of the draw-in sweep.
 */
export function arcs(all: readonly Slice[], lifted: ParticipantId | null = null, closed = false): Arc[] {
  const radius = (ring.size - ring.thickness) / 2;
  const length = 2 * Math.PI * radius;
  const trim = pieces(all) > 1 && !closed ? ring.gap + ring.thickness : 0;
  return all.map(({ id, start, fraction }) => {
    const r = id === lifted ? radius + ring.lift : radius;
    const scale = r / radius;
    return {
      id,
      r,
      dash: `${Math.max(0, fraction * length - trim) * scale} ${2 * Math.PI * r}`,
      offset: -(start * length + trim / 2) * scale,
      draw: drawIn(start + trim / 2 / length, Math.max(start + trim / 2 / length, start + fraction - trim / 2 / length)),
    };
  });
}

/** The part of the turn the Shares leave over: the unclaimed rest of the Total. */
const restOf = (all: readonly Slice[]) => Math.max(0, 1 - all.reduce((sum, { fraction }) => sum + fraction, 0));
const pieces = (all: readonly Slice[]) => all.length + (restOf(all) > 1e-9 ? 1 : 0);

/** The unclaimed rest as one more arc after the last Share, cut like the others, or null when everything is claimed. Nothing claimed at all gives the full ring. */
export function rest(all: readonly Slice[]): Omit<Arc, "id"> | null {
  const fraction = restOf(all);
  if (fraction <= 1e-9) return null;
  const radius = (ring.size - ring.thickness) / 2;
  const length = 2 * Math.PI * radius;
  const start = 1 - fraction;
  const trim = pieces(all) > 1 ? ring.gap + ring.thickness : 0;
  return { r: radius, dash: `${Math.max(0, fraction * length - trim)} ${length}`, offset: -(start * length + trim / 2), draw: drawIn(start + trim / 2 / length, Math.max(start + trim / 2 / length, 1 - trim / 2 / length)) };
}

/** When the ring has drawn in as it mounts, in ms: the sheet's arrival, then the end of the last arc's draw. All paid waits for this. */
export function drawnBy(all: readonly Slice[]): number {
  return ringMotion.sheetArrives + Math.max(0, ...arcs(all).map(({ draw }) => draw.delay + draw.duration));
}

/**
 * The ring's shapes as SVG markup in a `ring.size` square: the arcs from 12 o'clock clockwise, then the unclaimed rest in `rested`, with no ring behind them. The
 * `lifted` arc reaches `ring.lift` past the square, and a `closed` ring has no gaps. `paint` gives an arc's color.
 */
export function ringMarkup(all: readonly Slice[], paint: (id: ParticipantId) => string, rested: string, lifted: ParticipantId | null = null, closed = false): string {
  const { size, thickness } = ring;
  const middle = size / 2;
  const left = rest(all);
  const circle = (color: string, { r, dash, offset }: Omit<Arc, "id">) =>
    `<circle cx="${middle}" cy="${middle}" r="${r}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"/>`;
  const shapes = [...arcs(all, lifted, closed).map((arc) => circle(paint(arc.id), arc)), ...(left ? [circle(rested, left)] : [])].join("");
  return `<g transform="rotate(-90 ${middle} ${middle})">${shapes}</g>`;
}

/** How far past an arc's band a tap still picks it, and the shortest stretch of ring, in px along its middle, that any arc answers to, so a 1% sliver is still tappable. */
const hitSlack = 6;
const hitMinimum = 28;
/** A tap this close to the ends of an arc's own paint, in px, is left to the widened rule, so a neighbor's edge is not claimed by the wrong arc. */
const hitEdge = 2;

/**
 * The arc a tap lands on, from the tap's offset from the ring's center. The band is the arc's stroke widened by `hitSlack`; around the ring an arc answers from its
 * start to its end, or over `hitMinimum` px if it is shorter. A tap inside an arc's own painted span, past `hitEdge` px from its ends, always picks that arc, so a sliver
 * cannot take a neighbor's paint. Elsewhere, where widened arcs overlap, the one whose middle is nearer wins. A gap, the unclaimed rest and the hole pick nothing.
 */
export function arcAt(all: readonly Slice[], dx: number, dy: number): ParticipantId | null {
  const radius = (ring.size - ring.thickness) / 2;
  if (Math.abs(Math.hypot(dx, dy) - radius) > ring.thickness / 2 + hitSlack) return null;
  const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
  const least = hitMinimum / (2 * Math.PI * radius);
  const edge = hitEdge / (2 * Math.PI * radius);
  for (const { id, start, fraction } of all) {
    const into = (turn - start + 1) % 1;
    if (into >= edge && into <= fraction - edge) return id;
  }
  let best: { id: ParticipantId; away: number } | null = null;
  for (const { id, start, fraction } of all) {
    const gap = Math.abs(turn - (start + fraction / 2));
    const away = Math.min(gap, 1 - gap);
    if (away <= Math.max(fraction, least) / 2 && (best === null || away < best.away)) best = { id, away };
  }
  return best?.id ?? null;
}
