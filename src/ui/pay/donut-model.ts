import type { Shares } from "../../core/shares";
import type { ParticipantId } from "../../core/split";

/** One person's arc of the ring. `start` and `fraction` are parts of one full turn, which is the whole Total. */
export type Slice = { readonly id: ParticipantId; readonly cents: number; readonly start: number; readonly fraction: number };

/**
 * Shares plus the unclaimed rest add up to the Total, so the full ring is the Total. Each person's Share is an arc in chip order from the top; the unclaimed rest has
 * no arc of its own, it is the track left showing after the last one. A $0.00 Share gets no arc.
 */
export function slices({ shares, unclaimed }: Pick<Shares, "shares" | "unclaimed">): Slice[] {
  const total = shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total;
  let before = 0;
  return shares
    .filter(({ share }) => share > 0)
    .map(({ participantId, share }) => {
      const slice = { id: participantId, cents: share as number, start: before / total, fraction: share / total };
      before += share;
      return slice;
    });
}

export const ring = { size: 168, thickness: 8, gap: 4 } as const;

/** The draw-in is one clockwise sweep. An arc starts when the sweep reaches its start, so the last one begins within this many ms and equal arcs of a dozen people still begin 30 ms apart or more. */
const sweepFor = 420;

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

/** The ring's shapes as SVG markup in a `ring.size` square: a faint full track, then the arcs from 12 o'clock clockwise. `paint` gives an arc's color. */
export function ringMarkup(all: readonly Slice[], paint: (id: ParticipantId) => string, track: string): string {
  const { size, thickness } = ring;
  const middle = size / 2;
  const radius = (size - thickness) / 2;
  const arc = arcs(all)
    .map(({ id, dash, offset }) => `<circle cx="${middle}" cy="${middle}" r="${radius}" fill="none" stroke="${paint(id)}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"/>`)
    .join("");
  return `<circle cx="${middle}" cy="${middle}" r="${radius}" fill="none" stroke="${track}" stroke-width="${thickness}"/><g transform="rotate(-90 ${middle} ${middle})">${arc}</g>`;
}
