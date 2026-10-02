import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button, PressTarget } from "../components/button";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

export function SplitHeader({ onHistory, onShare }: { onHistory?: () => void; onShare?: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.header}>
      <PressTarget name={joinCopy.newSplit} onPress={() => router.push("/")} style={(pressed) => [styles.home, pressStyle(pressed, reduce)]}>
        {() => <Text style={[type.wordmark, { color: c.ink }]}>{copy.wordmark}</Text>}
      </PressTarget>
      <View style={styles.buttons}>
        {onHistory ? <Button kind="icon" icon="history" name={say.history} onPress={onHistory} /> : null}
        {onShare ? <Button kind="icon" icon="share" name={say.shareLink} onPress={onShare} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.header, paddingTop: 6 },
  buttons: { flexDirection: "row", marginRight: -12 },
  home: { minHeight: 44, justifyContent: "center" },
});
