import { Link } from "expo-router";
import { useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { RecentSplit } from "../device";
import { money } from "../draft";
import { scrollViewTouchDelay, type Press } from "./components/button";
import { useLayoutHeight } from "./components/viewport";
import { historyCopy as say } from "./home-copy";
import { useReducedMotion, webStyle } from "./motion";
import { BottomSheet } from "./split-view/bottom-sheet";
import { motion, tabular, type, useColors } from "./theme";

type Props = { splits: readonly RecentSplit[]; now: number; wide: boolean; from: Press; closing: boolean; onClose: () => void; onGone: () => void };

type Anchor = { top: number; right: number };

const popoverWidth = 360;
const popoverGap = 6;
const popoverOut = 150;

/** The list of stored Splits, opened from the header menu's History row. It hangs from the menu button, and the page gives focus back to that button when it is gone. */
export function RecentSplits({ splits, now, wide, from, closing, onClose, onGone }: Props) {
  const [anchor] = useState<Anchor>(() => {
    const box = from.trigger.getBoundingClientRect();
    return { top: box.bottom + popoverGap, right: document.documentElement.clientWidth - box.right };
  });
  // React Native Web's Modal hears Escape only once it marks itself active, a frame or more after it shows, so the list listens from its first commit.
  useLayoutEffect(() => {
    if (closing) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closing, onClose]);

  const list = <Entries splits={splits} now={now} onPick={onGone} />;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {wide ? (
        <Popover anchor={anchor} closing={closing} onClose={onClose} onGone={onGone}>
          {list}
        </Popover>
      ) : (
        <BottomSheet tapAway label={say.title} onDown={onGone} closing={closing} testID="recent-sheet">
          {list}
        </BottomSheet>
      )}
    </Modal>
  );
}

function Popover({ anchor, closing, onClose, onGone, children }: { anchor: Anchor; closing: boolean; onClose: () => void; onGone: () => void; children: ReactNode }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const surface = useRef<View>(null);
  const leave = useEffectEvent(onGone);
  const maxHeight = Math.min(560, useLayoutHeight() - anchor.top - 24);

  // The first frame already holds the start state, so the open popover never flashes before it grows.
  useLayoutEffect(() => {
    const element = surface.current as unknown as HTMLElement | null;
    const from = reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" };
    element?.animate?.([from, { opacity: 1, transform: "scale(1)" }], { duration: motion.controlIn, easing: motion.easeOut, fill: "backwards" });
  }, [reduce]);

  useLayoutEffect(() => {
    if (!closing) return;
    const element = surface.current as unknown as HTMLElement | null;
    if (!element?.animate) return leave();
    // A close that lands mid-entrance leaves from where the popover is, not from fully shown.
    const { opacity, transform } = getComputedStyle(element);
    element.getAnimations().forEach((running) => running.cancel());
    const to = reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.98)" };
    const fade = element.animate([{ opacity, transform }, to], { duration: popoverOut, easing: motion.easeOut, fill: "forwards" });
    fade.onfinish = () => leave();
    return () => fade.cancel();
  }, [closing, reduce]);

  return (
    <View style={styles.fill}>
      <View testID="recent-outside" style={styles.fill} onPointerDown={onClose} />
      <View
        ref={surface}
        role="dialog"
        aria-label={say.title}
        style={[styles.popover, origin, { top: anchor.top, right: anchor.right, maxHeight, backgroundColor: c.sheet, boxShadow: c.cardLift, borderColor: c.hairline }]}
      >
        <ScrollView style={contain} contentContainerStyle={styles.popoverContent}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

/** A row in a scrolling list fills only once a touch holds, so a scroll that starts on it does not flash. */
const web = { dataSet: { pressable: "" }, delayPressIn: scrollViewTouchDelay };
const fillIn = webStyle({ transitionProperty: "background-color", transitionDuration: "0ms" });
const fillOut = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.pressOut}ms`, transitionTimingFunction: motion.easeOut });
const contain = webStyle({ overscrollBehavior: "contain" });
const origin = { transformOrigin: "top right" };

function Entries({ splits, now, onPick }: { splits: readonly RecentSplit[]; now: number; onPick: () => void }) {
  const c = useColors();
  return (
    <View style={styles.list}>
      <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
        {say.title}
      </Text>
      {splits.map(({ id, names, total, added }) => {
        const who = say.names(names);
        const when = say.when(added, now);
        const amount = money(total);
        return (
          <Link key={id} href={`/s/${id}`} asChild>
            <Pressable {...web} aria-label={say.row(who, when, amount)} onPress={onPick}>
              {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
                <View style={[styles.row, pressed || hovered ? [fillIn, { backgroundColor: c.sheetIn }] : fillOut]}>
                  <View style={styles.text}>
                    <Text numberOfLines={1} style={[type.body, { color: c.ink }]}>
                      {who}
                    </Text>
                    <Text style={[type.caption, { color: c.muted }]}>{when}</Text>
                  </View>
                  <Text style={[type.body, tabular, { color: c.ink }]}>{amount}</Text>
                </View>
              )}
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  popover: { position: "absolute", width: popoverWidth, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  popoverContent: { padding: 8 },
  list: { alignSelf: "stretch", gap: 2 },
  title: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 28 },
  text: { flex: 1, minWidth: 0 },
});
