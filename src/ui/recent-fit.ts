/** The heights, in px, that decide how many Recent splits fit: the heading, one row, and the See all link. */
export type RecentSizes = { readonly title: number; readonly row: number; readonly seeAll: number };

/** How many of `total` rows show in `room` px: all of them when they fit, else as many as fit above See all, and none when not even one does. */
export function rowsThatFit(total: number, room: number, { title, row, seeAll }: RecentSizes): number {
  if (title + total * row <= room) return total;
  return Math.min(total, Math.max(0, Math.floor((room - title - seeAll) / row)));
}
