type Tab = {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

type Over = Pick<EventTarget, "addEventListener" | "removeEventListener">;

const overEvents = ["pointerenter", "pointerleave", "focusin", "focusout"];

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
  const watch = (event: Event) => {
    if (event.type.startsWith("focus")) focus = event.type === "focusin";
    else if ((event as PointerEvent).pointerType === "mouse") mouse = event.type === "pointerenter";
    update();
  };
  const stop = () => {
    clearTimeout(timer);
    tab?.removeEventListener("visibilitychange", update);
    for (const type of overEvents) over?.removeEventListener(type, watch);
  };
  const done = () => {
    stop();
    hide();
  };

  if (!holding()) run();
  tab?.addEventListener("visibilitychange", update);
  for (const type of overEvents) over?.addEventListener(type, watch);
  return stop;
}
