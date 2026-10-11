import { ring } from "./donut-model";

/** Inline, so the ring paints in the frame the sheet opens in. */
export function DonutRing({ markup }: { markup: string }) {
  return <svg aria-hidden width={ring.size} height={ring.size} viewBox={`0 0 ${ring.size} ${ring.size}`} style={{ display: "block", flexShrink: 0, pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: markup }} />;
}
