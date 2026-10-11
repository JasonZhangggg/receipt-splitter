import type { Shares } from "../../core/shares";
import type { ParticipantId } from "../../core/split";

/** One piece of the ring: a person's Share, or the unclaimed rest (`id` null). `start` and `fraction` are parts of one full turn. */
export type Slice = { readonly id: ParticipantId | null; readonly cents: number; readonly start: number; readonly fraction: number };

/**
 * Shares plus the unclaimed rest add up to the Total, so the slices fill the ring. They run in chip order from the top, the unclaimed rest last.
 * A $0.00 Share and an unclaimed $0.00 get no slice.
 */
export function slices({ shares, unclaimed }: Pick<Shares, "shares" | "unclaimed">): Slice[] {
  const parts = [...shares.map(({ participantId, share }) => ({ id: participantId as ParticipantId | null, cents: share as number })), { id: null, cents: unclaimed.total as number }].filter(
    ({ cents }) => cents > 0,
  );
  const whole = parts.reduce((sum, { cents }) => sum + cents, 0);
  let before = 0;
  return parts.map(({ id, cents }) => {
    const slice = { id, cents, start: before / whole, fraction: cents / whole };
    before += cents;
    return slice;
  });
}

export const ring = { size: 140, thickness: 14, gap: 2 } as const;

/** Each slice is a stroked circle cut to its length, so a full ring and a sliver draw the same way. A gap of `ring.gap` px sits between neighbors, and none when one slice fills the ring. */
export function arcs(all: readonly Slice[]): { id: ParticipantId | null; dash: string; offset: number }[] {
  const radius = (ring.size - ring.thickness) / 2;
  const length = 2 * Math.PI * radius;
  const gap = all.length > 1 ? ring.gap : 0;
  return all.map(({ id, start, fraction }) => ({
    id,
    dash: `${Math.max(0, fraction * length - gap)} ${length}`,
    offset: -(start * length + gap / 2),
  }));
}

/** The ring's shapes as SVG markup in a `ring.size` square, drawn from 12 o'clock clockwise. `paint` gives a slice's color. */
export function ringMarkup(all: readonly Slice[], paint: (id: ParticipantId | null) => string): string {
  const { size, thickness } = ring;
  const circles = arcs(all)
    .map(({ id, dash, offset }) => `<circle cx="${size / 2}" cy="${size / 2}" r="${(size - thickness) / 2}" fill="none" stroke="${paint(id)}" stroke-width="${thickness}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"/>`)
    .join("");
  return `<g transform="rotate(-90 ${size / 2} ${size / 2})">${circles}</g>`;
}
