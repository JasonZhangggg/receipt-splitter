import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nextNotice, type Connection, type Notice } from "../../live/connection";
import { awayStyle, useFade, useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

const rise = { y: 0, scale: 0.97 };
const words = { offline: say.connection.offline, slow: say.connection.slow };

// The copy ends in an ellipsis. It is heard as one, and seen as three dots that bounce in turn: each rises 3 px and settles, 1200 ms a loop, 120 ms apart.
const ellipsis = "\u2026";
const beat = (rest: Record<string, number | string>, peak: Record<string, number | string>) =>
  [0, 1, 2].map((i) =>
    webAnimation({
      animationKeyframes: [{ "0%": rest, "25%": peak, "50%": rest, "100%": rest }],
      animationDuration: "1200ms",
      animationDelay: `${i * 120}ms`,
      animationTimingFunction: "cubic-bezier(0.37, 0, 0.63, 1)",
      animationIterationCount: "infinite",
    }),
  );
const bounce = beat({ transform: "translateY(0)" }, { transform: "translateY(-3px)" });
// Reduced motion keeps the beat and drops the movement.
const dim = beat({ opacity: 1 }, { opacity: 0.35 });
// A transform needs a box, and an inline-block one still rides the text baseline.
const dotBox = webStyle({ display: "inline-block" });
// What a screen reader gets: the whole sentence once, in place of the moving dots.
const heard = webStyle({ position: "absolute", clip: "rect(0 0 0 0)", clipPath: "inset(50%)" });

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
  const line = useRef<View>(null);
  // The words stay while the line fades out, so it never changes shape on the way out.
  const [shown, setShown] = useState(message);
  if (message && message !== shown) setShown(message);

  useFade(line, message !== null, rise, reduce, () => setShown(null));

  return (
    <View role="status" aria-live="polite" pointerEvents="none" style={[styles.anchor, { top: insets.top + 6, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
      {shown ? (
        <View style={styles.column}>
          <View ref={line} testID="connection-notice" style={[styles.line, !message && awayStyle(rise, reduce)]}>
            <Text aria-hidden numberOfLines={1} style={[type.caption, { color: c.muted }]}>
              {shown.replace(ellipsis, "")}
              {[0, 1, 2].map((i) => (
                <Text key={i} style={[dotBox, styles.dot, (reduce ? dim : bounce)[i]]}>
                  .
                </Text>
              ))}
            </Text>
            <Text style={heard}>{shown}</Text>
          </View>
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
  line: { maxWidth: "100%" },
  dot: { marginLeft: 1 },
});
