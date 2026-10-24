import { describe, expect, it } from "vitest";

import { clickScale, isNotch, keepCovering, maxScale, rest, scaleAfterWheel, zoomAt } from "./zoom";

const box = { width: 400, height: 600 };

describe("photo zoom", () => {
  it("zooming at a point keeps the photo point under it where it was", () => {
    const next = zoomAt(rest, clickScale, 300, 150, box);
    expect(next).toEqual({ scale: 2.5, x: -450, y: -225 });
    expect((300 - next.x) / next.scale).toBe(300 / 1);
    expect((150 - next.y) / next.scale).toBe(150 / 1);
  });

  it("zooming at the corner of the frame stays pinned there", () => {
    expect(zoomAt(rest, 2, 0, 0, box)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(zoomAt(rest, 2, 400, 600, box)).toEqual({ scale: 2, x: -400, y: -600 });
  });

  it("the scale stays between 1 and the maximum, and zooming out to 1 recentres the photo", () => {
    expect(zoomAt(rest, 99, 200, 300, box).scale).toBe(maxScale);
    const zoomed = zoomAt(rest, 3, 350, 500, box);
    expect(zoomAt(zoomed, 0.2, 350, 500, box)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("a pan cannot move the photo off the frame", () => {
    expect(keepCovering({ scale: 2, x: 50, y: 20 }, box)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(keepCovering({ scale: 2, x: -900, y: -900 }, box)).toEqual({ scale: 2, x: -400, y: -600 });
    expect(keepCovering({ scale: 2, x: -120, y: -300 }, box)).toEqual({ scale: 2, x: -120, y: -300 });
  });

  it("a pinch step of the same size zooms by the same ratio at any scale, and the opposite step undoes it", () => {
    const once = scaleAfterWheel(1, -20);
    expect(scaleAfterWheel(2, -20) / 2).toBeCloseTo(once, 10);
    expect(scaleAfterWheel(once, 20)).toBeCloseTo(1, 10);
  });

  it("a mouse wheel notch reads as a notch, and a trackpad scroll does not", () => {
    expect(isNotch({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe(true);
    expect(isNotch({ deltaX: 0, deltaY: -120, deltaMode: 0 })).toBe(true);
    expect(isNotch({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(true);
    expect(isNotch({ deltaX: 0, deltaY: 4.5, deltaMode: 0 })).toBe(false);
    expect(isNotch({ deltaX: 2, deltaY: 60, deltaMode: 0 })).toBe(false);
  });
});
