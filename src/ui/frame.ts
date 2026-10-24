import { breakpoints } from "./theme";

/** The space left and right of the wide layout's frame. */
export const frameGutter = 48;

/** The wide layout of the Split page and home: a 680 px main column and a column beside it, centered in the window as one frame. Under 1280px the column and the gap between them narrow so the main column keeps room. */
export const frameFor = (width: number) => {
  const roomy = width >= breakpoints.roomyFrom;
  const column = roomy ? 420 : 380;
  const gap = roomy ? 112 : 56;
  const inner = Math.min(width - 2 * frameGutter, 680 + gap + column);
  return { column, gap, inner, clearRight: (width - inner) / 2 + column + gap };
};
