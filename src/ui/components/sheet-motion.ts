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

type Spring = { response: number; damping: number };

const sheetSpring: Spring = { response: 0.3, damping: 0.8 };

export function animateSpring(from: number, to: number, velocity: number, onFrame: (value: number) => void, onDone: () => void, { response, damping } = sheetSpring) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const friction = 4 * Math.PI * damping / response;
  let value = from;
  let speed = velocity;
  let last: number | null = null;
  let frame = 0;
  const advance = (dt: number) => {
    speed += (-stiffness * (value - to) - friction * speed) * dt;
    value += speed * dt;
    if (Math.abs(value - to) < 0.5 && Math.abs(speed) < 5) {
      onFrame(to);
      onDone();
      return;
    }
    onFrame(value);
    frame = requestAnimationFrame((now) => {
      const elapsed = last === null ? 1 / 60 : Math.min(0.032, Math.max(0, (now - last) / 1000));
      last = now;
      advance(elapsed);
    });
  };
  advance(1 / 60);
  return () => cancelAnimationFrame(frame);
}
