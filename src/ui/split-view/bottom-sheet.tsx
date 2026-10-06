import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glide, glideFor, reducedFade, releaseIntent, releaseVelocity, rubberband } from "../components/sheet-motion";
import { Swap } from "../components/swap";
import { useLayoutHeight } from "../components/viewport";
import { useReducedMotion, webStyle } from "../motion";
import { layout, motion, useColors } from "../theme";

const tapSlop = 10;
const grabHeight = 29;
// The scroller clips, so its content keeps this much room on the top and sides for a focused field's ring.
const ringRoom = 4;
const contain = webStyle({ overscrollBehavior: "contain" });
const holdsGesture = webStyle({ touchAction: "none" });
// A folding sheet's content sizes itself to fit, so the scroller never scrolls and lets a list inside reach out to the sheet's edge.
const unclipped = webStyle({ overflowX: "visible", overflowY: "visible" });

type FoldListener = (progress: number, ms: number, span: number) => void;

/** Where a folding sheet is between folded (0) and open (1), and how far it travels between them (`span`, px). Its content listens here to move with it, over the same `ms` (0 while the sheet follows a finger). */
export class FoldTrack {
  progress = 0;
  span = 0;
  private listener: FoldListener | null = null;

  move(progress: number, ms: number, span: number) {
    this.progress = progress;
    this.span = span;
    this.listener?.(progress, ms, span);
  }

  listen(listener: FoldListener) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }
}

export function useFoldTrack(): FoldTrack {
  return useState(() => new FoldTrack())[0];
}

/** Folded, the sheet shows its header and the first `peek` px of its content. A drag moves it between folded and open. */
type Fold = { open: boolean; peek: number; track: FoldTrack };

type Props = {
  children: ReactNode;
  scrim?: boolean;
  /** A swipe down, or a tap on the scrim. */
  onDown?: () => void;
  /** Asked before a swipe down or a scrim tap takes the sheet away; true settles it back, as for content holding an edit that cannot save. */
  holds?: () => boolean;
  /** A swipe up. */
  onUp?: () => void;
  /** The owner swaps the content on onDown, so the sheet glides to the new height instead of out of view. */
  stays?: boolean;
  minHeight?: number;
  /** A sheet that is part of the page appears in place on load. Others rise from the bottom. */
  rises?: boolean;
  /** Sinks out of view, as when another sheet covers it, and rises back when false. */
  lowered?: boolean;
  closing?: boolean;
  /** The height the page should leave clear under its content. A folding sheet reports its folded height, since open it covers the page, which holds still. */
  onHeight?: (height: number) => void;
  /** Names what the sheet shows. When it changes, the old content fades out, then the new content fades in, so the two never show together. */
  view?: string;
  /** Stays in place above the content when `view` changes. */
  header?: ReactNode;
  /** Makes the sheet fold. Its content then fits itself to the sheet: only a list marked `data-sheet-scroll` scrolls. onUp opens it and onDown folds it. */
  fold?: Fold;
  label: string;
  testID?: string;
};

/** `resume` is where a sheet caught mid-glide was headed, so a touch that never drags lets it finish. */
type Drag = { pointer: number; startY: number; startX: number; from: number; moved: boolean; resume: number | null; samples: { y: number; t: number }[] };

