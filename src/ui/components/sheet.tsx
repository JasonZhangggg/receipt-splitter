import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type PointerEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sheetCopy } from "../home-copy";
import { useReducedMotion, webStyle } from "../motion";
import { layout, useColors } from "../theme";
import { animateSpring, rubberband, snapTarget } from "./sheet-motion";

type Props = { children: ReactNode; action: ReactNode; onHeight: (height: number) => void };

const contain = webStyle({ overscrollBehavior: "contain" });
const grabbable = webStyle({ touchAction: "none", cursor: "grab" });
const tapSlop = 10;
const maxVelocity = 3000;
const sheetMarker = { dataSet: { sheet: "" } };
const surfaceMarker = { dataSet: { sheetSurface: "" } };


export function Sheet({ children, action, onHeight }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  return (
    <PhoneSheet maxContent={Math.round(windowHeight * 0.45)} action={action} onHeight={onHeight}>
      {children}
    </PhoneSheet>
  );
}

type Drag = { pointer: number; startY: number; from: number; moved: boolean; samples: { y: number; t: number }[] };

function PhoneSheet({ children, action, onHeight, maxContent }: Props & { maxContent: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [heights, setHeights] = useState({ sheet: 0, action: 0 });
  const top = useRef<View>(null);
  const drag = useRef<Drag | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const position = useRef(0);
  const heading = useRef<0 | 1>(0);

  const paint = (value: number) => {
    position.current = value;
    const element = top.current as unknown as HTMLElement | null;
    if (element) element.style.transform = value ? `translateY(${value}px)` : "";
  };

  useEffect(() => {
    onHeight(collapsed ? heights.sheet - contentHeight : heights.sheet);
  }, [collapsed, heights.sheet, contentHeight, onHeight]);

  const unfold = () => {
    if (!collapsed) return;
    setCollapsed(false);
    paint(contentHeight);
  };

  const settle = (to: 0 | 1, velocity: number) => {
    heading.current = to;
    stop.current();
    const done = () => {
      paint(0);
      position.current = to * contentHeight;
      setCollapsed(to === 1);
    };
    if (reduce) return done();
    stop.current = animateSpring(position.current, to * contentHeight, velocity, paint, done);
  };

  const toggle = () => {
    unfold();
    settle(heading.current === 1 ? 0 : 1, 0);
  };

  const onPointerDown = (event: PointerEvent) => {
    const { pointerId, clientY } = event.nativeEvent;
    if (drag.current) return;
    stop.current();
    (event.currentTarget as unknown as HTMLElement).setPointerCapture?.(pointerId);
    unfold();
    drag.current = { pointer: pointerId, startY: clientY, from: position.current, moved: false, samples: [{ y: clientY, t: event.timeStamp }] };
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    const { pointerId, clientY } = event.nativeEvent;
    if (!current || current.pointer !== pointerId) return;
    const travel = clientY - current.startY;
    current.moved ||= Math.abs(travel) > tapSlop;
    current.samples = [...current.samples.slice(-4), { y: clientY, t: event.timeStamp }];
    const at = current.from + travel;
    paint(at < 0 ? rubberband(at, contentHeight) : at > contentHeight ? contentHeight + rubberband(at - contentHeight, contentHeight) : at);
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.nativeEvent.pointerId) return;
    drag.current = null;
    if (!current.moved) return toggle();
    const [first] = current.samples;
    const last = current.samples.at(-1) ?? first;
    const measured = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    const velocity = Math.max(-maxVelocity, Math.min(maxVelocity, measured));
    const at = Math.min(contentHeight, Math.max(0, position.current));
    settle(snapTarget(at, velocity, contentHeight), velocity);
  };

  const grabKeys = {
    onKeyDown: (event: { key: string; preventDefault(): void }) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    },
  };

  const measureSheet = ({ nativeEvent }: LayoutChangeEvent) => setHeights((was) => ({ ...was, sheet: nativeEvent.layout.height }));
  const measureContent = ({ nativeEvent }: LayoutChangeEvent) => {
    if (!collapsed) setContentHeight(nativeEvent.layout.height);
  };

  return (
    <View {...sheetMarker} style={styles.anchor} onLayout={measureSheet}>
      <View ref={top} {...surfaceMarker} style={[styles.sheet, { backgroundColor: c.sheet, boxShadow: c.sheetShadow, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
        <View
          role="button"
          aria-label={collapsed ? sheetCopy.expand : sheetCopy.collapse}
          aria-expanded={!collapsed}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          {...grabKeys}
          {...{ dataSet: { sheetGrab: "" } }}
          style={[styles.grabArea, grabbable]}
        >
          <View style={[styles.grab, { backgroundColor: c.hairline }]} />
        </View>
        <View onLayout={measureContent} style={collapsed && styles.hidden}>
          <ScrollView style={[{ maxHeight: maxContent }, contain]} contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </View>
      </View>
      <View style={[styles.action, { backgroundColor: c.sheet, paddingBottom: 30 + insets.bottom, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
        <View style={styles.actionInner}>{action}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  grabArea: { alignSelf: "center", width: 120, height: 29, alignItems: "center", paddingTop: 10 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  hidden: { display: "none" },
  content: { alignSelf: "center", width: "100%", maxWidth: 440, gap: layout.blockGap, paddingBottom: 8 },
  action: { position: "relative", zIndex: 1, paddingTop: layout.blockGap },
  actionInner: { alignSelf: "center", width: "100%", maxWidth: 440 },
});
