import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nextNotice, type Connection, type Notice } from "../../live/connection";
import { useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { easing, layout, motion, type, useColors } from "../theme";

const words = { offline: say.connection.offline, slow: say.connection.slow };

/** The notice that shows now. It follows `nextNotice`, which holds back a brief drop and keeps a shown notice up through a link that flaps. */
function useNotice(connection: Connection): Notice {
  const [notice, setNotice] = useState<Notice>(null);
  const showing = useRef<Notice>(null);
  useEffect(() => {
    showing.current = notice;
  });
  useEffect(() => {
    const next = nextNotice(connection, showing.current);
    const timer = setTimeout(() => setNotice(next.notice), next.afterMs);
    return () => clearTimeout(timer);
  }, [connection]);
  return notice;
}

/**
 * A quiet line in the header's free middle, over the page and under every sheet's top edge, so it never covers the footer's pay pill or a sheet's fields.
 * It stays muted: red marks something the person can fix (B2 decision 2), and a dropped connection is not one.
 */
export function ConnectionNotice({ connection }: { connection: Connection }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const notice = useNotice(connection);
  const message = notice === null ? null : words[notice];
  const [progress] = useState(() => new Animated.Value(0));
  // The words stay while the line fades out, so it never changes shape on the way out.
  const [shown, setShown] = useState(message);
  if (message && message !== shown) setShown(message);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: message ? 1 : 0,
      duration: reduce ? motion.reducedFade : message ? motion.toastIn : motion.toastOut,
      easing: easing.easeOut,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !message) setShown(null);
    });
    return () => animation.stop();
  }, [message, reduce, progress]);

  const scale = reduce ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });

  return (
    <View role="status" aria-live="polite" pointerEvents="none" style={[styles.anchor, { top: insets.top + 6, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
      {shown ? (
        <View style={styles.column}>
          <Animated.View testID="connection-notice" style={[styles.pill, { backgroundColor: c.field, borderColor: c.hairline, opacity: progress, transform: [{ scale }] }]}>
            <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
              {shown}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

/** The wordmark on the left and three icon buttons on the right (coffee, theme, Share, glyph centers 292, 324 and 356 at 390). The line may reach into the cup's 44 px box, since it takes no touches, but never over the 15 px glyph. */
const wordmarkRoom = 72;
const buttonsRoom = 92;

const styles = StyleSheet.create({
  anchor: { position: "absolute", left: 0, right: 0, height: layout.header - 6, justifyContent: "center" },
  column: { alignSelf: "center", width: "100%", maxWidth: 480, alignItems: "center", paddingLeft: wordmarkRoom, paddingRight: buttonsRoom },
  pill: { maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
