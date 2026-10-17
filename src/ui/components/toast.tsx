import { useEffect, useEffectEvent, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { awayStyle, pressStyle, useFade, useReducedMotion, webStyle } from "../motion";
import { layout, type, useColors } from "../theme";
import { PressTarget } from "./button";
import { underline } from "./text-link";
import { hideAfter } from "./hide-timer";

const visibleFor = 4000;
const rise = { y: 8, scale: 0.98 };
// The toast is ink-colored, so its focus ring is drawn in the field color.
const ring = (color: string) => webStyle({ "--focus": color } as never);
// The toast sits above the home panel, so it rides the panel's keyboard lift.
const followsPanel = { dataSet: { followsPanel: "" } };

type Props = {
  message: string | null;
  onHide: () => void;
  action?: { label: string; onPress: () => void };
  lift?: number;
};

export function Toast({ message, onHide, action, lift = 0 }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(message);
  // While the bar fades out its Undo stays, so the bar does not change shape on the way out.
  const [shownAction, setShownAction] = useState(action);
  if (message && message !== shown) {
    setShown(message);
    setShownAction(action);
  }
  const showing = message ? action : shownAction;
  const hide = useEffectEvent(onHide);
  const bar = useRef<View>(null);
  // Where focus was before it moved into the toast, so it can go back when the toast leaves.
  const before = useRef<HTMLElement | null>(null);

  useFade(bar, message !== null, rise, reduce, () => setShown(null));

  useEffect(() => {
    if (message) return hideAfter(visibleFor, () => hide(), undefined, (bar.current as unknown as HTMLElement | null) ?? undefined);
  }, [message]);

  useEffect(() => {
    const element = bar.current as unknown as HTMLElement | null;
    if (!element) return;
    const onFocusIn = (event: FocusEvent) => {
      const from = event.relatedTarget as HTMLElement | null;
      if (from && !element.contains(from)) before.current = from;
    };
    element.addEventListener("focusin", onFocusIn);
    return () => element.removeEventListener("focusin", onFocusIn);
  }, [shown]);

  // A toast that leaves with focus inside it hands focus back to where it came from, not to the top of the page.
  useEffect(() => {
    if (message) return;
    const element = bar.current as unknown as HTMLElement | null;
    const back = before.current;
    before.current = null;
    if (element?.contains(document.activeElement) && back?.isConnected && !back.closest("[inert]")) back.focus({ preventScroll: true });
  }, [message]);

  return (
    <View role="status" aria-live="polite" pointerEvents="box-none" {...followsPanel} style={[styles.anchor, { bottom: 16 + (lift || insets.bottom) }]}>
      {shown ? (
        <View ref={bar} style={[styles.toast, !showing && styles.bare, ring(c.field), { backgroundColor: c.ink }, !message && awayStyle(rise, reduce)]}>
          <Text style={[type.caption, styles.message, { color: c.field }]}>{shown}</Text>
          {showing ? (
            <PressTarget onPress={showing.onPress} outsideScroll style={(pressed) => [styles.action, pressStyle(pressed, reduce)]}>
              {() => (
                <View {...{ dataSet: { pressFace: "" } }} style={styles.face}>
                  <Text style={[type.caption, underline, { color: c.field, textDecorationColor: c.field }]}>{showing.label}</Text>
                </View>
              )}
            </PressTarget>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The bar's room: every edge of its words sits `inset` from the pill's edge, and the action's hit area reaches `actionPad` past its label, so the bar itself gives the rest on that side. */
const barHeight = 56;
const inset = 24;
const actionPad = 14;

const styles = StyleSheet.create({
  anchor: { position: "absolute", left: layout.gutter, right: layout.gutter, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    maxWidth: 480,
    minHeight: barHeight,
    paddingLeft: inset,
    paddingRight: inset - actionPad,
    paddingVertical: 4,
    borderRadius: barHeight / 2,
  },
  // With no action at the end, the text keeps the same room on the right as on the left.
  bare: { paddingRight: inset },
  // The padding is on the text, not the bar, so a one-line toast stays at its height while a wrapped one clears its rounded ends.
  message: { flexShrink: 1, paddingVertical: 10 },
  action: { minWidth: 44, minHeight: 44 },
  face: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: actionPad, borderRadius: 22 },
});
