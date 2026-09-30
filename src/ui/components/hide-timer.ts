type Tab = {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export function hideAfter(ms: number, hide: () => void, tab: Tab | undefined = globalThis.document) {
  let left = ms;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    startedAt = Date.now();
    timer = setTimeout(done, left);
  };
  const pause = () => {
    clearTimeout(timer);
    timer = undefined;
    left -= Date.now() - startedAt;
  };
  const onVisibility = () => {
    if (tab?.hidden && timer) pause();
    else if (!tab?.hidden && !timer) run();
  };
  const stop = () => {
    clearTimeout(timer);
    tab?.removeEventListener("visibilitychange", onVisibility);
  };
  const done = () => {
    stop();
    hide();
  };

  if (!tab?.hidden) run();
  tab?.addEventListener("visibilitychange", onVisibility);
  return stop;
}
