# Home page, round 5: white page, gray surfaces, black action

This is a throwaway prototype. Nothing here is committed. Each idea is one static HTML file rendered by Playwright in Chromium, not the Expo app.

The operator asked for a pure white page in light mode, like his book-app reference. The reference has very light gray surfaces with no borders, one geometric sans at regular and medium weights, small gray labels, pill chips on light gray, a near-black primary button, and almost no color. This round changes only the look. The three layouts keep round 4's structure, content, words, and states.

## Files

- `ideas.png` is the contact sheet. Each idea has a row of seven shots.
- `idea1.html`, `idea2.html`, and `idea3.html` are the sources. Open one with `?s=empty|reading|read|ready|link&t=light|dark`. Widths of 900 px and up get the desktop layout. Each keeps the Figma `html-to-design/capture.js` tag in `<head>`.
- `shared.css` holds the new tokens and type. `shared.js` is unchanged from round 4.
- `shots/` holds all 27 screenshots, named `idea<n>-<state>-<width>-<theme>.png`. A `-fold` suffix is the 390 by 844 first screen (1280 by 820 on desktop). No suffix is the full page.
- `fonts/` holds the two font files and `OFL.txt`.
- `capture.mjs`, `words.mjs`, `audit.mjs`, and `sheet.mjs` are round 4's scripts, pointed at this folder and the new font. `audit.json` is the latest audit output.

The reference image (`images/6.png`) was never saved to disk. I worked from the root agent's written description of it, plus references 4 and 5.

## Font

Plus Jakarta Sans by Tokotype, weights 400 and 500, Latin subset as WOFF2. It is licensed under the SIL Open Font License 1.1, and `fonts/OFL.txt` is the license file from the package. The files come from npm `@fontsource/plus-jakarta-sans@5.3.0`. The font has `tnum`, so prices and totals keep tabular figures.

I picked it over Manrope and Outfit because its round, open geometric shapes are closest to the reference's headline. It also stays readable at 13 to 15 px in gray. Archivo SemiCondensed Bold is gone. Nothing on the page goes above weight 500.

| Use | Size and weight |
| --- | --- |
| Upload headline (ideas 1 and 2) | 28 px, 400, tracking -0.02em |
| Upload headline (idea 3) | 20 px, 500 |
| Total amount | 28 px, 500, tracking -0.02em |
| Wordmark | 18 px, 500 |
| Merchant name | 17 px, 500 |
| Body, items, inputs | 16 px, 400 |
| Action and button labels | 16 px, 500 |
| Chips | 15 px, 500 |
| Secondary text | 13 to 15 px, 400, muted |

## Tokens

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--field` | Page | `#FFFFFF` | `#121315` |
| `--paper` | Surface: cards, fields, chips, file row, drop zone | `#F5F6F7` | `#1C1D20` |
| `--inset` | Control on a surface: camera circle, replace button, Browse, flagged price box | `#FFFFFF` | `#2A2B2F` |
| `--ink` | Text, icons | `#111214` | `#F2F2F3` |
| `--muted` | Secondary text, placeholders | `#696D74` | `#A0A3A9` |
| `--hairline` | Dividers, outlined chips and buttons | `#E3E5E8` | `#2F3135` |
| `--action` | Primary button | `#111214` | `#F2F2F3` |
| `--on-action` | Primary button label | `#FFFFFF` | `#111214` |
| `--off` | Blocked action | `#EEEFF1` | `#26272B` |
| `--flag-wash` | Yellow highlighter behind a flagged price | `#FFEF9E` | `#463A0C` |
| `--flag` | Text and ring on the highlighter | `#5A4500` | `#FFE27A` |
| `--bar` | Frosted action bar | white at 86% | `#121315` at 86% |
| `--dash` (idea 3) | Dashed zone edge | `#878B92` | `#6B6F76` |
| `--sheet` (idea 2) | Bottom sheet | `#FFFFFF` | `#1C1D20` |
| `--sheet-in` (idea 2) | Fields and chips in the sheet | `#F5F6F7` | `#2A2B2F` |

The dark ladder mirrors the light one. In light, the page is white, surfaces are one step darker, and a control on a surface goes back to white, as the reference's white "Read Now" button does on its gray card. In dark, the page is the darkest step and each layer up is lighter. All grays are neutral, with no warm tint.

Orange is not used anywhere. The reference has no accent color, and the yellow highlighter already marks the one thing that needs attention. Dropping orange keeps that highlight as the only color on the page.

