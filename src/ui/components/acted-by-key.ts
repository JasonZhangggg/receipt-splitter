let byKey = false;

// Capture runs before the press handlers, so a close they start already knows how it came. A click with no pointer behind it (detail 0) is a key on a button or a screen reader's activation.
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => (byKey = false), true);
  document.addEventListener("keydown", () => (byKey = true), true);
  document.addEventListener("click", (event) => event.detail === 0 && (byKey = true), true);
}

/** Whether the last thing the person did was a key or a screen reader's activation rather than a touch or a click. Focus goes back to a sheet's opener only then, so a touch close never moves focus. */
export const actedByKey = () => byKey;
