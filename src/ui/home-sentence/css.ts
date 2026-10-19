// theme.ts installs the document stylesheet while it loads, so the values are written here rather than read from its motion tokens.
const easeOut = "cubic-bezier(.23, 1, .32, 1)";

/**
 * Home's reading words (docs/design/b2/home-sentence/R1Words.dc.html). Each step word fades in and rises 3 px. A transform needs a box, so the
 * step word is inline-block and moves to the next line whole. Reduced motion only fades.
 */
export const sentenceCss = `
[data-step-in] { animation: rs-step-in 320ms ${easeOut}; }
@keyframes rs-step-in { from { opacity: 0; filter: blur(2px); } to { opacity: 1; filter: none; } }
[data-step-rise] { display: inline-block; animation: rs-rise 200ms ${easeOut}; }
@keyframes rs-rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
@keyframes rs-fade { from { opacity: 0; } to { opacity: 1; } }
@supports not (field-sizing: content) { input[data-underline] { width: calc(var(--chars) * 1ch + 4px); } }
[data-app-word]:has(select:focus-visible) { outline: 2px solid var(--focus); outline-offset: 3px; border-radius: 2px; }
@media (prefers-reduced-motion: reduce) {
  [data-step-in], [data-step-rise] { animation: rs-fade 150ms ease; }
}`;
