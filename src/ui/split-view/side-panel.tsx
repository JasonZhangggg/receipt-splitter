import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { webStyle } from "../motion";
import { SurfaceContext } from "../theme";

/** Opacity only, and short: the column swaps content every time a line is clicked, so anything longer reads as lag. */
const fadeMs = 120;
const fade = webStyle({ transitionProperty: "opacity", transitionDuration: `${fadeMs}ms`, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" });
const contain = webStyle({ overscrollBehavior: "contain" });

type Props = {
  children: ReactNode;
  label: string;
  /** Fades the content out, then calls `onDown`, as a sheet slides down before it reports. */
  closing?: boolean;
  onDown?: () => void;
  testID?: string;
};

/** What a bottom sheet holds on a phone, shown in the wide layout's right column instead. It is not modal: the receipt beside it stays in reach. */
export function SidePanel({ children, label, closing = false, onDown, testID }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const down = useEffectEvent(() => onDown?.());
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(down, fadeMs);
    return () => clearTimeout(timer);
  }, [closing]);
  return (
    <SurfaceContext value="page">
      <View role="region" aria-label={label} testID={testID} style={[styles.panel, fade, { opacity: shown && !closing ? 1 : 0 }]}>
        <ScrollView style={[styles.scroll, contain]} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      </View>
    </SurfaceContext>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  // Room on the sides and top for a focused field's ring, which the scroller clips.
  content: { paddingTop: 4, paddingBottom: 32, paddingHorizontal: 4 },
});
