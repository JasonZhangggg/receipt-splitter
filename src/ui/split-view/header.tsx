import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, PressTarget } from "../components/button";
import { features } from "../../features";
import { CoffeeButton } from "../components/coffee-button";
import { ThemeToggle } from "../components/theme-toggle";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { shareLink, siteUrl } from "../share-link";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

type Props = { onShare: () => void };

/** The header row every page shares. On home the wordmark is the page's name and not a link, so it is plain text at the same height. The wide Split page puts its links before the icons. */
export function SplitHeader({ onShare, home = false, links }: Props & { home?: boolean; links?: ReactNode }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const wordmark = <Text style={[type.title, { color: c.ink }]}>{copy.wordmark}</Text>;
  return (
    <View style={styles.header}>
      <View role="heading" aria-level={1}>
        {home ? (
          <View style={styles.home}>{wordmark}</View>
        ) : (
          <PressTarget name={joinCopy.wordmarkHome} onPress={() => router.push("/")} style={(pressed) => [styles.home, pressStyle(pressed, reduce)]}>
            {() => wordmark}
          </PressTarget>
        )}
      </View>
      {links ? (
        <View style={styles.end}>
          <View style={styles.links}>{links}</View>
          <HeaderIcons onShare={onShare} />
        </View>
      ) : (
        <HeaderIcons onShare={onShare} />
      )}
    </View>
  );
}

/** How it works, coffee (when `features.coffee` is on), the theme toggle and Share, 32 px apart, the same on every page. */
export function HeaderIcons({ onShare }: Props) {
  return (
    <View style={styles.buttons}>
      <View style={styles.pull}>
        <Button kind="icon" icon="help" name={copy.howItWorks} href="/how-it-works" onFollow={() => router.navigate("/how-it-works")} />
      </View>
      {features.coffee && <CoffeeButton />}
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
  // Overlaps the next icon's 44 px box by 12 px, as CoffeeButton does, so the glyphs sit 32 px apart.
  pull: { marginRight: -12 },
  end: { flexDirection: "row", alignItems: "center", gap: 28 },
  links: { flexDirection: "row", alignItems: "center", columnGap: 20 },
});
