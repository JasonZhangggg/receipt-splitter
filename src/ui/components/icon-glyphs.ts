type Glyph = { svg: string; motion?: string };

/** Every icon draws with this stroke on screen, in px, whatever its size. B2's mock pairs 1.6 to 2.2 grid strokes with 13 to 19 px icons, which is 1.2 px. */
export const strokePx = 1.2;

/** The `stroke-width` on the 24-unit grid that draws `strokePx` at `size` px. */
export const strokeFor = (size: number) => Math.round((strokePx * 24 * 100) / size) / 100;

const tray =
  '<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5"/><g class="arrow"><path d="M7.5 7.5 12 3m0 0 4.5 4.5M12 3v13.5"/></g>';
const tick = '<path pathLength="1" d="m4.5 12.75 6 6 9-13.5"/>';
const pie =
  '<path d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z"/><path class="slice" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z"/>';
const undo = '<path d="M3 9h12a6 6 0 0 1 0 12h-3"/><g class="head"><path d="M9 15 3 9m0 0 6-6"/></g>';
const rays = ["M12 3v2.25", "M18.36 5.64l-1.59 1.59", "M21 12h-2.25", "M18.36 18.36l-1.59-1.59", "M12 18.75V21", "M7.23 16.77l-1.59 1.59", "M5.25 12H3", "M7.23 7.23 5.64 5.64"];

/** Heroicons outline paths (MIT) on a 24-unit grid. `motion` names the ai-* class that iconCss in ui/icon-css.ts animates. */
export const glyphs = {
  plus: { svg: '<path d="M5 12h14"/><path d="M12 5v14"/>', motion: "plus" },
  minus: { svg: '<path pathLength="1" d="M5 12h14"/>', motion: "minus" },
  x: { svg: '<path pathLength="1" d="M6 6l12 12"/><path pathLength="1" d="M18 6 6 18"/>', motion: "x" },
  check: { svg: tick, motion: "check" },
  tick: { svg: tick, motion: "check" },
  exclaim: {
    svg: '<path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/><g class="mark"><path d="M12 8.25v4.5"/><path d="M12 15.75h.008v.008H12v-.008Z"/></g>',
    motion: "alert",
  },
  trash: {
    svg: '<path class="lid" d="M15.75 5.39V4.48c0-1.18-.91-2.17-2.09-2.2a51.9 51.9 0 0 0-3.32 0c-1.18.03-2.09 1.02-2.09 2.2v.91M3.75 5.96c1.4-.24 2.8-.43 4.5-.57M20.25 5.96c-1.4-.24-2.8-.43-4.5-.57M8.25 5.39a50 50 0 0 1 7.5 0"/><path class="body" d="M14.74 9l-.35 9M9.6 18l-.34-9M19.23 5.79l-1.07 13.88a2.25 2.25 0 0 1-2.24 2.08H8.08a2.25 2.25 0 0 1-2.24-2.08L4.77 5.79"/>',
    motion: "trash",
  },
  share: { svg: tray, motion: "tray" },
  upload: { svg: tray, motion: "tray" },
  arrow: { svg: '<path class="head" d="M13.5 4.5 21 12m0 0-7.5 7.5"/><path class="line" d="M21 12H3"/>', motion: "arrow" },
  person: {
    svg: '<path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>',
  },
  people: {
    svg: '<path d="M15 19.13v-.01c0-1.11-.29-2.16-.79-3.07M15 19.13c-1.86 1.23-4.04 1.87-6.38 1.87s-4.51-.64-6.37-1.77v-.11a6.38 6.38 0 0 1 11.96-3.07M12 6.38a3.38 3.38 0 1 1-6.75 0 3.38 3.38 0 0 1 6.75 0Z"/><path class="second" d="M15 19.13a9.4 9.4 0 0 0 6.75-.58v-.17a4.13 4.13 0 0 0-7.53-2.32M20.25 8.63a2.63 2.63 0 1 1-5.25 0 2.63 2.63 0 0 1 5.25 0Z"/>',
    motion: "users",
  },
  pie: { svg: pie, motion: "pie" },
  // One line forking into two, for splitting an Item into its own lines.
  split: { svg: '<path d="M3 12h4.5c3.5 0 4.5-5.25 9-5.25H21"/><path d="M7.5 12c3.5 0 4.5 5.25 9 5.25H21"/><path d="M18 3.75l3 3-3 3"/><path d="M18 14.25l3 3-3 3"/>' },
  history: { svg: undo, motion: "undo" },
  sun: {
    svg: `<circle cx="12" cy="12" r="3.75"/>${rays.map((d, i) => `<path class="ray" style="--d:${i * 50}ms" d="${d}"/>`).join("")}`,
    motion: "sun",
  },
  moon: {
    svg: '<path d="M21.75 15A9.72 9.72 0 0 1 18 15.75c-5.39 0-9.75-4.37-9.75-9.75 0-1.33.27-2.6.75-3.75A9.75 9.75 0 0 0 3 11.25C3 16.64 7.37 21 12.75 21a9.75 9.75 0 0 0 9-6Z"/>',
    motion: "moon",
  },
  coffee: {
    svg: '<path d="M3 9.75h13.5v4.5a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-6-6v-4.5Z"/><path d="M16.5 11.25h1.5a3 3 0 0 1 0 6h-1.5"/><path d="M7.5 2.25c-.75.75-.75 1.5 0 2.25s.75 1.5 0 2.25"/><path d="M12 2.25c-.75.75-.75 1.5 0 2.25s.75 1.5 0 2.25"/>',
  },
  chevron: { svg: '<path d="m19.5 8.25-7.5 7.5-7.5-7.5"/>' },
  menu: { svg: '<path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>' },
  clock: { svg: '<path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>' },
  receipt: {
    svg: '<path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>',
  },
  bag: {
    svg: '<path d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>',
  },
  copy: {
    svg: '<path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"/>',
  },
  expand: {
    svg: '<path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>',
  },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;

export const glyph = (name: IconName): Glyph => glyphs[name];
