// theme.ts installs the document stylesheet while it loads, so the values are written here rather than read from its motion tokens.
const easeOut = "cubic-bezier(.23, 1, .32, 1)";

/**
 * Home's reading words (docs/design/b2/home-sentence/R1Words.dc.html). Each step word fades in on an outer span while the inner span sweeps a
 * text gradient; the two animations sit on different elements, so neither overrides the other. Reduced motion keeps plain ink text.
 */
export const sentenceCss = `
[data-step-in] { display: inline-block; animation: rs-step-in 320ms ${easeOut}; }
@keyframes rs-step-in { from { opacity: 0; filter: blur(2px); } to { opacity: 1; filter: none; } }
span[data-shimmer] {
  background: linear-gradient(90deg, var(--ink) 0%, var(--ink) 30%, var(--shimmer) 50%, var(--ink) 70%, var(--ink) 100%);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: rs-sweep 1.8s linear infinite;
}
@keyframes rs-sweep { from { background-position: 100% 0; } to { background-position: -150% 0; } }
[data-app-word]:has(select:focus-visible) { outline: 2px solid var(--focus); outline-offset: 3px; border-radius: 2px; }
@media (prefers-reduced-motion: reduce) {
  [data-step-in] { animation: none; }
  span[data-shimmer] { animation: none; background: none; color: var(--ink); }
}`;
