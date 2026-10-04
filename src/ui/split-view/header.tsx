import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useState } from "react";

import { Button, PressTarget } from "../components/button";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion, webAnimation } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";

type Props = { onReceipt?: () => void; onHistory?: () => void; onShare?: () => void };

export function SplitHeader({ onReceipt, onHistory, onShare }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  // A photo already there when the page opens shows at once; one that lands later scales in (fades under reduced motion).
  const [hadReceipt] = useState(onReceipt !== undefined);
  return (
    <View style={styles.header}>
      <View role="heading" aria-level={1}>
        <PressTarget name={joinCopy.newSplit} onPress={() => router.push("/")} style={(pressed) => [styles.home, pressStyle(pressed, reduce)]}>
          {() => <Text style={[type.wordmark, { color: c.ink }]}>{copy.wordmark}</Text>}
        </PressTarget>
      </View>
      <View style={styles.buttons}>
        {onReceipt ? (
          <View style={!hadReceipt && (reduce ? receiptFade : receiptIn)}>
            <Button kind="icon" icon="receipt" name={say.viewReceipt} onPress={onReceipt} />
          </View>
        ) : null}
        {onHistory ? <Button kind="icon" icon="history" name={say.history} onPress={onHistory} /> : null}
        {onShare ? <Button kind="icon" icon="share" name={say.shareLink} onPress={onShare} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.header, paddingTop: 6 },
  buttons: { flexDirection: "row", alignItems: "center", marginRight: -12 },
  home: { minHeight: 44, justifyContent: "center" },
});

const arrival = (from: Record<string, number | string>) =>
  webAnimation({
    animationKeyframes: [{ from, to: { opacity: 1, transform: "scale(1)" } }],
    animationDuration: `${motion.controlIn}ms`,
    animationTimingFunction: motion.easeOut,
    animationFillMode: "both",
  });
const receiptIn = arrival({ opacity: 0, transform: "scale(0.96)" });
const receiptFade = arrival({ opacity: 0 });
