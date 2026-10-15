import { useCallback, useState, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";

import { webStyle } from "./motion";
import { motion, useColors } from "./theme";

/** True once the page has scrolled `past` px, which is when content starts to pass under the pinned top. */
export function useScrolledPast(past = 0) {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setScrolled(event.nativeEvent.contentOffset.y > past),
    [past],
  );
  return { scrolled, onScroll };
}

type Props = {
  children: ReactNode;
  /** Stays at the top of the scroller. Off, it scrolls with the page. */
  pinned: boolean;
  /** Content has scrolled under it, so a hairline marks its edge. */
  scrolled: boolean;
  top: number;
  left: number;
  right: number;
  bottom?: number;
  onHeight?: (height: number) => void;
};

/** The top of a page that stays put while the rest scrolls under it. It is the first child of the scroller's content, with the page background so rows do not show through. */
export function PinnedTop({
  children,
  pinned,
  scrolled,
  top,
  left,
  right,
  bottom = 0,
  onHeight,
}: Props) {
  const c = useColors();
  return (
    <View
      onLayout={
        onHeight &&
        (({ nativeEvent }: LayoutChangeEvent) =>
          onHeight(nativeEvent.layout.height))
      }
      style={[
        styles.top,
        pinned && styles.stuck,
        edge,
        {
          backgroundColor: c.field,
          borderBottomColor: scrolled ? c.hairline : "transparent",
          paddingTop: top,
          paddingBottom: bottom,
          paddingLeft: left,
          paddingRight: right,
        },
      ]}
    >
      {children}
    </View>
  );
}

const edge = webStyle({
  transitionProperty: "border-color",
  transitionDuration: `${motion.actionColor}ms`,
  transitionTimingFunction: "ease",
});

const styles = StyleSheet.create({
  stuck: { position: "sticky" as ViewStyle["position"], top: 0, zIndex: 5 },
  top: { width: "100%", borderBottomWidth: 1 },
});
