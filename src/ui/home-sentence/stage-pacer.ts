/** A step word stays up at least this long, so a fast read shows a word that can be read instead of a flash of one. */
export const stageMinMs = 700;

/**
 * Holds each shown stage for `stageMinMs`. A stage that arrives sooner waits for the one on screen and shows then, unless a later stage
 * or the result overtakes it first, in which case it is never shown.
 */
export function stagePacer<Stage>(show: (stage: Stage) => void) {
  let shownAt = Number.NEGATIVE_INFINITY;
  let waiting: { stage: Stage } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const remaining = () => shownAt + stageMinMs - performance.now();
  const display = (stage: Stage) => {
    shownAt = performance.now();
    show(stage);
  };
  const drop = () => {
    waiting = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    push(stage: Stage) {
      const wait = remaining();
      if (wait <= 0) {
        drop();
        return display(stage);
      }
      waiting = { stage };
      timer ??= setTimeout(() => {
        const next = waiting;
        timer = null;
        waiting = null;
        if (next) display(next.stage);
      }, wait);
    },
    /** Resolves when the word on screen has had its time, so the result can replace it. A stage still waiting is overtaken and dropped. */
    settle(): Promise<void> {
      drop();
      const wait = remaining();
      return wait <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, wait));
    },
    /** A newer read took over, so no stage of this one may show. */
    cancel: drop,
  };
}
