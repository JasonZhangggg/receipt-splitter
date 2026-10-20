import { useState } from "react";

import type { ParticipantId } from "../../core/split";
import { useReducedMotion } from "../motion";
import { motion } from "../theme";
import { arcAt, arcs, checks, ring, ringMotion, tickPath, tickScale, tickWeight, type Slice } from "./donut-model";

type Props = {
  slices: readonly Slice[];
  paint: (id: ParticipantId) => string;
  track: string;
  /** The tick color on a paid arc's check disc, or null for an arc without one. */
  tick?: (id: ParticipantId) => string | null;
  /** A tap on an arc. The ring stays hidden from assistive tech; the rows are the accessible control. */
  onPick?: (id: ParticipantId) => void;
};

const middle = ring.size / 2;
const radius = (ring.size - ring.thickness) / 2;
const length = 2 * Math.PI * radius;
const drawFor = 620;
const { sheetArrives, checkAfterDraw, checkIn } = ringMotion;
const recolorFor = 200;

// Each arc grows from nothing to the length its style gives it, so a claim landing mid-draw retargets the end of the sweep instead of restarting it.
const draw = `@keyframes ring-draw{from{stroke-dasharray:0 ${length};opacity:0}15%{opacity:1}}@keyframes ring-check{from{transform:scale(.4);opacity:0}}`;

/**
 * Real SVG. As it mounts the arcs draw in one after another from 12 o'clock, each fading in as it starts, and each paid arc's check disc pops in as its arc lands;
 * a check that arrives later, from a payment, pops in at once. Choosing another person recolors by transition, so a pick mid-draw changes color without touching
 * the sweep. Reduced motion shows the ring whole and recolors at once. The discs stand past the square, so the SVG lets them overflow.
 */
export function DonutRing({ slices, paint, track, tick, onPick }: Props) {
  const reduce = useReducedMotion();
  // The checks the ring opens with, each with when it pops in; any other check arrives later and pops in at once.
  const [atMount] = useState(() => {
    const checked = new Set(checks(slices, (id) => (tick?.(id) ?? null) !== null).map(({ id }) => id));
    return new Map(arcs(slices).flatMap(({ id, delay }) => (checked.has(id) ? [[id, sheetArrives + delay + checkAfterDraw] as const] : [])));
  });
  return (
    <svg aria-hidden width={ring.size} height={ring.size} viewBox={`0 0 ${ring.size} ${ring.size}`} style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const scale = ring.size / box.width;
        const id = arcAt(slices, (event.clientX - box.left - box.width / 2) * scale, (event.clientY - box.top - box.height / 2) * scale);
        if (id !== null) onPick?.(id);
      }}
    >
      {reduce ? null : <style>{draw}</style>}
      <circle cx={middle} cy={middle} r={radius} fill="none" stroke={track} strokeWidth={ring.thickness} />
      <g transform={`rotate(-90 ${middle} ${middle})`}>
        {arcs(slices).map(({ id, dash, offset, delay }) => (
          <circle
            key={id}
            cx={middle}
            cy={middle}
            r={radius}
            fill="none"
            strokeWidth={ring.thickness}
            strokeLinecap="round"
            style={{
              stroke: paint(id),
              strokeDasharray: dash,
              strokeDashoffset: offset,
              ...(reduce ? {} : { transition: `stroke ${recolorFor}ms ${motion.easeOut}`, animation: `ring-draw ${drawFor}ms ${motion.easeOut} ${sheetArrives + delay}ms both` }),
            }}
          />
        ))}
      </g>
      {tick
        ? checks(slices, (id) => tick(id) !== null).map(({ id, x, y }) => (
            <Check key={id} x={middle + x} y={middle + y} fill={paint(id)} tick={tick(id) ?? ""} delay={reduce ? null : (atMount.get(id) ?? 0)} />
          ))
        : null}
    </svg>
  );
}

/** A paid arc's check disc. Its pop-in delay is fixed when it first appears, so a later render cannot replay or hurry it; null shows it at once. */
function Check({ x, y, fill, tick, delay }: { x: number; y: number; fill: string; tick: string; delay: number | null }) {
  const [wait] = useState(delay);
  const recolor = wait === null ? undefined : `${recolorFor}ms ${motion.easeOut}`;
  return (
    <g data-check="" style={{ transformBox: "fill-box", transformOrigin: "center", ...(wait === null ? {} : { animation: `ring-check ${checkIn}ms ${motion.easeOut} ${wait}ms both` }) }}>
      <circle cx={x} cy={y} r={ring.check / 2} style={{ fill, transition: recolor && `fill ${recolor}` }} />
      <path
        d={tickPath}
        fill="none"
        strokeWidth={tickWeight / tickScale}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`translate(${x - 12 * tickScale} ${y - 12 * tickScale}) scale(${tickScale})`}
        style={{ stroke: tick, transition: recolor && `stroke ${recolor}` }}
      />
    </g>
  );
}
