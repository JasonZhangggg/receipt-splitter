import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { tabbable } from "../components/popover";
import { webAnimation, webStyle } from "../motion";
import { motion, SurfaceContext } from "../theme";

/** New content fades in over 120ms, opacity only, from its first painted frame. The column swaps content on nearly every click, so anything longer reads as lag, and old content leaves at once rather than fading: a fade out followed by a fade in leaves the column blank between them. */
const fadeIn = webAnimation({ animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }], animationDuration: "120ms", animationTimingFunction: motion.easeOut, animationFillMode: "both" });
const contain = webStyle({ overscrollBehavior: "contain" });

type Props = {
  children: ReactNode;
  label: string;
  /** Calls `onDown` at once, where a sheet would first slide down. */
  closing?: boolean;
  onDown?: () => void;
  /** Opened from the keyboard: focus moves to the first control inside, as a sheet's does, instead of staying behind the whole receipt in tab order. */
  focusFirst?: boolean;
  testID?: string;
};

/** What a bottom sheet holds on a phone, shown in the wide layout's right column instead. It is not modal: the receipt beside it stays in reach. */
export function SidePanel({ children, label, closing = false, onDown, focusFirst = false, testID }: Props) {
  const region = useRef<View>(null);
  const [focusOnOpen] = useState(focusFirst);
  useEffect(() => {
    if (focusOnOpen) (region.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>(tabbable)?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const down = useEffectEvent(() => onDown?.());
  useEffect(() => {
    if (closing) down();
  }, [closing]);
  return (
    <SurfaceContext value="page">
      <View ref={region} role="region" aria-label={label} testID={testID} style={[styles.panel, fadeIn]}>
        <ScrollView style={[styles.scroll, contain]} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      </View>
    </SurfaceContext>
  );
}

// Past the widest overhang in a sheet: the Close button's 44pt target hangs 14px beyond the content edge.
const bleed = 16;

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  // The scroller reaches `bleed` past the column on each side and the content pads it back in, so the content sits where it did. Controls that hang past their row (a link's tap area, the Close button's) then stay inside the scroller, which would otherwise scroll sideways to show them and clip the column's left edge.
  scroll: { flex: 1, marginHorizontal: -bleed },
  // Room on the sides and top for a focused field's ring, which the scroller clips.
  content: { paddingTop: 4, paddingBottom: 32, paddingHorizontal: 4 + bleed },
});
