import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, PressTarget } from "../components/button";
import { CoffeeButton } from "../components/coffee-button";
import { ThemeToggle } from "../components/theme-toggle";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { shareLink, siteUrl } from "../share-link";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

type Props = { onShare: () => void };

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
      <HeaderIcons onShare={onShare} />
    </View>
  );
}

/** Coffee, the theme toggle and Share, 32 px apart, the same on every page. */
export function HeaderIcons({ onShare }: Props) {
  return (
    <View style={styles.buttons}>
      <CoffeeButton />
      <ThemeToggle />
      <Button kind="icon" icon="share" name={say.shareLink} onPress={onShare} />
    </View>
  );
}

/** Share for pages that aren't a Split: sends the site's link, and says so when it was copied instead. */
export function useSiteShare() {
  const [notice, setNotice] = useState<string | null>(null);
  const share = async () => {
    const result = await shareLink(siteUrl());
    if (result !== "shared") setNotice(result === "copied" ? say.linkCopied : say.copyFailed);
  };
  return { share: () => void share(), notice, hideNotice: () => setNotice(null) };
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.header, paddingTop: 6 },
  buttons: { flexDirection: "row", alignItems: "center", marginRight: -12 },
  home: { minHeight: 44, justifyContent: "center" },
});