Other changes to the look:

- The primary action is a 54 px black pill (white pill in dark). Copy is a gray pill next to it.
- Idea 1's card lost its warm drop shadow and is now flat gray.
- Idea 2's sheet is white with a 1 px hairline and a soft neutral shadow. On desktop the same panel gets a hairline all around.
- Idea 3's dashed edge went from 2 px to 1.5 px.
- Radii are a little smaller: cards 20 to 28 px, fields 14 px.
- Icons use a 1.5 stroke.

## Contrast

`audit.mjs` ran over every idea, both widths, both themes, and all five states (60 pages). No page has text below WCAG AA or a target under 44 by 44 px.

| Pair | Light | Dark |
| --- | --- | --- |
| Ink on page | 18.74 | 16.62 |
| Ink on surface | 17.32 | 15.06 |
| Ink on inset | 18.74 | 12.64 |
| Muted on page | 5.20 | 7.35 |
| Muted on surface | 4.80 | 6.67 |
| Muted on inset (dark sheet fields) | 5.20 | 5.59 |
| Action label on action | 18.74 | 16.75 |
| Flag text on highlighter | 7.91 | 8.77 |
| Blocked action label on off (not required, measured anyway) | 4.52 | 5.90 |
| Dashed edge on zone (non-text, needs 3:1) | 3.16 | 3.34 |

The lowest text ratio the audit found is 4.80 in light (muted text on the gray surface) on every idea. In dark the lowest is 6.67 for ideas 1 and 3 and 5.59 for idea 2 (muted placeholder in a sheet field).

Two surface steps are deliberately faint and carry no meaning on their own. The surface on white is 1.08:1 and the hairline on white is 1.26:1. Every control on them is named by its own text or icon, so WCAG 1.4.11 does not apply to the fill. This is the reference's look. Idea 1's card and idea 3's file row are the places where that faint step shows the most.

## Word count on the empty phone screen

`words.mjs` gives the same counts as round 4.

| Idea | Words | What they are |
| --- | --- | --- |
| 1. Centered card | 15 | Receipt Splitter, Add receipt, Photo or PDF, V, Venmo, Me, Add, Create split link, @username |
| 2. Open table | 16 | The same as idea 1, plus Example |
| 3. Drop zone | 17 | Receipt Splitter, Tap to add receipt, Photo or PDF, V, Venmo, Me, Add, Create split link, @username |

## The three ideas in the new look

- **1. Centered card.** This is the closest match to the reference. A flat gray card with a white camera circle and a 28 px regular headline matches its search field and book card. The gap between the names and the action on a tall phone is more visible on white than it was on the warm field.
- **2. Open table.** This idea changed the most. The gray slip on white is quieter than the paper slip on the warm field, so the black camera button now does most of the work, and it is the only black thing on the empty page apart from the Venmo glyph. The white sheet needs a hairline and a shadow to separate from the white page, which makes it the one layout with real elevation. That fits the reference less well.
- **3. Drop zone.** This is the closest match to references 4 and 5. The gray zone with a fine dashed edge, the white upload circle, and the gray file row look like the clean upload screens the operator liked. Of the three, the read state reads best on white, because the file row and the receipt card are two gray blocks with the same edge.

## Recommendation

I still recommend idea 3, the drop zone, and the new look makes the case stronger.

- The white page, gray surfaces, and black pill are close to references 4 and 5, which were upload screens. Idea 3 is the only layout built from those screens, so the look and the layout now come from the same source.
- On white, the dashed edge is the one thing that marks the zone as a drop target. Ideas 1 and 2 rely on a faint 1.08:1 surface step, or a shadow, to show where to tap.
- The round 4 grafts still apply. Use idea 2's blank slip in place of the upload arrow, and give the file row's thumbnail the slip's torn edge. In this look the slip should be a white `--inset` shape inside the gray zone, so it reads without a shadow.

Idea 1 is a close second. It matches the book-app reference most directly and needs the least work. If the operator prefers a calmer page with no dashed line, take idea 1, and fill the gap above the action by moving the action up to sit under the names on tall phones.

## Open from round 4, unchanged

- "The photo stays on this phone" and "Type it in instead" are still off the empty page.
- Accepting a PDF is still a scope addition the root must raise with the operator.
- Motion is specified in round 4's `ideas.md` and not built. The one change is that blocked to enabled moves from `--off` gray to black over 180 ms ease, not to orange.
