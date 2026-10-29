import type { ParticipantId } from "../../core/split";
import { useReducedMotion } from "../motion";
import { motion } from "../theme";
import { arcAt, arcs, rest, ring, ringMotion, type Slice } from "./donut-model";

type Props = {
  slices: readonly Slice[];
  paint: (id: ParticipantId) => string;
  /** The color of the unclaimed rest. */
  rested: string;
  /** The selected person, whose arc stands out from the ring, or null for none. */
  lifted?: ParticipantId | null;
  /** Everyone has paid: the gaps close into one unbroken ring. */
  closed?: boolean;
  /** A tap on an arc. The ring stays hidden from assistive tech; the rows are the accessible control. */
  onPick?: (id: ParticipantId) => void;
};

const middle = ring.size / 2;
const radius = (ring.size - ring.thickness) / 2;
const length = 2 * Math.PI * radius;
const { sheetArrives, settle, close } = ringMotion;
const recolorFor = 200;

// Each arc grows from nothing to the length its style gives it, so a claim landing mid-draw retargets the end of the sweep instead of restarting it.
const draw = `@keyframes ring-draw{from{stroke-dasharray:0 ${length};opacity:0}15%{opacity:1}}`;
const moves = (cut: number) => `stroke ${recolorFor}ms ${motion.easeOut}, r ${settle}ms ${motion.easeOut}, stroke-dasharray ${cut}ms ${motion.easeOut}, stroke-dashoffset ${cut}ms ${motion.easeOut}`;

/**
 * Real SVG. As it mounts one sweep draws the ring from 12 o'clock, each arc fading in as the sweep reaches it. After that every change is a transition, so it retargets
 * mid-flight: a payment recolors its arc and slides the arcs to their new places, and picking someone eases their arc out and the last one back in. When the last
 * person pays, the gaps close more slowly into one unbroken ring as All paid rises in the middle. Reduced motion
 * shows the ring whole and changes it at once. The unclaimed rest is one more arc, in a lighter gray, with no ring behind. The selected arc stands past the
 * square, so the SVG lets it overflow.
 */
export function DonutRing({ slices, paint, rested, lifted = null, closed = false, onPick }: Props) {
  const left = rest(slices);
  const reduce = useReducedMotion();
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
      <g transform={`rotate(-90 ${middle} ${middle})`}>
        {[...arcs(slices, lifted, closed).map((arc) => ({ ...arc, key: arc.id as string, color: paint(arc.id) })), ...(left ? [{ ...left, key: "rest", color: rested }] : [])].map(({ key, color, r, dash, offset, draw }) => (
          <circle
            key={key}
            cx={middle}
            cy={middle}
            r={r}
            fill="none"
            strokeWidth={ring.thickness}
            strokeLinecap="round"
            style={{
              r,
              stroke: color,
              strokeDasharray: dash,
              strokeDashoffset: offset,
              ...(reduce ? {} : { transition: moves(closed ? close : settle), animation: `ring-draw ${draw.duration}ms ${draw.easing} ${sheetArrives + draw.delay}ms both` }),
            }}
          />
        ))}
      </g>
    </svg>
  );
}
