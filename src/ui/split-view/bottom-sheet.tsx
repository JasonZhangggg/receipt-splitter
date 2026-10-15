import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glide, glideFor, leaveMs, reducedFade, releaseVelocity, rubberband, snapFor, tallShare } from "../components/sheet-motion";
import { useLayoutHeight } from "../components/viewport";
import { useReducedMotion, webStyle } from "../motion";
import { layout, motion, useColors } from "../theme";

const tapSlop = 10;
const grabHeight = 29;
const barGap = 16;
// The scroller clips, so its content keeps this much room on the top and sides for a focused field's ring.
const ringRoom = 4;
const contain = webStyle({ overscrollBehavior: "contain" });
const holdsGesture = webStyle({ touchAction: "none" });

type Props = {
  children: ReactNode;
  /** Lays a transparent hit area over the page that closes the sheet on a tap. The page behind is never dimmed. */
  tapAway?: boolean;
  /** A swipe down, or a tap away. Called once the sheet has left. */
  onDown?: () => void;
  /** Asked before a swipe down or a tap away takes the sheet away; true settles it back, as for content holding an edit that cannot save. */
  holds?: () => boolean;
  minHeight?: number;
  closing?: boolean;
  /** A bar fixed to the bottom of the sheet, under the scrolling content: the Pay sheet's pay button. */
  bar?: ReactNode;
  label: string;
  testID?: string;
};

type Drag = { pointer: number; startY: number; startX: number; from: number; moved: boolean; resume: number | null; samples: { y: number; t: number }[] };

export function BottomSheet({ children, tapAway = false, onDown, holds, closing = false, minHeight = 0, bar, label, testID }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // The keyboard neither moves nor shrinks the sheet. iOS pans the page to reveal the focused field.
  const screen = useLayoutHeight();
  const tallest = Math.min(Math.round(screen * tallShare), screen - insets.top - 8);
  const [content, setContent] = useState(0);
  const [tall, setTall] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const natural = content + grabHeight + (bar ? barHeight + barGap : 30 + insets.bottom);
  const visible = content === 0 ? 0 : Math.min(Math.max(natural, minHeight), tallest);
  const scrolls = natural > tallest;
  const rest = tallest - visible;
  const home = tall ? 0 : rest;
  const surface = useRef<View>(null);
  const body = useRef<View>(null);
  const offset = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const leaving = useRef(false);
  const left = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gestures = onDown !== undefined;

  const element = () => surface.current as unknown as HTMLElement | null;

  const place = (to: number, ms: number, easing = glide.easing) => {
    offset.current = to;
    const sheet = element();
    if (sheet) {
      sheet.style.transition = ms > 0 ? `transform ${ms}ms ${easing}` : "none";
      sheet.style.transform = `translateY(${to}px)`;
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
    if (to >= tallest) {
      const out = Math.min(leaveMs, ms);
      place(to, out, motion.easeOut);
      if (done) left.current = setTimeout(done, out);
      return;
    }
    place(to, ms);
    if (done) left.current = setTimeout(done, ms);
  };

  const leave = (velocity: number) => {
    if (leaving.current) return;
    if (holds?.()) return settle(home, velocity);
    leaving.current = true;
    settle(tallest, velocity, onDown);
  };

  const follow = useEffectEvent(() => {
    if (offset.current === null) place(tallest, 0);
    if (visible === 0 || drag.current?.moved || leaving.current) return;
    if (offset.current === home) return;
    settle(home, 0);
  });
  useLayoutEffect(() => follow(), [visible, tallest, home]);

  const close = useEffectEvent(() => leave(0));
  useEffect(() => {
    if (closing) close();
  }, [closing]);

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
    place(at < 0 ? rubberband(at, visible) : at > home && !onDown ? home + rubberband(at - home, visible) : at, 0);
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
    const snap = snapFor((offset.current ?? home) - rest, velocity, tall, rest);
    if (snap === "close" && onDown) return leave(velocity);
    const next = snap === "tall" || (snap === "stay" && tall);
    settle(next ? 0 : rest, velocity);
    setTall(next);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (drag.current?.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    settle(home, 0);
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
      <View pointerEvents={tapAway ? "auto" : "none"} onPointerUp={onDown && (() => leave(0))} style={styles.hitArea} />
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
        <View style={styles.column}>
          <View {...{ dataSet: { sheetGrab: "" } }} style={[styles.grabArea, grip]}>
            <View style={[styles.grab, { backgroundColor: c.hairline }]} />
          </View>
          <ScrollView
            style={[{ maxHeight: tallest - grabHeight + ringRoom - barHeight }, contain, fits]}
            contentContainerStyle={[{ paddingTop: ringRoom, paddingBottom: bar ? barGap : 30 + insets.bottom }, fits]}
          >
            <View style={[styles.inset, styles.shrink, { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
              <View ref={body} onLayout={measure} {...{ dataSet: { sheetBody: "" } }} style={styles.shrink}>
                {children}
              </View>
            </View>
          </ScrollView>
          {bar ? (
            <View
              onLayout={(event) => setBarHeight(Math.ceil(event.nativeEvent.layout.height))}
              style={[styles.bar, { borderTopColor: c.hairline, backgroundColor: c.sheet, paddingBottom: 22 + insets.bottom }]}
            >
              <View style={[styles.inset, { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>{bar}</View>
            </View>
          ) : null}
        </View>
      </View>
    </>
  );
}

const layer = webStyle({ willChange: "transform" });

const styles = StyleSheet.create({
  hitArea: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  below: { position: "absolute", top: "100%", left: 0, right: 0 },
  column: { width: "100%" },
  inset: { alignSelf: "center", width: "100%", maxWidth: 480 },
  grabArea: { alignSelf: "stretch", height: grabHeight - ringRoom, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  shrink: { flexShrink: 1 },
  bar: { borderTopWidth: 1, paddingTop: 12 },
});
