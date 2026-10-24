// theme.ts installs the document stylesheet while it loads, so the values are written here rather than read from its motion tokens.
const easeOut = "cubic-bezier(.23, 1, .32, 1)";

/**
 * Home's reading words (docs/design/b2/home-sentence/R1Words.dc.html). Each step word rolls over like a counter: the new word comes up from below
 * as the one it replaced lifts away. The leaving word is drawn by ::before from data-step-from, so it is never text a test or a screen reader sees,
 * and it rests at opacity 0 once its animation ends. The step word clips it to its own width, so a longer word leaving never covers the words after it. A transform needs a box, so the step word is inline-block and moves to the next line whole.
 * Reduced motion only fades the new word in.
 */
export const sentenceCss = `
[data-step-in] { animation: rs-step-in 320ms ${easeOut}; }
@keyframes rs-step-in { from { opacity: 0; filter: blur(2px); } to { opacity: 1; filter: none; } }
[data-step-roll] { display: inline-block; position: relative; clip-path: inset(-0.5em 0); }
[data-step-roll-in] { display: inline-block; animation: rs-roll-in 280ms ${easeOut}; }
[data-step-roll][data-step-from]::before { content: attr(data-step-from); content: attr(data-step-from) / ""; position: absolute; left: 0; top: 0; white-space: nowrap; pointer-events: none; opacity: 0; animation: rs-roll-out 200ms ${easeOut}; }
@keyframes rs-roll-in { from { opacity: 0; transform: translateY(0.45em); } to { opacity: 1; transform: none; } }
@keyframes rs-roll-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-0.45em); } }
@keyframes rs-fade { from { opacity: 0; } to { opacity: 1; } }
@supports not (field-sizing: content) { input[data-underline] { width: calc(var(--chars) * 1ch + 4px); } }
@media (prefers-reduced-motion: reduce) {
  [data-step-in], [data-step-roll-in] { animation: rs-fade 150ms ease; }
  [data-step-roll][data-step-from]::before { content: none; }
}`;
