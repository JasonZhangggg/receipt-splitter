import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { actedByKey } from "../components/acted-by-key";
import { tabbable } from "../components/popover";
import { glide, glideFor, leaveFor, leaveMs, reducedFade, releaseVelocity, rubberband, snapFor, tallShare } from "../components/sheet-motion";
import { useLayoutHeight } from "../components/viewport";
import { useReducedMotion, webStyle } from "../motion";
import { layout, motion, useColors } from "../theme";

const tapSlop = 10;
const grabHeight = 29;
// The tall snap stops below the page header, so the wordmark and its buttons stay whole above it.
const headerClear = 52;
const barGap = 16;
// The scroller clips, so its content keeps this much room on the top and sides for a focused field's ring.
const ringRoom = 4;
const contain = webStyle({ overscrollBehavior: "contain" });
// A focused field or a scrolled-to row stops below the pinned title, not under it.
const belowTitle = webStyle({ scrollPaddingTop: "60px" });
const holdsGesture = webStyle({ touchAction: "none" });
// The page column is 480 wide between its gutters, so the sheet surface is that plus both gutters and its text lines up with the page's.
const surfaceWidth = 480 + 2 * layout.gutter;
// A sheet is modal: the page behind it (the siblings that are not a sheet's dim or surface, a toast or a notice) is out of reach of Tab and screen readers while it is open. Counted, so one sheet closing under another keeps the page out.
const overlayLayer = '[role="dialog"], [role="status"], [data-sheet-dim]';
const held = new Map<HTMLElement, number>();
function holdPage(from: HTMLElement) {
  const page = [...(from.parentElement?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.matches(overlayLayer));
  for (const el of page) {
    held.set(el, (held.get(el) ?? 0) + 1);
    el.inert = true;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const el of page) {
      const left = (held.get(el) ?? 1) - 1;
      if (left > 0) held.set(el, left);
      else {
        held.delete(el);
        el.inert = false;
      }
    }
  };
}

