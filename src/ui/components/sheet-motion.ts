const decelerationRate = 0.998;

export function project(velocity: number): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function snapTarget(position: number, velocity: number, collapsedAt: number): 0 | 1 {
  return position + project(velocity) > collapsedAt / 2 ? 1 : 0;
}

type Spring = { response: number; damping: number };

export const sheetSpring: Spring = { response: 0.3, damping: 0.8 };

export function animateSpring(from: number, to: number, velocity: number, onFrame: (value: number) => void, onDone: () => void, { response, damping } = sheetSpring) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const friction = 4 * Math.PI * damping / response;
  let value = from;
  let speed = velocity;
  let last = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    speed += (-stiffness * (value - to) - friction * speed) * dt;
    value += speed * dt;
    if (Math.abs(value - to) < 0.5 && Math.abs(speed) < 5) {
      onFrame(to);
      onDone();
      return;
    }
    onFrame(value);
    frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}
