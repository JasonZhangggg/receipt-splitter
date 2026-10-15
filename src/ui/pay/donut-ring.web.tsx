import type { ParticipantId } from "../../core/split";
import { useReducedMotion } from "../motion";
import { motion } from "../theme";
import { arcs, ring, type Slice } from "./donut-model";

type Props = { slices: readonly Slice[]; paint: (id: ParticipantId) => string; track: string };

const middle = ring.size / 2;
const radius = (ring.size - ring.thickness) / 2;
const length = 2 * Math.PI * radius;
const drawFor = 620;
const recolorFor = 200;

// Each arc grows from nothing to the length its style gives it, so a claim landing mid-draw retargets the end of the sweep instead of restarting it.
const draw = `@keyframes ring-draw{from{stroke-dasharray:0 ${length};opacity:0}15%{opacity:1}}`;

/**
 * Real SVG. As it mounts the arcs draw in one after another from 12 o'clock, each fading in as it starts. Choosing another person recolors by transition, so a pick
 * mid-draw changes color without touching the sweep. Reduced motion shows the ring whole and recolors at once.
 */
export function DonutRing({ slices, paint, track }: Props) {
  const reduce = useReducedMotion();
  return (
    <svg aria-hidden width={ring.size} height={ring.size} viewBox={`0 0 ${ring.size} ${ring.size}`} style={{ display: "block", flexShrink: 0, pointerEvents: "none" }}>
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
              ...(reduce ? {} : { transition: `stroke ${recolorFor}ms ${motion.easeOut}`, animation: `ring-draw ${drawFor}ms ${motion.easeOut} ${delay}ms both` }),
            }}
          />
        ))}
      </g>
    </svg>
  );
}
