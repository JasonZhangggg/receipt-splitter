import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion, webStyle } from "../motion";
import { layout, useColors } from "../theme";
import { animateSpring, releaseVelocity, rubberband } from "./sheet-motion";
import { useLayoutHeight } from "./viewport";

type Props = { children: ReactNode; action: ReactNode; onHeight: (height: number) => void };

const contain = webStyle({ overscrollBehavior: "contain" });
const pinned = webStyle({ touchAction: "none" });
const scrolls = webStyle({ touchAction: "pan-y" });
const controls = "input, textarea, select, button, a, [role='button'], [role='link']";
const sheetMarker = { dataSet: { sheet: "" } };
const surfaceMarker = { dataSet: { sheetSurface: "" } };
const grabMarker = { dataSet: { sheetGrab: "" } };

type Drag = { pointer: number; startY: number; from: number; samples: { y: number; t: number }[] };

export function Sheet({ children, action, onHeight }: Props) {
  const c = useColors();
  const maxContent = Math.round(useLayoutHeight() * 0.45);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [height, setHeight] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const anchor = useRef<View>(null);
  const panel = useRef<View>(null);
  const scroller = useRef<ScrollView>(null);
  const drag = useRef<Drag | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const position = useRef(0);

  // iOS reveals a focused field by scrolling the window into the room `below` leaves under the page, and never scrolls it back.
  // It holds the visible page still while the keyboard slides away, so the glide back waits until the keyboard is gone.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const closed = () => {
      if (window.scrollY > 0 && viewport.height >= document.documentElement.clientHeight) window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
    };
    viewport.addEventListener("resize", closed);
    return () => viewport.removeEventListener("resize", closed);
  }, [reduce]);

  const paint = (value: number) => {
    position.current = value;
    const element = panel.current as unknown as HTMLElement | null;
    if (element) element.style.transform = value ? `translateY(${value}px)` : "";
  };

  // onLayout reports after the first paint, and the page lays out around this height, so the first frame reads it before paint.
  useLayoutEffect(() => setHeight((anchor.current as unknown as HTMLElement).getBoundingClientRect().height), []);
  useLayoutEffect(() => onHeight(height), [height, onHeight]);

  const onPointerDown = (event: PointerEvent) => {
    const { pointerId, pointerType, clientY } = event.nativeEvent;
    if (drag.current || reduce || (event.target as unknown as Element).closest(controls)) return;
    stop.current();
    // Touch and pen are captured to their target implicitly; only a mouse would leave the panel mid-drag.
    if (pointerType === "mouse") (event.currentTarget as unknown as HTMLElement).setPointerCapture(pointerId);
    drag.current = { pointer: pointerId, startY: clientY, from: position.current, samples: [{ y: clientY, t: event.timeStamp }] };
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    const { pointerId, clientY } = event.nativeEvent;
    if (!current || current.pointer !== pointerId) return;
    current.samples = [...current.samples.slice(-4), { y: clientY, t: event.timeStamp }];
    paint(rubberband(current.from + clientY - current.startY, height));
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    stop.current = animateSpring(position.current, 0, releaseVelocity(current.samples, event.timeStamp), paint, () => paint(0));
  };

  const onContentSizeChange = (_: number, contentHeight: number) => {
    setOverflows(contentHeight > maxContent);
    const content = scroller.current as unknown as HTMLElement | null;
    const focused = document.activeElement;
    if (focused && content?.contains(focused)) focused.scrollIntoView({ block: "nearest" });
  };

  const measure = ({ nativeEvent }: LayoutChangeEvent) => setHeight(nativeEvent.layout.height);

  return (
    // The keyboard leaves the panel where it lies; iOS pans the page to reveal the focused field.
    <View ref={anchor} {...sheetMarker} style={styles.anchor} onLayout={measure}>
      <View
        ref={panel}
        {...surfaceMarker}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={[
          styles.sheet,
          pinned,
          { backgroundColor: c.sheet, boxShadow: c.sheetShadow, paddingBottom: 30 + insets.bottom, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right },
        ]}
      >
        <View {...grabMarker} style={styles.grabArea}>
          <View style={[styles.grab, { backgroundColor: c.hairline }]} />
        </View>
        <ScrollView
          ref={scroller}
          style={[{ maxHeight: maxContent }, contain, overflows ? scrolls : pinned]}
          contentContainerStyle={styles.content}
          onContentSizeChange={onContentSizeChange}
        >
          {children}
        </ScrollView>
        <View style={styles.action}>{action}</View>
        <View style={[styles.below, { backgroundColor: c.sheet }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  grabArea: { alignSelf: "center", width: 120, height: 29, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  content: { alignSelf: "center", width: "100%", maxWidth: 440, gap: layout.blockGap, paddingBottom: 8 },
  action: { alignSelf: "center", width: "100%", maxWidth: 440, paddingTop: layout.blockGap },
  below: { position: "absolute", top: "100%", left: 0, right: 0, height: "100%" },
});
