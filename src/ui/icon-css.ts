const spring = "cubic-bezier(.34, 1.56, .64, 1)";
const out = "cubic-bezier(.23, 1, .32, 1)";
const inOut = "cubic-bezier(.77, 0, .175, 1)";

/** Motions of docs/design/b2/split.dc.html. icon.web.tsx sets data-play for a replay. Tick and warning play on mount when icon.web.tsx marks them data-appear, which it does only for icons mounted after the first press or key, so ticks already on screen never animate. */
export const iconCss = `
.ai { overflow: visible; }
.ai * { transform-box: fill-box; transform-origin: center; }
.ai-x path, .ai-minus path, .ai-check path { stroke-dasharray: 1 1; }
@media (prefers-reduced-motion: no-preference) {
  .ai-x[data-play] path, .ai-minus[data-play] path { animation: ai-draw 300ms ${out} both; }
  .ai-x[data-play] path + path { animation-delay: 110ms; }
  .ai-plus[data-play] { animation: ai-spin 460ms ${spring}; }
  .ai-trash[data-play] .lid { transform-origin: 90% 100%; animation: ai-lid 360ms ${spring}; }
  .ai-trash[data-play] .body { animation: ai-sink 360ms ${spring}; }
  .ai-undo[data-play] { animation: ai-rewind 560ms ${spring}; }
  .ai-undo[data-play] .head { transform-origin: left center; animation: ai-stretch 450ms ${inOut}; }
  .ai-tray[data-play] .arrow { animation: ai-lift 500ms ${inOut}; }
  .ai-users[data-play] .second { animation: ai-join 520ms ${spring} 60ms both; }
  .ai-pie[data-play] .slice { animation: ai-pop 640ms cubic-bezier(.4, 0, .2, 1); }
  .ai-arrow[data-play] .head { animation: ai-nudge 400ms ${inOut}; }
  .ai-arrow[data-play] .line { transform-origin: right; animation: ai-shrink 400ms ${inOut}; }
  .ai-cam[data-play] { animation: ai-press 300ms ${inOut}; }
  .ai-cam[data-play] .lens { animation: ai-lens 300ms ${inOut}; }
  .ai-sun[data-play] .ray { animation: ai-ray 300ms ${out} var(--d) both; }
  .ai-moon[data-play] path { animation: ai-wiggle 640ms ${inOut} 120ms; }
  .ai-check[data-appear] path { animation: ai-tick 400ms ${out} both; }
  .ai-alert[data-appear] .mark { animation: ai-pulse 800ms ${inOut} 2; }
}
@keyframes ai-draw { from { stroke-dashoffset: 1; opacity: 0; } 30% { opacity: 1; } to { stroke-dashoffset: 0; opacity: 1; } }
@keyframes ai-tick { from { stroke-dashoffset: 1; opacity: 0; transform: scale(.5); } 25% { opacity: 1; } to { stroke-dashoffset: 0; opacity: 1; transform: none; } }
@keyframes ai-spin { from { transform: none; } to { transform: rotate(180deg); } }
@keyframes ai-lid { 45% { transform: translateY(-1.5px) rotate(14deg); } }
@keyframes ai-sink { 45% { transform: translateY(1px); } }
@keyframes ai-rewind { 45% { transform: rotate(-55deg); } }
@keyframes ai-stretch { 50% { transform: translateX(-1.5px) scaleX(1.15); } }
@keyframes ai-lift { 40% { transform: translateY(-2px); } }
@keyframes ai-join { from { transform: translateX(-6px); opacity: 0; } 30% { opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ai-pop { 35% { transform: translate(1.6px, -1.6px); } 60% { transform: translate(1.1px, -1.1px); } }
@keyframes ai-nudge { 50% { transform: translateX(-3px); } }
@keyframes ai-shrink { 50% { transform: scaleX(.8); } }
@keyframes ai-press { 50% { transform: scale(.95); } }
@keyframes ai-lens { 50% { transform: scale(1.1); opacity: .6; } }
@keyframes ai-pulse { 50% { transform: scale(1.1); opacity: .4; } }
@keyframes ai-ray { from { opacity: 0; } }
@keyframes ai-wiggle { 20% { transform: rotate(-10deg); } 40% { transform: rotate(10deg); } 60% { transform: rotate(-5deg); } 80% { transform: rotate(5deg); } }
`;
