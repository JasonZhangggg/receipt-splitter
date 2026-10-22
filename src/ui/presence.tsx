import { useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { useReducedMotion } from "./motion";
import { keepInPlace, type Kept } from "./split-view/model";
import { motion } from "./theme";

/** Ids the last change added, such as the rows of a Split or a person who joins. A row reads it only when it mounts, and a Bundle that opens later mounts its rows as they are. */
export function useEntering<Id extends string>(ids: readonly Id[]): readonly [ReadonlySet<Id>, () => void] {
  const key = ids.join(" ");
  const [seen, setSeen] = useState(() => ({ key, ids: new Set(ids) }));
  const [entering, setEntering] = useState<ReadonlySet<Id>>(() => new Set());
  if (seen.key !== key) {
    setSeen({ key, ids: new Set(ids) });
    setEntering(new Set(ids.filter((id) => !seen.ids.has(id))));
  }
  return [entering, () => setEntering(new Set())];
}

// The height starts at 0 in a layout effect, so no painted frame shows the new row at full height.
export function Grow({ enter, children }: { enter: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<View>(null);
  const [mount] = useState({ enter, reduce });
  useLayoutEffect(() => {
    const el = box.current as unknown as HTMLElement | null;
    if (!mount.enter || typeof el?.animate !== "function") return;
    const height = `${el.getBoundingClientRect().height}px`;
    const frames = mount.reduce
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { height: "0px", opacity: 0, overflow: "hidden" },
          { height, opacity: 1, overflow: "hidden" },
        ];
    const opening = el.animate(frames, {
      duration: mount.reduce ? motion.reducedFade : motion.rowsIn,
      easing: motion.easeOut,
    });
    // Held at its first frame until the frame that paints the row, so a slow commit cannot eat its start.
    opening.pause();
    const frame = requestAnimationFrame(() => opening.play());
    return () => {
      cancelAnimationFrame(frame);
      opening.cancel();
    };
  }, [mount]);
  return <View ref={box}>{children}</View>;
}

// Children that turn present with animate set grow in, and collapse out over rowsOut when present turns false with animate set, so the rows under them glide. Children present from the first render arrive with the screen, and with animate unset they arrive and leave at once.
export function Presence({ present, animate, children }: { present: boolean; animate: boolean; children: ReactNode }) {
  const [last, setLast] = useState(children);
  const [seen, setSeen] = useState(present);
  const [changed, setChanged] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (present && children !== last) setLast(children);
  if (seen !== present) {
    setSeen(present);
    setChanged(true);
    setLeaving(!present && animate);
  } else if (leaving && !animate) setLeaving(false);
  if (present) return <Grow enter={animate && changed}>{children}</Grow>;
  return leaving ? <Shrink onDone={() => setLeaving(false)}>{last}</Shrink> : null;
}

/** Each row in place. A row the list drops keeps showing what it last showed and collapses out where it stood, and a row the list adds grows in. */
export function KeptRows<Row extends { readonly id: string }>({ rows, entering, children }: { rows: readonly Row[]; entering: ReadonlySet<string>; children: (row: Row) => ReactNode }) {
  const [last, setLast] = useState(rows);
  const [kept, setKept] = useState<readonly Kept<Row>[]>(() => rows.map((row) => ({ row, gone: false })));
  if (rows.length !== last.length || rows.some((row, at) => row !== last[at])) {
    setLast(rows);
    setKept(keepInPlace(kept, rows));
  }
  const forget = (id: string) => setKept((was) => was.filter(({ row, gone }) => !(gone && row.id === id)));
  return kept.map(({ row, gone }) =>
    gone ? (
      <Shrink key={row.id} onDone={() => forget(row.id)}>
        {children(row)}
      </Shrink>
    ) : (
      <Grow key={row.id} enter={entering.has(row.id)}>
        {children(row)}
      </Grow>
    ),
  );
}

/** Collapses its children out over rowsOut, or fades them under reduced motion, so the rows under them glide up; then onDone. They are out of reach of taps, Tab and screen readers from the first frame. */
export function Shrink({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<View>(null);
  const done = useEffectEvent(onDone);
  useLayoutEffect(() => {
    const el = box.current as unknown as HTMLElement | null;
    if (typeof el?.animate !== "function") return done();
    el.inert = true;
    const height = `${el.getBoundingClientRect().height}px`;
    const frames = reduce
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { height, opacity: 1, overflow: "hidden" },
          { height: "0px", opacity: 0, overflow: "hidden" },
        ];
    const going = el.animate(frames, {
      duration: reduce ? motion.reducedFade : motion.rowsOut,
      easing: motion.easeOut,
      fill: "forwards",
    });
    going.onfinish = () => done();
    return () => going.cancel();
  }, [reduce]);
  return (
    <View ref={box} aria-hidden pointerEvents="none">
      {children}
    </View>
  );
}
