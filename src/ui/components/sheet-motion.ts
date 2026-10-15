const decelerationRate = 0.998;

export function project(velocity: number): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

const pullAt = 40;
const closeAt = 0.5;

export type Release = "down" | "up" | "stay";

/** Where a released sheet goes, from how far below its rest it is (px), its speed (px/s, down is positive) and its visible height. */
export function releaseIntent(travel: number, velocity: number, visible: number): Release {
  const projected = travel + project(velocity);
  if (projected > visible * closeAt) return "down";
  if (travel <= 0 && projected < -pullAt) return "up";
  return "stay";
}

/** A pull down past this many px below the rest snap, after the release's momentum, closes a snapping sheet. */
export const closeDistance = 110;
export const snapAt = 40;
/** The share of the screen a sheet fills at its tall snap. */
export const tallShare = 0.94;
/** A sheet leaves in about this long. */
export const leaveMs = 300;

/** On easeOut the first frame covers about 0.23 of the distance at 300 ms, so a tall sheet leaves slower to keep that frame under e2e/motion.ts's 140 px step. */
export function leaveFor(distance: number): number {
  return Math.round(Math.max(leaveMs, Math.abs(distance) * 0.55));
}

export type Snap = "close" | "tall" | "rest" | "stay";

/** Where a released snapping sheet goes, from how far it is below the rest snap (px, negative above it), its speed (px/s, down is positive), whether it started tall and how far tall sits above rest. Like a detent, a pull down from tall lands at rest; only a pull past `closeDistance` below rest closes. */
export function snapFor(fromRest: number, velocity: number, tall: boolean, tallAbove: number): Snap {
  const projected = fromRest + project(velocity);
  if (projected > closeDistance) return "close";
  if (tall && projected + tallAbove > snapAt) return "rest";
  if (!tall && projected < -snapAt) return "tall";
  return "stay";
}

const recentMs = 100;
const heldMs = 80;
const fastest = 3000;

export function releaseVelocity(samples: readonly { y: number; t: number }[], at: number): number {
  const recent = samples.filter(({ t }) => at - t <= recentMs);
  const first = recent[0];
  const last = recent.at(-1);
  if (!first || !last || at - last.t > heldMs || last.t <= first.t) return 0;
  return Math.max(-fastest, Math.min(fastest, ((last.y - first.y) / (last.t - first.t)) * 1000));
}

/** Under reduced motion a sheet's content cross-fades for this long instead of moving. */
export const reducedFade = 150;

export const glide = { ms: 300, shortest: 150, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };
const startSlope = 0.72 / 0.32;

/** A glide of `distance` px whose first frames match a finger moving `velocity` px/s toward the target. */
export function glideFor(distance: number, velocity: number): number {
  if (velocity <= 0) return glide.ms;
  return Math.round(Math.min(glide.ms, Math.max(glide.shortest, ((startSlope * Math.abs(distance)) / velocity) * 1000)));
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
