# Home, design A

Jason picked design A on 2026-10-24 ("Design a looks good. Lets go with that"). Preference rule 98 records it.

## Spec

- The sentence is the headline: 30 px on a phone, 44 px from 1024 px (`saySizes` in `src/ui/home-sentence/say-size.ts`).
- The total shows only in the sentence. The phone footer holds the reason line and the 50 px Create link pill.
- The payment app's name has a chevron and opens a menu. The menu lists the free apps with a tick on the current one, then "Add a second app" or "Add another app" under a hairline. The ", or add an app" clause is gone.
- Recent splits uses the Split page's section style: "Recent splits" in ink over a hairline, "See all N" in gray at its end, names and amounts at 18 px medium, and "You paid" or "<Host> paid" under each amount.
- From 1024 px home uses the Split page's centered frame (`src/ui/frame.ts`). The sentence and the inline Create pill with its reason sit in the left column, and Recent splits sits in the right. There is no footer bar.

## Proof

- e2e: home, home-review, home-punctuation, scan, audit-polish, history and flash.
- Screenshots of phone and desktop (1100 and 1440), light and dark, empty, filled and with the menu open.
