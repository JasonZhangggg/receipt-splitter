import { breakpoints } from "./theme";

/** The space left and right of the wide layout's frame. */
export const frameGutter = 48;

/** The wide layout of the Split page and home: a 680 px main column and a column beside it, centered in the window as one frame. Under 1280px the column and the gap between them narrow so the main column keeps room. `room` is the page's width inside its scroll bar and the matching strip on the left, once measured. */
export const frameFor = (width: number, room = width) => {
  const roomy = width >= breakpoints.roomyFrom;
  const column = roomy ? 420 : 380;
  const gap = roomy ? 112 : 56;
  const inner = Math.min(room - 2 * frameGutter, 680 + gap + column);
  return { column, gap, inner, clearRight: (width - inner) / 2 + column + gap };
};
