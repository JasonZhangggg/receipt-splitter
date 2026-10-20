import type { Shares } from "../../core/shares";
import type { ParticipantId } from "../../core/split";

/** One person's arc of the ring. `start` and `fraction` are parts of one full turn, which is the whole Total. */
export type Slice = { readonly id: ParticipantId; readonly cents: number; readonly start: number; readonly fraction: number };

/**
 * Shares plus the unclaimed rest add up to the Total, so the full ring is the Total. Each person's Share is an arc in chip order from the top, turned so `first`'s
 * arc starts there; the unclaimed rest has no arc of its own, it is the track left showing after the last one. A $0.00 Share gets no arc.
 */
export function slices({ shares, unclaimed }: Pick<Shares, "shares" | "unclaimed">, first: ParticipantId | null = null): Slice[] {
  const total = shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total;
  const at = Math.max(0, shares.findIndex(({ participantId }) => participantId === first));
  let before = 0;
  return [...shares.slice(at), ...shares.slice(0, at)]
    .filter(({ share }) => share > 0)
    .map(({ participantId, share }) => {
      const slice = { id: participantId, cents: share as number, start: before / total, fraction: share / total };
      before += share;
      return slice;
    });
}

/** `check` is the width of a paid arc's check disc, which sits on the ring and stands `bleed` px past its edge. */
export const ring = { size: 168, thickness: 8, gap: 4, check: 19, bleed: 6 } as const;

/** The draw-in is one clockwise sweep. An arc starts when the sweep reaches its start, so the last one begins within this many ms and equal arcs of a dozen people still begin 30 ms apart or more. */
const sweepFor = 420;

/**
 * The ring's mount timing on the web. The Payments sheet takes about 300 ms to arrive; the arcs wait `sheetArrives` for it so the ring draws on a sheet that has
 * landed. A check pops in `checkAfterDraw` after its arc starts drawing, as the 620 ms draw settles, and takes `checkIn`; one that arrives after its arc has
 * drawn, from a payment, pops in at once.
 */
export const ringMotion = { sheetArrives: 200, checkAfterDraw: 560, checkIn: 300 } as const;

export type Arc = { id: ParticipantId; dash: string; offset: number; delay: number };

/**
 * Each arc is a stroked circle cut to its length, so a full ring and a sliver draw the same way. Round caps stand half a stroke past each end, so the cut takes the
 * stroke off too: neighbors then leave `ring.gap` px of clear track between their caps. One arc alone has no gap to leave. `delay` is when its draw-in starts.
 */
export function arcs(all: readonly Slice[]): Arc[] {
  const radius = (ring.size - ring.thickness) / 2;
  const length = 2 * Math.PI * radius;
  const trim = all.length > 1 ? ring.gap + ring.thickness : 0;
  return all.map(({ id, start, fraction }) => ({
    id,
    dash: `${Math.max(0, fraction * length - trim)} ${length}`,
    offset: -(start * length + trim / 2),
    delay: Math.round(start * sweepFor),
  }));
}

/** A paid arc's check: a disc centered on the middle of the arc's paint, as an offset from the ring's center. */
export type Check = { id: ParticipantId; x: number; y: number };

/** Where the checks go: one on each arc `paid` says is paid, unless its paint is shorter than the disc, so a sliver keeps its plain arc. */
export function checks(all: readonly Slice[], paid: (id: ParticipantId) => boolean): Check[] {
  const radius = (ring.size - ring.thickness) / 2;
  const trim = all.length > 1 ? ring.gap + ring.thickness : 0;
  return all
    .filter(({ id, fraction }) => paid(id) && fraction * 2 * Math.PI * radius - trim >= ring.check)
    .map(({ id, start, fraction }) => {
      const turn = 2 * Math.PI * (start + fraction / 2);
      return { id, x: radius * Math.sin(turn), y: -radius * Math.cos(turn) };
    });
}

/** When the last check has popped in as the ring mounts, in ms: the last checked arc's draw-in start, then its pop. All paid waits for this. */
export function checksLandBy(all: readonly Slice[], paid: (id: ParticipantId) => boolean): number {
  const checked = new Set(checks(all, paid).map(({ id }) => id));
  const last = Math.max(0, ...arcs(all).filter(({ id }) => checked.has(id)).map(({ delay }) => delay));
  return ringMotion.sheetArrives + last + ringMotion.checkAfterDraw + ringMotion.checkIn;
}

/** The tick inside a disc: the app's check glyph (icon-glyphs.ts) on its 24-unit grid, drawn 11 px across at the 1.9 px weight that reads at that size. */
export const tickPath = "m4.5 12.75 6 6 9-13.5";
export const tickScale = 11 / 24;
export const tickWeight = 1.9;

/**
 * The ring's shapes as SVG markup in a `ring.size` square: a faint full track, the arcs from 12 o'clock clockwise, then a check disc on each paid arc, which
 * reaches `ring.bleed` past the square. `paint` gives an arc's color; `tick` gives the color of the tick on its disc, or null for an arc without one.
 */
export function ringMarkup(all: readonly Slice[], paint: (id: ParticipantId) => string, track: string, tick: (id: ParticipantId) => string | null = () => null): string {
  const { size, thickness } = ring;
  const middle = size / 2;
  const radius = (size - thickness) / 2;
  const arc = arcs(all)
    .map(({ id, dash, offset }) => `<circle cx="${middle}" cy="${middle}" r="${radius}" fill="none" stroke="${paint(id)}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"/>`)
    .join("");
  const marks = checks(all, (id) => tick(id) !== null)
    .map(({ id, x, y }) => {
      const [cx, cy] = [middle + x, middle + y];
      return `<circle cx="${cx}" cy="${cy}" r="${ring.check / 2}" fill="${paint(id)}"/><path d="${tickPath}" fill="none" stroke="${tick(id)}" stroke-width="${tickWeight / tickScale}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx - 12 * tickScale} ${cy - 12 * tickScale}) scale(${tickScale})"/>`;
    })
    .join("");
  return `<circle cx="${middle}" cy="${middle}" r="${radius}" fill="none" stroke="${track}" stroke-width="${thickness}"/><g transform="rotate(-90 ${middle} ${middle})">${arc}</g>${marks}`;
}

/** How far past an arc's band a tap still picks it, and the shortest stretch of ring, in px along its middle, that any arc answers to, so a 1% sliver is still tappable. */
const hitSlack = 6;
const hitMinimum = 28;
/** A tap this close to the ends of an arc's own paint, in px, is left to the widened rule, so a neighbor's edge is not claimed by the wrong arc. */
const hitEdge = 2;

/**
 * The arc a tap lands on, from the tap's offset from the ring's center. The band is the arc's stroke widened by `hitSlack`; around the ring an arc answers from its
 * start to its end, or over `hitMinimum` px if it is shorter. A tap inside an arc's own painted span, past `hitEdge` px from its ends, always picks that arc, so a sliver
 * cannot take a neighbor's paint. Elsewhere, where widened arcs overlap, the one whose middle is nearer wins. The track gap and the hole pick nothing.
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