type Props = {
  children: ReactNode;
  /** Lays a dim layer over the whole page, header and footer included, that closes the sheet on a tap. Its opacity follows the sheet's position. */
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

type Pull = { id: number; x: number; y: number; from: number; moved: boolean; list: HTMLElement; samples: { y: number; t: number }[] };

type Drag = { pointer: number; startY: number; startX: number; from: number; moved: boolean; resume: number | null; samples: { y: number; t: number }[] };

export function BottomSheet({ children, tapAway = false, onDown, holds, closing = false, minHeight = 0, bar, label, testID }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // The keyboard neither moves nor shrinks the sheet. iOS pans the page to reveal the focused field.
  const screen = useLayoutHeight();
  const tallest = Math.min(Math.round(screen * tallShare), screen - insets.top - headerClear);
  const [content, setContent] = useState(0);
  const [tall, setTall] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const natural = content + grabHeight + (bar ? barHeight + barGap : 30 + insets.bottom);
  const visible = content === 0 ? 0 : Math.min(Math.max(natural, minHeight), tallest);
  const scrolls = natural > tallest;
  const rest = tallest - visible;
  const home = tall ? 0 : rest;
  const surface = useRef<View>(null);
  const dim = useRef<View>(null);
  const body = useRef<View>(null);
  const offset = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const pull = useRef<Pull | null>(null);
  const leaving = useRef(false);
  const left = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gestures = onDown !== undefined;
  // The page is out of reach until the sheet starts to leave, so a key pressed as it slides away reaches the page and the opener can take focus back.
  const releasePage = useRef<(() => void) | null>(null);

  const element = () => surface.current as unknown as HTMLElement | null;

  // Full at the rest snap and above it, none once the sheet is fully down, linear between, so the same easing on both keeps them in step.
  const dimAt = (to: number) => {
    const span = tallest - rest;
    return span > 0 ? Math.min(1, Math.max(0, (tallest - to) / span)) : to >= tallest ? 0 : 1;
  };

  const place = (to: number, ms: number, easing = glide.easing) => {
    offset.current = to;
    const scrim = dim.current as unknown as HTMLElement | null;
    if (scrim) {
      scrim.style.transition = ms > 0 ? `opacity ${ms}ms ${easing}` : "none";
      scrim.style.opacity = String(dimAt(to));
    }
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
      if (entering) {
        element()?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: reducedFade, easing: motion.easeOut });
        (dim.current as unknown as HTMLElement | null)?.animate?.([{ opacity: 0 }, { opacity: dimAt(to) }], { duration: reducedFade, easing: motion.easeOut });
      }
      return done?.();
    }
    const from = offset.current ?? tallest;
    const ms = glideFor(to - from, Math.sign(to - from) * velocity);
    if (to >= tallest) {
      const out = velocity > 0 ? Math.min(leaveMs, ms) : leaveFor(to - from);
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
    releasePage.current?.();
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

  useLayoutEffect(() => {
    const sheet = element();
    if (!sheet) return;
    const release = holdPage(sheet);
    releasePage.current = release;
    return release;
  }, []);

  // A sheet a key opened takes focus as it appears, so the next key reaches the sheet and not the page behind it. A touch or click leaves focus on the opener, and a field that took focus itself keeps it.
  useEffect(() => {
    const sheet = element();
    if (sheet && actedByKey() && !sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
  }, []);

  // Tab cycles through the sheet and a toast's action over it, and never to the browser's own controls. Focus in a popover over the sheet is that popover's to trap.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const box = element();
      if (event.key !== "Tab" || !box) return;
      const at = document.activeElement;
      const toast = [...document.querySelectorAll<HTMLElement>('[role="status"] [data-pressable]')];
      const stops = [...box.querySelectorAll<HTMLElement>(tabbable), ...toast].filter((el) => el.getClientRects().length > 0);
      const ours = at === null || at === document.body || box.contains(at) || toast.includes(at as HTMLElement);
      if (!ours) return;
      const edge = event.shiftKey ? stops[0] : stops.at(-1);
      if (at === box && !event.shiftKey) return;
      if (at && stops.includes(at as HTMLElement) && at !== edge) return;
      event.preventDefault();
      (event.shiftKey ? (stops.at(-1) ?? box) : (stops[0] ?? box)).focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  const release = (samples: Drag["samples"], at: number) => {
    const velocity = releaseVelocity(samples, at);
    const snap = snapFor((offset.current ?? home) - rest, velocity, tall, rest);
    if (snap === "close" && onDown) return leave(velocity);
    const next = snap === "tall" || (snap === "stay" && tall);
    settle(next ? 0 : rest, velocity);
    setTall(next);
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    if (!current.moved) {
      if (current.resume !== null) settle(current.resume, 0);
      return;
    }
    release(current.samples, event.timeStamp);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (drag.current?.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    settle(home, 0);
  };

  // A list that scrolls keeps its own touches until it sits at the top. A pull down from there carries the sheet, as on iOS, and an upward move scrolls as usual. The pointer events end when the browser takes a touch to scroll, so this runs on touch events, whose move can be cancelled.
  const listAt = (target: EventTarget | null) => {
    const list = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-sheet-scroll], [data-sheet-outer]") ?? null;
    return list && (list.hasAttribute("data-sheet-scroll") || scrolls) ? list : null;
  };
  const pullStart = useEffectEvent((event: TouchEvent) => {
    const list = listAt(event.target);
    const touch = event.touches[0];
    pull.current = !gestures || leaving.current || event.touches.length !== 1 || drag.current || !list || list.scrollTop > 0 || !touch ? null : { id: touch.identifier, x: touch.clientX, y: touch.clientY, from: 0, moved: false, list, samples: [{ y: touch.clientY, t: event.timeStamp }] };
  });
  const pullMove = useEffectEvent((event: TouchEvent) => {
    const current = pull.current;
    const touch = current && [...event.changedTouches].find(({ identifier }) => identifier === current.id);
    if (!current || !touch) return;
    const travel = touch.clientY - current.y;
    if (!current.moved) {
      // iOS stops sending cancelable moves once the list starts its own bounce, so a downward move at the top is held from its first pixel.
      if (travel <= 0 || Math.abs(touch.clientX - current.x) > travel || current.list.scrollTop > 0) {
        pull.current = null;
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (travel <= tapSlop) return;
      current.moved = true;
      current.y = touch.clientY;
      current.from = live();
    }
    if (event.cancelable) event.preventDefault();
    current.samples = [...current.samples.slice(-4), { y: touch.clientY, t: event.timeStamp }];
    const at = current.from + (touch.clientY - current.y);
    place(at < 0 ? rubberband(at, visible) : at, 0);
  });
  const pullEnd = useEffectEvent((event: TouchEvent) => {
    const current = pull.current;
    pull.current = null;
    if (!current?.moved) return;
    if (event.type === "touchcancel") return settle(home, 0);
    release(current.samples, event.timeStamp);
  });
  useEffect(() => {
    const sheet = element();
    if (!sheet) return;
    const start = (event: TouchEvent) => pullStart(event);
    const move = (event: TouchEvent) => pullMove(event);
    const end = (event: TouchEvent) => pullEnd(event);
    sheet.addEventListener("touchstart", start, { passive: true });
    sheet.addEventListener("touchmove", move, { passive: false });
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
    return () => {
      sheet.removeEventListener("touchstart", start);
      sheet.removeEventListener("touchmove", move);
      sheet.removeEventListener("touchend", end);
      sheet.removeEventListener("touchcancel", end);
    };
  }, []);

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
      <View ref={dim} testID="sheet-dim" {...{ dataSet: { sheetDim: "" } }} pointerEvents={tapAway ? "auto" : "none"} onPointerUp={onDown && (() => leave(0))} style={[styles.hitArea, { backgroundColor: c.sheetScrim }]} />
      <View
        ref={surface}
        role="dialog"
        aria-modal
        aria-label={label}
        testID={testID}
        tabIndex={-1}
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
            {...{ dataSet: { sheetOuter: "" } }}
            style={[{ maxHeight: tallest - grabHeight + ringRoom - barHeight }, contain, belowTitle, fits]}
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
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: surfaceWidth, marginHorizontal: "auto", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  below: { position: "absolute", top: "100%", left: 0, right: 0 },
  column: { width: "100%" },
  inset: { alignSelf: "center", width: "100%", maxWidth: surfaceWidth },
  grabArea: { alignSelf: "stretch", height: grabHeight - ringRoom, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  shrink: { flexShrink: 1 },
  bar: { borderTopWidth: 1, paddingTop: 12 },
});
