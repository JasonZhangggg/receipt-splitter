import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { animateSpring, project, rubberband } from "../components/sheet-motion";
import { useReducedMotion, webStyle } from "../motion";
import { layout, useColors } from "../theme";

export const sheetSpring = { response: 0.35, damping: 1 };
const reducedFade = 200;
const tapSlop = 10;
const maxVelocity = 3000;
const closeAt = 0.5;
const contain = webStyle({ overscrollBehavior: "contain" });
const grabbable = webStyle({ touchAction: "none", cursor: "grab" });

type Props = {
  children: ReactNode;
  /** Dims the page behind the sheet. It fades as the sheet is dragged down, and over the spring's time when it turns off. */
  scrim?: boolean;
  /** A sheet with onClose answers a flick down or a scrim tap. It slides off screen and then calls it, or with `stays` calls it at once and springs to whatever content comes next. */
  onClose?: () => void;
  stays?: boolean;
  /** The tall pick sheet reaches this high even when its content is short. */
  minHeight?: number;
  /** Bumped by the parent to ask the sheet to leave the way a flick would. */
  closing?: boolean;
  onHeight?: (height: number) => void;
  /** Drawn under the content without counting toward its height, such as the pick list fading out as the sheet drops. */
  extra?: ReactNode;
  label: string;
  testID?: string;
};

type Drag = { pointer: number; startY: number; from: number; moved: boolean; samples: { y: number; t: number }[] };

/** A bottom sheet whose height follows its content on one critically damped spring of 0.35 s, moving only transform. Under reduced motion it jumps and cross-fades over 200 ms. */
export function SpringSheet({ children, scrim = false, onClose, stays = false, closing = false, onHeight, extra, minHeight = 0, label, testID }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const tallest = windowHeight - insets.top - 38;
  const [content, setContent] = useState(0);
  const visible = content === 0 ? 0 : Math.min(Math.max(content + grabHeight + 30 + insets.bottom, minHeight), tallest);
  const surface = useRef<View>(null);
  const shade = useRef<View>(null);
  const offset = useRef<number | null>(null);
  const stop = useRef<() => void>(() => {});
  const drag = useRef<Drag | null>(null);
  const leaving = useRef(false);
  const handoff = useRef(0);

  const paint = (value: number) => {
    offset.current = value;
    const element = surface.current as unknown as HTMLElement | null;
    if (element) element.style.transform = `translateY(${value}px)`;
    const dim = shade.current as unknown as HTMLElement | null;
    if (dim) dim.style.opacity = String(visible > 0 ? Math.max(0, Math.min(1, 1 - (value - (tallest - visible)) / visible)) : 0);
  };

  const settle = (to: number, velocity: number, done?: () => void) => {
    stop.current();
    const from = offset.current ?? tallest;
    if (reduce) {
      paint(to);
      fade(surface.current);
      return done?.();
    }
    stop.current = animateSpring(from, to, velocity, paint, () => done?.(), sheetSpring);
  };

  const leave = (velocity: number) => {
    if (stays) {
      handoff.current = velocity;
      return onClose?.();
    }
    if (leaving.current) return;
    leaving.current = true;
    settle(tallest, velocity, onClose);
  };

  useLayoutEffect(() => {
    if (offset.current === null) paint(tallest);
    if (visible === 0 || drag.current || leaving.current) return;
    settle(tallest - visible, handoff.current);
    handoff.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tallest]);

  useEffect(() => {
    if (closing) leave(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  useEffect(() => onHeight?.(visible), [visible, onHeight]);
  useEffect(() => () => stop.current(), []);

  const onPointerDown = (event: PointerEvent) => {
    const { pointerId, clientY } = event.nativeEvent;
    if (drag.current || !onClose) return;
    stop.current();
    (event.currentTarget as unknown as HTMLElement).setPointerCapture?.(pointerId);
    drag.current = { pointer: pointerId, startY: clientY, from: offset.current ?? tallest - visible, moved: false, samples: [{ y: clientY, t: event.timeStamp }] };
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    const { pointerId, clientY } = event.nativeEvent;
    if (!current || current.pointer !== pointerId) return;
    const travel = clientY - current.startY;
    current.moved ||= Math.abs(travel) > tapSlop;
    current.samples = [...current.samples.slice(-4), { y: clientY, t: event.timeStamp }];
    const rest = tallest - visible;
    const at = current.from + travel;
    paint(at < rest ? rest + rubberband(at - rest, visible) : at);
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    const rest = tallest - visible;
    if (!current.moved) return settle(rest, 0);
    const [first] = current.samples;
    const last = current.samples.at(-1) ?? first;
    const measured = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    const velocity = Math.max(-maxVelocity, Math.min(maxVelocity, measured));
    const travelled = (offset.current ?? rest) - rest + project(velocity);
    if (travelled > visible * closeAt) return leave(velocity);
    settle(rest, velocity);
  };

  const measure = ({ nativeEvent }: LayoutChangeEvent) => setContent(Math.ceil(nativeEvent.layout.height));

  return (
    <>
      <View pointerEvents={scrim ? "auto" : "none"} onPointerUp={onClose && (() => leave(0))} style={[styles.scrim, { opacity: scrim ? 1 : 0 }, reduce ? scrimCrossFade : scrimFade]}>
        <View ref={shade} style={[styles.fill, { backgroundColor: c.scrim }]} />
      </View>
      <View
        ref={surface}
        role="dialog"
        aria-label={label}
        testID={testID}
        style={[styles.sheet, { height: tallest, backgroundColor: c.sheet, boxShadow: c.sheetShadow }]}
      >
        <View style={[styles.column, { paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
          <View
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            {...{ dataSet: { sheetGrab: "" } }}
            style={[styles.grabArea, onClose && grabbable]}
          >
            <View style={[styles.grab, { backgroundColor: c.hairline }]} />
          </View>
          <ScrollView style={[{ maxHeight: tallest - grabHeight }, contain]} contentContainerStyle={{ paddingBottom: 30 + insets.bottom }}>
            <View onLayout={measure}>{children}</View>
            {extra}
          </ScrollView>
        </View>
      </View>
    </>
  );
}

const grabHeight = 29;

const scrimFade = webStyle({ transitionProperty: "opacity", transitionDuration: "350ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" });
const scrimCrossFade = webStyle({ transitionProperty: "opacity", transitionDuration: `${reducedFade}ms`, transitionTimingFunction: "ease" });

function fade(view: View | null) {
  const element = view as unknown as HTMLElement | null;
  element?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: reducedFade, easing: "ease" });
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  grabArea: { alignSelf: "center", width: 120, height: grabHeight, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
});