export function BottomSheet({ children, scrim = false, onDown, holds, onUp, stays = false, closing = false, onHeight, view, header, fold, minHeight = 0, rises = true, lowered = false, label, testID }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // The keyboard neither moves nor shrinks the sheet. iOS pans the page to reveal the focused field.
  const tallest = useLayoutHeight() - insets.top - 38;
  const [content, setContent] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const natural = content + grabHeight + 30 + insets.bottom;
  const visible = content === 0 ? 0 : Math.min(Math.max(natural, minHeight), tallest);
  const scrolls = natural > tallest;
  const rest = tallest - visible;
  const folded = fold ? Math.min(headerHeight + fold.peek + grabHeight + 30 + insets.bottom, visible) : visible;
  const foldRest = tallest - folded;
  const home = fold && !fold.open ? foldRest : rest;
  const surface = useRef<View>(null);
  const body = useRef<View>(null);
  const top = useRef<View>(null);
  const shade = useRef<View>(null);
  const offset = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const leaving = useRef(false);
  const handoff = useRef(0);
  const placed = useRef(false);
  const left = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gestures = onDown !== undefined || onUp !== undefined;

  const element = () => surface.current as unknown as HTMLElement | null;
  const dimFor = (value: number) => (visible > 0 ? Math.max(0, Math.min(1, 1 - (value - rest) / visible)) : 0);

  const progressAt = (at: number) => {
    if (!fold) return 1;
    if (lowered || foldRest <= rest) return fold.open ? 1 : 0;
    return Math.max(0, Math.min(1, (foldRest - at) / (foldRest - rest)));
  };

  const place = (to: number, ms: number) => {
    offset.current = to;
    fold?.track.move(progressAt(to), ms, foldRest - rest);
    const sheet = element();
    const dim = shade.current as unknown as HTMLElement | null;
    const transition = `${ms}ms ${glide.easing}`;
    if (sheet) {
      sheet.style.transition = ms > 0 ? `transform ${transition}` : "none";
      sheet.style.transform = `translateY(${to}px)`;
    }
    if (dim) {
      dim.style.transition = ms > 0 ? `opacity ${transition}` : "none";
      dim.style.opacity = String(dimFor(to));
    }
  };

  const settle = (to: number, velocity: number, done?: () => void) => {
    if (reduce) {
      const entering = (offset.current ?? tallest) >= tallest - 1;
      place(to, 0);
      if (entering) element()?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: reducedFade, easing: motion.easeOut });
      return done?.();
    }
    const from = offset.current ?? tallest;
    const ms = glideFor(to - from, Math.sign(to - from) * velocity);
    place(to, ms);
    if (done) left.current = setTimeout(done, ms);
  };

  const leave = (velocity: number) => {
    if (stays) {
      handoff.current = velocity;
      settle(home, velocity);
      return onDown?.();
    }
    if (leaving.current) return;
    if (holds?.()) return settle(home, velocity);
    leaving.current = true;
    settle(tallest, velocity, onDown);
  };

  const follow = useEffectEvent(() => {
    if (offset.current === null) place(tallest, 0);
    if (visible === 0 || drag.current?.moved || leaving.current) return;
    const to = lowered ? tallest : home;
    const firstPlacement = !placed.current;
    placed.current = true;
    if (!rises && firstPlacement) return place(to, 0);
    if (offset.current === to) return;
    settle(to, handoff.current);
    handoff.current = 0;
  });
  useLayoutEffect(() => follow(), [visible, tallest, lowered, home]);

  const close = useEffectEvent(() => leave(0));
  useEffect(() => {
    if (closing) close();
  }, [closing]);

  useEffect(() => onHeight?.(folded), [folded, onHeight]);
  useEffect(() => () => clearTimeout(left.current), []);

  const live = () => {
    const sheet = element();
    if (!sheet || typeof DOMMatrixReadOnly === "undefined") return offset.current ?? tallest;
    return new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
  };

  const onPointerDown = (event: PointerEvent) => {
    const { pointerId, clientY, clientX } = event.nativeEvent;
    // iOS never ends the touch that opens a field's edit menu. It sends no pointerup or pointercancel, and every later touch reports isPrimary false. So a new touch replaces the current drag unless that drag has already moved.
    if (drag.current?.moved || !gestures || leaving.current) return;
    const onGrab = (event.target as unknown as HTMLElement).closest?.("[data-sheet-grab]") != null;
    const onList = (event.target as unknown as HTMLElement).closest?.("[data-sheet-scroll]") != null;
    if ((scrolls && !onGrab) || onList) return;
    const target = offset.current ?? home;
    const at = live();
    const gliding = Math.abs(at - target) > 1;
    if (gliding) place(at, 0);
    drag.current = { pointer: pointerId, startY: clientY, startX: clientX, from: at, moved: false, resume: gliding ? target : (drag.current?.resume ?? null), samples: [{ y: clientY, t: event.timeStamp }] };
    // The grab bar holds no buttons, so it can take the pointer at once. A mouse, which has no implicit capture, would otherwise leave the sheet on the first move up.
    if (onGrab) (event.currentTarget as unknown as HTMLElement).setPointerCapture?.(pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    const { pointerId, clientY, clientX } = event.nativeEvent;
    if (!current || current.pointer !== pointerId) return;
    const travel = clientY - current.startY;
    if (!current.moved) {
      if (Math.abs(travel) <= tapSlop || Math.abs(travel) < Math.abs(clientX - current.startX)) return;
      current.moved = true;
      current.startY = clientY;
      current.from = live();
      (event.currentTarget as unknown as HTMLElement).setPointerCapture?.(pointerId);
    }
    current.samples = [...current.samples.slice(-4), { y: clientY, t: event.timeStamp }];
    const at = current.from + (clientY - current.startY);
    // Past the rest it started from, a folding sheet resists. A drag that reaches the other rest stops there, so a flick that overshoots never springs back against its own direction.
    if (fold) {
      const above = fold.open ? rest + rubberband(at - rest, visible) : rest;
      const below = fold.open ? foldRest : foldRest + rubberband(at - foldRest, folded);
      return place(at < rest ? above : at > foldRest ? below : at, 0);
    }
    const below = at - rest;
    place(rest + (below > 0 && onDown ? below : rubberband(below, visible)), 0);
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    if (!current.moved) {
      if (current.resume !== null) settle(current.resume, 0);
      return;
    }
    const velocity = releaseVelocity(current.samples, event.timeStamp);
    if (fold) {
      const at = offset.current ?? home;
      const opens = fold.open ? releaseIntent(at - rest, velocity, foldRest - rest) !== "down" : releaseIntent(at - foldRest, velocity, folded) === "up";
      settle(opens ? rest : foldRest, velocity);
      if (opens !== fold.open) (opens ? onUp : onDown)?.();
      return;
    }
    const intent = releaseIntent((offset.current ?? rest) - rest, velocity, visible);
    if (intent === "down" && onDown) return leave(velocity);
    settle(rest, velocity);
    if (intent === "up" && onUp) onUp();
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (drag.current?.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    settle(home, 0);
  };

  const measure = () => {
    const box = body.current as unknown as HTMLElement | null;
    if (box) setContent(Math.ceil(box.getBoundingClientRect().height));
    const above = top.current as unknown as HTMLElement | null;
    if (above) setHeaderHeight(Math.ceil(above.getBoundingClientRect().height));
  };
  useLayoutEffect(measure);

  const grip = gestures ? holdsGesture : null;
  // touch-action stops at a scroll container, so content that fits hands the whole sheet, scroller included, to the drag.
  const fits = scrolls ? null : grip;
  return (
    <>
      <View pointerEvents={scrim ? "auto" : "none"} onPointerUp={onDown && (() => leave(0))} style={[styles.scrim, { opacity: scrim ? 1 : 0 }, reduce ? scrimCrossFade : scrimFade]}>
        <View ref={shade} style={[styles.fill, { backgroundColor: c.scrim }]} />
      </View>
      <View
        ref={surface}
        role="dialog"
        aria-label={label}
        testID={testID}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={[styles.sheet, { height: tallest, backgroundColor: c.sheet, boxShadow: c.sheetShadow }, fits, layer]}
      >
        {/* A drag past the top rest lifts the bottom edge off the screen, so the sheet runs on below it and the page never shows there. */}
        <View style={[styles.below, { height: tallest, backgroundColor: c.sheet }]} />
        <View style={[styles.column, { paddingLeft: layout.gutter - ringRoom + insets.left, paddingRight: layout.gutter - ringRoom + insets.right }]}>
          <View {...{ dataSet: { sheetGrab: "" } }} style={[styles.grabArea, grip]}>
            <View style={[styles.grab, { backgroundColor: c.hairline }]} />
          </View>
          <ScrollView
            style={[{ maxHeight: tallest - grabHeight + ringRoom }, contain, fits, fold && unclipped]}
            contentContainerStyle={[{ paddingTop: ringRoom, paddingHorizontal: ringRoom, paddingBottom: 30 + insets.bottom }, fits, fold && { maxHeight: tallest - grabHeight + ringRoom }]}
          >
            <View ref={body} onLayout={measure} {...{ dataSet: { sheetBody: "" } }} style={styles.shrink}>
              <View ref={top}>{header}</View>
              <Swap view={view} style={styles.shrink}>
                {children}
              </Swap>
            </View>
          </ScrollView>
        </View>
      </View>
    </>
  );
}

const layer = webStyle({ willChange: "transform" });
const scrimFade = webStyle({ transitionProperty: "opacity", transitionDuration: `${glide.ms}ms`, transitionTimingFunction: glide.easing });
const scrimCrossFade = webStyle({ transitionProperty: "opacity", transitionDuration: `${reducedFade}ms`, transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  below: { position: "absolute", top: "100%", left: 0, right: 0 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  grabArea: { alignSelf: "stretch", height: grabHeight - ringRoom, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  shrink: { flexShrink: 1 },
});
