import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button, PressTarget, type Press } from "../components/button";
import { MenuRows } from "../components/menu";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { useAppearanceFlip } from "../use-appearance-flip";

type Props = { onMore?: (press: Press) => void; moreOpen?: boolean; onShare?: () => void };

export function SplitHeader({ onMore, moreOpen = false, onShare }: Props) {
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
        {onShare ? <Button kind="icon" icon="share" name={say.shareLink} onPress={onShare} /> : null}
        {onMore ? <Button kind="icon" icon="menu" name={say.menu} popup="dialog" expanded={moreOpen} onPress={onMore} /> : null}
      </View>
    </View>
  );
}

/** What the header's menu button holds: Payments first, since it is the one people open to check on something, then the receipt photo while the Split has one, and History. */
export function HeaderMenu({ onPayments, onPhoto, onHistory, onAppearance }: { onPayments: (press: Press) => void; onPhoto?: (press: Press) => void; onHistory: (press: Press) => void; onAppearance: (press: Press) => void }) {
  const appearance = useAppearanceFlip();
  return (
    <MenuRows
      rows={[
        { icon: "check", label: say.payments, onPress: onPayments },
        ...(onPhoto ? [{ icon: "receipt" as const, label: say.receiptPhotoItem, onPress: onPhoto }] : []),
        { icon: "history", label: say.history, onPress: onHistory },
        { icon: appearance.next === "dark" ? ("moon" as const) : ("sun" as const), label: copy.mode[appearance.next], onPress: (press: Press) => { onAppearance(press); appearance.flip(); } },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.header, paddingTop: 6 },
  buttons: { flexDirection: "row", alignItems: "center", marginRight: -12 },
  home: { minHeight: 44, justifyContent: "center" },
});
