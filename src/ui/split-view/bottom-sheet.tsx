import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glide, glideFor, releaseIntent, releaseVelocity, rubberband } from "../components/sheet-motion";
import { useReducedMotion, webStyle } from "../motion";
import { layout, motion, useColors } from "../theme";

const reducedFade = 200;
const fadeIn = 200;
const fadeOut = 150;
const tapSlop = 10;
const grabHeight = 29;
const contain = webStyle({ overscrollBehavior: "contain" });
const holdsGesture = webStyle({ touchAction: "none" });

type Props = {
  children: ReactNode;
  scrim?: boolean;
  /** A swipe down, or a tap on the scrim. */
  onDown?: () => void;
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
  onHeight?: (height: number) => void;
  /** Names what the sheet shows. When it changes, the old content fades out over the new one as it fades in. */
  view?: string;
  label: string;
  testID?: string;
};

type Drag = { pointer: number; startY: number; startX: number; from: number; moved: boolean; samples: { y: number; t: number }[] };

export function BottomSheet({ children, scrim = false, onDown, onUp, stays = false, closing = false, onHeight, view, minHeight = 0, rises = true, lowered = false, label, testID }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const tallest = windowHeight - insets.top - 38;
  const [content, setContent] = useState(0);
  const natural = content + grabHeight + 30 + insets.bottom;
  const visible = content === 0 ? 0 : Math.min(Math.max(natural, minHeight), tallest);
  const scrolls = natural > tallest;
  const surface = useRef<View>(null);
  const body = useRef<View>(null);
  const shade = useRef<View>(null);
  const offset = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const leaving = useRef(false);
  const handoff = useRef(0);
  const placed = useRef(false);
  const left = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gestures = onDown !== undefined || onUp !== undefined;
  const [shown, setShown] = useState({ view, children });
  const [outgoing, setOutgoing] = useState<{ view: string | undefined; content: ReactNode } | null>(null);
  if (view !== shown.view) {
    setOutgoing({ view: shown.view, content: shown.children });
    setShown({ view, children });
  } else if (children !== shown.children) setShown({ view, children });
  useLayoutEffect(() => {
    const box = body.current as unknown as HTMLElement | null;
    if (outgoing) box?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: fadeIn, easing: motion.easeOut });
  }, [outgoing]);

  const element = () => surface.current as unknown as HTMLElement | null;
  const dimFor = (value: number) => (visible > 0 ? Math.max(0, Math.min(1, 1 - (value - (tallest - visible)) / visible)) : 0);

  const place = (to: number, ms: number) => {
    offset.current = to;
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
      if (entering) element()?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: reducedFade, easing: "ease" });
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
      settle(tallest - visible, velocity);
      return onDown?.();
    }
    if (leaving.current) return;
    leaving.current = true;
    settle(tallest, velocity, onDown);
  };

  const follow = useEffectEvent(() => {
    if (offset.current === null) place(tallest, 0);
    if (visible === 0 || drag.current?.moved || leaving.current) return;
    const rest = lowered ? tallest : tallest - visible;
    const firstPlacement = !placed.current;
    placed.current = true;
    if (!rises && firstPlacement) return place(rest, 0);
    settle(rest, handoff.current);
    handoff.current = 0;
  });
  useLayoutEffect(() => follow(), [visible, tallest, lowered]);

  const close = useEffectEvent(() => leave(0));
  useEffect(() => {
    if (closing) close();
  }, [closing]);

  useEffect(() => onHeight?.(visible), [visible, onHeight]);
  useEffect(() => () => clearTimeout(left.current), []);

  const live = () => {
    const sheet = element();
    if (!sheet || typeof DOMMatrixReadOnly === "undefined") return offset.current ?? tallest;
    return new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
  };

  const onPointerDown = (event: PointerEvent) => {
    const { pointerId, clientY, clientX, isPrimary } = event.nativeEvent;
    if (drag.current || !gestures || !isPrimary || leaving.current) return;
    const onGrab = (event.target as unknown as HTMLElement).closest?.("[data-sheet-grab]") != null;
    if (scrolls && !onGrab) return;
    drag.current = { pointer: pointerId, startY: clientY, startX: clientX, from: offset.current ?? tallest - visible, moved: false, samples: [{ y: clientY, t: event.timeStamp }] };
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
    const rest = tallest - visible;
    const at = current.from + (clientY - current.startY);
    const below = at - rest;
    place(rest + (below > 0 && onDown ? below : rubberband(below, visible)), 0);
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    if (!current.moved) return;
    const rest = tallest - visible;
    const velocity = releaseVelocity(current.samples, event.timeStamp);
    const intent = releaseIntent((offset.current ?? rest) - rest, velocity, visible);
    if (intent === "down" && onDown) return leave(velocity);
    settle(rest, velocity);
    if (intent === "up" && onUp) onUp();
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (drag.current?.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    settle(tallest - visible, 0);
  };

  const measure = () => {
    const box = body.current as unknown as HTMLElement | null;
    if (box) setContent(Math.ceil(box.getBoundingClientRect().height));
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
        <View style={[styles.column, { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
          <View {...{ dataSet: { sheetGrab: "" } }} style={[styles.grabArea, grip]}>
            <View style={[styles.grab, { backgroundColor: c.hairline }]} />
          </View>
          <ScrollView style={[{ maxHeight: tallest - grabHeight }, contain, fits]} contentContainerStyle={[{ paddingBottom: 30 + insets.bottom }, fits]}>
            <View ref={body} onLayout={measure} {...{ dataSet: { sheetBody: "" } }}>
              {children}
            </View>
            {outgoing ? <Outgoing key={outgoing.view} onDone={() => setOutgoing(null)}>{outgoing.content}</Outgoing> : null}
          </ScrollView>
        </View>
      </View>
    </>
  );
}

function Outgoing({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  const copy = useRef<View>(null);
  const done = useEffectEvent(onDone);
  useLayoutEffect(() => {
    const node = copy.current as unknown as HTMLElement | null;
    // The copy is a picture of what left, so it gives up the ids and test ids the live content now holds.
    node?.querySelectorAll<HTMLElement>("[id], [data-testid]").forEach((el) => {
      el.removeAttribute("id");
      if (el.dataset.testid) el.dataset.leftTestid = el.dataset.testid;
      delete el.dataset.testid;
    });
    const fade = node?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: fadeOut, easing: motion.easeOut, fill: "forwards" });
    if (!fade) return done();
    fade.onfinish = () => done();
    return () => fade.cancel();
  }, []);
  return (
    <View ref={copy} aria-hidden pointerEvents="none" style={styles.outgoing}>
      {children}
    </View>
  );
}

const layer = webStyle({ willChange: "transform" });
const scrimFade = webStyle({ transitionProperty: "opacity", transitionDuration: `${glide.ms}ms`, transitionTimingFunction: glide.easing });
const scrimCrossFade = webStyle({ transitionProperty: "opacity", transitionDuration: `${reducedFade}ms`, transitionTimingFunction: "ease" });

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  grabArea: { alignSelf: "stretch", height: grabHeight, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  outgoing: { position: "absolute", top: 0, left: 0, right: 0 },
});
