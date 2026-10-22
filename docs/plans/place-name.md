# Place name plan

One PR. The scan already reads the business name, and home says "I paid $51.30 at Dinefine Restaurant." (a79d408). The name stays in the home draft and is lost on Create. This PR keeps it on the Split, so the Split page and Recent splits can show it. It also empties every device's Recent splits list once.

## Behavior

1. **Home: edit the place.** When the scan read a place, the place word in "I paid $X at <place>." can be tapped. A tap turns it into an inline text field, the same pattern as the "your name" field. Enter or blur commits the edit. An empty field removes the place, and the sentence goes back to "I paid $X." When the scan read no place, the sentence stays "I paid $X." with no "at" and no add affordance, as it is today. Limit input to the 32 characters `placeOfReply` already uses.
2. **Create keeps it.** The create request sends the place, and the Split stores it as an optional `place` string. Splits made before this PR have no place, and everything treats them as they are today. A by-hand Split has no place.
3. **Split page shows it, read-only.** Show the place on the Split page where it names the Split (read `src/ui/split-view/header.tsx` and `intro.tsx` and pick the spot that fits B2). Nobody edits it there. A Split with no place looks exactly as it does today.
4. **Recent splits show it.** A row with a place reads `Dinefine Restaurant` on the first line and `Today · With Sam and Ana` on the second. A row with no place keeps today's `With Sam and Ana` over `Today · 3 people`. The row's aria-label includes the place. Rows keep their fixed height (`sizes.row` in `src/ui/recent-splits.tsx`), so both lines stay `numberOfLines={1}`.
5. **Clear Recent splits for everyone, once.** Recent entries live only in each browser's localStorage (`src/device.ts`). Version the stored `recent` entry, so an entry written before this PR fails to parse and is removed the first time `recentSplits` or `noteSplit` runs. Keep `creatorSecret`, `me` and `payWith`: those make an open Split still work. A record that held only `recent` is deleted. Splits on the server are not touched, so shared links keep working. Opening a Split again lists it again, with its place when it has one.

## Server and data

- `Split` gets `readonly place?: string`. Do not bump `schemaVersion`. The field is optional, and Splits without it parse unchanged.
- Parse `place` with `maybe` in `newSplit` (`src/core/parse.ts`) and in `splitFields`, with the same text rules as names, at most 64 characters. Reject longer or empty values.
- Pass it through `createSplit` and the worker's create path (`worker/create.ts`). Check that the Split's byte budget and the HMAC-signed id are unaffected.
- `noteSplit` copies `split.place` into the Recent entry, and `RecentSplit` exposes it.
- Before committing to the data shape, the owner asks a short-lived Opus advisor (rule in `.claude/memory/model-choice.md`).

## Out of scope

Editing the place on the Split page. Reading the place on device (OCR-only reads). Any change to the scan prompt.

## Checks

- [x] Unit: parse accepts a Split with and without `place`, rejects an empty or a 65-character one. Create round-trips the place.
- [x] Unit (`src/device.test.ts`): an old-format Recent entry is dropped, its `creatorSecret`/`me`/`payWith` survive, and a record holding only `recent` is deleted. A new entry lists with its place.
- [x] Unit: `historyCopy` row text with and without a place.
- [x] Unit (`src/draft.test.ts`): editing the place, and clearing it.
- [x] Live (`verify-receipt-splitter`, 390x844, light and dark): home with the read place, the place being edited, the Split page with the place, Recent splits with a mixed list.
- [x] `npm run typecheck`, lint and unit tests pass. CI runs the full e2e.
