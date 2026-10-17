type Tab = {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

type Over = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Runs `hide` after `ms` of counted time. The count stops while the tab is hidden, while a mouse is over `over` and while focus is inside it, and resumes with what was left. A touch never holds it, so a tap's timing is unchanged. */
export function hideAfter(ms: number, hide: () => void, tab: Tab | undefined = globalThis.document, over?: Over) {
  let left = ms;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mouse = false;
  let focus = false;

  const holding = () => Boolean(tab?.hidden) || mouse || focus;
  const run = () => {
    startedAt = Date.now();
    timer = setTimeout(done, left);
  };
  const pause = () => {
    clearTimeout(timer);
    timer = undefined;
    left -= Date.now() - startedAt;
  };
  const update = () => {
    if (holding() && timer) pause();
    else if (!holding() && !timer) run();
  };
  const byMouse = (event: Event) => (event as PointerEvent).pointerType === "mouse";
  const onEnter = (event: Event) => {
    if (!byMouse(event)) return;
    mouse = true;
    update();
  };
  const onLeave = (event: Event) => {
    if (!byMouse(event)) return;
    mouse = false;
    update();
  };
  const onFocusIn = () => {
    focus = true;
    update();
  };
  const onFocusOut = () => {
    focus = false;
    update();
  };
  const stop = () => {
    clearTimeout(timer);
    tab?.removeEventListener("visibilitychange", update);
    over?.removeEventListener("pointerenter", onEnter);
    over?.removeEventListener("pointerleave", onLeave);
    over?.removeEventListener("focusin", onFocusIn);
    over?.removeEventListener("focusout", onFocusOut);
  };
  const done = () => {
    stop();
    hide();
  };

  if (!holding()) run();
  tab?.addEventListener("visibilitychange", update);
  over?.addEventListener("pointerenter", onEnter);
  over?.addEventListener("pointerleave", onLeave);
  over?.addEventListener("focusin", onFocusIn);
  over?.addEventListener("focusout", onFocusOut);
  return stop;
}
