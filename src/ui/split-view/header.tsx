import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button, PressTarget } from "../components/button";
import { ThemeToggle } from "../components/theme-toggle";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

type Props = { onShare?: () => void };

export function SplitHeader({ onShare }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.header}>
      <View role="heading" aria-level={1}>
        <PressTarget name={joinCopy.wordmarkHome} onPress={() => router.push("/")} style={(pressed) => [styles.home, pressStyle(pressed, reduce)]}>
          {() => <Text style={[type.title, { color: c.ink }]}>{copy.wordmark}</Text>}
        </PressTarget>
      </View>
      <View style={styles.buttons}>
        <ThemeToggle />
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
