import { useEffect, useState } from "react";

import type { ParticipantId } from "../../core/split";
import { useReducedMotion } from "../motion";
import { motion } from "../theme";
import { arcs, dimmed, ring, type Slice } from "./donut-model";

type Props = { slices: readonly Slice[]; paint: (id: ParticipantId) => string; track: string; picked: ParticipantId | null };

const sweepFor = 650;
const pickFor = 220;
const middle = ring.size / 2;
const radius = (ring.size - ring.thickness) / 2;
// The picked arc is thicker and grows outward, past the square the ring is laid out in.
const room = ring.picked;
const length = 2 * Math.PI * radius;

/**
 * Real SVG, so a pick moves the arcs by transition: the picked arc thickens and the others dim. As it mounts, the arcs are revealed by a mask that sweeps once
 * around from 12 o'clock. Reduced motion shows the ring whole and changes a pick at once.
 */
export function DonutRing({ slices, paint, track, picked }: Props) {
  const reduce = useReducedMotion();
  const [drawn, setDrawn] = useState(reduce);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const ease = reduce ? "none" : `stroke-width ${pickFor}ms ${motion.easeOut}, opacity ${pickFor}ms ${motion.easeOut}, stroke-dasharray ${pickFor}ms ${motion.easeOut}, stroke-dashoffset ${pickFor}ms ${motion.easeOut}`;
  return (
    <svg aria-hidden width={ring.size} height={ring.size} viewBox={`0 0 ${ring.size} ${ring.size}`} style={{ display: "block", flexShrink: 0, pointerEvents: "none", overflow: "visible" }}>
      <mask id="ring-sweep" maskUnits="userSpaceOnUse" x={-room} y={-room} width={ring.size + room * 2} height={ring.size + room * 2}>
        <circle
          cx={middle}
          cy={middle}
          r={radius}
          fill="none"
          stroke="#fff"
          strokeWidth={ring.picked * 2}
          transform={`rotate(-90 ${middle} ${middle})`}
          style={{ strokeDasharray: `${drawn ? length : 0} ${length}`, transition: reduce ? "none" : `stroke-dasharray ${sweepFor}ms ${motion.easeOut}` }}
        />
      </mask>
      <circle cx={middle} cy={middle} r={radius} fill="none" stroke={track} strokeWidth={ring.thickness} />
      <g mask="url(#ring-sweep)">
        <g transform={`rotate(-90 ${middle} ${middle})`}>
          {arcs(slices, picked).map(({ id, dash, offset, width }) => (
            <circle
              key={id}
              cx={middle}
              cy={middle}
              r={radius}
              fill="none"
              stroke={paint(id)}
              strokeLinecap="round"
              style={{ strokeWidth: width, strokeDasharray: dash, strokeDashoffset: offset, opacity: picked !== null && id !== picked ? dimmed : 1, transition: ease }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
